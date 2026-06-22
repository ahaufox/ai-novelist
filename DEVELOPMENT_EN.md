[English](DEVELOPMENT_EN.md) | **中文**

# Development Standards

This document records the development standards and conventions of the project. Contributors should follow these rules. (Updated 2026/2/9)

## Backend Development Standards

### 1. Import Standards

**Rule: This project strictly uses absolute imports; relative imports are prohibited.**

#### ✅ Correct Import Methods

```python
# Import standard libraries
import os
import sys

# Import third-party libraries
import numpy as np

# Import project modules - must use absolute paths
from backend.settings.settings import settings
from backend.ai_agent.core.graph_builder import GraphBuilder
from backend.api.chat_api import router
```

#### ❌ Prohibited Import Methods

```python
# Prohibit relative imports
from ..utils import helpers  # Not allowed
from .submodule import func  # Not allowed
```

#### PyCharm User Notes

PyCharm may automatically refactor imports through `__init__.py` to simplify them; this is allowed.

**Reasons:**
- Improve code readability and clarify module hierarchy
- Avoid import errors caused by file movement
- Facilitate IDE code navigation and refactoring

---

### 2. Configuration Access

**Rule: All paths are passed via environment variables by the launcher. Application config is accessed through the `settings` instance. Do NOT compute paths yourself or read/write config files directly.**

Paths are managed by the launcher via `AI_NOVELIST_*` environment variables. See [`launcher/internal/env/envars.go`](launcher/internal/env/envars.go) for the full list.

Application config (`store.yaml`) is accessed through `settings` class methods:

#### Example:

```python
# ✅ Correct - Access through settings class
from backend.settings.settings import settings

# Read path (from environment variable)
data_dir = settings.DATA_DIR

# Read app config (from store.yaml)
mode = settings.get_config('mode')

# ❌ Incorrect - Compute paths yourself
from pathlib import Path
data_dir = Path(__file__).parent.parent.parent / 'data'

# ❌ Incorrect - Read store.yaml directly
import yaml
with open('data/config/store.yaml') as f:
    config = yaml.safe_load(f)
```

**Reasons:**
- The launcher decides all paths; the backend does zero path computation
- Easier deployment and refactoring
- Unified configuration management entry point
- Prevent accidental corruption of configuration files

---

## Git Collaboration Standards

### Commit Messages

**Rule: All Git commit messages must be written in Chinese.**

- Use Chinese to describe the specific content of each update, so that users can quickly understand the intent of the changes
- Follow the format `<type>: <brief description>`, for example:
  - `feat: 添加启动器模块` (feat: add launcher module)
  - `fix: 修复文件服务路径解析错误` (fix: fix file service path parsing error)
  - `refactor: 重构配置初始化逻辑` (refactor: refactor configuration initialization logic)
- Commit messages should be concise and clear, allowing users to easily select the appropriate save point or branch locally

**Reasons:**
- Reduce user comprehension cost; no translation needed to grasp update content
- Facilitate quick search and traceability of specific feature changes in Git logs

---

## Frontend Standards

Unified use of defined theme colors, such as `text-theme-green`

(To be supplemented)
