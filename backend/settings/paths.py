"""
路径配置模块,确保开发环境，生产环境都能正确找到位置
"""
import os
import sys
from pathlib import Path


def get_data_dir():
    """获取数据目录路径"""
    if getattr(sys, 'frozen', False):
        # PyInstaller 打包后，数据放在 exe 同级目录的 data/ 文件夹
        # 使用 sys.executable 获取 exe 所在目录
        exe_dir = Path(sys.executable).parent
        return exe_dir / 'data'
    else:
        # 开发环境，data 放在项目根目录
        return Path(__file__).parent.parent.parent / 'data'


def get_bin_dir():
    """获取可执行文件目录路径（由启动器通过环境变量 AI_NOVELIST_TOOLS_DIR 传入）"""
    tools_dir = os.environ.get("AI_NOVELIST_TOOLS_DIR")
    if tools_dir:
        return Path(tools_dir)
    raise RuntimeError("环境变量 AI_NOVELIST_TOOLS_DIR 未设置，请通过启动器运行项目")


def get_env_file_path() -> Path:
    """获取环境变量文件路径"""
    if getattr(sys, 'frozen', False):
        return Path(os.path.dirname(sys.executable)) / ".env"
    else:
        return Path(__file__).parent.parent.parent / ".env"
