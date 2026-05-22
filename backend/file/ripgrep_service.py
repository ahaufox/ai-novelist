import subprocess
import asyncio
from pathlib import Path
from typing import Optional
import logging
from backend.settings.settings import settings

logger = logging.getLogger(__name__)


class RipgrepSearchService:
    
    def __init__(self):
        self.data_dir = Path(settings.DATA_DIR)
        rg_exe = settings.RG_EXECUTABLE
        logger.info(f"[ripgrep] RG_EXECUTABLE = {rg_exe!r}")
        logger.info(f"[ripgrep] RG_EXECUTABLE exists? {Path(rg_exe).exists() if Path(rg_exe).is_absolute() else 'not absolute, checking PATH...'}")
        logger.info(f"[ripgrep] DATA_DIR = {self.data_dir}")
    
    async def search(
        self,
        query: str,
        directory: Optional[str] = None,
        file_pattern: Optional[str] = None,
        case_sensitive: bool = False,
        max_results: Optional[int] = None,
        ignore_file: Optional[str] = None
    ) -> str:
        try:
            logger.info(f"[ripgrep] search() called — query={query!r}, directory={directory!r}, file_pattern={file_pattern!r}")
            
            if directory:
                directory_path = Path(directory)
                if directory_path.is_absolute():
                    search_dir = directory_path
                    logger.info(f"[ripgrep] 绝对路径检测: {directory} → {search_dir}")
                else:
                    search_dir = self.data_dir / directory
                    logger.info(f"[ripgrep] 相对路径拼接: {directory} + {self.data_dir} → {search_dir}")
            else:
                search_dir = self.data_dir
                logger.info(f"[ripgrep] 未指定目录，使用默认: {search_dir}")
            
            if not search_dir.exists():
                logger.warning(f"[ripgrep] 搜索目录不存在: {search_dir}")
                return ""
            
            logger.info(f"[ripgrep] 搜索目录确认存在: {search_dir}")
            
            cmd = [settings.RG_EXECUTABLE, query, str(search_dir)]
            logger.info(f"[ripgrep] 完整命令: {' '.join(cmd)}")
            
            if not case_sensitive:
                cmd.append("-i")
            
            # 显示1行上下文
            cmd.append("-C")
            cmd.append("1")
            
            if file_pattern:
                cmd.append("-g")
                cmd.append(file_pattern)
            
            if max_results:
                cmd.append("--max-count")
                cmd.append(str(max_results))
            
            cmd.append("--line-number")
            cmd.append("--no-heading")
            cmd.append("--color=never")
            
            
            # 使用传入的 ignore_file 文件过滤
            if ignore_file:
                ignore_path = Path(ignore_file)
                if ignore_path.exists():
                    # 默认禁用 .gitignore 等 VCS ignore 文件，避免搜索不到内容
                    cmd.append("--no-ignore-vcs")
                    cmd.append("--ignore-file")
                    cmd.append(str(ignore_path))
            
            # 使用 run_in_executor 包装同步 subprocess，避免 Windows 上 asyncio subprocess 的问题
            def run_rg():
                result = subprocess.run(
                    cmd,
                    capture_output=True,
                    text=True,
                    encoding='utf-8',
                    errors='ignore'
                )
                return result
            
            loop = asyncio.get_running_loop()
            result = await loop.run_in_executor(None, run_rg)
            
            logger.info(f"[ripgrep] returncode={result.returncode}, stdout长度={len(result.stdout)}, stderr={result.stderr!r}")
            
            if result.returncode != 0:
                if "No matches found" in result.stderr or result.returncode == 1:
                    logger.info(f"[ripgrep] 无匹配结果 (returncode=1)")
                    return ""
                else:
                    logger.error(f"[ripgrep] 搜索失败! returncode={result.returncode}, stderr={result.stderr!r}")
                    return ""
            
            # 直接返回原始输出，不进行解析
            output = result.stdout
            return output
            
        except FileNotFoundError as e:
            logger.error(f"[ripgrep] 可执行文件未找到: {e}")
            return ""
        except Exception as e:
            logger.exception(f"[ripgrep] 搜索异常: {e}")
            return ""


ripgrep_service = RipgrepSearchService()
