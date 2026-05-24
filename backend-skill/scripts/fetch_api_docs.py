#!/usr/bin/env python
"""
获取后端 API 文档的脚本

用法：
    python backend-skill/scripts/fetch_api_docs.py <tag> [--base-url <url>]

示例：
    python backend-skill/scripts/fetch_api_docs.py History
    python backend-skill/scripts/fetch_api_docs.py Knowledge
    python backend-skill/scripts/fetch_api_docs.py MCP
    python backend-skill/scripts/fetch_api_docs.py File
    python backend-skill/scripts/fetch_api_docs.py Config
    python backend-skill/scripts/fetch_api_docs.py Provider
    python backend-skill/scripts/fetch_api_docs.py Mode
    python backend-skill/scripts/fetch_api_docs.py checkpoints
    python backend-skill/scripts/fetch_api_docs.py Auth

    # 列出所有可用的 tag
    python backend-skill/scripts/fetch_api_docs.py --list

    # 指定后端地址（默认 http://localhost:8000）
    python backend-skill/scripts/fetch_api_docs.py History --base-url http://localhost:8000
"""

import json
import re
import sys
import urllib.error
import urllib.request


def fetch_openapi(base_url: str) -> dict:
    """从后端获取 OpenAPI spec"""
    url = f"{base_url.rstrip('/')}/openapi.json"
    try:
        with urllib.request.urlopen(url, timeout=5) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.URLError as e:
        print(f"错误: 无法连接到后端 ({url})", file=sys.stderr)
        print(f"  请确保后端已在 {base_url} 上运行", file=sys.stderr)
        print(f"  详情: {e.reason}", file=sys.stderr)
        sys.exit(1)


def get_all_tags(spec: dict) -> list[str]:
    """获取 OpenAPI spec 中所有可用的 tag"""
    tags: set[str] = set()
    for path, methods in spec.get("paths", {}).items():
        for method, detail in methods.items():
            for tag in detail.get("tags", []):
                tags.add(tag)
    return sorted(tags)


def filter_by_tag(spec: dict, tag: str) -> dict:
    """按 tag 过滤 OpenAPI spec，只保留指定 tag 的路由"""
    filtered_paths: dict = {}
    for path, methods in spec.get("paths", {}).items():
        filtered_methods: dict = {}
        for method, detail in methods.items():
            if tag in detail.get("tags", []):
                filtered_methods[method.upper()] = detail
        if filtered_methods:
            filtered_paths[path] = filtered_methods
    return filtered_paths


def format_output(tag: str, paths: dict, base_url: str = "http://localhost:8000") -> str:
    """将过滤后的 API 文档格式化为易读的文本"""
    lines: list[str] = []
    lines.append(f"# {tag} API 文档")
    lines.append("=" * 60)
    lines.append("")

    if not paths:
        lines.append(f"未找到 tag 为 '{tag}' 的 API 端点")
        return "\n".join(lines)

    for path, methods in sorted(paths.items()):
        for method, detail in methods.items():
            summary = detail.get("summary", "")
            description = detail.get("description", "")

            # 路由和方法
            lines.append(f"## {method} {path}")
            if summary:
                lines.append(f"**描述**: {summary}")
            if description and description != summary:
                lines.append(f"**详情**: {description}")
            lines.append("")

            # 路径参数
            params = detail.get("parameters", [])
            path_params = [p for p in params if p.get("in") == "path"]
            query_params = [p for p in params if p.get("in") == "query"]
            if path_params:
                lines.append("### 路径参数")
                for p in path_params:
                    schema = p.get("schema", {})
                    required = " (必填)" if p.get("required") else ""
                    lines.append(f"- **{p['name']}**: {schema.get('type', 'any')}{required}")
                    if p.get("description"):
                        lines.append(f"  - {p['description']}")
                lines.append("")

            if query_params:
                lines.append("### 查询参数")
                for p in query_params:
                    schema = p.get("schema", {})
                    required = " (必填)" if p.get("required") else ""
                    lines.append(f"- **{p['name']}**: {schema.get('type', 'any')}{required}")
                    if p.get("description"):
                        lines.append(f"  - {p['description']}")
                lines.append("")

            # 请求体
            request_body = detail.get("requestBody", {})
            if request_body:
                content = request_body.get("content", {})
                if "application/json" in content:
                    schema = content["application/json"].get("schema", {})
                    lines.append("### 请求体 (JSON)")
                    lines.append(format_schema(schema))
                    lines.append("")
                elif "multipart/form-data" in content:
                    schema = content["multipart/form-data"].get("schema", {})
                    lines.append("### 请求体 (multipart/form-data)")
                    lines.append(format_schema(schema))
                    lines.append("")

            # curl 示例
            lines.append("### curl 示例")
            curl_cmd = build_curl_example(path, method, request_body, base_url)
            lines.append("```bash")
            lines.append(curl_cmd)
            lines.append("```")
            lines.append("")

    return "\n".join(lines)


def format_schema(schema: dict, indent: int = 0) -> str:
    """格式化 schema 为易读文本"""
    prefix = "  " * indent
    lines: list[str] = []

    if "properties" in schema:
        required_fields = schema.get("required", [])
        for prop_name, prop_schema in schema["properties"].items():
            is_required = "(必填)" if prop_name in required_fields else "(可选)"
            prop_type = prop_schema.get("type", "any")
            prop_desc = prop_schema.get("description", "")
            lines.append(f"{prefix}- **{prop_name}**: {prop_type} {is_required}")
            if prop_desc:
                lines.append(f"{prefix}  - {prop_desc}")
            # 处理嵌套对象
            if "properties" in prop_schema:
                lines.append(format_schema(prop_schema, indent + 1))
    elif "anyOf" in schema:
        for sub_schema in schema["anyOf"]:
            if sub_schema.get("type") != "null":
                lines.append(format_schema(sub_schema, indent))

    return "\n".join(lines)


def build_curl_example(path: str, method: str, request_body: dict, base_url: str = "http://localhost:8000") -> str:
    """构建 curl 命令示例"""

    # 提取路径参数并替换为占位符
    def replace_param(match):
        param_name = match.group(1)
        return f"{{{param_name}}}"

    example_path = re.sub(r"\{(\w+)\}", replace_param, path)
    url = f"{base_url}{example_path}"

    # 生成 curl 命令
    parts = [f"curl -X {method.upper()} {url}"]

    # 如果有请求体，添加 JSON 示例
    content = request_body.get("content", {})
    if "application/json" in content:
        schema = content.get("application/json", {}).get("schema", {})
        example_json = build_example_json(schema)
        if example_json:
            example_str = json.dumps(example_json, ensure_ascii=False, indent=2)
            parts.append(f'  -H "Content-Type: application/json"')
            parts.append(f"  -d '{example_str}'")

    return " \\\n".join(parts)


def build_example_json(schema: dict) -> dict:
    """根据 schema 构建示例 JSON"""
    example: dict = {}
    if "properties" not in schema:
        return example

    for prop_name, prop_schema in schema["properties"].items():
        prop_type = prop_schema.get("type", "string")

        if prop_type == "string":
            example[prop_name] = prop_schema.get("description", prop_name)
        elif prop_type == "integer":
            example[prop_name] = 0
        elif prop_type == "number":
            example[prop_name] = 0.0
        elif prop_type == "boolean":
            example[prop_name] = False
        elif prop_type == "array":
            example[prop_name] = []
        elif prop_type == "object":
            nested = build_example_json(prop_schema)
            example[prop_name] = nested or {}
        else:
            example[prop_name] = None

    return example


def list_tags(base_url: str):
    """列出所有可用的 tag"""
    spec = fetch_openapi(base_url)
    tags = get_all_tags(spec)
    print("可用的 API 模块 (tag):")
    print("=" * 40)
    for tag in tags:
        # 统计每个 tag 下的端点数量
        paths = filter_by_tag(spec, tag)
        count = sum(len(methods) for methods in paths.values())
        print(f"  {tag:20s} ({count} 个端点)")
    print()
    print("使用方式: python backend-skill/scripts/fetch_api_docs.py <tag>")
    print("示例:    python backend-skill/scripts/fetch_api_docs.py History")


def main():
    args = sys.argv[1:]
    base_url = "http://localhost:8000"

    # 解析参数
    if "--base-url" in args:
        idx = args.index("--base-url")
        if idx + 1 < len(args):
            base_url = args[idx + 1]
            args = args[:idx] + args[idx + 2:]

    if not args or "--help" in args or "-h" in args:
        print(__doc__)
        return

    if args[0] == "--list":
        list_tags(base_url)
        return

    tag = args[0]

    # 获取并过滤
    spec = fetch_openapi(base_url)

    # 验证 tag 是否存在
    all_tags = get_all_tags(spec)
    if tag not in all_tags:
        print(f"错误: 无效的 tag '{tag}'", file=sys.stderr)
        print(f"可用的 tags: {', '.join(all_tags)}", file=sys.stderr)
        sys.exit(1)

    paths = filter_by_tag(spec, tag)
    output = format_output(tag, paths, base_url)
    print(output)


if __name__ == "__main__":
    main()
