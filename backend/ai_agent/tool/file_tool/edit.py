"""
edit 工具

Performs exact string replacements in files.
后端的核心逻辑：接收最终内容，直接写入文件。
实际的搜索替换和 diff 预览全部在前端完成。
"""

from pydantic import BaseModel, Field

from backend.file.file_service import resolve_file_path
from backend.ai_agent.tool.base import (
    ExecuteResult,
    ToolContext,
    ToolDef,
    register_tool,
)


class EditParams(BaseModel):
    filePath: str = Field(description="The absolute path to the file to modify")
    oldString: str = Field(description="The text to replace (must match exactly, including whitespace and indentation)")
    newString: str = Field(
        description="The text to replace it with (must be different from oldString)"
    )
    replaceAll: bool | None = Field(
        default=None,
        description="Replace all occurrences of oldString (default false)",
    )


@register_tool
class EditTool(ToolDef):
    id = "edit"
    description = (
        "Performs exact string replacements in files.\n\n"
        "Usage:\n"
        "- You must use your `Read` tool at least once in the conversation before editing.\n"
        "- When editing text from Read tool output, ensure you preserve the exact indentation "
        "(tabs/spaces) as it appears AFTER the line number prefix.\n"
        "- ALWAYS prefer editing existing files. NEVER write new files unless explicitly required.\n"
        "- The edit will FAIL if `oldString` is not found in the file.\n"
        "- The edit will FAIL if `oldString` is found multiple times in the file. Either provide "
        "a larger string with more surrounding context to make it unique or use `replaceAll` to "
        "change every instance.\n"
        "- Use `replaceAll` for replacing and renaming strings across the file."
    )
    parameters = EditParams

    async def execute(self, params: EditParams, ctx: ToolContext) -> ExecuteResult:
        """
        执行编辑。
        
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
                print(
                    f"[HITL-DEBUG] edit 工具缺少 final_content: "
                    f"ctx.extra={'None' if ctx.extra is None else dict(ctx.extra)}, "
                    f"filepath={filepath}",
                    flush=True,
                )
                return ExecuteResult(
                    title=filepath,
                    output="Edit requires HITL approval. Please approve the change in the UI.",
                    metadata={"error": "hitl_required", "changed": False},
                )

            final_content = ctx.extra["final_content"]

            # 确保目录存在
            resolved.parent.mkdir(parents=True, exist_ok=True)

            # 直接写入最终内容
            with open(abs_path, "w", encoding="utf-8") as f:
                f.write(final_content)

            return ExecuteResult(
                title=filepath,
                output="Edit applied successfully.",
                metadata={
                    "changed": True,
                    "filepath": abs_path,
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
                output=f"Edit failed: {e}",
                metadata={"error": str(e)},
            )
