package updater

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"launcher/internal/env"
	"launcher/internal/gitutil"
)

// 硬编码配置
const (
	DefaultRemoteURL  = "https://denghuominghui.top/api/git/repo.git"
	DefaultProjectDir = "qingzhu"
)

type Config struct {
	Git struct {
		RemoteURL  string
		ProjectDir string
	}
}

const PipMirror = "https://mirrors.aliyun.com/pypi/simple/"
const NpmMirror = "https://registry.npmmirror.com/"

type CommitInfo struct {
	SHA     string `json:"sha"`
	Message string `json:"message"`
	Date    string `json:"date"`
}

type UpdateStatus struct {
	HasUpdate    bool        `json:"has_update"`
	RemoteCommit CommitInfo  `json:"remote_commit"`
	LocalCommit  *CommitInfo `json:"local_commit,omitempty"`
}

type Logger interface {
	Logf(format string, args ...interface{})
	Progress(percent int)
}

// getExeDir 获取启动器exe所在目录
func getExeDir() string {
	return env.GetExeDir()
}

// GetBackupDir 获取备份仓库目录（exe同级/.qingzhu-backup/）
func GetBackupDir() string {
	return filepath.Join(getExeDir(), ".qingzhu-backup")
}

// GetProjectDir 获取项目目录（exe同级/projectDir），目录不存在时自动创建
func GetProjectDir(cfg *Config) string {
	dir := cfg.Git.ProjectDir
	if dir == "" {
		dir = "qingzhu"
	}
	projectDir := filepath.Join(getExeDir(), dir)
	os.MkdirAll(projectDir, 0755)
	return projectDir
}

// EnsureRipgrep 检查 bin/ 目录下是否存在 rg.exe
func EnsureRipgrep() error {
	rgPath := filepath.Join(env.GetBinDir(), "rg.exe")
	if _, err := os.Stat(rgPath); os.IsNotExist(err) {
		return fmt.Errorf("未找到 rg.exe: %s（请确保分发包中包含 bin/rg.exe）", rgPath)
	}
	return nil
}

// vcDLLs 需要复制的 VC++ 运行时 DLL 列表
var vcDLLs = []string{"msvcp140.dll", "vcruntime140.dll", "vcruntime140_1.dll"}

// EnsureVcRedist 将启动器同级 bin/vcredist/ 目录下的 VC++ 运行时 DLL 复制到 .venv 中
func EnsureVcRedist(projectDir string) error {
	srcDir := filepath.Join(getExeDir(), "bin", "vcredist")

	// 检查 bin/vcredist/ 是否存在
	if _, err := os.Stat(srcDir); os.IsNotExist(err) {
		return fmt.Errorf("未找到 vcredist 目录: %s", srcDir)
	}

	// 目标目录：projectDir/.venv/Lib/site-packages/chromadb_rust_bindings/
	dstDir := filepath.Join(projectDir, ".venv", "Lib", "site-packages", "chromadb_rust_bindings")
	if _, err := os.Stat(dstDir); os.IsNotExist(err) {
		return fmt.Errorf("未找到 chromadb_rust_bindings 目录: %s", dstDir)
	}

	for _, dll := range vcDLLs {
		dst := filepath.Join(dstDir, dll)
		// 已存在则跳过
		if _, err := os.Stat(dst); err == nil {
			continue
		}
		src := filepath.Join(srcDir, dll)
		data, err := os.ReadFile(src)
		if err != nil {
			return fmt.Errorf("读取 %s 失败: %w", src, err)
		}
		if err := os.WriteFile(dst, data, 0644); err != nil {
			return fmt.Errorf("复制 %s 失败: %w", dll, err)
		}
	}
	return nil
}

// EnsureGit 检查 bin/git/ 下是否有 git.exe，没有则从安装包解压
func EnsureGit(logger Logger) error {
	binDir := env.GetBinDir()
	dstDir := filepath.Join(binDir, "git")
	gitExe := filepath.Join(dstDir, "bin", "git.exe")

	// 已存在则跳过
	if _, err := os.Stat(gitExe); err == nil {
		return nil
	}

	// 检查 bin/ 目录下是否有安装包
	installerName := "PortableGit-2.54.0-64-bit.7z.exe"
	installerPath := filepath.Join(binDir, installerName)

	if _, err := os.Stat(installerPath); os.IsNotExist(err) {
		// 下载到 bin/ 目录
		url := "https://registry.npmmirror.com/-/binary/git-for-windows/v2.54.0.windows.1/PortableGit-2.54.0-64-bit.7z.exe"
		if logger != nil {
			logger.Logf("正在下载 Git 便携包 ...")
		}
		if err := os.MkdirAll(binDir, 0755); err != nil {
			return fmt.Errorf("创建 bin 目录失败: %w", err)
		}
		if err := downloadFile(url, installerPath, logger); err != nil {
			return fmt.Errorf("下载 Git 便携包失败: %w", err)
		}
	}

	// 解压到目标目录
	if logger != nil {
		logger.Logf("正在解压 Git ...")
	}
	os.MkdirAll(dstDir, 0755)

	// PortableGit-2.54.0-64-bit.7z.exe 是自解压 7z 文件，使用 /S 静默解压到指定目录
	cmd := exec.Command(installerPath, fmt.Sprintf("-o%s", dstDir), "-y")
	cmd.Stdout = nil
	cmd.Stderr = nil
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("解压 Git 便携包失败: %w", err)
	}

	if _, err := os.Stat(gitExe); os.IsNotExist(err) {
		return fmt.Errorf("解压后未找到 git.exe")
	}

	if logger != nil {
		logger.Logf("Git 安装完成: %s", gitExe)
	}
	return nil
}

func downloadFile(url, dest string, logger Logger) error {
	client := &http.Client{Timeout: 10 * time.Minute}
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8")
	req.Header.Set("Referer", "https://mirrors.tuna.tsinghua.edu.cn/")
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("HTTP %d", resp.StatusCode)
	}

	out, err := os.Create(dest)
	if err != nil {
		return err
	}
	defer out.Close()

	total := resp.ContentLength
	var written int64
	buf := make([]byte, 32*1024)

	for {
		n, err := resp.Body.Read(buf)
		if n > 0 {
			_, werr := out.Write(buf[:n])
			if werr != nil {
				return werr
			}
			written += int64(n)
			if logger != nil && total > 0 {
				pct := int(float64(written) / float64(total) * 100)
				logger.Progress(pct)
			}
		}
		if err != nil {
			if err == io.EOF {
				break
			}
			return err
		}
	}
	return nil
}

// LoadConfig 返回硬编码配置，不再读取外部 config.yaml
func LoadConfig() (*Config, error) {
	return &Config{
		Git: struct {
			RemoteURL  string
			ProjectDir string
		}{
			RemoteURL:  DefaultRemoteURL,
			ProjectDir: DefaultProjectDir,
		},
	}, nil
}

// GetRemoteLatestCommit 通过 git ls-remote 获取远程仓库指定分支的最新 commit
func GetRemoteLatestCommit(remoteURL, branch string, logger Logger) (*CommitInfo, error) {
	if logger != nil {
		logger.Logf("[DEBUG] 开始获取远程提交: remoteURL=%s, branch=%s", remoteURL, branch)
	}

	gitExe, err := gitutil.GetGitExe()
	if err != nil {
		return nil, fmt.Errorf("获取 git 路径失败: %w", err)
	}

	cmd := exec.Command(gitExe, "ls-remote", remoteURL, fmt.Sprintf("refs/heads/%s", branch))
	out, err := cmd.Output()
	if err != nil {
		if logger != nil {
			logger.Logf("[DEBUG] ls-remote 失败: %v", err)
		}
		return nil, fmt.Errorf("获取远程引用失败: %w", err)
	}

	output := strings.TrimSpace(string(out))
	if output == "" {
		return nil, fmt.Errorf("未找到远程分支 %s", branch)
	}

	// 输出格式: "<sha>\trefs/heads/<branch>"
	parts := strings.SplitN(output, "\t", 2)
	sha := parts[0]
	if logger != nil {
		logger.Logf("[DEBUG] 获取远程提交成功: SHA=%s", sha[:7])
	}
	return &CommitInfo{
		SHA:     sha,
		Message: "",
		Date:    "",
	}, nil
}

func GetLocalCommit(projectDir string) (*CommitInfo, error) {
	sha, err := gitutil.OutputIn(projectDir, "rev-parse", "HEAD")
	if err != nil {
		return nil, fmt.Errorf("获取本地 commit 失败: %w", err)
	}
	sha = strings.TrimSpace(sha)

	// 获取 message 和 date
	info, err := gitutil.OutputIn(projectDir, "log", "-1", "--format=%s|%aI", "HEAD")
	if err != nil {
		// 可能没有提交记录
		return &CommitInfo{SHA: sha}, nil
	}
	parts := strings.SplitN(info, "|", 2)
	message := ""
	date := ""
	if len(parts) >= 1 {
		message = strings.TrimSpace(parts[0])
	}
	if len(parts) >= 2 {
		date = strings.TrimSpace(parts[1])
	}

	return &CommitInfo{
		SHA:     sha,
		Message: message,
		Date:    date,
	}, nil
}

func CheckUpdateStatus(cfg *Config, logger Logger) (*UpdateStatus, error) {
	projectDir := GetProjectDir(cfg)
	currentBranch := "main"
	if _, err := os.Stat(filepath.Join(projectDir, ".git")); err == nil {
		b, err := gitutil.OutputIn(projectDir, "rev-parse", "--abbrev-ref", "HEAD")
		if err == nil && b != "" {
			currentBranch = strings.TrimSpace(b)
		}
	}

	remote, err := GetRemoteLatestCommit(cfg.Git.RemoteURL, currentBranch, logger)
	if err != nil {
		return nil, err
	}
	local, _ := GetLocalCommit(projectDir)

	status := &UpdateStatus{
		HasUpdate:    true,
		RemoteCommit: *remote,
		LocalCommit:  local,
	}
	if local != nil && local.SHA == remote.SHA {
		status.HasUpdate = false
	}

	if logger != nil {
		if status.HasUpdate {
			logger.Logf("发现新提交: %s", remote.SHA[:7])
		} else {
			logger.Logf("当前已是最新提交: %s", remote.SHA[:7])
		}
	}
	return status, nil
}

// syncBranches 同步本地分支与远程分支
func syncBranches(projectDir string, currentBranch string, logger Logger) {
	logger.Logf("[syncBranches] 当前分支: %s", currentBranch)
	logger.Logf("[syncBranches] 正在同步分支...")

	// 获取所有远程分支名 (origin/xxx 格式)
	remoteBranchesOut, err := gitutil.OutputIn(projectDir, "branch", "-r", "--format=%(refname:short)")
	if err != nil {
		logger.Logf("[syncBranches] 获取远程分支失败: %v", err)
		return
	}

	remoteBranches := make(map[string]bool)
	if remoteBranchesOut != "" {
		for _, rb := range strings.Split(remoteBranchesOut, "\n") {
			rb = strings.TrimSpace(rb)
			if rb != "" {
				remoteBranches[rb] = true
			}
		}
	}

	// 获取所有本地分支名
	localBranchesOut, err := gitutil.OutputIn(projectDir, "branch", "--format=%(refname:short)")
	if err != nil {
		logger.Logf("[syncBranches] 获取本地分支失败: %v", err)
		return
	}

	if localBranchesOut != "" {
		for _, lb := range strings.Split(localBranchesOut, "\n") {
			lb = strings.TrimSpace(lb)
			if lb == "" {
				continue
			}
			remoteRef := "origin/" + lb
			if !remoteBranches[remoteRef] {
				if lb != currentBranch {
					logger.Logf("[syncBranches] 删除本地分支: %s - 远程已删除", lb)
					_ = gitutil.RunIn(projectDir, "branch", "-D", lb)
				} else {
					logger.Logf("[syncBranches] 跳过当前分支 %s（远程已删除但保留本地）", lb)
				}
			}
		}
	}

	// 创建远程有但本地没有的跟踪分支
	for remoteRef := range remoteBranches {
		localName := strings.TrimPrefix(remoteRef, "origin/")
		if localName == remoteRef {
			continue
		}
		out, _ := gitutil.OutputIn(projectDir, "rev-parse", "--verify", "--quiet", "refs/heads/"+localName)
		if out == "" {
			logger.Logf("[syncBranches] 创建本地跟踪分支: %s -> %s", localName, remoteRef)
			_ = gitutil.RunIn(projectDir, "branch", "--track", localName, remoteRef)
		}
	}
	logger.Logf("[syncBranches] 分支同步完成")
}

// PullUpdates 根据项目目录是否存在，执行克隆或拉取更新
func PullUpdates(cfg *Config, logger Logger) error {
	projectDir := GetProjectDir(cfg)
	backupDir := GetBackupDir()

	// 检查项目仓库是否存在（通过 .git 目录判断）
	if _, err := os.Stat(filepath.Join(projectDir, ".git")); os.IsNotExist(err) {
		logger.Logf("项目未部署，开始克隆到 %s ...", projectDir)
		return cloneProject(cfg, logger)
	}

	logger.Logf("开始拉取更新...")

	// 1. 更新主仓库
	if err := gitutil.RunIn(projectDir, "fetch", "--prune", "origin"); err != nil {
		return fmt.Errorf("获取远程更新失败: %w", err)
	}
	logger.Logf("远程 fetch 成功")

	// 2. 同步更新备份仓库（先确保存在）
	ensureBackupRepo(projectDir, backupDir, logger)
	if err := gitutil.RunIn(backupDir, "fetch", "--prune", "origin"); err != nil {
		logger.Logf("备份仓库 fetch 失败（非致命）: %v", err)
	} else {
		logger.Logf("备份仓库已同步")
	}

	// 获取当前分支
	currentBranch, err := gitutil.OutputIn(projectDir, "rev-parse", "--abbrev-ref", "HEAD")
	if err != nil {
		return fmt.Errorf("获取当前分支失败: %w", err)
	}
	currentBranch = strings.TrimSpace(currentBranch)

	if currentBranch != "" && currentBranch != "HEAD" {
		// git reset --hard origin/<branch>
		remoteRef := "origin/" + currentBranch
		if err := gitutil.RunIn(projectDir, "reset", "--hard", remoteRef); err != nil {
			return fmt.Errorf("重置到最新提交失败: %w", err)
		}
		logger.Logf("已重置 %s 到 %s", currentBranch, remoteRef)
	}

	logger.Logf("正在同步本地跟踪分支...")
	syncBranches(projectDir, currentBranch, logger)

	logger.Logf("更新完成")
	if err := EnsureRipgrep(); err != nil {
		return fmt.Errorf("检查 rg.exe 失败: %w", err)
	}
	return nil
}

func cloneProject(cfg *Config, logger Logger) error {
	projectDir := GetProjectDir(cfg)
	backupDir := GetBackupDir()

	gitExe, err := gitutil.GetGitExe()
	if err != nil {
		return fmt.Errorf("获取 git 路径失败: %w", err)
	}

	// 1. 克隆到 qingzhu（正常仓库，有工作目录）
	logger.Logf("正在克隆项目到 %s ...", projectDir)
	cmd := exec.Command(gitExe, "clone", cfg.Git.RemoteURL, projectDir)
	cmd.Stdout = nil
	cmd.Stderr = nil
	if output, err := cmd.CombinedOutput(); err != nil {
		logger.Logf("克隆项目失败: %v", err)
		return fmt.Errorf("克隆项目失败: %w\n%s", err, string(output))
	}
	logger.Logf("项目克隆完成")

	// 2. 克隆到备份仓库（bare repo，只存对象）
	logger.Logf("正在创建备份仓库到 %s ...", backupDir)
	cmd = exec.Command(gitExe, "clone", "--bare", cfg.Git.RemoteURL, backupDir)
	cmd.Stdout = nil
	cmd.Stderr = nil
	if output, err := cmd.CombinedOutput(); err != nil {
		logger.Logf("克隆备份仓库失败: %v", err)
		return fmt.Errorf("克隆备份仓库失败: %w\n%s", err, string(output))
	}
	logger.Logf("备份仓库创建完成")

	// 同步远程分支
	currentBranch, _ := gitutil.OutputIn(projectDir, "rev-parse", "--abbrev-ref", "HEAD")
	currentBranch = strings.TrimSpace(currentBranch)
	logger.Logf("正在同步远程分支...")
	syncBranches(projectDir, currentBranch, logger)

	logger.Logf("接下来点击「准备环境」按钮，将会检测系统环境，下载需要的安装包/便携包")
	return nil
}

// ensureBackupRepo 确保备份仓库存在，不存在则从本地创建
func ensureBackupRepo(projectDir, backupDir string, logger Logger) {
	if _, err := os.Stat(filepath.Join(backupDir, "HEAD")); os.IsNotExist(err) {
		logger.Logf("备份仓库不存在，正在从本地创建...")
		gitExe, err := gitutil.GetGitExe()
		if err != nil {
			logger.Logf("获取 git 路径失败: %v", err)
			return
		}
		cmd := exec.Command(gitExe, "clone", "--bare", projectDir, backupDir)
		cmd.Stdout = nil
		cmd.Stderr = nil
		if output, err := cmd.CombinedOutput(); err != nil {
			logger.Logf("创建备份仓库失败: %v\n%s", err, string(output))
			return
		}
		logger.Logf("备份仓库创建完成")
	}
}

type logWriter struct {
	logger Logger
}

func (w *logWriter) Write(p []byte) (n int, err error) {
	w.logger.Logf("%s", strings.TrimSpace(string(p)))
	return len(p), nil
}
