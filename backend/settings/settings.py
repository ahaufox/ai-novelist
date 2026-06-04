import json
import logging
import os
import sqlite3
from pathlib import Path
from typing import Dict, Any, TypedDict, Optional

import yaml

from backend.settings.paths import get_data_dir, get_bin_dir, get_env_file_path
from backend.settings.env import EnvManager
from backend.settings.tools import ALL_AVAILABLE_TOOLS

logger = logging.getLogger(__name__)


class Settings:
    """
    统一配置系统
    """
    ALL_AVAILABLE_TOOLS: dict = ALL_AVAILABLE_TOOLS
    
    def __init__(self):
        # 先初始化路径
        self.DATA_DIR: str = str(get_data_dir())
        self.ENV_FILE_PATH: Path = get_env_file_path()
        
        # 配置文件目录
        self.CONFIG_DIR = str(Path(self.DATA_DIR) / "config")
        
        # 向量数据库目录
        self.CHROMADB_PERSIST_DIR: str = str(Path(self.DATA_DIR) / "chromadb")
        # SQLite数据库配置
        self.DB_DIR: str = str(Path(self.DATA_DIR) / "db")
        self.CHECKPOINTS_DB_PATH: str = str(Path(self.DATA_DIR) / "db" / "checkpoints.db")
        # 对话存储数据库（新，独立于 langgraph checkpoint）
        self.CONVERSATIONS_DB_PATH: str = str(Path(self.DATA_DIR) / "db" / "conversations.db")
        # 上传文件目录
        self.UPLOADS_DIR: str = str(Path(self.DATA_DIR) / "uploads")
        # 临时文件目录
        self.TEMP_DIR: str = str(Path(self.DATA_DIR) / "temp")
        # Skills目录
        self.SKILLS_DIR: str = str(Path(self.DATA_DIR) / "skills")
        # 认证 token 目录
        self.AUTH_TOKEN_DIR: Path = Path(self.DATA_DIR) / "auth"
        self.AUTH_TOKEN_FILE: Path = self.AUTH_TOKEN_DIR / "tokens.json"
        
        # 先初始化环境变量管理器（加载 .env 到 os.environ，使后续操作能读取到）
        self.env_manager = EnvManager(self.ENV_FILE_PATH)
        
        # 可执行文件路径（可能在 .env 中设置了 AI_NOVELIST_TOOLS_DIR）
        self.NODE_EXECUTABLE: str = self._get_executable('node.exe')
        self.NPM_EXECUTABLE: str = self._get_executable('npm.cmd')
        self.RG_EXECUTABLE: str = self._get_executable('rg.exe')
        self.GIT_EXECUTABLE: str = self._get_executable('git.exe')
        
        # 加载应用配置（必须在路径初始化之后）
        self.LOG_LEVEL: str = self.get_config("log_level", default="INFO")
        self.HOST: str = self.get_config("host", default="127.0.0.1")
        self.PORT: int = self.get_config("port", default=8000)
    
    def _get_executable(self, exe_name: str) -> str:
        """获取工具目录中的可执行文件路径，如果不存在则使用系统命令
        
        Args:
            exe_name: 可执行文件名（如 'uv.exe' 或 'node.exe'）
        
        Returns:
            str: 可执行文件的完整路径或系统命令名
        """
        tools_dir = get_bin_dir()
        # Node.js 在 tools/node/ 子目录下
        if exe_name in ('node.exe', 'npm.cmd', 'npx.cmd'):
            exe_path = tools_dir / 'node' / exe_name
            if exe_path.exists():
                logger.info(f"使用项目自带的 {exe_name}: {exe_path}")
                return str(exe_path)
        # Git 在 tools/git/bin/ 子目录下
        if exe_name == 'git.exe':
            exe_path = tools_dir / 'git' / 'bin' / exe_name
            if exe_path.exists():
                logger.info(f"使用项目自带的 {exe_name}: {exe_path}")
                return str(exe_path)
        exe_path = tools_dir / exe_name
        if exe_path.exists():
            logger.info(f"使用项目自带的 {exe_name}: {exe_path}")
            return str(exe_path)
        # 如果项目自带的不存在，回退到系统命令
        cmd_name = exe_name.replace('.exe', '').replace('.cmd', '')
        logger.info(f"使用系统 {cmd_name}")
        return cmd_name
        
    def _load_config(self, config_file: str = "store.yaml") -> Dict[str, Any]:
        """加载配置，每次都会创建全新的字典对象
        
        Args:
            config_file: 配置文件名，如 'store.yaml' 或 'skills_config.yaml'
        """
        try:
            config_path = Path(self.CONFIG_DIR) / config_file
            with open(config_path, 'r', encoding='utf-8') as f:
                return yaml.safe_load(f) or {}
        except Exception as e:
            logger.error(f"加载配置文件失败 {config_path}: {e}")
            return {}

    def get_config(self, *keys: str, default: Any = None, config_file: str = "store.yaml") -> Any:
        """获取指定配置值，支持多层嵌套。返回临时字典的引用，必须使用update_config更新，才能保存到磁盘
        
        Args:
            *keys: 嵌套的键路径，如 get_config('level1', 'level2', 'level3')
            default: 默认值
            config_file: 配置文件名，如 'store.yaml' 或 'skills_config.yaml'
        """
        config = self._load_config(config_file)
        current = config
        
        try:
            # 遍历所有键
            for key in keys:
                current = current[key]
            return current
        except (KeyError, TypeError):
            return default
    
    def update_config(self, value: Any, *keys: str, config_file: str = "store.yaml") -> bool:
        """更新配置，支持多层嵌套
        
        Args:
            value: 要设置的值
            *keys: 嵌套的键路径，如 update_config(new_value, 'level1', 'level2', 'level3')
            config_file: 配置文件名，如 'store.yaml' 或 'skills_config.yaml'
        """
        try:
            config = self._load_config(config_file)
            current = config
            
            # 遍历到最后一层的前一个
            for key in keys[:-1]:
                if key not in current:
                    current[key] = {}
                current = current[key]
                
            # 设置最后一层的值
            current[keys[-1]] = value
            
            # 保存配置
            config_path = Path(self.CONFIG_DIR) / config_file
            with open(config_path, 'w', encoding='utf-8') as f:
                yaml.dump(config, f, allow_unicode=True, sort_keys=False, default_flow_style=False)
            return True
        except (KeyError, TypeError, IndexError) as e:
            logger.error(f"更新配置失败: {e}")
            return False
    
    def delete_config(self, *keys: str, config_file: str = "store.yaml") -> bool:
        """删除配置，支持多层嵌套
        
        Args:
            *keys: 嵌套的键路径，如 delete_config('level1', 'level2', 'level3')
            config_file: 配置文件名，如 'store.yaml' 或 'skills_config.yaml'
        
        Returns:
            bool: 删除成功返回True，失败返回False
        """
        try:
            config = self._load_config(config_file)
            current = config
            
            # 遍历到最后一层的前一个
            for key in keys[:-1]:
                if key not in current:
                    return False
                current = current[key]
            
            # 删除最后一层的键
            if keys[-1] in current:
                del current[keys[-1]]
                
                # 保存配置
                config_path = Path(self.CONFIG_DIR) / config_file
                with open(config_path, 'w', encoding='utf-8') as f:
                    yaml.dump(config, f, allow_unicode=True, sort_keys=False, default_flow_style=False)
                return True
            return False
        except (KeyError, TypeError, IndexError) as e:
            logger.error(f"删除配置失败: {e}")
            return False

    def get_api_key_from_env(self, env_key: str) -> Optional[str]:
        return self.env_manager.get_api_key(env_key)

    def set_api_key_to_env(self, env_key: str, api_key: str) -> bool:
        return self.env_manager.set_api_key(env_key, api_key)

    def remove_api_key_from_env(self, env_key: str) -> bool:
        return self.env_manager.remove_api_key(env_key)

    # ==================== Token 存储管理 (data/auth/tokens.json) ====================

    def save_tokens(self, access_token: str, refresh_token: Optional[str] = None):
        """保存 token 到 data/auth/tokens.json"""
        data = {"access_token": access_token}
        if refresh_token:
            data["refresh_token"] = refresh_token
        # 写入临时文件后原子重命名，避免写一半崩溃导致文件损坏
        tmp = self.AUTH_TOKEN_FILE.with_suffix(".tmp")
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f)
        tmp.replace(self.AUTH_TOKEN_FILE)
        logger.info("Token 已持久化到 %s", self.AUTH_TOKEN_FILE)

    def load_tokens(self) -> dict:
        """从 data/auth/tokens.json 加载 token"""
        if not self.AUTH_TOKEN_FILE.exists():
            return {}
        try:
            with open(self.AUTH_TOKEN_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError) as e:
            logger.error("读取 token 文件失败: %s", e)
            return {}

    def clear_tokens(self):
        """清除持久化的 token"""
        if self.AUTH_TOKEN_FILE.exists():
            self.AUTH_TOKEN_FILE.unlink()
        logger.info("Token 已清除")

    def get_access_token(self) -> Optional[str]:
        """获取存储的 access_token"""
        tokens = self.load_tokens()
        return tokens.get("access_token")

    def get_refresh_token(self) -> Optional[str]:
        """获取存储的 refresh_token"""
        tokens = self.load_tokens()
        return tokens.get("refresh_token")

    # ==================== Provider Key 获取 ====================

    def get_provider_key(self, provider: str) -> Optional[str]:
        # 内置提供商特殊处理：使用 JWT access_token 作为 api_key
        if provider == "builtin":
            return self.get_access_token()

        # 从配置中获取 env_key
        env_key = self.get_config("provider", provider, "env_key", default=None)
        if not env_key:
            # 如果没有配置 env_key，使用默认格式
            env_key = f"{provider.upper()}_API_KEY"
        
        return self.get_api_key_from_env(env_key)


# 创建全局设置实例
settings = Settings()


def get_db_connection():
    """获取数据库连接，用于直接查询数据库（如 history_api.py）"""
    conn = sqlite3.connect(settings.CHECKPOINTS_DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row  # 返回字典格式
    return conn
