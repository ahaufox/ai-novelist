"""
grep 工具

- Fast content search tool that works with any codebase size
- Searches file contents using regular expressions
- Supports full regex syntax (eg. "log.*Error", "function\s+\w+", etc.)
- Filter files by pattern with the include parameter (eg. "*.js", "*.{ts,tsx}")
- Returns file paths and line numbers with at least one match
- Use this tool when you need to find files containing specific patterns
- If you need to identify/count the number of matches within files, use the Shell tool
  with `rg` (ripgrep) directly. Do NOT use `grep`.
"""

import os
import re
import asyncio
import logging
from pathlib import Path

from pydantic import BaseModel, Field

from backend.file.ripgrep_service import ripgrep_service
from backend.file.file_service import resolve_file_path
from backend.settings.settings import settings
from backend.ai_agent.tool.base import (
    ExecuteResult,
    ToolContext,
    ToolDef,
    register_tool,
)

logger = logging.getLogger(__name__)

MAX_LINE_LENGTH = 2000
MAX_RESULTS = 100


class GrepParams(BaseModel):
    pattern: str = Field(description="The regex pattern to search for in file contents")
    path: str | None = Field(
        default=None,
        description="The directory to search in. Defaults to the current working directory.",
    )
    include: str | None = Field(
        default=None,
        description='File pattern to include in the search (e.g. "*.js", "*.{ts,tsx}")',
    )


@register_tool
class GrepTool(ToolDef):
    id = "grep"
    description = (
        "- Fast content search tool that works with any codebase size\n"
        "- Searches file contents using regular expressions\n"
        "- Supports full regex syntax (eg. \"log.*Error\", \"function\\s+\\w+\", etc.)\n"
        "- Filter files by pattern with the include parameter (eg. \"*.js\", \"*.{ts,tsx}\")\n"
        "- Returns file paths and line numbers with at least one match sorted by modification time\n"
        "- Use this tool when you need to find files containing specific patterns\n"
        "- If you need to identify/count the number of matches within files, "
        "use the Shell tool with `rg` (ripgrep) directly. Do NOT use `grep`."
    )
    parameters = GrepParams

    async def execute(self, params: GrepParams, ctx: ToolContext) -> ExecuteResult:
        pattern = params.pattern
        logger.info(f"[GrepTool] execute() called — pattern={pattern!r}, path={params.path!r}, include={params.include!r}")
        
        if not pattern:
            logger.warning(f"[GrepTool] pattern为空")
            return ExecuteResult(
                title=pattern,
                output="No files found",
                metadata={"matches": 0, "truncated": False},
            )

        try:
            search_dir = None
            if params.path:
                resolved = resolve_file_path(params.path)
                search_dir = str(resolved.resolve())
                logger.info(f"[GrepTool] 路径已解析: path={params.path!r} → resolved={resolved!r} → search_dir={search_dir!r}")
            else:
                search_dir = settings.DATA_DIR
                logger.info(f"[GrepTool] 未指定路径，使用默认: {search_dir!r}")

            search_path = Path(search_dir)
            logger.info(f"[GrepTool] 搜索路径是否存在? {search_path.exists()}")
            if not search_path.exists():
                logger.warning(f"[GrepTool] 路径不存在: {search_dir}")
                return ExecuteResult(
                    title=pattern,
                    output="No files found",
                    metadata={"matches": 0, "truncated": False},
                )

            logger.info(f"[GrepTool] 准备调用 ripgrep_service.search()")
            ignore_file = os.path.join(settings.DATA_DIR, '.aiignore')
            raw_output = await ripgrep_service.search(
                query=pattern,
                directory=search_dir,
                file_pattern=params.include,
                max_results=MAX_RESULTS + 1,
                ignore_file=ignore_file,
            )
            logger.info(f"[GrepTool] ripgrep_service.search() 返回, 结果长度={len(raw_output) if raw_output else 0}")

            if not raw_output:
                logger.info(f"[GrepTool] 无结果返回")
                return ExecuteResult(
                    title=pattern,
                    output="No files found",
                    metadata={"matches": 0, "truncated": False},
                )

            # Parse ripgrep output: "filepath:linenum:text"
            # 注意: Windows 路径如 F:\data\file.yaml:42:content 含盘符冒号，
            # 不能用 .split(":", 2) 解析，必须用正则提取最后一个 :num: 作为行号
            rg_line_re = re.compile(r'^(.+):(\d+):(.*)$')
            lines = raw_output.strip().split("\n")
            results = []
            for line in lines:
                m = rg_line_re.match(line)
                if m:
                    filepath = m.group(1)
                    linenum = int(m.group(2))
                    text = m.group(3)
                    if len(text) > MAX_LINE_LENGTH:
                        text = text[:MAX_LINE_LENGTH] + "..."
                    results.append({
                        "file": filepath,
                        "line": linenum,
                        "text": text,
                    })

            total = len(results)
            logger.info(f"[GrepTool] 解析完成: {len(lines)} 行原始输出 → {total} 个匹配结果")
            truncated = total > MAX_RESULTS
            if truncated:
                results = results[:MAX_RESULTS]

            if total == 0:
                return ExecuteResult(
                    title=pattern,
                    output="No files found",
                    metadata={"matches": 0, "truncated": False},
                )

            # Format output
            output_lines = [
                f"Found {total} matches{truncated and f' (showing first {MAX_RESULTS})' or ''}"
            ]
            current_file = ""
            for r in results:
                if r["file"] != current_file:
                    if current_file:
                        output_lines.append("")
                    current_file = r["file"]
                    output_lines.append(f"{current_file}:")
                output_lines.append(f"  Line {r['line']}: {r['text']}")

            if truncated:
                output_lines.append("")
                output_lines.append(
                    f"(Results truncated: showing {MAX_RESULTS} of {total} matches "
                    f"({total - MAX_RESULTS} hidden). "
                    "Consider using a more specific path or pattern.)"
                )

            return ExecuteResult(
                title=pattern,
                output="\n".join(output_lines),
                metadata={"matches": total, "truncated": truncated},
            )

        except Exception as e:
            logger.exception(f"[GrepTool] 执行异常: {e}")
            return ExecuteResult(
                title=pattern,
                output="No files found",
                metadata={"matches": 0, "truncated": False},
            )
