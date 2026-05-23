"""rag_search 工具

在向量数据库中检索语义相近内容
"""

from pydantic import BaseModel, Field
from typing import Optional

from backend.ai_agent.tool.base import (
    ExecuteResult,
    ToolContext,
    ToolDef,
    register_tool,
)
from backend.ai_agent.embedding.emb_service import asearch_emb


class RagSearchParams(BaseModel):
    collection_id: str = Field(description="知识库ID (e.g., db_xxx)")
    query: str = Field(description="搜索查询文本")
    filename_filter: Optional[str] = Field(
        default=None,
        description="可选的文件名筛选，用于缩减范围，提升精准度",
    )


@register_tool
class RagSearchTool(ToolDef):
    id = "rag_search"
    description = (
        "在向量数据库中检索语义相近内容\n\n"
        "建议生成句子而非词语，便于向量匹配\n"
        '例如：\n'
        '"龙可是帝王之征啊"（√）\n'
        '"龙"，"皇帝"等词语（×）'
    )
    parameters = RagSearchParams

    async def execute(self, params: RagSearchParams, ctx: ToolContext) -> ExecuteResult:
        try:
            results = await asearch_emb(
                collection_name=params.collection_id,
                search_input=params.query,
                filename_filter=params.filename_filter,
            )

            if not results:
                return ExecuteResult(
                    title="向量搜索完成",
                    output=(
                        f"【工具结果】：在集合 '{params.collection_id}' "
                        f"中没有找到与查询 '{params.query}' 相关的内容"
                    ),
                )

            formatted_results = []
            for i, (doc, score) in enumerate(results):
                metadata = doc.metadata
                original_filename = metadata.get("original_filename", "未知")
                result_item = (
                    f"结果 {i+1} (相似度: {score:.4f}):\n"
                    f"来源文件: {original_filename}\n"
                    f"内容: {doc.page_content}\n"
                )
                formatted_results.append(result_item)

            results_text = "\n".join(formatted_results)
            return ExecuteResult(
                title="向量搜索完成",
                output=(
                    f"【工具结果】：在集合 '{params.collection_id}' "
                    f"中找到 {len(results)} 个与查询 '{params.query}' 相关的结果：\n\n"
                    f"{results_text}"
                ),
                metadata={
                    "result_count": len(results),
                    "collection_id": params.collection_id,
                },
            )

        except Exception as e:
            return ExecuteResult(
                title="向量搜索错误",
                output=f"【工具结果】：搜索过程中发生错误: {str(e)}",
                metadata={"error": str(e)},
            )
