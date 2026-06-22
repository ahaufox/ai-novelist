package env

import (
	"os"
	"path/filepath"
)

// AI Novelist 环境变量名称常量
const (
	// 根路径
	EnvProjectDir = "AI_NOVELIST_PROJECT_DIR"
	EnvDataDir    = "AI_NOVELIST_DATA_DIR"
	EnvBinDir     = "AI_NOVELIST_BIN_DIR"
	EnvBackupDir  = "AI_NOVELIST_BACKUP_DIR"
	EnvEnvFile    = "AI_NOVELIST_ENV_FILE"

	// data/ 子目录
	EnvConfigDir   = "AI_NOVELIST_CONFIG_DIR"
	EnvDbDir       = "AI_NOVELIST_DB_DIR"
	EnvChromaDbDir = "AI_NOVELIST_CHROMADB_DIR"
	EnvUploadsDir  = "AI_NOVELIST_UPLOADS_DIR"
	EnvTempDir     = "AI_NOVELIST_TEMP_DIR"
	EnvSkillsDir   = "AI_NOVELIST_SKILLS_DIR"
	EnvAuthDir     = "AI_NOVELIST_AUTH_DIR"

	// 具体文件
	EnvConversationsDb = "AI_NOVELIST_CONVERSATIONS_DB"
	EnvAuthTokenFile   = "AI_NOVELIST_AUTH_TOKEN_FILE"

	// 可执行文件
	EnvGitExe  = "AI_NOVELIST_GIT_EXECUTABLE"
	EnvNodeExe = "AI_NOVELIST_NODE_EXECUTABLE"
	EnvNpmExe  = "AI_NOVELIST_NPM_EXECUTABLE"
	EnvRgExe   = "AI_NOVELIST_RG_EXECUTABLE"

	// 静态文件目录
	EnvStaticDir = "AI_NOVELIST_STATIC_DIR"

	// 端口配置
	EnvBackendPort  = "AI_NOVELIST_BACKEND_PORT"
	EnvFrontendPort = "AI_NOVELIST_FRONTEND_PORT"
)

// AllEnvKeys 返回所有 AI_NOVELIST_* 环境变量 key 列表
func AllEnvKeys() []string {
	return []string{
		EnvProjectDir,
		EnvDataDir,
		EnvBinDir,
		EnvBackupDir,
		EnvEnvFile,
		EnvConfigDir,
		EnvDbDir,
		EnvChromaDbDir,
		EnvUploadsDir,
		EnvTempDir,
		EnvSkillsDir,
		EnvAuthDir,
		EnvConversationsDb,
		EnvAuthTokenFile,
		EnvGitExe,
		EnvNodeExe,
		EnvNpmExe,
		EnvRgExe,
		EnvStaticDir,
		EnvBackendPort,
		EnvFrontendPort,
	}
}

// GetExeDir 获取启动器 exe 所在目录
func GetExeDir() string {
	exePath, err := os.Executable()
	if err != nil {
		return "."
	}
	return filepath.Dir(exePath)
}

// BuildEnvMap 计算所有 AI_NOVELIST_* 环境变量的默认值
// exeDir: 启动器 exe 所在目录
// projectDir: 项目代码目录（qingzhu/）
func BuildEnvMap(exeDir, projectDir string) map[string]string {
	envs := make(map[string]string, 23)

	dataDir := filepath.Join(exeDir, "data")
	binDir := filepath.Join(exeDir, "bin")

	// 根路径
	envs[EnvProjectDir] = projectDir
	envs[EnvDataDir] = dataDir
	envs[EnvBinDir] = binDir
	envs[EnvBackupDir] = filepath.Join(exeDir, ".qingzhu-backup")
	envs[EnvEnvFile] = filepath.Join(exeDir, ".env")

	// data/ 子目录
	envs[EnvConfigDir] = filepath.Join(dataDir, "config")
	envs[EnvDbDir] = filepath.Join(dataDir, "db")
	envs[EnvChromaDbDir] = filepath.Join(dataDir, "chromadb")
	envs[EnvUploadsDir] = filepath.Join(dataDir, "uploads")
	envs[EnvTempDir] = filepath.Join(dataDir, "temp")
	envs[EnvSkillsDir] = filepath.Join(dataDir, "skills")
	envs[EnvAuthDir] = filepath.Join(dataDir, "auth")

	// 具体文件
	envs[EnvConversationsDb] = filepath.Join(dataDir, "db", "conversations.db")
	envs[EnvAuthTokenFile] = filepath.Join(dataDir, "auth", "tokens.json")

	// 可执行文件
	envs[EnvGitExe] = filepath.Join(binDir, "git", "bin", "git.exe")
	envs[EnvNodeExe] = filepath.Join(binDir, "node", "node.exe")
	envs[EnvNpmExe] = filepath.Join(binDir, "node", "npm.cmd")
	envs[EnvRgExe] = filepath.Join(binDir, "rg.exe")

	// 静态文件目录
	envs[EnvStaticDir] = filepath.Join(projectDir, "static")

	// 端口配置
	envs[EnvBackendPort] = "8000"
	envs[EnvFrontendPort] = "3000"

	return envs
}
