"""
shell 工具 - 对标 opencode-dev shell tool

Executes a given command in a persistent shell session with optional timeout.

⚠️ 当前运行环境: Windows (cmd.exe)，非 Linux/macOS bash！
- 不要使用 bash 特有语法: $(command)、`` `command` ``
- 不要使用 Unix 特有命令: uname, which, grep, sed, awk, cat, ps, kill, chmod 等
- 路径分隔符请使用反斜杠 \ 或正斜杠 /
- 环境变量引用使用 %VAR_NAME% 而非 $VAR_NAME
- 获取日期时间使用 %date% %time%

Usage:
- The command argument is required.
- You can specify an optional timeout in milliseconds. If not specified, commands will time out after 120000ms (2 minutes).
- It is very helpful if you write a clear, concise description of what this command does in 5-10 words.
- If the output exceeds limits, it will be truncated.
- Avoid using Shell for file operations (reading, writing, editing, searching, finding files).
  Use the specialized tools (Read, Write, Edit, Grep, Glob) instead.
"""

import asyncio
import os
import sys
from pydantic import BaseModel, Field

from backend.settings.settings import settings
from backend.ai_agent.tool.base import (
    ExecuteResult,
    ToolContext,
    ToolDef,
    register_tool,
)


class ShellParams(BaseModel):
    command: str = Field(description="The command to execute (Windows cmd.exe syntax)")
    description: str = Field(
        description=(
            "Clear, concise description of what this command does in 5-10 words. "
            "Examples:\n"
            "Input: dir\n"
            "Output: Lists files in current directory\n\n"
            "Input: git status\n"
            "Output: Shows working tree status"
        )
    )
    timeout: int | None = Field(
        default=None,
        description="Optional timeout in milliseconds (default: 120000, max: 300000)",
    )
    workdir: str | None = Field(
        default=None,
        description=(
            "The working directory to run the command in. "
            "Defaults to the current directory. Use this instead of 'cd' commands."
        ),
    )


@register_tool
class ShellTool(ToolDef):
    id = "shell"
    description = (
        "Executes a given command in a shell session with optional timeout, "
        "ensuring proper handling and security measures.\n\n"
        "⚠️ CURRENT PLATFORM: Windows (cmd.exe) — NOT Linux/macOS bash!\n"
        "DO NOT use bash-specific syntax or Unix-only commands.\n\n"
        "Windows-compatible examples:\n"
        "- List files: dir\n"
        "- Print working directory: cd\n"
        "- Environment variable: echo %PATH%\n"
        "- Date/time: echo %date% %time%\n"
        "- Clear screen: cls\n"
        "- Find string in file: findstr \"pattern\" file.txt\n\n"
        "INCOMPATIBLE (will fail on cmd.exe):\n"
        "- $(command) or `command` — use %command% syntax or plain command\n"
        "- uname, which, grep, sed, awk, cat, chmod, ps, kill — not available on Windows\n"
        "- $VAR — use %VAR% instead\n"
        "- ls, pwd — use dir, cd instead\n\n"
        "All commands run in the current working directory by default. "
        "Use the `workdir` parameter if you need to run a command in a different directory. "
        "AVOID changing directories inside the command - use `workdir` instead.\n\n"
        "IMPORTANT: This tool is for terminal operations like git, npm, python, etc. "
        "DO NOT use it for file operations (reading, writing, editing, searching, finding files) "
        "- use the specialized tools for this instead.\n\n"
        "Usage notes:\n"
        "- The command argument is required.\n"
        "- You can specify an optional timeout in milliseconds. If not specified, "
        "commands will time out after 120000ms (2 minutes).\n"
        "- It is very helpful if you write a clear, concise description of what this command "
        "does in 5-10 words.\n"
        "- If the output exceeds limits, it will be truncated.\n"
        "- Avoid using Shell with file commands (echo >, findstr, etc.). "
        "Use Read, Grep, Glob, Write, Edit instead."
    )
    parameters = ShellParams

    async def execute(self, params: ShellParams, ctx: ToolContext) -> ExecuteResult:
        command = params.command
        timeout_ms = params.timeout or 120000
        timeout_s = timeout_ms / 1000
        workdir = params.workdir or settings.DATA_DIR

        if not command:
            return ExecuteResult(
                title=params.description or "(no description)",
                output="(no output)",
                metadata={"exit": None, "truncated": False},
            )

        try:
            process = await asyncio.create_subprocess_shell(
                command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=workdir,
                env=os.environ.copy(),
            )

            try:
                stdout, stderr = await asyncio.wait_for(
                    process.communicate(), timeout=timeout_s
                )
            except asyncio.TimeoutError:
                try:
                    process.kill()
                    await process.wait()
                except Exception:
                    pass
                return ExecuteResult(
                    title=params.description or "(no description)",
                    output=(
                        f"shell tool terminated command after exceeding timeout "
                        f"{timeout_ms} ms."
                    ),
                    metadata={"exit": None, "truncated": False},
                )

            stdout_text = stdout.decode("utf-8", errors="ignore") if stdout else ""
            stderr_text = stderr.decode("utf-8", errors="ignore") if stderr else ""

            output_parts = []
            if stdout_text:
                output_parts.append(stdout_text)
            if stderr_text:
                output_parts.append(stderr_text)

            output = "\n".join(output_parts) if output_parts else "(no output)"
            title = params.description or "(no description)"

            return ExecuteResult(
                title=title,
                output=output,
                metadata={
                    "exit": process.returncode,
                    "description": params.description,
                    "truncated": False,
                },
            )

        except Exception as e:
            return ExecuteResult(
                title=params.description or "(no description)",
                output=f"Command failed: {e}",
                metadata={"exit": None, "truncated": False},
            )