"""
工具加载模块
对接新工具注册表，同时保留与 MCP 工具的兼容

工具名称规范：
- 内置工具: 直接使用名称（如 read, write, edit 等）
- MCP工具: 格式 mcp--<server_id>--<tool_name>
"""

from backend.ai_agent.tool.base import get_all_tools, tool_def_to_openai_schema
from backend.ai_agent.mcp.mcp_manager import get_mcp_tools_as_objects


async def import_tools(mode: str = None) -> dict:
    """导入所有工具，包括注册的核心工具和 MCP 工具
    
    注意：mode 参数已不再用于过滤工具，保留仅用于兼容调用方。
    所有核心工具始终全部加载，模式的 tools 配置仅用于前端自动批准逻辑。
        
    Returns:
        工具名 -> 工具对象的映射
    """
    # 1. 获取所有注册的核心工具（ToolDef 实例）
    all_tools = get_all_tools()
    # 始终加载所有核心工具，不再按模式配置过滤
    # 模式的 tools 配置仅用于前端自动批准逻辑
    builtin_tools = dict(all_tools)
    
    print(f"[工具] 核心: {list(builtin_tools.keys())}")
    
    # 2. 获取 MCP 工具（保持原有格式）
    mcp_tools = await get_mcp_tools_as_objects()
    
    # 3. 合并
    tools = {}
    tools.update(builtin_tools)
    tools.update(mcp_tools)
    
    print(f"[工具] MCP: {list(mcp_tools.keys())}")
    print(f"[工具] 共 {len(tools)} 个 (核心 {len(builtin_tools)} + MCP {len(mcp_tools)})")
    return tools
