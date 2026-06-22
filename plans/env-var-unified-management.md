# 环境变量统一管理重构计划（最终版）

## 目录布局

```
{exeDir}/
├── qingzhu/                   ← 项目代码仓库（仅代码）
│   ├── main.py
│   ├── backend/
│   ├── frontend/
│   │   └── package.json       ← 仅代码，无 node_modules
│   └── static/
├── .venv/                     ← Python 虚拟环境
├── .modules/                  ← 前端 node_modules
├── data/                      ← 用户数据
│   ├── config/                ←   store.yaml, skills.yaml
│   ├── db/                    ←   conversations.db
│   ├── chromadb/              ←   向量数据库持久化
│   ├── uploads/               ←   用户上传文件
│   ├── temp/                  ←   临时文件
│   ├── skills/                ←   Skill 文件
│   ├── auth/                  ←   tokens.json
│   ├── .aiignore
│   └── .userignore
├── bin/                       ← 工具链
│   ├── rg.exe
│   ├── git/bin/git.exe
│   ├── vcredist/
│   └── node/
│       ├── node.exe
│       └── npm.cmd
├── .qingzhu-backup/           ← 备份仓库（bare repo）
├── .env                       ← ★ 所有环境变量统一存放处
└── launcher.exe
```

## `.env` 文件内容示例

```env
# ===== 路径变量（启动器自动管理） =====
AI_NOVELIST_PROJECT_DIR=C:/Users/.../qingzhu
AI_NOVELIST_DATA_DIR=C:/Users/.../data
AI_NOVELIST_BIN_DIR=C:/Users/.../bin
AI_NOVELIST_BACKUP_DIR=C:/Users/.../.qingzhu-backup
AI_NOVELIST_ENV_FILE=C:/Users/.../.env
AI_NOVELIST_CONFIG_DIR=C:/Users/.../data/config
AI_NOVELIST_DB_DIR=C:/Users/.../data/db
AI_NOVELIST_CHROMADB_DIR=C:/Users/.../data/chromadb
AI_NOVELIST_UPLOADS_DIR=C:/Users/.../data/uploads
AI_NOVELIST_TEMP_DIR=C:/Users/.../data/temp
AI_NOVELIST_SKILLS_DIR=C:/Users/.../data/skills
AI_NOVELIST_AUTH_DIR=C:/Users/.../data/auth
AI_NOVELIST_CONVERSATIONS_DB=C:/Users/.../data/db/conversations.db
AI_NOVELIST_AUTH_TOKEN_FILE=C:/Users/.../data/auth/tokens.json
AI_NOVELIST_GIT_EXECUTABLE=C:/Users/.../bin/git/bin/git.exe
AI_NOVELIST_NODE_EXECUTABLE=C:/Users/.../bin/node/node.exe
AI_NOVELIST_NPM_EXECUTABLE=C:/Users/.../bin/node/npm.cmd
AI_NOVELIST_RG_EXECUTABLE=C:/Users/.../bin/rg.exe
AI_NOVELIST_VENV_DIR=C:/Users/.../.venv
AI_NOVELIST_MODULES_DIR=C:/Users/.../.modules

# ===== API Keys（用户手动添加，启动器不修改） =====
DEEPSEEK_API_KEY=sk-...
OPENAI_API_KEY=sk-...
```

## 启动器 `.env` 管理流程

```
启动器启动
    │
    ├──► 检查 {exeDir}/.env 是否存在
    │       ├── 不存在 → 创建空文件
    │       └── 存在   → 读取全部键值对
    │
    ├──► 遍历 20 个 AI_NOVELIST_* 必需变量
    │       ├── .env 中已有 → 跳过
    │       └── .env 中缺失 → 用 BuildEnvMap 计算默认值
    │
    ├──► 将缺失变量写入 .env（追加模式，不覆盖已有键）
    │
    └──► 将 .env 全部键值对加载到 os.Environ
            │
            └──► 启动后端子进程时，cmd.Env = os.Environ()
                    → 子进程继承所有变量
```

## 启动器侧新增：`.env` 管理模块

### 新建文件：`launcher/internal/env/dotenv.go`

```go
package env

import (
    "bufio"
    "os"
    "path/filepath"
    "strings"
)

// LoadDotenv 读取 .env 文件，返回键值对 map
func LoadDotenv(envFile string) (map[string]string, error) {
    f, err := os.Open(envFile)
    if err != nil {
        return nil, err
    }
    defer f.Close()
    
    vars := make(map[string]string)
    scanner := bufio.NewScanner(f)
    for scanner.Scan() {
        line := strings.TrimSpace(scanner.Text())
        if line == "" || strings.HasPrefix(line, "#") {
            continue
        }
        parts := strings.SplitN(line, "=", 2)
        if len(parts) == 2 {
            vars[strings.TrimSpace(parts[0])] = strings.TrimSpace(parts[1])
        }
    }
    return vars, scanner.Err()
}

// SaveDotenv 保存键值对到 .env 文件（保留注释和已有格式）
func SaveDotenv(envFile string, vars map[string]string, defaults map[string]string) error {
    // 读取已有内容
    existing := make(map[string]bool)
    var lines []string
    
    data, err := os.ReadFile(envFile)
    if err == nil {
        for _, line := range strings.Split(string(data), "\n") {
            trimLine := strings.TrimSpace(line)
            if trimLine == "" || strings.HasPrefix(trimLine, "#") {
                lines = append(lines, line)
                continue
            }
            parts := strings.SplitN(trimLine, "=", 2)
            if len(parts) == 2 {
                key := strings.TrimSpace(parts[0])
                existing[key] = true
                // 如果是我们管理的变量且有新值，用新值替换
                if val, ok := vars[key]; ok {
                    lines = append(lines, key+"="+val)
                } else {
                    lines = append(lines, line)
                }
            } else {
                lines = append(lines, line)
            }
        }
    }
    
    // 添加缺失的默认变量
    for key, val := range defaults {
        if !existing[key] {
            lines = append(lines, key+"="+val)
        }
    }
    
    return os.WriteFile(envFile, []byte(strings.Join(lines, "\n")+"\n"), 0644)
}

// EnsureDotenv 确保 .env 存在并包含所有必需变量
// 返回完整的环境变量 map（含用户自定义的 API_KEY）
func EnsureDotenv(exeDir, projectDir string) (map[string]string, error) {
    envFile := filepath.Join(exeDir, ".env")
    
    // 1. 确保文件存在
    if _, err := os.Stat(envFile); os.IsNotExist(err) {
        os.WriteFile(envFile, []byte{}, 0644)
    }
    
    // 2. 读取现有 .env
    existing, _ := LoadDotenv(envFile)
    
    // 3. 计算缺失的默认值
    defaults := BuildEnvMap(exeDir, projectDir)
    missing := make(map[string]string)
    for k, v := range defaults {
        if _, ok := existing[k]; !ok {
            missing[k] = v
        }
    }
    
    // 4. 有缺失就写入
    if len(missing) > 0 {
        SaveDotenv(envFile, nil, missing)
    }
    
    // 5. 再次读取完整内容（含用户 API_KEY）
    full, _ := LoadDotenv(envFile)
    
    // 6. 确保所有默认值都存在（防止用户误删）
    for k, v := range defaults {
        if _, ok := full[k]; !ok {
            full[k] = v
        }
    }
    
    return full, nil
}
```

### 在 `app.go` 启动流程中集成

```go
func (a *App) startup(ctx context.Context) {
    a.ctx = ctx
    
    // 加载配置
    config, _ := a.LoadConfig()
    projectDir := updater.GetProjectDir(config)
    exeDir := filepath.Dir(projectDir)  // qingzhu/ 的父目录
    
    // ★ 确保 .env 完整，并加载到 os.Environ
    envVars, err := env.EnsureDotenv(exeDir, projectDir)
    if err != nil {
        a.Logf("初始化环境变量失败: %v", err)
    }
    
    // ★ 加载到当前进程环境（子进程自动继承）
    for k, v := range envVars {
        os.Setenv(k, v)
    }
    
    a.Logf("环境变量已就绪，共 %d 个", len(envVars))
}
```

## 环境变量清单（共 20 个）

### 根路径（5 个）

| # | 环境变量 | 默认值 |
|---|---------|--------|
| 1 | `AI_NOVELIST_PROJECT_DIR` | `{exeDir}/qingzhu/` |
| 2 | `AI_NOVELIST_DATA_DIR` | `{exeDir}/data/` |
| 3 | `AI_NOVELIST_BIN_DIR` | `{exeDir}/bin/` |
| 4 | `AI_NOVELIST_BACKUP_DIR` | `{exeDir}/.qingzhu-backup/` |
| 5 | `AI_NOVELIST_ENV_FILE` | `{exeDir}/.env` |

### data/ 子目录（7 个）

| # | 环境变量 | 默认值 |
|---|---------|--------|
| 6 | `AI_NOVELIST_CONFIG_DIR` | `{exeDir}/data/config/` |
| 7 | `AI_NOVELIST_DB_DIR` | `{exeDir}/data/db/` |
| 8 | `AI_NOVELIST_CHROMADB_DIR` | `{exeDir}/data/chromadb/` |
| 9 | `AI_NOVELIST_UPLOADS_DIR` | `{exeDir}/data/uploads/` |
| 10 | `AI_NOVELIST_TEMP_DIR` | `{exeDir}/data/temp/` |
| 11 | `AI_NOVELIST_SKILLS_DIR` | `{exeDir}/data/skills/` |
| 12 | `AI_NOVELIST_AUTH_DIR` | `{exeDir}/data/auth/` |

### 具体文件（2 个）

| # | 环境变量 | 默认值 |
|---|---------|--------|
| 13 | `AI_NOVELIST_CONVERSATIONS_DB` | `{exeDir}/data/db/conversations.db` |
| 14 | `AI_NOVELIST_AUTH_TOKEN_FILE` | `{exeDir}/data/auth/tokens.json` |

### 可执行文件（5 个）

| # | 环境变量 | 默认值 |
|---|---------|--------|
| 15 | `AI_NOVELIST_GIT_EXECUTABLE` | `{exeDir}/bin/git/bin/git.exe` |
| 16 | `AI_NOVELIST_NODE_EXECUTABLE` | `{exeDir}/bin/node/node.exe` |
| 17 | `AI_NOVELIST_NPM_EXECUTABLE` | `{exeDir}/bin/node/npm.cmd` |
| 18 | `AI_NOVELIST_RG_EXECUTABLE` | `{exeDir}/bin/rg.exe` |

### 依赖目录（2 个）

| # | 环境变量 | 默认值 |
|---|---------|--------|
| 19 | `AI_NOVELIST_VENV_DIR` | `{exeDir}/.venv/` |
| 20 | `AI_NOVELIST_MODULES_DIR` | `{exeDir}/.modules/` |

## 需要删除的死代码

| 项 | 文件 | 原因 |
|---|------|------|
| `CHECKPOINTS_DB_PATH` | `settings.py:35` | 无调用方，检查点已改用 Git |
| `get_db_connection()` | `settings.py:260-263` | 无任何调用方 |
| `sys.frozen` 分支 | `paths.py` 全部 | 不再区分开发/生产环境 |
| 旧 `.env` 解析代码 | `backend/settings/env.py` | 改为由启动器统一管理 `.env` |

## 后端 `settings.py` 重构

```python
class Settings:
    ALL_AVAILABLE_TOOLS: dict = ALL_AVAILABLE_TOOLS
    
    def __init__(self):
        # ===== 所有路径从环境变量读取 =====
        self.DATA_DIR: str = os.environ["AI_NOVELIST_DATA_DIR"]
        self.CONFIG_DIR: str = os.environ["AI_NOVELIST_CONFIG_DIR"]
        self.CHROMADB_PERSIST_DIR: str = os.environ["AI_NOVELIST_CHROMADB_DIR"]
        self.DB_DIR: str = os.environ["AI_NOVELIST_DB_DIR"]
        self.UPLOADS_DIR: str = os.environ["AI_NOVELIST_UPLOADS_DIR"]
        self.TEMP_DIR: str = os.environ["AI_NOVELIST_TEMP_DIR"]
        self.SKILLS_DIR: str = os.environ["AI_NOVELIST_SKILLS_DIR"]
        self.AUTH_TOKEN_DIR: Path = Path(os.environ["AI_NOVELIST_AUTH_DIR"])
        self.AUTH_TOKEN_FILE: Path = Path(os.environ["AI_NOVELIST_AUTH_TOKEN_FILE"])
        self.ENV_FILE_PATH: Path = Path(os.environ["AI_NOVELIST_ENV_FILE"])
        self.CONVERSATIONS_DB_PATH: str = os.environ["AI_NOVELIST_CONVERSATIONS_DB"]
        
        # ===== 可执行文件路径 =====
        self.NODE_EXECUTABLE: str = os.environ["AI_NOVELIST_NODE_EXECUTABLE"]
        self.NPM_EXECUTABLE: str = os.environ["AI_NOVELIST_NPM_EXECUTABLE"]
        self.RG_EXECUTABLE: str = os.environ["AI_NOVELIST_RG_EXECUTABLE"]
        self.GIT_EXECUTABLE: str = os.environ["AI_NOVELIST_GIT_EXECUTABLE"]
        
        # ===== 环境变量管理（API Keys 等，启动器已加载到 os.environ） =====
        self.env_manager = EnvManager(self.ENV_FILE_PATH)
        
        # ===== 应用配置（从 store.yaml 读取） =====
        self.LOG_LEVEL: str = self.get_config("log_level", default="INFO")
        self.HOST: str = self.get_config("host", default="127.0.0.1")
        self.PORT: int = self.get_config("port", default=8000)
```

## 修改文件清单

### 启动器侧（Go）— 10 个文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `launcher/internal/env/dotenv.go` | **新建** | `.env` 读取/写入/补齐逻辑 |
| `launcher/internal/env/envars.go` | **新建** | 常量 + `BuildEnvMap()` + `GetExeDir()` |
| `launcher/internal/env/env.go` | 修改 | `DetectVenvPython` 改为 exeDir 级；`EnsureVenv` 同步 |
| `launcher/app.go` | 修改 | `startup()` 中调用 `EnsureDotenv()` + `os.Setenv()` |
| `launcher/internal/backend/backend.go` | 修改 | `Start()` 去掉手动构造 env（.env 已加载到 os.Environ） |
| `launcher/internal/frontend/frontend.go` | 修改 | npm `--prefix` + `NODE_PATH` |
| `launcher/internal/updater/updater.go` | 修改 | `tools/` → `bin/`；`EnsureVcRedist` 路径 |
| `launcher/internal/gitutil/gitutil.go` | 修改 | `tools/` → `bin/` |
| `launcher/internal/migration/migration.go` | 修改 | `data/` 路径改为 `exeDir/data` |
| `launcher/internal/launcher/launcher.go` | 修改 | `PrepareEnvironment` 参数适配 |

### 后端侧（Python）— 4 个文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/settings/settings.py` | **重构** | 20 个属性从环境变量读取；删除 `CHECKPOINTS_DB_PATH` 等死代码 |
| `backend/settings/paths.py` | **重写** | 移除全部路径计算逻辑，改为常量定义或直接删除 |
| `backend/settings/initializer.py` | 修改 | 路径初始化直接用 `settings` 属性（已从 env var 读取） |
| `main.py` | 修改 | `setup_portable_git` 简化为直接读环境变量 |

### 无需修改的文件

以下文件只通过 `settings` 实例访问路径，底层已变但接口不变：

`backend/file/`、`backend/ai_agent/`、`backend/api/`、`backend/storage/`、`backend/git/`、`backend/websocket/` 下所有文件。

## 数据流图

```mermaid
flowchart TD
    L[启动器启动] --> C{exeDir/.env 存在？}
    C -->|否| N[创建空 .env]
    C -->|是| R[读取全部键值对]
    
    R --> M{缺少 AI_NOVELIST_* 变量？}
    N --> M
    M -->|有缺失| W[BuildEnvMap 计算默认值 → 写入 .env]
    M -->|无缺失| S
    
    W --> S[os.Setenv 加载到进程环境]
    S --> B[启动后端子进程<br/>cmd.Env = os.Environ()]
    
    B --> P[Python 后端<br/>os.environ['AI_NOVELIST_DATA_DIR']]
    P --> U[各模块使用 settings 实例]
```

## 实施步骤（顺序执行）

1. **新建 `launcher/internal/env/envars.go`**：常量 + `BuildEnvMap()` + `GetExeDir()`
2. **新建 `launcher/internal/env/dotenv.go`**：`.env` 管理（读/写/补齐）
3. **修改 `launcher/app.go`**：`startup()` 集成 `EnsureDotenv()`
4. **修改 `launcher/internal/env/env.go`**：`.venv` 路径改为 exeDir 级
5. **修改 `launcher/internal/backend/backend.go`**：`Start()` 简化 env 处理
6. **修改 `launcher/internal/frontend/frontend.go`**：npm `--prefix` 模式
7. **修改 `launcher/internal/updater/updater.go`**：`bin/` 路径 + `EnsureVcRedist`
8. **修改 `launcher/internal/gitutil/gitutil.go`**：`bin/` 路径
9. **修改 `launcher/internal/migration/migration.go`**：`data/` 路径
10. **重写/删除 `backend/settings/paths.py`**：移除路径计算
11. **重构 `backend/settings/settings.py`**：env var 读取 + 删死代码
12. **修改 `backend/settings/initializer.py`**：适配新路径
13. **修改 `main.py`**：简化 git 配置
