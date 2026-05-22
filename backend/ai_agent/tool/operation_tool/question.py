"""
question 工具 - 对标 opencode-dev question tool

Use this tool when you need to ask the user questions during execution.
This allows you to:
1. Gather user preferences or requirements
2. Clarify ambiguous instructions
3. Get decisions on implementation choices as you work
4. Offer choices to the user about what direction to take.
"""

from pydantic import BaseModel, Field

from backend.ai_agent.tool.base import (
    ExecuteResult,
    ToolContext,
    ToolDef,
    register_tool,
)


class QuestionItem(BaseModel):
    question: str = Field(description="The question to ask the user")
    options: list[str] | None = Field(
        default=None,
        description="Optional list of pre-defined options for the user to choose from",
    )


class QuestionParams(BaseModel):
    questions: list[QuestionItem] = Field(
        description="Questions to ask the user",
        min_length=1,
    )


@register_tool
class QuestionTool(ToolDef):
    id = "question"
    description = (
        "Use this tool when you need to ask the user questions during execution. "
        "This allows you to:\n"
        "1. Gather user preferences or requirements\n"
        "2. Clarify ambiguous instructions\n"
        "3. Get decisions on implementation choices as you work\n"
        "4. Offer choices to the user about what direction to take.\n\n"
        "Usage notes:\n"
        '- When `custom` is enabled (default), a "Type your own answer" option is '
        "added automatically; don't include \"Other\" or catch-all options\n"
        "- Answers are returned as arrays of labels; set `multiple: true` to allow "
        "selecting more than one\n"
        '- If you recommend a specific option, make that the first option in the list '
        'and add "(Recommended)" at the end of the label'
    )
    parameters = QuestionParams

    async def execute(self, params: QuestionParams, ctx: ToolContext) -> ExecuteResult:
        formatted = ", ".join(
            f'"{q.question}"' for q in params.questions
        )
        return ExecuteResult(
            title=f"Asked {len(params.questions)} question(s)",
            output=(
                f"User has answered your questions: {formatted}. "
                "You can now continue with the user's answers in mind."
            ),
            metadata={
                "questions": [
                    {"question": q.question, "options": q.options}
                    for q in params.questions
                ],
            },
        )