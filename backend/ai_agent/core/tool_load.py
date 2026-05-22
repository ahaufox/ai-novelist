"""
工具加载模块
对接新工具注册表，同时保留与 MCP 工具的兼容

工具名称规范：
- 内置工具: 直接使用名称（如 read, write, edit 等）
- MCP工具: 格式 mcp--<server_id>--<tool_name>
"""

from backend.ai_agent.tool.base import get_all_tools, tool_def_to_openai_schema
from backend.ai_agent.mcp.mcp_manager import get_mcp_tools_as_objects
from backend.settings.settings import settings


async def import_tools(mode: str = None) -> dict:
    """导入所有工具，包括注册的核心工具和 MCP 工具
    
    Args:
        mode: 模式名称（用于过滤启用的内置工具）
        
    Returns:
        工具名 -> 工具对象的映射
    """
    # 1. 获取所有注册的核心工具（ToolDef 实例）
    all_tools = get_all_tools()
    builtin_tools: dict = {}
    
    # 判断是否应该加载核心工具
    # 如果 mode 存在，检查 mode 配置中是否启用了某个核心工具
    if mode:
        enabled_tools = settings.get_config("mode", mode, "tools", default=[])
        if enabled_tools:
            # 只加载启用的工具
            for tool_name in enabled_tools:
                if tool_name in all_tools:
                    builtin_tools[tool_name] = all_tools[tool_name]
                else:
                    print(f"[WARN] 工具 '{tool_name}' 未注册")
        else:
            # 没有工具列表配置，默认加载所有核心工具
            builtin_tools = dict(all_tools)
    else:
        builtin_tools = dict(all_tools)
    
    print(f"[INFO] 核心工具: {list(builtin_tools.keys())}")
    
    # 2. 获取 MCP 工具（保持原有格式）
    mcp_tools = await get_mcp_tools_as_objects()
    
    # 3. 合并
    tools = {}
    tools.update(builtin_tools)
    tools.update(mcp_tools)
    
    print(f"[INFO] 总共导入 {len(tools)} 个工具 (MCP: {len(mcp_tools)}, 核心: {len(builtin_tools)})")
    return tools
