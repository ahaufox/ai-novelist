"""
skill 工具

Load a specialized skill when the task at hand matches one of the skills
listed in the system prompt.

Use this tool to inject the skill's instructions and resources into the
current conversation. The output may contain detailed workflow guidance
as well as references to scripts, files, etc. in the same directory as the skill.

The skill name must match one of the skills listed in your system prompt.
"""

import os
from pathlib import Path
from urllib.parse import quote

from pydantic import BaseModel, Field

from backend.ai_agent.tool.base import (
    ExecuteResult,
    ToolContext,
    ToolDef,
    register_tool,
)

# 扫描文件时的排除列表
_SKIP_DIRS = {"__pycache__", ".git", ".venv", "node_modules", ".mypy_cache", ".pytest_cache"}
_SKIP_EXTS = {".pyc", ".pyo"}
_SKIP_FILES = {"SKILL.md"}
_MAX_FILES = 20  # 最多列出 20 个文件


def _scan_skill_files(skill_dir: Path) -> list[str]:
    """扫描 skill 目录下的文件（排除 SKILL.md 和缓存目录），返回绝对路径列表"""
    files: list[str] = []
    for root, dirs, filenames in os.walk(str(skill_dir), topdown=True):
        # 跳过排除目录（直接修改 dirs 列表可阻止 os.walk 进入这些目录）
        dirs[:] = [d for d in dirs if d not in _SKIP_DIRS and not d.startswith(".")]
        for name in filenames:
            ext = os.path.splitext(name)[1].lower()
            if ext in _SKIP_EXTS:
                continue
            if name in _SKIP_FILES:
                continue
            file_path = os.path.join(root, name)
            files.append(os.path.normpath(file_path))
        if len(files) >= _MAX_FILES:
            break
    return files[:_MAX_FILES]


def _path_to_file_url(path: Path) -> str:
    """将路径转换为 file:// URI（兼容 Windows）"""
    # Windows: Path("C:\\foo") → "file:///C:/foo"
    resolved = path.resolve()
    return f"file:///{quote(str(resolved), safe='/:\\')}"


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

        # 扫描 skill 目录下的文件
        skill_files = _scan_skill_files(skill.base_dir)
        files_xml = "\n".join(f"<file>{f}</file>" for f in skill_files)

        # 生成 file:// URI
        base_url = _path_to_file_url(skill.base_dir)

        return ExecuteResult(
            title=f"Loaded skill: {params.name}",
            output=(
                f'<skill_content name="{skill.name}">\n'
                f"# Skill: {skill.name}\n\n"
                f"{skill.content.strip()}\n\n"
                f"Base directory for this skill: {base_url}\n"
                f"Relative paths in this skill (e.g., scripts/, reference/) "
                f"are relative to this base directory.\n"
                f"Note: file list is sampled.\n"
                f"\n"
                f"<skill_files>\n"
                f"{files_xml}\n"
                f"</skill_files>\n"
                f"</skill_content>"
            ),
            metadata={
                "name": skill.name,
                "dir": str(skill.base_dir),
            },
        )
