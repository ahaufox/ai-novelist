from pydantic import BaseModel, Field

from backend.ai_agent.tool.base import (
    ExecuteResult,
    ToolDef,
    register_tool,
)


class QuestionParams(BaseModel):
    content: str = Field(description="向用户提出的问题内容")


@register_tool
class QuestionTool(ToolDef):
    id = "question"
    description = "向用户提问"
    parameters = QuestionParams

    async def execute(self, params: QuestionParams, _ctx) -> ExecuteResult:
        return ExecuteResult(
            title="已向用户提问",
            output="问题已发送给用户",
        )