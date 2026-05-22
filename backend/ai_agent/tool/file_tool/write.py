"""
write 工具 - 对标 opencode-dev write tool

Writes a file to the local filesystem.
后端的核心逻辑：接收最终内容，直接写入文件。
"""

from pydantic import BaseModel, Field

from backend.file.file_service import resolve_file_path, normalize_line_endings
from backend.ai_agent.tool.base import (
    ExecuteResult,
    ToolContext,
    ToolDef,
    register_tool,
)


class WriteParams(BaseModel):
    filePath: str = Field(
        description="The absolute path to the file to write (must be absolute, not relative)"
    )
    content: str = Field(
        description="The content to write to the file"
    )


@register_tool
class WriteTool(ToolDef):
    id = "write"
    description = (
        "Writes a file to the local filesystem.\n\n"
        "Usage:\n"
        "- This tool will overwrite the existing file if there is one at the provided path.\n"
        "- If this is an existing file, you MUST use the Read tool first to read the file's contents.\n"
        "- ALWAYS prefer editing existing files. NEVER write new files unless explicitly required."
    )
    parameters = WriteParams

    async def execute(self, params: WriteParams, ctx: ToolContext) -> ExecuteResult:
        """
        执行写入。
        
        文件修改已由前端 HITL 流程处理完毕，
        后端仅负责将前端传来的最终内容写入文件。
        
        final_content 通过 ctx.extra["final_content"] 传入。
        """
        filepath = params.filePath
        resolved = resolve_file_path(filepath)
        abs_path = str(resolved.resolve())

        try:
            # 从 HITL 流程获取最终内容
            if not (ctx.extra and ctx.extra.get("final_content") is not None):
                return ExecuteResult(
                    title=filepath,
                    output="Write requires HITL approval. Please approve the change in the UI.",
                    metadata={"error": "hitl_required", "changed": False},
                )

            final_content = ctx.extra["final_content"]

            # 确保目录存在
            resolved.parent.mkdir(parents=True, exist_ok=True)

            # 统一换行符，避免 Windows text mode 双重翻译导致 \r\r\n
            final_content = normalize_line_endings(final_content)

            # 写入最终内容
            with open(abs_path, "w", encoding="utf-8") as f:
                f.write(final_content)

            return ExecuteResult(
                title=filepath,
                output="File written successfully.",
                metadata={
                    "filepath": abs_path,
                    "size": len(final_content),
                },
            )

        except PermissionError:
            return ExecuteResult(
                title=filepath,
                output=f"Permission denied: {filepath}",
                metadata={"error": "permission_denied"},
            )
        except Exception as e:
            return ExecuteResult(
                title=filepath,
                output=f"Write failed: {e}",
                metadata={"error": str(e)},
            )
