"""
read 工具 - 对标 opencode-dev read tool

Read a file or directory from the local filesystem. If the path does not exist, an error is returned.

Usage:
- The filePath parameter should be an absolute path.
- By default, this tool returns up to 2000 lines from the start of the file.
- The offset parameter is the line number to start from (1-indexed).
- To read later sections, call this tool again with a larger offset.
- Use the grep tool to find specific content in large files or files with long lines.
- If you are unsure of the correct file path, use the glob tool to look up filenames by glob pattern.
- Contents are returned with each line prefixed by its line number as `<line>: <content>`.
  For directories, entries are returned one per line with a trailing `/` for subdirectories.
- Any line longer than 2000 characters is truncated.
- Call this tool in parallel when you know there are multiple files you want to read.
- Avoid tiny repeated slices (30 line chunks). If you need more context, read a larger window.
- This tool can read image files and PDFs and return them as file attachments.
"""

import os
from pathlib import Path

from pydantic import BaseModel, Field

from backend.file.file_service import resolve_file_path
from backend.ai_agent.tool.base import (
    ExecuteResult,
    ToolContext,
    ToolDef,
    register_tool,
)

MAX_LINE_LENGTH = 2000
MAX_BYTES = 50 * 1024
DEFAULT_READ_LIMIT = 2000
SUPPORTED_IMAGE_MIMES = {"image/png", "image/jpeg", "image/gif", "image/webp"}


class ReadParams(BaseModel):
    filePath: str = Field(
        description="The absolute path to the file or directory to read"
    )
    offset: int | None = Field(
        default=None,
        description="The line number to start reading from (1-indexed)",
    )
    limit: int | None = Field(
        default=None,
        description="The maximum number of lines to read (defaults to 2000)",
    )


def _sniff_mime(filepath: str) -> str:
    ext = Path(filepath).suffix.lower()
    mime_map = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".webp": "image/webp",
        ".pdf": "application/pdf",
    }
    return mime_map.get(ext, "application/octet-stream")


def _is_binary(filepath: str, sample: bytes) -> bool:
    ext = Path(filepath).suffix.lower()
    binary_exts = {
        ".exe", ".dll", ".so", ".class", ".jar", ".zip", ".tar",
        ".gz", ".7z", ".bin", ".dat", ".obj", ".o", ".a", ".lib",
        ".wasm", ".pyc", ".pyo",
    }
    if ext in binary_exts:
        return True
    if len(sample) == 0:
        return False
    non_printable = sum(1 for b in sample if b == 0 or (b < 9) or (13 < b < 32))
    return non_printable / len(sample) > 0.3


@register_tool
class ReadTool(ToolDef):
    id = "read"
    description = (
        "Read a file or directory from the local filesystem. "
        "If the path does not exist, an error is returned.\n\n"
        "Usage:\n"
        "- The filePath parameter should be an absolute path.\n"
        "- By default, this tool returns up to 2000 lines from the start of the file.\n"
        "- The offset parameter is the line number to start from (1-indexed).\n"
        "- To read later sections, call this tool again with a larger offset.\n"
        "- Use the grep tool to find specific content in large files or files with long lines.\n"
        "- If you are unsure of the correct file path, use the glob tool to look up filenames by glob pattern.\n"
        "- Contents are returned with each line prefixed by its line number as `<line>: <content>`. "
        "For directories, entries are returned one per line with a trailing `/` for subdirectories.\n"
        "- Any line longer than 2000 characters is truncated.\n"
        "- Call this tool in parallel when you know there are multiple files you want to read.\n"
        "- This tool can read image files and PDFs and return them as file attachments."
    )
    parameters = ReadParams

    async def execute(self, params: ReadParams, ctx: ToolContext) -> ExecuteResult:
        filepath = params.filePath
        resolved = resolve_file_path(filepath)

        if not resolved.exists():
            parent = resolved.parent
            base = resolved.name.lower()
            suggestions = []
            if parent.exists():
                try:
                    for entry in sorted(parent.iterdir()):
                        if base in entry.name.lower() or entry.name.lower() in base:
                            suggestions.append(str(entry))
                            if len(suggestions) >= 3:
                                break
                except OSError:
                    pass

            if suggestions:
                return ExecuteResult(
                    title=filepath,
                    output=f"File not found: {filepath}\n\nDid you mean one of these?\n" + "\n".join(suggestions),
                    metadata={"error": "not_found", "suggestions": suggestions},
                )
            return ExecuteResult(
                title=filepath,
                output=f"File not found: {filepath}",
                metadata={"error": "not_found"},
            )

        if resolved.is_dir():
            return await self._read_dir(str(resolved.resolve()), filepath)
        return await self._read_file(str(resolved.resolve()), params)

    async def _read_dir(self, abs_path: str, display_path: str) -> ExecuteResult:
        entries = []
        try:
            for entry in sorted(os.scandir(abs_path), key=lambda e: (not e.is_dir(), e.name)):
                suffix = "/" if entry.is_dir() else ""
                entries.append(entry.name + suffix)
        except PermissionError:
            return ExecuteResult(
                title=display_path,
                output=f"Cannot access directory: {display_path}",
                metadata={"error": "permission_denied"},
            )

        total = len(entries)
        limit = DEFAULT_READ_LIMIT
        sliced = entries[:limit]
        truncated = len(sliced) < total

        lines = [
            f"<path>{abs_path}</path>",
            "<type>directory</type>",
            "<entries>",
            "\n".join(sliced),
            "",
            f"({sliced.__len__()} entries)" if not truncated else
            f"(Showing {len(sliced)} of {total} entries. Use 'offset' parameter to read beyond entry {limit})",
            "</entries>",
        ]
        return ExecuteResult(
            title=display_path,
            output="\n".join(lines),
            metadata={"preview": "\n".join(sliced[:20]), "truncated": truncated},
        )

    async def _read_file(self, abs_path: str, params: ReadParams) -> ExecuteResult:
        offset = params.offset or 1
        limit = params.limit or DEFAULT_READ_LIMIT

        try:
            file_size = os.path.getsize(abs_path)
            with open(abs_path, "rb") as f:
                sample = f.read(4096)

            mime = _sniff_mime(abs_path)
            is_image = mime in SUPPORTED_IMAGE_MIMES

            if is_image:
                import base64
                return ExecuteResult(
                    title=params.filePath,
                    output="Image read successfully",
                    metadata={"preview": "Image read successfully", "truncated": False},
                    attachments=[{
                        "type": "file",
                        "mime": mime,
                        "url": f"data:{mime};base64,{base64.b64encode(sample).decode()}",
                    }],
                )

            if mime == "application/pdf":
                import base64
                with open(abs_path, "rb") as f:
                    pdf_data = f.read()
                return ExecuteResult(
                    title=params.filePath,
                    output="PDF read successfully",
                    metadata={"preview": "PDF read successfully", "truncated": False},
                    attachments=[{
                        "type": "file",
                        "mime": mime,
                        "url": f"data:{mime};base64,{base64.b64encode(pdf_data).decode()}",
                    }],
                )

            if _is_binary(abs_path, sample):
                return ExecuteResult(
                    title=params.filePath,
                    output=f"Cannot read binary file: {params.filePath}",
                    metadata={"error": "binary_file"},
                )

            with open(abs_path, "r", encoding="utf-8", errors="ignore") as f:
                all_lines = f.readlines()

            total_lines = len(all_lines)
            if total_lines == 0:
                return ExecuteResult(
                    title=params.filePath,
                    output=f"<path>{abs_path}</path>\n<type>file</type>\n<content>\n\n(End of file - total 0 lines)\n</content>",
                    metadata={"preview": "", "truncated": False},
                )

            start = offset - 1
            if start < 0 or start >= total_lines:
                return ExecuteResult(
                    title=params.filePath,
                    output=f"Offset {offset} is out of range for this file ({total_lines} lines)",
                    metadata={"error": "out_of_range", "total_lines": total_lines},
                )

            end = min(start + limit, total_lines)
            raw_lines = all_lines[start:end]
            output_lines = []
            current_bytes = 0
            cut = False
            more = end < total_lines

            for i, line in enumerate(raw_lines):
                clean_line = line.rstrip("\n").rstrip("\r")
                if len(clean_line) > MAX_LINE_LENGTH:
                    clean_line = clean_line[:MAX_LINE_LENGTH] + f"... (line truncated to {MAX_LINE_LENGTH} chars)"
                formatted = f"{start + i + 1}: {clean_line}"
                line_bytes = len(formatted.encode("utf-8")) + (1 if output_lines else 0)
                if current_bytes + line_bytes <= MAX_BYTES:
                    output_lines.append(formatted)
                    current_bytes += line_bytes
                else:
                    cut = True
                    more = True
                    break

            last_shown = start + len(output_lines)
            next_offset = last_shown + 1

            output = f"<path>{abs_path}</path>\n<type>file</type>\n<content>\n"
            output += "\n".join(output_lines)

            if cut:
                output += (
                    f"\n\n(Output capped at {MAX_BYTES // 1024} KB. "
                    f"Showing lines {offset}-{last_shown}. Use offset={next_offset} to continue.)"
                )
            elif more:
                output += (
                    f"\n\n(Showing lines {offset}-{last_shown} of {total_lines}. "
                    f"Use offset={next_offset} to continue.)"
                )
            else:
                output += f"\n\n(End of file - total {total_lines} lines)"
            output += "\n</content>"

            return ExecuteResult(
                title=params.filePath,
                output=output,
                metadata={
                    "preview": "\n".join(output_lines[:20]),
                    "truncated": cut or more,
                },
            )

        except UnicodeDecodeError:
            return ExecuteResult(
                title=params.filePath,
                output=f"Cannot read as text: {params.filePath}",
                metadata={"error": "binary_file"},
            )
        except PermissionError:
            return ExecuteResult(
                title=params.filePath,
                output=f"Permission denied: {params.filePath}",
                metadata={"error": "permission_denied"},
            )
        except Exception as e:
            return ExecuteResult(
                title=params.filePath,
                output=f"Read failed: {e}",
                metadata={"error": str(e)},
            )
