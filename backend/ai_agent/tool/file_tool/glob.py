"""
glob 工具 - 对标 opencode-dev glob tool

- Fast file pattern matching tool that works with any codebase size
- Supports glob patterns like "**/*.py" or "src/**/*.ts"
- Returns matching file paths sorted by modification time
- Use this tool when you need to find files by name patterns
- When you are doing an open-ended search that may require multiple rounds of globbing
  and grepping, use the Task tool instead
"""

import os
import subprocess
from pathlib import Path

from pydantic import BaseModel, Field

from backend.file.file_service import resolve_file_path
from backend.settings.settings import settings
from backend.ai_agent.tool.base import (
    ExecuteResult,
    ToolContext,
    ToolDef,
    register_tool,
)

MAX_RESULTS = 100


class GlobParams(BaseModel):
    pattern: str = Field(description="The glob pattern to match files against")
    path: str | None = Field(
        default=None,
        description=(
            "The directory to search in. If not specified, the current working directory "
            "will be used. IMPORTANT: Omit this field to use the default directory. "
            "Must be a valid directory path if provided."
        ),
    )


@register_tool
class GlobTool(ToolDef):
    id = "glob"
    description = (
        "- Fast file pattern matching tool that works with any codebase size\n"
        "- Supports glob patterns like \"**/*.py\" or \"src/**/*.ts\"\n"
        "- Returns matching file paths sorted by modification time\n"
        "- Use this tool when you need to find files by name patterns\n"
        "- When you are doing an open-ended search that may require multiple rounds "
        "of globbing and grepping, use the Task tool instead"
    )
    parameters = GlobParams

    async def execute(self, params: GlobParams, ctx: ToolContext) -> ExecuteResult:
        search_path = str(
            resolve_file_path(params.path).resolve()
            if params.path
            else Path(settings.DATA_DIR).resolve()
        )

        if not Path(search_path).exists():
            return ExecuteResult(
                title=params.pattern,
                output="No files found",
                metadata={"count": 0, "truncated": False},
            )

        if Path(search_path).is_file():
            return ExecuteResult(
                title=params.pattern,
                output="No files found",
                metadata={"count": 0, "truncated": False},
            )

        try:
            # Use ripgrep with --files + -g for glob matching
            cmd = [
                settings.RG_EXECUTABLE,
                "--files",
                "-g", params.pattern,
                search_path,
                "--color=never",
                "--no-ignore",
            ]

            loop = asyncio.get_running_loop()

            def run_rg():
                result = subprocess.run(
                    cmd, capture_output=True, text=True, encoding="utf-8", errors="ignore"
                )
                return result

            result = await loop.run_in_executor(None, run_rg)

            if result.returncode not in (0, 1):
                return ExecuteResult(
                    title=params.pattern,
                    output="No files found",
                    metadata={"count": 0, "truncated": False},
                )

            files = [f.strip() for f in result.stdout.strip().split("\n") if f.strip()]
            total = len(files)
            truncated = total > MAX_RESULTS
            if truncated:
                files = files[:MAX_RESULTS]

            if total == 0:
                return ExecuteResult(
                    title=params.pattern,
                    output="No files found",
                    metadata={"count": 0, "truncated": False},
                )

            output_lines = list(files)
            if truncated:
                output_lines.append("")
                output_lines.append(
                    f"(Results are truncated: showing first {MAX_RESULTS} results. "
                    "Consider using a more specific path or pattern.)"
                )

            return ExecuteResult(
                title=params.pattern,
                output="\n".join(output_lines),
                metadata={"count": total, "truncated": truncated},
            )

        except Exception as e:
            return ExecuteResult(
                title=params.pattern,
                output="No files found",
                metadata={"count": 0, "truncated": False},
            )


import asyncio