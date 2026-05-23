"""rag_list_files 工具

获取指定知识库内的文件列表
"""

from pydantic import BaseModel, Field

from backend.ai_agent.tool.base import (
    ExecuteResult,
    ToolContext,
    ToolDef,
    register_tool,
)
from backend.ai_agent.embedding.emb_service import get_files_in_collection


class RagListFilesParams(BaseModel):
    collection_id: str = Field(description="知识库ID (e.g., db_xxx)")


@register_tool
class RagListFilesTool(ToolDef):
    id = "rag_list_files"
    description = "获取指定知识库内的文件列表"
    parameters = RagListFilesParams

    async def execute(
        self, params: RagListFilesParams, ctx: ToolContext
    ) -> ExecuteResult:
        try:
            file_info = get_files_in_collection(params.collection_id)

            if not file_info:
                return ExecuteResult(
                    title="知识库文件列表",
                    output=f"【工具结果】：集合 '{params.collection_id}' 中没有文件",
                )

            formatted_files = []
            for filename, info in file_info.items():
                file_item = (
                    f"文件名: {filename}\n"
                    f"  文档块数: {info['chunk_count']}\n"
                    f"  分块大小: {info['chunk_size']}\n"
                    f"  重叠大小: {info['chunk_overlap']}\n"
                )
                formatted_files.append(file_item)

            files_text = "\n".join(formatted_files)
            return ExecuteResult(
                title="知识库文件列表",
                output=(
                    f"【工具结果】：集合 '{params.collection_id}' "
                    f"中包含 {len(file_info)} 个文件：\n\n"
                    f"{files_text}"
                ),
                metadata={
                    "file_count": len(file_info),
                    "collection_id": params.collection_id,
                },
            )

        except Exception as e:
            return ExecuteResult(
                title="知识库文件列表错误",
                output=f"【工具结果】：列出知识库文件时发生错误: {str(e)}",
                metadata={"error": str(e)},
            )
