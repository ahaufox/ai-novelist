package gitutil

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
)

// GetGitExe 返回便携 git 可执行文件路径
func GetGitExe() (string, error) {
	toolsDir, err := getToolsDir()
	if err != nil {
		return "", err
	}
	gitExe := filepath.Join(toolsDir, "git", "bin", "git.exe")
	if _, err := os.Stat(gitExe); os.IsNotExist(err) {
		return "", fmt.Errorf("git 未安装，请先点击「准备环境」: %s", gitExe)
	}
	return gitExe, nil
}

// getToolsDir 获取 tools 目录路径
func getToolsDir() (string, error) {
	exePath, err := os.Executable()
	if err != nil {
		return "", fmt.Errorf("获取启动器路径失败: %w", err)
	}
	return filepath.Join(filepath.Dir(exePath), "tools"), nil
}

// ExecIn 创建一个在指定目录执行的 git 命令
func ExecIn(dir string, args ...string) (*exec.Cmd, error) {
	gitExe, err := GetGitExe()
	if err != nil {
		return nil, err
	}
	cmd := exec.Command(gitExe, args...)
	cmd.Dir = dir
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	return cmd, nil
}

// OutputIn 执行 git 命令并返回 stdout 输出（去除尾部换行）
func OutputIn(dir string, args ...string) (string, error) {
	cmd, err := ExecIn(dir, args...)
	if err != nil {
		return "", err
	}
	out, err := cmd.Output()
	if err != nil {
		if ee, ok := err.(*exec.ExitError); ok {
			return "", fmt.Errorf("git %s 失败: %w\n%s", strings.Join(args, " "), err, string(ee.Stderr))
		}
		return "", fmt.Errorf("git %s 失败: %w", strings.Join(args, " "), err)
	}
	return strings.TrimRight(string(out), "\r\n"), nil
}

// CombinedOutputIn 执行 git 命令并返回合并输出
func CombinedOutputIn(dir string, args ...string) (string, error) {
	cmd, err := ExecIn(dir, args...)
	if err != nil {
		return "", err
	}
	out, err := cmd.CombinedOutput()
	return strings.TrimRight(string(out), "\r\n"), err
}

// RunIn 执行 git 命令，忽略 stdout，返回 stderr 错误信息
func RunIn(dir string, args ...string) error {
	cmd, err := ExecIn(dir, args...)
	if err != nil {
		return err
	}
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("git %s 失败: %w\n%s", strings.Join(args, " "), err, string(out))
	}
	return nil
}
