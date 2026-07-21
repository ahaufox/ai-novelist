---
name: backend-skill
description: 1. 直接调用后端 API，直接控制项目配置、文件管理、知识库、MCP 等核心功能。2. 配置迁移：根据迁移模板自动补全配置文件中缺失的字段。3. 介绍项目配置文件，便于直接修改配置文件以实现某些需求。
---

# 功能范围

## 1. 后端API

- **配置管理**：读取和修改系统配置、模式、模型提供商等（`Config` 模块）
- **文件操作**：管理项目文件、读取和修改内容（`File` 模块）
- **知识库**：创建、管理和搜索知识库内容（`Knowledge` 模块）
- **MCP 服务器**：管理 MCP 服务器配置（`MCP` 模块）
- **对话历史**：管理对话记录（`History` 模块）
- **模式管理**：管理自定义模式和工具配置（`Mode` 模块）
- **提供商管理**：管理 AI 提供商和 API KEY（`Provider` 模块）
- **检查点**：Git 文件版本管理（`checkpoints` 模块）


### 获取 API 文档的方式

请使用 [`scripts/fetch_api_docs.py`](scripts/fetch_api_docs.py) 脚本从正在运行的后端动态获取最新 API 文档。

### 可用模块

执行以下命令查看所有可用模块（tag）及其端点数量：

```bash
python scripts/fetch_api_docs.py --list
```

预期输出：
```
可用的 API 模块 (tag):
========================================
  Auth                 (9 个端点)    ← 用户认证
  Chat                 (10 个端点)   ← 聊天相关
  Config               (3 个端点)    ← 配置读取/修改
  File                 (10 个端点)   ← 文件操作
  History              (4 个端点)    ← 对话历史管理
  Knowledge            (11 个端点)   ← 知识库管理
  MCP                  (4 个端点)    ← MCP 服务器管理
  Mode                 (9 个端点)    ← 模式管理
  Provider             (10 个端点)   ← 提供商管理
  checkpoints          (6 个端点)    ← Git 检查点
```

### 获取特定模块的 API 文档

```bash
python scripts/fetch_api_docs.py <模块名>
```

示例 - 获取 MCP 模块的 API：
```bash
python scripts/fetch_api_docs.py MCP
```

示例 - 获取文件操作模块的 API：
```bash
python scripts/fetch_api_docs.py File
```

### API 调用方式

使用命令执行工具，通过 curl 调用后端的 API。脚本输出的 curl 示例可以直接使用。

基础 URL：`http://localhost:8000`

通用格式：
```bash
curl -X <METHOD> http://localhost:8000/api/<module>/<endpoint> \
  -H "Content-Type: application/json" \
  -d '{"key": "value"}'
```

示例 - 获取配置存储值：
```bash
curl "http://localhost:8000/api/config/store?key=provider.deepseek"
```

示例 - 设置配置存储值：
```bash
curl -X POST http://localhost:8000/api/config/store \
  -H "Content-Type: application/json" \
  -d '{"key": "selectedModel", "value": "deepseek-chat"}'
```

### 注意事项

1. **不要直接请求 `/openapi.json`** - 请使用 `fetch_api_docs.py` 脚本按模块获取，减少不必要的数据传输
2. **不要读取 `.env` 文件** - API KEY 等敏感信息通过 API 操作（`/api/provider/{id}/api-key`）
3. **配置操作** - 读取和修改配置通过 `/api/config/store` 进行，详见 `Config` 模块文档


---

## 2. 配置迁移

> 每次项目启动时，启动器会自动将 `backend-skill/` 目录完整复制到 `data/skills/backend-skill/`。
> 迁移模板位于本 Skill 的 [`references/`](references/) 目录下，它们是配置文件的最新默认值。
> **你需要手动检查并执行配置迁移**，将模板中新增的字段补全到实际配置文件中。

### 2.1 迁移模板说明

| 模板文件 | 对应实际配置文件 | 用途 |
|---|---|---|
| [`references/store_migration.yaml`](references/store_migration.yaml) | `config/store.yaml` | 完整的 store 配置默认值（含所有提供商、MCP、主题等） |
| [`references/store_template.yaml`](references/store_template.yaml) | `config/store.yaml` | 带注释说明的配置参考（适合阅读） |
| [`references/skills_migration.yaml`](references/skills_migration.yaml) | `config/skills.yaml` | skill 配置默认值 |
| [`references/.aiignore`](references/.aiignore) | `.aiignore` | AI 忽略规则默认内容 |
| [`references/.gitignore`](references/.gitignore) | `.gitignore` | Git 忽略规则默认内容 |
| [`references/.userignore`](references/.userignore) | `.userignore` | 用户忽略规则默认内容 |

### 2.2 迁移操作步骤

当项目升级后，你需要执行以下操作：

**步骤 1：对比 `store.yaml`**

用 `read` 工具分别读取：
- 迁移模板：[`references/store_migration.yaml`](references/store_migration.yaml)
- 实际配置：`config/store.yaml`

对比两者的差异，重点关注：
- `provider` 下是否有新的提供商或新的模型
- `mode` 下是否有新的模式或新的工具
- `mcpServers` 下是否有新的 MCP 服务器
- `theme` 下是否有新的配色字段

**步骤 2：补全缺失字段**

使用 `edit` 或 `write` 工具，将模板中有但实际配置中缺失的字段补全到 `config/store.yaml`。

**步骤 3：迁移 `skills.yaml`**

同理，对比：
- 迁移模板：[`references/skills_migration.yaml`](references/skills_migration.yaml)
- 实际配置：`config/skills.yaml`

补全缺失的 skill 配置。

**步骤 4：迁移 ignore 文件**

检查以下文件是否存在，不存在则从模板创建：
- `.aiignore` → 模板：[`references/.aiignore`](references/.aiignore)
- `.gitignore` → 模板：[`references/.gitignore`](references/.gitignore)（注意不要覆盖用户的 gitignore）
- `.userignore` → 模板：[`references/.userignore`](references/.userignore)

### 2.3 注意事项

1. **不要删除用户已有的配置** — 只补全缺失的字段，不要修改用户已有的值
2. **`store_template.yaml` 是简化版参考**，`store_migration.yaml` 才是完整的默认值，迁移时以 `store_migration.yaml` 为准
3. **`.env` 由启动器管理**，不要手动修改
4. **迁移完成后**，告知用户已完成了哪些配置的迁移


---

## 3. 配置文件

### 3.1 配置文件概览

参考配置文件位于 [`references/store_template.yaml`](references/store_template.yaml)
实际配置文件位于工作区的 `config/store.yaml`（不在此 skill 文件夹）


### 3.2 使用场景与修改方式

场景1. 如果用户要求你操作项目功能，以实现某些任务（比如"帮我创建一个数据库"，"帮我添加一个 mcp"）
场景2. 项目升级，需要迁移配置文件

你可以用 `read`，`write`，`edit` 等工具直接操作配置文件
