# 代码组织逻辑：

## 核心文件：
1. `settings.py` : 全局配置实例，提供统一配置访问入口
   - 所有路径由启动器通过环境变量传入（`os.environ["AI_NOVELIST_*"]`），零计算
   - 应用配置（store.yaml）通过 `get_config/update_config` 操作
   - 环境变量（API Keys）通过 `EnvManager` 管理
2. `initializer.py` : 初始化时创建所有需要的目录和文件

## 支持文件：
1. `paths.py` : 环境变量名称常量 + `get_env_or_raise()` 工具函数
2. `env.py` : `.env` 文件解析/加载/保存（`EnvManager` 类，用于 API Key 管理）
3. `tools.py` : 工具 id、名称、描述的映射表

## 规则：
`backend/settings/` 文件夹以外，任何模块都只能从 `settings` 实例里获取属性和方法。
不允许直接读取配置文件或环境变量文件。
