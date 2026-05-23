"""
工具基础框架

定义：
- ToolDef: 工具定义（id, description, parameters, execute）
- ExecuteResult: 执行结果（title, output, metadata, attachments）
- ToolContext: 执行上下文（sessionID, messageID, abort 等）
- 工具注册表: register_tool / get_tools

使用方式：
    @register_tool
    class MyTool(ToolDef):
        id = "my_tool"
        description = "..."
        parameters: type[BaseModel] = MyParams
        async def execute(self, params, ctx) -> ExecuteResult:
            ...
"""

from dataclasses import dataclass, field
from typing import (
    Any,
    Callable,
    Coroutine,
    Optional,
    Type,
)

from pydantic import BaseModel


# ============================================================
# 输出格式
# ============================================================

@dataclass
class ExecuteResult:
    """工具执行结果"""
    title: str                                       # 简短标题
    output: str                                      # LLM 可读的文本输出
    metadata: dict = field(default_factory=dict)     # 结构化元数据
    attachments: Optional[list[dict]] = None         # 文件附件，格式: {type, mime, url, name?}


# ============================================================
# 执行上下文
# ============================================================

@dataclass
class ToolContext:
    """工具执行上下文"""
    session_id: str
    message_id: str
    agent: str = ""                                  # 当前 agent 名称
    abort_signal: Any = None                         # 取消信号 (asyncio.Event / asyncio.CancelledError)
    call_id: Optional[str] = None                    # 工具调用 ID
    extra: Optional[dict] = None                     # 额外上下文
    messages: list = field(default_factory=list)      # 当前消息列表


# ============================================================
# 工具定义基类
# ============================================================

class ToolDef:
    """工具定义

    子类需定义：
        id: str
        description: str
        parameters: type[BaseModel]

    子类需实现：
        async def execute(self, params, ctx) -> ExecuteResult
    """
    id: str = ""
    description: str = ""
    parameters: Type[BaseModel] = BaseModel

    async def execute(self, params: BaseModel, ctx: ToolContext) -> ExecuteResult:
        raise NotImplementedError

    def json_schema(self) -> dict:
        """生成 OpenAI 兼容的 JSON Schema"""
        return self.parameters.model_json_schema()


# ============================================================
# 工具注册表
# ============================================================

_tool_registry: dict[str, ToolDef] = {}


def register_tool(tool_cls: Type[ToolDef]) -> Type[ToolDef]:
    """装饰器：注册工具到全局注册表"""
    instance = tool_cls()
    if not instance.id:
        instance.id = tool_cls.__name__.lower()
    _tool_registry[instance.id] = instance
    return tool_cls


def get_all_tools() -> dict[str, ToolDef]:
    """获取所有已注册的工具"""
    return dict(_tool_registry)


def get_tools_by_ids(ids: list[str]) -> dict[str, ToolDef]:
    """按 ID 列表获取工具"""
    return {tid: _tool_registry[tid] for tid in ids if tid in _tool_registry}


# ============================================================
# 工具定义辅助函数（非装饰器用法）
# ============================================================

def make_tool(
    tool_id: str,
    description: str,
    parameters: Type[BaseModel],
    execute_fn: Callable[[BaseModel, ToolContext], Coroutine[Any, Any, ExecuteResult]],
) -> ToolDef:
    """快速创建工具定义"""
    tool = ToolDef()
    tool.id = tool_id
    tool.description = description
    tool.parameters = parameters
    tool.execute = execute_fn
    _tool_registry[tool_id] = tool
    return tool


def tool_def_to_openai_schema(tool: ToolDef) -> dict:
    """将 ToolDef 转换为 OpenAI function calling 格式"""
    return {
        "type": "function",
        "function": {
            "name": tool.id,
            "description": tool.description,
            "parameters": tool.json_schema(),
        },
    }
