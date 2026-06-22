import logging
import os
import sqlite3
from pathlib import Path
from typing import Dict, Any, TypedDict, Optional

import yaml

from backend.settings.paths import get_env_or_raise
from backend.settings.paths import (
    ENV_DATA_DIR, ENV_CONFIG_DIR, ENV_DB_DIR, ENV_CHROMADB_DIR,
    ENV_UPLOADS_DIR, ENV_TEMP_DIR, ENV_SKILLS_DIR, ENV_AUTH_DIR,
    ENV_CONVERSATIONS_DB, ENV_AUTH_TOKEN_FILE, ENV_ENV_FILE,
    ENV_GIT_EXECUTABLE, ENV_NODE_EXECUTABLE, ENV_NPM_EXECUTABLE, ENV_RG_EXECUTABLE,
    ENV_STATIC_DIR,
)
from backend.settings.env import EnvManager
from backend.settings.tools import ALL_AVAILABLE_TOOLS

logger = logging.getLogger(__name__)


class Settings:
    """
    统一配置系统
    
    所有路径由启动器通过环境变量传入，此处直接读取。
    应用配置（store.yaml）通过 get_config/update_config 操作。
    """
    ALL_AVAILABLE_TOOLS: dict = ALL_AVAILABLE_TOOLS
    
    def __init__(self):
        # ===== 所有路径从环境变量读取，零计算 =====
        self.DATA_DIR: str = get_env_or_raise(ENV_DATA_DIR)
        self.CONFIG_DIR: str = get_env_or_raise(ENV_CONFIG_DIR)
        self.CHROMADB_PERSIST_DIR: str = get_env_or_raise(ENV_CHROMADB_DIR)
        self.DB_DIR: str = get_env_or_raise(ENV_DB_DIR)
        self.UPLOADS_DIR: str = get_env_or_raise(ENV_UPLOADS_DIR)
        self.TEMP_DIR: str = get_env_or_raise(ENV_TEMP_DIR)
        self.SKILLS_DIR: str = get_env_or_raise(ENV_SKILLS_DIR)
        self.AUTH_TOKEN_DIR: Path = Path(get_env_or_raise(ENV_AUTH_DIR))
        self.AUTH_TOKEN_FILE: Path = Path(get_env_or_raise(ENV_AUTH_TOKEN_FILE))
        self.ENV_FILE_PATH: Path = Path(get_env_or_raise(ENV_ENV_FILE))
        self.CONVERSATIONS_DB_PATH: str = get_env_or_raise(ENV_CONVERSATIONS_DB)
        
        # ===== 可执行文件路径 =====
        self.NODE_EXECUTABLE: str = get_env_or_raise(ENV_NODE_EXECUTABLE)
        self.NPM_EXECUTABLE: str = get_env_or_raise(ENV_NPM_EXECUTABLE)
        self.RG_EXECUTABLE: str = get_env_or_raise(ENV_RG_EXECUTABLE)
        self.GIT_EXECUTABLE: str = get_env_or_raise(ENV_GIT_EXECUTABLE)
        
        # ===== 环境变量管理器（加载 .env 中的 API Keys） =====
        self.env_manager = EnvManager(self.ENV_FILE_PATH)
        
        # ===== 静态文件目录 =====
        self.STATIC_DIR: str = get_env_or_raise(ENV_STATIC_DIR)

        # ===== 端口配置（从环境变量读取，启动器管理） =====
        self.HOST: str = "127.0.0.1"
        self.PORT: int = int(os.environ.get("AI_NOVELIST_BACKEND_PORT", "8000"))

        # ===== 应用配置（从 store.yaml 读取） =====
        self.LOG_LEVEL: str = self.get_config("log_level", default="INFO")
    
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
            
            for key in keys[:-1]:
                if key not in current:
                    current[key] = {}
                current = current[key]
            
            current[keys[-1]] = value
            
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
            
            for key in keys[:-1]:
                if key not in current:
                    return False
                current = current[key]
            
            if keys[-1] in current:
                del current[keys[-1]]
                
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
        if provider == "builtin":
            return self.get_access_token()

        env_key = self.get_config("provider", provider, "env_key", default=None)
        if not env_key:
            env_key = f"{provider.upper()}_API_KEY"
        
        return self.get_api_key_from_env(env_key)


# 创建全局设置实例
settings = Settings()
