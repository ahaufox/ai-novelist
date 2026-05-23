"""
skill 工具

Load a specialized skill when the task at hand matches one of the skills
listed in the system prompt.

Use this tool to inject the skill's instructions and resources into the
current conversation. The output may contain detailed workflow guidance
as well as references to scripts, files, etc. in the same directory as the skill.

The skill name must match one of the skills listed in your system prompt.
"""

from pydantic import BaseModel, Field

from backend.ai_agent.tool.base import (
    ExecuteResult,
    ToolContext,
    ToolDef,
    register_tool,
)


class SkillParams(BaseModel):
    name: str = Field(description="The name of the skill from available_skills")


@register_tool
class SkillTool(ToolDef):
    id = "skill"
    description = (
        "Load a specialized skill when the task at hand matches one of the "
        "skills listed in the system prompt.\n\n"
        "Use this tool to inject the skill's instructions and resources into "
        "the current conversation. The output may contain detailed workflow "
        "guidance as well as references to scripts, files, etc. in the same "
        "directory as the skill.\n\n"
        "The skill name must match one of the skills listed in your system prompt."
    )
    parameters = SkillParams

    async def execute(self, params: SkillParams, ctx: ToolContext) -> ExecuteResult:
        from backend.ai_agent.skill import get_skill_loader

        skill_loader = get_skill_loader()
        all_skills = skill_loader.load_all_skills()

        skill = all_skills.get(params.name)
        if not skill:
            available = ", ".join(s.name for s in all_skills.values()) if all_skills else "none"
            return ExecuteResult(
                title=params.name,
                output=f'Skill "{params.name}" not found. Available skills: {available}',
                metadata={"error": "not_found"},
            )

        return ExecuteResult(
            title=f"Loaded skill: {params.name}",
            output=(
                f'<skill_content name="{skill.name}">\n'
                f"# Skill: {skill.name}\n\n"
                f"{skill.content.strip()}\n\n"
                f'Base directory for this skill: {skill.base_dir}/\n'
                f"</skill_content>"
            ),
            metadata={
                "name": skill.name,
                "dir": str(skill.base_dir),
            },
        )
