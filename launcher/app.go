package main

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"sync"
	"time"

	"launcher/internal/backend"
	"launcher/internal/env"
	"launcher/internal/frontend"
	"launcher/internal/gitman"
	"launcher/internal/gitservice"
	"launcher/internal/launcher"
	"launcher/internal/migration"
	"launcher/internal/updater"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type App struct {
	ctx           context.Context
	config        *updater.Config
	logBuffer     []string
	logMutex      sync.RWMutex
	cmdBackend    *os.Process
	cmdFrontend   *os.Process
	backendMutex  sync.Mutex
	frontendMutex sync.Mutex
	gitServer     *gitservice.Server
}

func NewApp() *App {
	return &App{}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	a.Logf("[DEBUG] App startup 被调用")

	// 加载配置
	config, err := a.LoadConfig()
	if err != nil {
		a.Logf("[WARN] 加载配置失败: %v", err)
		return
	}
	projectDir := updater.GetProjectDir(config)
	exeDir := filepath.Dir(projectDir)

	// 确保 .env 存在并包含所有必需环境变量，加载到进程环境
	envVars, err := env.EnsureDotenv(exeDir, projectDir)
	if err != nil {
		a.Logf("[WARN] 初始化环境变量失败: %v", err)
	} else {
		// 加载到当前进程环境（子进程自动继承）
		for k, v := range envVars {
			os.Setenv(k, v)
		}
		a.Logf("[INFO] 环境变量已就绪，共 %d 个", len(envVars))
	}
}

// StartGitServer 启动Git HTTP服务
func (a *App) StartGitServer() error {
	if a.gitServer != nil {
		return nil
	}

	projectDir := a.getProjectDir()
	if projectDir == "" {
		return fmt.Errorf("项目目录未设置")
	}

	a.gitServer = gitservice.NewServer("")
	a.gitServer.SetProjectDir(projectDir)

	if err := a.gitServer.Start(); err != nil {
		a.gitServer = nil
		return fmt.Errorf("启动Git服务失败: %w", err)
	}

	a.Logf("Git服务已启动: %s", a.gitServer.GetAddress())
	return nil
}

// StopGitServer 停止Git HTTP服务
func (a *App) StopGitServer() error {
	if a.gitServer == nil {
		return nil
	}

	if err := a.gitServer.Stop(); err != nil {
		return fmt.Errorf("停止Git服务失败: %w", err)
	}

	a.gitServer = nil
	a.Logf("Git服务已停止")
	return nil
}

// GetGitServerAddress 获取Git服务地址
func (a *App) GetGitServerAddress() string {
	if a.gitServer == nil {
		return ""
	}
	return a.gitServer.GetAddress()
}

func (a *App) LoadConfig() (*updater.Config, error) {
	config, err := updater.LoadConfig()
	if err != nil {
		return nil, err
	}
	a.config = config
	return config, nil
}

// getProjectDir 获取项目目录（exe同级/qingzhu/）
func (a *App) getProjectDir() string {
	if a.config == nil {
		return ""
	}
	return updater.GetProjectDir(a.config)
}

// IsProjectDeployed 检查项目仓库是否存在（通过 .git 目录判断）
func (a *App) IsProjectDeployed() bool {
	projectDir := a.getProjectDir()
	if projectDir == "" {
		return false
	}
	_, err := os.Stat(filepath.Join(projectDir, ".git"))
	return err == nil
}

func (a *App) GetVersion() string {
	if a.config == nil {
		return ""
	}
	projectDir := a.getProjectDir()
	local, err := updater.GetLocalCommit(projectDir)
	if err != nil {
		return "未安装"
	}
	if len(local.SHA) > 7 {
		return local.SHA[:7]
	}
	return local.SHA
}

// SyncProject 同步项目：克隆（首次）或拉取最新 + 备份仓库
// 合并了原先的 CheckUpdate + PerformUpdate 两个流程
func (a *App) SyncProject() (*updater.UpdateStatus, error) {
	if a.config == nil {
		return nil, fmt.Errorf("配置未加载")
	}
	if err := updater.EnsureGit(a); err != nil {
		return nil, fmt.Errorf("准备 Git 失败: %w", err)
	}
	if err := updater.PullUpdates(a.config, a); err != nil {
		return nil, err
	}
	return updater.CheckUpdateStatus(a.config, a)
}

func (a *App) PrepareEnvironment() error {
	if a.config == nil {
		return fmt.Errorf("配置未加载")
	}
	projectDir := a.getProjectDir()
	return launcher.PrepareEnvironment(projectDir, a)
}

// ─── 后端控制 ───

func (a *App) BackendStart() error {
	a.backendMutex.Lock()
	defer a.backendMutex.Unlock()

	if a.cmdBackend != nil {
		return fmt.Errorf("后端已在运行中")
	}

	projectDir := a.getProjectDir()
	if projectDir == "" {
		return fmt.Errorf("项目目录未设置")
	}

	// 检查项目仓库是否存在
	if _, err := os.Stat(filepath.Join(projectDir, ".git")); os.IsNotExist(err) {
		return fmt.Errorf("项目仓库不存在: %s，请先点击「检查更新」下载项目", projectDir)
	}

	// 运行配置迁移（创建/补全 store.yaml、skills.yaml 等配置文件）
	a.Logf("=== 检查配置迁移 ===")
	exeDir := filepath.Dir(projectDir)
	dataDir := filepath.Join(exeDir, "data")
	configDir := filepath.Join(dataDir, "config")
	if err := migration.RunAll(projectDir, dataDir, configDir); err != nil {
		return fmt.Errorf("配置迁移失败: %w", err)
	}

	// 检测 Python
	pythonPath, ok := env.DetectVenvPython(projectDir)
	if !ok {
		a.Logf("未找到虚拟环境，检测系统 Python...")
		check := env.CheckSystemPython()
		if check.Found && check.Ok {
			realPythonPath, err := env.FindSystemPython()
			if err != nil {
				return fmt.Errorf("获取系统 Python 真实路径失败: %w", err)
			}
			pythonPath, err = env.EnsureVenv(projectDir, realPythonPath, a)
			if err != nil {
				return fmt.Errorf("创建虚拟环境失败: %w", err)
			}
		} else {
			return fmt.Errorf("Python 环境未就绪，请先点击「准备环境」")
		}
	}
	a.Logf("使用 Python: %s", pythonPath)

	// pip install（每次都确保依赖最新）
	a.Logf("=== 安装后端依赖 ===")
	if err := backend.PipInstall(projectDir, pythonPath, a); err != nil {
		return fmt.Errorf("安装后端依赖失败: %w", err)
	}
	a.Logf("=== 复制 VC++ 运行时 DLL ===")
	if err := updater.EnsureVcRedist(projectDir); err != nil {
		a.Logf("复制 VC++ 运行时 DLL 失败（非致命）: %v", err)
	} else {
		a.Logf("VC++ 运行时 DLL 已就绪")
	}
	a.Logf("=== 后端依赖部署完成 ===")

	// 启动后端
	a.Logf("=== 启动 Python 后端 ===")
	cmd, err := backend.Start(projectDir, pythonPath, a)
	if err != nil {
		return fmt.Errorf("启动后端失败: %w", err)
	}

	// 从环境变量读取后端端口（EnsureDotenv 已确保存在）
	backendPort, _ := strconv.Atoi(os.Getenv("AI_NOVELIST_BACKEND_PORT"))

	// 等待后端就绪
	a.Logf("=== 等待后端就绪 ===")
	if err := backend.WaitForHealthy(backendPort, 60*time.Second); err != nil {
		killProcessTree(cmd.Process.Pid)
		return fmt.Errorf("后端健康检查失败: %w", err)
	}

	a.cmdBackend = cmd.Process
	a.Logf("后端启动成功 (PID: %d)", cmd.Process.Pid)
	a.emitMainProgramState(true)
	return nil
}

func (a *App) BackendStop() error {
	a.backendMutex.Lock()
	defer a.backendMutex.Unlock()

	if a.cmdBackend == nil {
		return nil
	}

	pid := a.cmdBackend.Pid
	a.Logf("正在关闭后端 (PID: %d)...", pid)
	killProcessTree(pid)
	a.cmdBackend = nil
	a.Logf("后端已关闭")
	a.emitMainProgramState(false)
	return nil
}

func (a *App) BackendRunning() bool {
	a.backendMutex.Lock()
	defer a.backendMutex.Unlock()
	return a.cmdBackend != nil
}

// ─── 前端控制 ───

func (a *App) FrontendStart() error {
	a.frontendMutex.Lock()
	defer a.frontendMutex.Unlock()

	if a.cmdFrontend != nil {
		return fmt.Errorf("前端已在运行中")
	}

	projectDir := a.getProjectDir()
	if projectDir == "" {
		return fmt.Errorf("项目目录未设置")
	}

	// 检测 Node.js（exeDir 级的 bin/node/）
	nodePath, ok := env.DetectNode()
	if !ok {
		return fmt.Errorf("Node.js 环境未就绪，请先点击「准备环境」")
	}
	a.Logf("使用 Node.js: %s", nodePath)

	// npm install（每次都确保依赖最新）
	a.Logf("=== 安装前端依赖 ===")
	if err := frontend.NpmInstall(projectDir, nodePath, a); err != nil {
		return fmt.Errorf("安装前端依赖失败: %w", err)
	}

	// 启动前端（Vite dev server）
	a.Logf("=== 启动前端 ===")
	cmd, err := frontend.Start(projectDir, nodePath, a)
	if err != nil {
		return fmt.Errorf("启动前端失败: %w", err)
	}

	a.cmdFrontend = cmd.Process
	a.Logf("前端启动成功 (PID: %d)", cmd.Process.Pid)
	a.emitMainProgramState(true)
	return nil
}

func (a *App) FrontendStop() error {
	a.frontendMutex.Lock()
	defer a.frontendMutex.Unlock()

	if a.cmdFrontend == nil {
		return nil
	}

	pid := a.cmdFrontend.Pid
	a.Logf("正在关闭前端 (PID: %d)...", pid)
	killProcessTree(pid)
	a.cmdFrontend = nil
	a.Logf("前端已关闭")
	a.emitMainProgramState(false)
	return nil
}

func (a *App) FrontendRunning() bool {
	a.frontendMutex.Lock()
	defer a.frontendMutex.Unlock()
	return a.cmdFrontend != nil
}

// ─── 清理 ───

func (a *App) Cleanup() {
	a.Logf("=== 正在清理所有进程 ===")

	a.FrontendStop()
	a.BackendStop()

	if a.gitServer != nil {
		a.gitServer.Stop()
		a.gitServer = nil
	}

	a.Logf("=== 清理完成 ===")
}

// killProcessTree 在 Windows 上用 taskkill 杀掉整个进程树
func killProcessTree(pid int) {
	exec.Command("taskkill", "/F", "/T", "/PID", fmt.Sprintf("%d", pid)).Run()
}

func (a *App) IsMainProgramRunning() bool {
	return a.BackendRunning() || a.FrontendRunning()
}

func (a *App) emitMainProgramState(running bool) {
	if a.ctx != nil {
		runtime.EventsEmit(a.ctx, "main-program-state", running)
	}
}

func (a *App) GetLogs() string {
	a.logMutex.RLock()
	defer a.logMutex.RUnlock()
	var result string
	for _, line := range a.logBuffer {
		result += line
	}
	return result
}

func (a *App) Logf(format string, args ...interface{}) {
	line := fmt.Sprintf(format, args...)
	if len(line) == 0 || line[len(line)-1] != '\n' {
		line += "\n"
	}

	a.logMutex.Lock()
	a.logBuffer = append(a.logBuffer, line)
	a.logMutex.Unlock()

	if a.ctx != nil {
		runtime.EventsEmit(a.ctx, "log", line)
	}
}

func (a *App) Progress(percent int) {
	if a.ctx != nil {
		runtime.EventsEmit(a.ctx, "progress", percent)
	}
}

func (a *App) AutoCheckUpdate() {
	go func() {
		time.Sleep(500 * time.Millisecond)
		a.Logf("=== 青烛 启动器 ===")

		_, err := updater.CheckUpdateStatus(a.config, a)
		if err != nil {
			a.Logf("初次部署项目，或者需要更新项目，")
			a.Logf("请点击「检查更新」按钮")
			a.Logf("等待检查完成后，点击「下载更新」按钮")
		}
	}()
}

func (a *App) GitHistory(limit int) ([]gitman.CommitDetail, error) {
	projectDir := a.getProjectDir()
	return gitman.GetCommitHistory(projectDir, limit)
}

func (a *App) GitFullGraph(limit int) ([]gitman.CommitDetail, error) {
	projectDir := a.getProjectDir()
	return gitman.GetFullCommitGraph(projectDir, limit)
}

func (a *App) GitBranches() ([]gitman.BranchInfo, error) {
	projectDir := a.getProjectDir()
	return gitman.GetBranches(projectDir)
}

func (a *App) GitCheckout(hash string) error {
	projectDir := a.getProjectDir()
	return gitman.CheckoutCommit(projectDir, hash)
}

func (a *App) GitSwitchBranch(name string) error {
	projectDir := a.getProjectDir()
	return gitman.SwitchBranch(projectDir, name)
}

func (a *App) GitCreateBranch(name string) error {
	projectDir := a.getProjectDir()
	return gitman.CreateBranch(projectDir, name)
}

func (a *App) GitGraphOutput(maxCount int) ([]gitman.GraphLine, error) {
	projectDir := a.getProjectDir()
	return gitman.GetGraphOutput(projectDir, maxCount)
}

// GitStructuredGraph 返回结构化的分支图数据（替换 GitGraphOutput）
// Go 端完成所有解析和颜色分配，前端纯渲染
func (a *App) GitStructuredGraph(maxCount int) (*gitman.GraphOutput, error) {
	projectDir := a.getProjectDir()
	return gitman.GetStructuredGraph(projectDir, maxCount)
}

func (a *App) GitAllCommits(maxCount int) ([]gitman.CommitDetail, error) {
	projectDir := a.getProjectDir()
	return gitman.GetAllCommitDetails(projectDir, maxCount)
}

// GitDualGraph 获取基准仓库完整图 + 可变仓库 HEAD 位置
func (a *App) GitDualGraph(maxCount int) (*gitman.DualGraphOutput, error) {
	projectDir := a.getProjectDir()
	backupDir := updater.GetBackupDir()

	// 检查备份仓库是否存在
	if _, err := os.Stat(filepath.Join(backupDir, "HEAD")); os.IsNotExist(err) {
		return nil, fmt.Errorf("备份仓库不存在，请先点击「检查更新」同步项目")
	}

	graph, err := gitman.GetStructuredGraph(backupDir, maxCount)
	if err != nil {
		return nil, fmt.Errorf("获取基准分支图失败: %w", err)
	}

	workingHead, err := gitman.GetHeadSHA(projectDir)
	if err != nil {
		return nil, fmt.Errorf("获取当前版本失败: %w", err)
	}

	return &gitman.DualGraphOutput{
		Graph:       graph,
		WorkingHead: workingHead,
	}, nil
}

// GitDualCheckout 智能回档 + 返回新的双仓库图
func (a *App) GitDualCheckout(sha string, maxCount int) (*gitman.DualGraphOutput, error) {
	projectDir := a.getProjectDir()
	backupDir := updater.GetBackupDir()

	// 检查目标 commit 是否在可变仓库中可达
	reachable, _ := gitman.IsCommitReachable(projectDir, sha)

	if !reachable {
		// 往后回档 — 先从 backup fetch 到 qingzhu
		a.Logf("目标提交在可变仓库中不可达，从备份仓库同步...")
		if err := gitman.FetchFromRepo(projectDir, backupDir); err != nil {
			return nil, fmt.Errorf("从备份仓库同步失败: %w", err)
		}
		a.Logf("备份仓库同步完成")
	}

	// 执行 reset --hard
	if err := gitman.CheckoutCommit(projectDir, sha); err != nil {
		return nil, fmt.Errorf("回档失败: %w", err)
	}

	a.Logf("已回档到 %s", sha[:7])

	// 返回更新后的图
	return a.GitDualGraph(maxCount)
}

// OpenWebviewTab 打开一个 Webview 标签页，显示指定 URL
func (a *App) OpenWebviewTab(title string, url string) {
	if a.ctx != nil {
		runtime.EventsEmit(a.ctx, "open-webview-tab", map[string]string{
			"title": title,
			"url":   url,
		})
	}
}
