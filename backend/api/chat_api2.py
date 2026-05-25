from backend.settings.settings import settings
from struct import pack
from backend.ai_agent.core.tool_load import import_tools
from backend.ai_agent.core.system_prompt_builder import SystemPromptBuilder
from backend.ai_agent.models.stream_interrupt_manager import stream_interrupt_manager
from backend.storage.schema import init_db
from backend.storage import service as storage
from backend.file.file_service import read_file, resolve_file_path
from litellm import acompletion

import json
import logging
import asyncio
import math
import uuid
import time
from pydantic import BaseModel, Field
from fastapi import APIRouter
from fastapi.responses import StreamingResponse


logger = logging.getLogger(__name__)

# 确保数据库表已创建
init_db()

# 系统提示词构建器（每次调用 build_prompts 时创建新实例避免并发问题）
_system_prompt_builder = SystemPromptBuilder()


def _get_model_prefix(provider: str) -> str:
    if provider == "zhipuai":
        return "zai"
    elif provider == "ollama":
        return "ollama_chat"
    elif provider in ["deepseek", "dashscope", "openrouter", "gemini", "lm_studio", "moonshot"]:
        return provider
    else:
        return "openai"


def _count_tokens_approx(msg: dict) -> int:
    """估算单条消息的 token 数，对齐 langchain count_tokens_approximately
    
    支持 Content Array 格式（数组→提取各 text part 拼接后统计）
    """
    content = msg.get("content", "")
    chars = len(_extract_content_text(content)) if not isinstance(content, str) else len(content)
    chars += len(msg.get("role", ""))
    if msg.get("role") == "assistant" and msg.get("tool_calls"):
        chars += len(repr(msg["tool_calls"]))
    if msg.get("role") == "tool":
        chars += len(msg.get("tool_call_id", ""))
    return math.ceil(chars / 4.0) + 3


def _trim_history(history: list[dict], max_tokens: int) -> list[dict]:
    """裁剪消息历史，对齐旧版 trim_messages(strategy=last, start_on=human, end_on=(human,tool))"""
    if not history:
        return []

    msgs = list(history)

    # Step 1: end_on — 从末尾截断到 user 或 tool
    while msgs and msgs[-1].get("role") not in ("user", "tool"):
        msgs.pop()

    if not msgs:
        return []

    # Step 2: 从尾到头累计 token，保留不超限的消息
    kept = []
    token_count = 0
    for msg in reversed(msgs):
        t = _count_tokens_approx(msg)
        if token_count + t > max_tokens:
            break
        kept.insert(0, msg)
        token_count += t

    # Step 3: start_on — 去掉开头不是 user 的消息
    while kept and kept[0].get("role") != "user":
        kept.pop(0)

    return kept


def _collect_summaries_and_filter(history: list[dict], summaries: list[dict]) -> tuple[str, list[dict]]:
    """收集摘要文本并过滤被替换的消息，返回 (summary_text, filtered_history)"""
    if not summaries:
        return "", list(history)

    # 收集所有被替换的消息 id
    skip_ids: set[str] = set()
    for s in summaries:
        # 从 history 中找到 replaces_from 到 replaces_to 之间的消息
        in_range = False
        for m in history:
            if m["id"] == s["replaces_from"]:
                in_range = True
            if in_range:
                skip_ids.add(m["id"])
            if m["id"] == s["replaces_to"]:
                break

    summary_text = "\n\n".join(s["content"] for s in summaries)
    filtered = [m for m in history if m["id"] not in skip_ids]
    return summary_text, filtered


def _tool_to_openai_schema(tool) -> dict:
    """将工具定义转换为 OpenAI function calling 格式
    
    支持两种工具类型：
    1. 新 ToolDef 工具（来自 tool/base.py）
    2. 旧 langchain @tool 装饰器工具（MCP 工具等）
    """
    # 新 ToolDef 类型
    from backend.ai_agent.tool.base import ToolDef
    if isinstance(tool, ToolDef):
        return {
            "type": "function",
            "function": {
                "name": tool.id,
                "description": tool.description,
                "parameters": tool.json_schema(),
            }
        }
    
    # 旧 langchain @tool 类型（兼容 MCP 工具）
    if hasattr(tool, 'args_schema') and tool.args_schema:
        if isinstance(tool.args_schema, dict):
            parameters = tool.args_schema
        else:
            parameters = tool.args_schema.model_json_schema()
    else:
        parameters = {"type": "object", "properties": {}}
    return {
        "type": "function",
        "function": {
            "name": tool.name,
            "description": tool.description,
            "parameters": parameters
        }
    }


class ChatMessageRequest(BaseModel):
    messages: list[dict] = Field(default_factory=list, description="OpenAI格式消息列表")


class RegenerateRequest(BaseModel):
    msg_id: str = Field(..., description="目标用户消息 id")
    edited_content: str | None = Field(default=None, description="编辑后的内容，纯重新生成为 null")


class SwitchBranchRequest(BaseModel):
    parent_msg_id: str = Field(..., description="分支点的父消息 id")
    target_msg_id: str = Field(..., description="要切换到的目标消息 id")


router = APIRouter(prefix="/api/chat2", tags=["Chat"])


class FunctionCallingRequest(BaseModel):
    """工具调用请求"""
    tool_call_id: str = Field(..., description="工具调用ID")
    approved: bool = Field(..., description="是否批准")
    user_extra: str = Field(default="", description="用户附加信息")
    user_diff: str | None = Field(default=None, description="用户对AI建议内容的修改diff")
    final_content: str | None = Field(
        default=None,
        description="前端计算后的最终文件内容（仅在 edit/write 工具中使用）"
    )


def _encode_message(data: dict) -> bytes:
    """将 JSON 消息编码为二进制长度前缀帧: [4字节大端uint32长度][JSON UTF-8]"""
    json_bytes = json.dumps(data, ensure_ascii=False).encode('utf-8')
    return pack('>I', len(json_bytes)) + json_bytes


def _build_state_update_data(thread_id: str) -> bytes:
    """构建包含完整树信息的 state_update 二进制帧"""
    tree = storage.get_full_tree(thread_id)
    data = storage.get_data(thread_id)
    logger.info(f"下一步工具是{tree["next_pending_tool"]}")
    return _encode_message({
        "type": "state_update",
        "messages": tree["messages"],
        "active_leaf": tree["active_leaf"],
        "active_path": tree["active_path"],
        "branch_points": tree["branch_points"],
        "next_pending_tool": tree["next_pending_tool"],
        "summaries": data.get("summaries", []),
        "pending_user_extras": data.get("pending_user_extras", []),
    })


def _get_pending_tool_calls(thread_id: str) -> list[dict]:
    """
    从消息链推导待审批的工具调用。
    
    在活跃路径中，找到最后一个 assistant 消息的 tool_calls，
    检查每个 tool_call_id 是否有对应的 role==tool 消息。
    没有对应 tool 消息的，就是待审批的工具调用。
    """
    history = storage.get_active_path(thread_id)
    # 找到最后一个 assistant 消息
    last_assistant = None
    for msg in reversed(history):
        if msg.get("role") == "assistant" and msg.get("tool_calls"):
            last_assistant = msg
            break
    if not last_assistant:
        return []
    
    # 收集已有的 tool_call_id
    existing_tool_ids = {
        m["tool_call_id"]
        for m in history
        if m.get("role") == "tool" and m.get("tool_call_id")
    }
    
    # 返回没有对应 tool 消息的 tool_calls
    pending = []
    for tc in last_assistant["tool_calls"]:
        if tc.get("id") and tc["id"] not in existing_tool_ids:
            pending.append(tc)
    return pending


def _extract_content_text(content: str | list) -> str:
    """从可能为 Content Array 的 content 字段中提取纯文本
    
    OpenAI 格式中 content 可以是字符串或数组，
    如果是数组，提取所有 type=text 的文本拼接起来。
    
    Args:
        content: content 字段值（字符串或数组）
        
    Returns:
        拼接后的纯文本
    """
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        texts = []
        for part in content:
            if isinstance(part, dict) and part.get("type") == "text":
                texts.append(part.get("text", ""))
        return "\n".join(texts)
    return str(content) if content else ""


def _make_content_array(user_text: str, attachment_texts: list[str]) -> list[dict]:
    """将用户文本和附件文本合并为 Content Array 格式
    
    Args:
        user_text: 用户原始文本
        attachment_texts: 附件文本列表
        
    Returns:
        Content Array，第一个 part 为用户文本，后续为附件
    """
    parts = [{"type": "text", "text": user_text}]
    for att in attachment_texts:
        parts.append({"type": "text", "text": att})
    return parts


async def _resolve_at_attachments(user_input: str) -> list[str]:
    """解析用户输入中的 @路径，读取文件内容，返回附件格式文本
    
    借用 SystemPromptBuilder 的 _extract_at_paths 方法，
    不持久化到配置，仅用于当前对话轮次。
    
    Args:
        user_input: 用户输入文本
        
    Returns:
        附件文本列表，格式: 【用户附件 - 绝对路径】: \n内容
    """
    if not user_input:
        return []
    
    # 借用 SystemPromptBuilder 的 _extract_at_paths 方法
    at_paths = _system_prompt_builder._extract_at_paths(user_input)
    if not at_paths:
        return []
    
    attachments = []
    for raw_path in at_paths:
        try:
            file_path = resolve_file_path(raw_path)
            
            if not file_path.exists() or not file_path.is_file():
                continue
            
            content = await read_file(str(file_path))
            if content:
                abs_path = str(file_path.resolve())
                attachments.append(f"【用户附件 - {abs_path}】:\n{content}")
                
        except Exception as e:
            logger.error(f"处理 @路径 附件失败: {raw_path}, 错误: {e}")
    
    return attachments


async def _build_messages_with_context(
    history: list[dict],
    mode: str,
    user_input: str = "",
    summaries: list[dict] | None = None,
) -> list[dict]:
    """将系统提示词和环境信息注入到消息列表中

    系统提示词 → 作为 system role 消息放在最前面
    环境信息（文件树/知识库/Skills/RAG等） → 作为 user role 消息放在最后面
    用户 @路径 附件已在保存消息时嵌入到 content array 中，无需在此处理。

    注入的消息不持久化到数据库，每次调用时动态构建。
    """
    # 收集摘要文本
    summary_text = ""
    if summaries:
        summary_text = "\n\n".join(s["content"] for s in summaries)

    system_prompt, context_message = await _system_prompt_builder.build_prompts(
        mode=mode,
        user_input=user_input,
        summary=summary_text,
    )

    result = []
    if system_prompt:
        result.append({"role": "system", "content": system_prompt})
    result.extend(history)
    if context_message:
        result.append({
            "role": "user",
            "content": f"【系统环境信息 - 此消息由系统自动生成，并非用户发送】\n\n{context_message}\n\n"
        })

    return result


# ==================== 流式 AI 响应（通用） ====================


async def _stream_ai_response(thread_id: str, parent_msg_id: str, history: list[dict]):
    """
    流式传输 AI 回复，结束后保存消息并更新 active_leaf。
    
    Args:
        thread_id: 会话 id
        parent_msg_id: AI 回复消息的 parent_id（通常是上一条用户消息 id）
        history: 发送给 AI 的活跃路径消息列表（已含注入上下文）
    """
    _stream_start = time.perf_counter()
    
    _t = time.perf_counter()
    _mode = settings.get_config("currentMode", default="管家agent")
    _selected_model = settings.get_config("selectedModel")
    _selected_provider = settings.get_config("selectedProvider")
    _temperature = settings.get_config("mode", _mode, "temperature")
    _top_p = settings.get_config("mode", _mode, "top_p")
    _max_tokens = settings.get_config("mode", _mode, "max_tokens")
    print(f"[耗时] 读取配置 (6次 get_config): {(time.perf_counter() - _t)*1000:.1f}ms")

    _t = time.perf_counter()
    api_key = settings.get_provider_key(_selected_provider)
    base_url = settings.get_config("provider", _selected_provider, "url", default="")
    litellm_model = f"{_get_model_prefix(_selected_provider)}/{_selected_model}"
    print(f"[耗时] 读取 provider key/url: {(time.perf_counter() - _t)*1000:.1f}ms")

    _t = time.perf_counter()
    tool_dict = await import_tools(mode=_mode)
    _t_cost = time.perf_counter() - _t
    print(f"[耗时] import_tools: {_t_cost*1000:.1f}ms, 共 {len(tool_dict)} 个工具")
    tools = None
    if tool_dict:
        _t_schema = time.perf_counter()
        tools = [_tool_to_openai_schema(t) for t in tool_dict.values()]
        print(f"[耗时] 转换为 OpenAI schema: {(time.perf_counter() - _t_schema)*1000:.1f}ms")

    print(f"[参数] 模式={_mode}, 模型={litellm_model}, temp={_temperature}, top_p={_top_p}, max_tokens={_max_tokens}")

    # 从消息列表中提取最后一条 user 消息作为 user_input（用于 RAG 检索，需要纯文本）
    # 注意：content 可能是 Content Array（@路径附件），用 _extract_content_text 提取纯文本
    user_input = ""
    for msg in reversed(history):
        if msg.get("role") == "user":
            user_input = _extract_content_text(msg.get("content", ""))
            break

    # 收集摘要并过滤被替换的消息
    _t = time.perf_counter()
    data = storage.get_data(thread_id)
    summaries = data.get("summaries", [])
    summary_text, filtered_history = _collect_summaries_and_filter(history, summaries)
    print(f"[耗时] 收集摘要: {(time.perf_counter() - _t)*1000:.1f}ms")

    # 裁剪超限消息
    _t = time.perf_counter()
    context_window = settings.get_config(
        "provider", _selected_provider, "favoriteModels", "chat", _selected_model
    ) or 4096
    trimmed_history = _trim_history(filtered_history, context_window - _max_tokens)
    print(f"[耗时] 裁剪历史消息: {(time.perf_counter() - _t)*1000:.1f}ms")

    _t = time.perf_counter()
    messages_with_context = await _build_messages_with_context(
        trimmed_history, _mode, user_input, summaries
    )
    print(f"[耗时] 构建上下文消息: {(time.perf_counter() - _t)*1000:.1f}ms")
    logger.info(f"环境信息：{messages_with_context}")

    call_kwargs = {
        "model": litellm_model,
        "messages": messages_with_context,
        "temperature": _temperature,
        "top_p": _top_p,
        "max_tokens": _max_tokens,
        "timeout": 300,
        "stream": True,
        "stream_options": {"include_usage": True},
        "api_key": api_key,
        "base_url": base_url,
    }
    if tools:
        call_kwargs["tools"] = tools

    print(f"[参数] 上下文窗口={context_window}, 消息数={len(messages_with_context)}, 工具数={len(tools) if tools else 0}")

    _t = time.perf_counter()
    response_stream = await acompletion(**call_kwargs)
    print(f"[耗时] acompletion 首包耗时: {(time.perf_counter() - _t)*1000:.1f}ms")
    print(f"[耗时] 前置准备（总计）: {(time.perf_counter() - _stream_start)*1000:.1f}ms")

    full_content = ""
    full_reasoning = ""
    tool_calls_accumulated: dict[int, dict] = {}
    usage_metadata: dict | None = None
    _first_chunk = True
    _stream_chunk_start = time.perf_counter()

    async for chunk in response_stream:
        if _first_chunk:
            print(f"[耗时] 首个 content chunk 到达: {(time.perf_counter() - _stream_chunk_start)*1000:.1f}ms")
            _first_chunk = False

        if stream_interrupt_manager.is_interrupted(thread_id):
            yield _encode_message({"interrupted": True})
            break

        # 捕获 usage（DeepSeek 等提供商将 usage 放在最后一个有 choices 的 chunk 中，而非空 choices chunk）
        if hasattr(chunk, 'usage') and chunk.usage:
            usage_metadata = {
                "input_tokens": chunk.usage.prompt_tokens,
                "output_tokens": chunk.usage.completion_tokens,
                "total_tokens": chunk.usage.total_tokens,
            }
            logger.info(f"[usage] 捕获到 usage: {usage_metadata}")
            yield _encode_message({"usage_metadata": usage_metadata})

        if not chunk.choices:
            continue

        delta = chunk.choices[0].delta
        chunk_data = {}

        if hasattr(delta, 'content') and delta.content:
            chunk_data["content"] = delta.content
            full_content += delta.content

        if hasattr(delta, 'reasoning_content') and delta.reasoning_content:
            chunk_data["reasoning_content"] = delta.reasoning_content
            full_reasoning += delta.reasoning_content

        if hasattr(delta, 'tool_calls') and delta.tool_calls:
            for tc in delta.tool_calls:
                index = tc.index if hasattr(tc, 'index') and tc.index is not None else 0
                if index not in tool_calls_accumulated:
                    tool_calls_accumulated[index] = {
                        "id": tc.id,
                        "type": "function",
                        "function": {
                            "name": tc.function.name if tc.function else None,
                            "arguments": tc.function.arguments if tc.function else ""
                        }
                    }
                else:
                    existing = tool_calls_accumulated[index]
                    if tc.id:
                        existing["id"] = tc.id
                    if tc.function:
                        if tc.function.name:
                            existing["function"]["name"] = tc.function.name
                        if tc.function.arguments:
                            existing["function"]["arguments"] += tc.function.arguments

            # 流式输出当前累积的 tool_calls，让前端能实时预览编辑效果
            chunk_data["tool_calls"] = [tc for tc in tool_calls_accumulated.values()]

        if chunk_data:
            yield _encode_message(chunk_data)
            await asyncio.sleep(0)

    _stream_elapsed = time.perf_counter() - _stream_start
    print(f"[耗时] 流式传输总耗时: {_stream_elapsed*1000:.1f}ms")
    if full_content:
        print(f"[耗时] 生成文本长度: {len(full_content)} 字符")
    if full_reasoning:
        print(f"[耗时] 推理内容长度: {len(full_reasoning)} 字符")
    if tool_calls_accumulated:
        print(f"[耗时] 生成工具调用: {len(tool_calls_accumulated)} 个")

    # 保存 assistant 消息到 data
    assistant_msg = {
        "id": f"msg-{uuid.uuid4()}",
        "role": "assistant",
        "content": full_content,
        "parent_id": parent_msg_id,
        "created_at": time.time(),
        "additional_kwargs": {},
    }
    if full_reasoning:
        assistant_msg["additional_kwargs"]["reasoning_content"] = full_reasoning
    if tool_calls_accumulated:
        assistant_msg["tool_calls"] = list(tool_calls_accumulated.values())
    if usage_metadata:
        assistant_msg["usage_metadata"] = usage_metadata

    print(full_content, flush=True)

    data = storage.get_data(thread_id)
    data.setdefault("messages", []).append(assistant_msg)

    # 更新 active_leaf 为新的 AI 消息
    data["active_leaf"] = assistant_msg["id"]
    storage.save_data(thread_id, data)

    # 发送统一 state_update
    yield _build_state_update_data(thread_id)


# ==================== 发送消息 ====================


@router.post("/message", summary="发送聊天消息（续接当前活跃路径）")
async def send_chat_message(request: ChatMessageRequest):
    thread_id = settings.get_config("thread_id")
    stream_interrupt_manager.create_task(thread_id)

    # 确保会话存在
    conv = storage.get_conversation(thread_id)
    if conv is None:
        title_raw = request.messages[-1].get("content", "新对话") if request.messages else "新对话"
        title = _extract_content_text(title_raw) if not isinstance(title_raw, str) else title_raw
        storage.create_conversation(thread_id, title=title[:50])

    # 获取当前活跃叶子作为 parent_id
    data = storage.get_data(thread_id)
    parent_id = data.get("active_leaf") or "__root__"

    # 保存用户消息（带 parent_id）
    if request.messages:
        user_msg = request.messages[-1]
        user_msg["parent_id"] = parent_id
        user_msg.setdefault("created_at", time.time())
        
        # 处理 @路径 附件：解析文件并转换为 Content Array 格式（持久化到DB）
        user_content = user_msg.get("content", "")
        if isinstance(user_content, str):
            attachments = await _resolve_at_attachments(user_content)
            if attachments:
                user_msg["content"] = _make_content_array(user_content, attachments)
        
        storage.append_message(thread_id, user_msg)
        # 更新 active_leaf 为用户消息
        data = storage.get_data(thread_id)
        data["active_leaf"] = user_msg["id"]
        storage.save_data(thread_id, data)

    async def generate():
        try:
            # 获取活跃路径作为 AI 上下文
            history = storage.get_active_path(thread_id)

            # 流式 AI 响应，parent_id 为新用户消息的 id
            async for chunk in _stream_ai_response(thread_id, user_msg["id"], history):
                yield chunk
        finally:
            stream_interrupt_manager.remove_task(thread_id)

    return StreamingResponse(generate(), media_type="application/octet-stream")


# ==================== 重新生成（创建分支） ====================


@router.post("/regenerate", summary="重新生成消息（创建新分支）")
async def regenerate_message(request: RegenerateRequest):
    thread_id = settings.get_config("thread_id")
    stream_interrupt_manager.create_task(thread_id)
    logger.info(f"重新生成: thread_id={thread_id}, msg_id={request.msg_id}")

    # 创建新分支用户消息，返回新消息 id
    new_user_msg_id = storage.regenerate(thread_id, request.msg_id, request.edited_content)

    async def generate():
        try:
            # 获取活跃路径作为 AI 上下文
            history = storage.get_active_path(thread_id)

            # 流式 AI 响应，parent_id 为新用户消息 id
            async for chunk in _stream_ai_response(thread_id, new_user_msg_id, history):
                yield chunk
        finally:
            stream_interrupt_manager.remove_task(thread_id)

    return StreamingResponse(generate(), media_type="application/octet-stream")


# ==================== 切换分支 ====================


@router.post("/switch-branch", summary="切换活跃分支")
async def switch_branch(request: SwitchBranchRequest):
    thread_id = settings.get_config("thread_id")
    tree = storage.switch_branch(thread_id, request.parent_msg_id, request.target_msg_id)
    return tree


# ==================== 工具函数（保持不变） ====================


async def _execute_tool(
    tool_dict: dict,
    tool_name: str,
    arguments: str,
    final_content: str | None = None,
) -> dict:
    """执行工具并返回结果
    
    支持两种工具类型：
    1. 新 ToolDef 工具: 使用 tool.execute(parsed_params, ctx)
    2. 旧 langchain @tool 工具: 使用 tool.ainvoke(args)
    
    Args:
        tool_dict: 工具字典
        tool_name: 工具名称
        arguments: 工具参数 JSON 字符串
        final_content: HITL 流程传递的最终文件内容（仅 edit/write 使用）
    """
    from backend.ai_agent.tool.base import ToolDef, ToolContext, ExecuteResult
    
    tool = tool_dict.get(tool_name)
    if tool is None:
        return {"success": False, "detail": f"工具 '{tool_name}' 未找到"}

    try:
        args = json.loads(arguments) if arguments else {}
        
        # 新 ToolDef 类型
        if isinstance(tool, ToolDef):
            parsed_params = tool.parameters(**args)
            ctx = ToolContext(
                session_id=settings.get_config("thread_id", default=""),
                message_id="",
                call_id="",
            )
            
            # HITL: 前端传递最终内容，通过 ctx.extra 传给工具
            if final_content is not None:
                ctx.extra = ctx.extra or {}
                ctx.extra["final_content"] = final_content
            
            result: ExecuteResult = await tool.execute(parsed_params, ctx)
            return {
                "success": True,
                "detail": result.output,
                "metadata": result.metadata,
                "title": result.title,
                "attachments": result.attachments,
            }
        
        # 旧 langchain @tool 类型（兼容 MCP）
        result = await tool.ainvoke(args)
        return {"success": True, "detail": str(result)}
        
    except Exception as e:
        return {"success": False, "detail": f"工具执行失败: {str(e)}"}


# ==================== 工具调用处理 ====================


@router.post("/function_calling", summary="处理工具调用")
async def function_calling(request: FunctionCallingRequest):
    thread_id = settings.get_config("thread_id")
    logger.info(f"处理工具调用: tool_call_id={request.tool_call_id}, approved={request.approved}")

    # 1. 执行/拒绝工具
    result = None
    if request.approved:
        _mode = settings.get_config("currentMode", default="管家agent")
        tool_dict = await import_tools(mode=_mode)
        # 从活跃路径中查找对应的 tool_call 信息
        history = storage.get_active_path(thread_id)
        tool_name = ""
        arguments = "{}"
        for msg in reversed(history):
            if msg.get("role") == "assistant" and msg.get("tool_calls"):
                for tc in msg["tool_calls"]:
                    if tc.get("id") == request.tool_call_id:
                        tool_name = tc.get("function", {}).get("name", "")
                        arguments = tc.get("function", {}).get("arguments", "{}")
                        break
                break
        result = await _execute_tool(
            tool_dict,
            tool_name,
            arguments,
            final_content=request.final_content,
        )
    else:
        result = {"success": False, "detail": "用户取消了工具调用"}

    # 2. 创建 tool 消息
    result_json = json.dumps(result, ensure_ascii=False)
    data = storage.get_data(thread_id)
    tool_parent_id = data.get("active_leaf")
    tool_parts = []
    if result and result.get("detail"):
        tool_parts.append(result["detail"])
    if request.user_diff:
        tool_parts.append(f"[用户修改了文件内容]\n{request.user_diff}")
    tool_content = "\n\n".join(tool_parts) if tool_parts else result_json
    tool_msg = {
        "id": f"msg-{uuid.uuid4()}",
        "role": "tool",
        "tool_call_id": request.tool_call_id,
        "content": tool_content,
        "parent_id": tool_parent_id,
        "created_at": time.time(),
    }
    data.setdefault("messages", []).append(tool_msg)
    data["active_leaf"] = tool_msg["id"]
    storage.save_data(thread_id, data)

    async def generate():
        try:
            stream_interrupt_manager.create_task(thread_id)

            # 保存用户附加消息到 pending 缓冲区（不直接写入 messages）
            if request.user_extra:
                data = storage.get_data(thread_id)
                data.setdefault("pending_user_extras", [])
                data["pending_user_extras"].append({
                    "tool_call_id": request.tool_call_id,
                    "content": request.user_extra,
                })
                storage.save_data(thread_id, data)

            # 发送统一 state_update（含 pending_user_extras）
            yield _build_state_update_data(thread_id)

            # 3. 检查是否还有待审批的工具（消息链推导）
            pending = _get_pending_tool_calls(thread_id)

            if not pending:
                # 所有工具执行完毕 → 将 pending_user_extras 正式写入消息列表
                data = storage.get_data(thread_id)
                pending_extras = data.get("pending_user_extras", [])
                if pending_extras:
                    # parent_id 链：最后一个 tool → user_1 → user_2 → ...
                    last_id = data["active_leaf"]
                    for extra in pending_extras:
                        user_msg = {
                            "id": f"msg-{uuid.uuid4()}",
                            "role": "user",
                            "content": extra["content"],
                            "parent_id": last_id,
                            "created_at": time.time(),
                        }
                        data["messages"].append(user_msg)
                        last_id = user_msg["id"]
                    data["active_leaf"] = last_id
                    data["pending_user_extras"] = []
                    storage.save_data(thread_id, data)

                # 流式 AI 响应
                history = storage.get_active_path(thread_id)
                ai_parent_id = storage.get_data(thread_id).get("active_leaf")
                async for chunk in _stream_ai_response(thread_id, ai_parent_id, history):
                    yield chunk
        finally:
            stream_interrupt_manager.remove_task(thread_id)
            logger.info(f"function_call端点正确执行")

    return StreamingResponse(generate(), media_type="application/octet-stream")


# ==================== 上下文压缩 ====================


class SummarizeRequest(BaseModel):
    thread_id: str = Field(..., description="要压缩的会话 id")


@router.post("/summarize", summary="压缩上下文（生成摘要）")
async def summarize_context(request: SummarizeRequest):
    """手动触发上下文压缩，生成摘要存入 data.summaries"""
    thread_id = request.thread_id
    logger.info(f"压缩上下文: thread_id={thread_id}")

    data = storage.get_data(thread_id)
    history = storage.get_active_path(thread_id)
    summaries = data.get("summaries", [])

    if len(history) < 2:
        return {"success": False, "detail": "消息太少，无需压缩"}

    # 确定替换范围：压缩全部 active_path 消息
    replaces_from = history[0]["id"]
    replaces_to = history[-1]["id"]

    # 拼接总结 prompt（使用中文提示词，输出中文摘要）
    if summaries:
        existing = "\n\n".join(s["content"] for s in summaries)
        prompt = (
            f"以下是到目前为止的对话摘要：\n{existing}\n\n"
            "请根据以上对话和新的对话内容，用中文扩展或更新这个摘要。"
        )
    else:
        prompt = (
            "请用中文总结以上对话的主要内容，"
            "提取关键信息、重要决定和用户需求，形成一份简洁的对话摘要。"
        )

    # 构建总结消息（不含系统提示词和环境信息，纯对话历史）
    summarize_messages = list(history)
    summarize_messages.append({"role": "user", "content": prompt})

    # 调用总结模型
    _mode = settings.get_config("currentMode", default="管家agent")
    _selected_model = settings.get_config("selectedModel")
    _selected_provider = settings.get_config("selectedProvider")
    _temperature = settings.get_config("mode", _mode, "temperature")

    api_key = settings.get_provider_key(_selected_provider)
    base_url = settings.get_config("provider", _selected_provider, "url", default="")
    litellm_model = f"{_get_model_prefix(_selected_provider)}/{_selected_model}"

    try:
        response = await acompletion(
            model=litellm_model,
            messages=summarize_messages,
            temperature=_temperature,
            max_tokens=1024,
            timeout=120,
            api_key=api_key,
            base_url=base_url,
        )
        summary_content = response.choices[0].message.content or ""
    except Exception as e:
        logger.error(f"总结模型调用失败: {e}")
        return {"success": False, "detail": f"总结失败: {str(e)}"}

    # 存入 data.summaries
    data.setdefault("summaries", [])
    data["summaries"].append({
        "content": summary_content,
        "replaces_from": replaces_from,
        "replaces_to": replaces_to,
        "created_at": time.time(),
    })
    storage.save_data(thread_id, data)

    # 返回完整树信息（含 summaries 和 next_pending_tool）
    tree = storage.get_full_tree(thread_id)
    return {
        "messages": tree["messages"],
        "active_leaf": tree["active_leaf"],
        "active_path": tree["active_path"],
        "branch_points": tree["branch_points"],
        "next_pending_tool": tree["next_pending_tool"],
        "summaries": data.get("summaries", []),
    }
