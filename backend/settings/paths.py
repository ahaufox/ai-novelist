"""
路径配置模块,确保开发环境，生产环境都能正确找到位置
"""
import logging
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
    """获取可执行文件目录路径

    优先级：
    1. 环境变量 AI_NOVELIST_TOOLS_DIR（由启动器传入）
    2. 项目根目录下的 bin/（旧版本布局，兼容直接运行）
    """
    # 优先级1：启动器传入的环境变量
    tools_dir = os.environ.get("AI_NOVELIST_TOOLS_DIR")
    if tools_dir:
        return Path(tools_dir)

    # 优先级2：项目根目录下的 bin/（兼容旧版本 / 直接运行）
    project_root = Path(__file__).parent.parent.parent  # backend/settings/ -> 项目根目录
    bin_dir = project_root / 'bin'
    if bin_dir.exists():
        return bin_dir

    # 冻结模式（PyInstaller）：exe 同级目录下的 bin/
    if getattr(sys, 'frozen', False):
        exe_dir = Path(sys.executable).parent
        frozen_bin = exe_dir / 'bin'
        if frozen_bin.exists():
            return frozen_bin

    # 都找不到时，返回项目根目录下的 bin/（即使不存在，让调用方自行处理）
    logger = logging.getLogger(__name__)
    logger.warning("AI_NOVELIST_TOOLS_DIR 未设置，也未找到 bin/ 目录，将使用系统命令回退")
    return project_root / 'bin'


def get_env_file_path() -> Path:
    """获取环境变量文件路径"""
    if getattr(sys, 'frozen', False):
        return Path(os.path.dirname(sys.executable)) / ".env"
    else:
        return Path(__file__).parent.parent.parent / ".env"
