---
name: backend-skill
description: 1. 直接调用后端 API，直接控制项目配置、文件管理、知识库、MCP 等核心功能。2. 介绍项目配置文件，便于直接修改配置文件以实现某些需求。
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

## 2. 配置文件

### 2.1 配置文件概览

参考配置文件位于[references/store_template.yaml]
实际配置文件位于工作区的 [`config/store.yaml`]（不在此skill文件夹）


### 2.2 使用场景与修改方式

场景1. 如果用户要求你操作项目功能，以实现某些任务（比如“帮我创建一个数据库”，“帮我添加一个mcp”）
场景2. 项目升级，需要迁移配置文件

你可以用read，write，edit等工具直接操作配置文件
