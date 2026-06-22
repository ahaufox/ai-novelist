[English](DEVELOPMENT_EN.md) | **中文**

# 开发规范

本文档记录项目的开发规范和约定，本人与协作者应遵循这些规则。（2026/2/9更新）

## 后端开发规范

### 1. 导入规范

**规则：本项目严格使用绝对导入，禁止相对导入。**

#### ✅ 正确的导入方式

```python
# 导入标准库
import os
import sys

# 导入第三方库
import numpy as np

# 导入本项目模块 - 必须使用绝对路径
from backend.settings.settings import settings
from backend.ai_agent.core.graph_builder import GraphBuilder
from backend.api.chat_api import router
```

#### ❌ 禁止的导入方式

```python
# 禁止相对导入
from ..utils import helpers  # 不允许
from .submodule import func  # 不允许
```

#### PyCharm 用户注意事项

PyCharm 可能会自动将导入重构为通过 `__init__.py` 简化导入，这是允许的。

**原因：**
- 提高代码可读性，明确模块层级关系
- 避免因文件移动导致的导入错误
- 便于IDE进行代码跳转和重构

### 2. 配置访问

**规则：所有路径通过环境变量传入，应用配置通过 `settings` 实例操作，禁止自行计算路径或直接读写配置文件。**

路径由启动器统一管理（通过 `AI_NOVELIST_*` 环境变量传入），详见 [`launcher/internal/env/envars.go`](launcher/internal/env/envars.go)。

应用配置（`store.yaml`）通过 `settings` 类方法操作：

**示例：**

```python
# ✅ 正确 - 通过settings类访问配置
from backend.settings.settings import settings

# 读取路径（从环境变量）
data_dir = settings.DATA_DIR

# 读取应用配置（从 store.yaml）
mode = settings.get_config('mode')

# ❌ 错误 - 直接计算路径
from pathlib import Path
data_dir = Path(__file__).parent.parent.parent / 'data'

# ❌ 错误 - 直接读写 store.yaml
import yaml
with open('data/config/store.yaml') as f:
    config = yaml.safe_load(f)
```

**原因：**
- 路径由启动器决定，后端零计算，便于部署和重构
- 统一配置管理入口，便于维护
- 方便未来切换配置存储方式（如从文件切换到数据库）

## Git 协作规范

### 提交信息（Commit Message）

**规则：所有 Git 提交信息必须使用中文撰写。**

- 使用中文描述每次更新的具体内容，便于用户快速理解变更意图
- 遵循 `<类型>: <简要描述>` 的格式，例如：
  - `feat: 添加启动器模块`
  - `fix: 修复文件服务路径解析错误`
  - `refactor: 重构配置初始化逻辑`
- 提交信息应简洁明了，让用户能在本地轻松选择合适的存档点或分支

**原因：**
- 降低用户理解成本，无需翻译即可把握更新内容
- 便于在 Git 日志中快速检索和回溯特定功能变更

## 前端规范：
统一使用定义的theme颜色，如text-theme-green

（待补充）