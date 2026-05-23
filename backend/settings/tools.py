"""
工具配置列表

内置工具（8个核心工具）：
- read: 读取文件/目录
- write: 写入文件
- edit: 搜索替换编辑
- grep: 正则内容搜索
- glob: 文件模式匹配
- shell: 执行命令
- question: 询问用户
- skill: 加载 Skill

项目专属工具（2个）：
- rag_search: 知识库向量搜索
- rag_list_files: 知识库文件列表

MCP工具通过 mcp 管理器动态加载，名称格式: mcp--<server_id>--<tool_name>
"""

ALL_AVAILABLE_TOOLS = {
    "read": {
        "name": "读取文件",
        "description": "读取文件或目录内容，支持分页和图片/PDF附件"
    },
    "write": {
        "name": "写入文件",
        "description": "创建新文件或覆写已有文件"
    },
    "edit": {
        "name": "编辑文件",
        "description": "在文件中进行精确的字符串搜索替换"
    },
    "grep": {
        "name": "搜索内容",
        "description": "使用正则表达式在文件内容中搜索"
    },
    "glob": {
        "name": "搜索文件",
        "description": "使用 glob 模式匹配文件路径"
    },
    "shell": {
        "name": "执行命令",
        "description": "在 shell 中执行命令"
    },
    "question": {
        "name": "询问用户",
        "description": "向用户提出问题以获取更多信息"
    },
    "skill": {
        "name": "加载 Skill",
        "description": "加载专用 Skill 到当前对话"
    },
    "rag_search": {
        "name": "向量搜索",
        "description": "在向量数据库中搜索相似内容便于文本参考"
    },
    "rag_list_files": {
        "name": "列出知识库文件",
        "description": "列出指定知识库中的所有文件信息"
    },
}
