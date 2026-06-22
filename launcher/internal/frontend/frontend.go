package frontend

import (
	"bufio"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
)

type Logger interface {
	Logf(format string, args ...interface{})
}

// makeNodeEnv 构造包含便携 Node.js PATH 的环境变量
func makeNodeEnv(nodePath string) []string {
	nodeDir := filepath.Dir(nodePath)
	env := os.Environ()
	for i, e := range env {
		if strings.HasPrefix(strings.ToUpper(e), "PATH=") {
			env[i] = "PATH=" + nodeDir + ";" + e[len("PATH="):]
			break
		}
	}
	return env
}

// NpmInstall 安装前端依赖（node_modules 装到 exeDir 级的 .modules/）
func NpmInstall(projectPath, nodePath string, logger Logger) error {
	exeDir := filepath.Dir(projectPath)
	modulesDir := filepath.Join(exeDir, ".modules")
	frontendPath := filepath.Join(projectPath, "frontend")

	os.MkdirAll(modulesDir, 0755)

	logger.Logf("正在安装前端依赖（可能需要几分钟）...")

	npmPath := resolveNpm(nodePath)
	// 在 frontendPath 下执行 npm install（package.json 在那里）
	// 然后通过 NODE_PATH 让运行时从 .modules/node_modules 找依赖
	// 使用 --install-strategy=linked 将 node_modules 链接到外部目录
	cmd := exec.Command("cmd", "/c", npmPath, "install", "--no-package-lock")
	cmd.Dir = frontendPath
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	cmd.Env = append(makeNodeEnv(nodePath),
		"npm_config_registry=https://registry.npmmirror.com/",
		"ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/",
		"ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/",
	)

	stdout, _ := cmd.StdoutPipe()
	stderr, _ := cmd.StderrPipe()

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("npm install 启动失败: %w", err)
	}

	go func() {
		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			logger.Logf("[npm] %s", scanner.Text())
		}
	}()

	go func() {
		scanner := bufio.NewScanner(stderr)
		for scanner.Scan() {
			logger.Logf("[npm ERR] %s", scanner.Text())
		}
	}()

	if err := cmd.Wait(); err != nil {
		return fmt.Errorf("npm install 失败: %w", err)
	}

	logger.Logf("前端依赖安装完成")
	return nil
}

// Start 启动前端 dev server（node_modules 从 exeDir 级的 .modules/ 读取）
func Start(projectPath, nodePath string, logger Logger) (*exec.Cmd, error) {
	exeDir := filepath.Dir(projectPath)
	modulesDir := filepath.Join(exeDir, ".modules")
	frontendPath := filepath.Join(projectPath, "frontend")

	// 从环境变量读取前端端口（EnsureDotenv 已确保存在）
	frontendPort := os.Getenv("AI_NOVELIST_FRONTEND_PORT")

	npmPath := resolveNpm(nodePath)
	cmd := exec.Command("cmd", "/c", npmPath, "run", "dev", "--", "--port", frontendPort)
	cmd.Dir = frontendPath
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	backendPort := os.Getenv("AI_NOVELIST_BACKEND_PORT")
	cmd.Env = append(makeNodeEnv(nodePath),
		"NODE_PATH="+filepath.Join(modulesDir, "node_modules"),
		"VITE_AI_NOVELIST_BACKEND_URL=http://localhost:"+backendPort,
	)

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return nil, err
	}

	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("启动前端失败: %w", err)
	}

	logger.Logf("前端启动成功 (PID: %d)", cmd.Process.Pid)

	go func() {
		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			logger.Logf("[Vite] %s", scanner.Text())
		}
	}()

	go func() {
		scanner := bufio.NewScanner(stderr)
		for scanner.Scan() {
			logger.Logf("[Vite ERR] %s", scanner.Text())
		}
	}()

	return cmd, nil
}

func resolveNpm(nodePath string) string {
	npmPath := filepath.Join(filepath.Dir(nodePath), "npm.cmd")
	if _, err := os.Stat(npmPath); err == nil {
		return npmPath
	}
	return "npm"
}
