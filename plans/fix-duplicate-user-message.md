# 修复 `[用户留言]` 重复问题

## 问题描述

当用户在工具审批弹窗中输入额外消息并批准工具时：
1. **工具结果消息** 中包含 `[用户留言]\n{用户输入}` 标签和内容
2. **消息列表** 中在所有工具执行完毕后，又添加了一条独立用户消息，内容相同

## 根本原因

在 [`backend/api/chat_api2.py`](../backend/api/chat_api2.py) 的 `function_calling` 端点中：

- **第 609-610 行**：`user_extra` 被嵌入到 **tool 消息内容**中，加了 `[用户留言]` 标签
- **第 637-647 行**：所有工具执行完毕后，`user_extra` 又被作为**独立用户消息**添加

结果：同一段文本在对话中出现两次。

## OpenAI 消息格式约束 ⚠️

```
✓ 正确的消息顺序：
  assistant (tool_calls: [call1, call2, call3])
    → tool (call1 的结果)
    → tool (call2 的结果)     ← 所有 tool 必须连续
    → tool (call3 的结果)
    → user (附加消息)         ← user 消息只能在所有 tool 之后
    → assistant (AI 响应)

✗ 错误的消息顺序：
  assistant (tool_calls: [call1, call2, call3])
    → tool (call1 的结果)
    → user (附加消息)          ← 穿插在 tool 之间！破坏格式！
    → tool (call2 的结果)
```

因此 `user_extra` **不能**在每次工具执行后立即插入为 user 消息，必须在所有 tool 消息之后添加。

## 修改方案

只需修改 **1 处**。

### 修改：从 tool 消息中移除 `[用户留言]`

**文件**: [`backend/api/chat_api2.py`](../backend/api/chat_api2.py)
**位置**: 第 607-610 行

```python
# tool_parts 构建
tool_parts = []
if result and result.get("detail"):
    tool_parts.append(result["detail"])
if request.user_diff:
    tool_parts.append(f"[用户修改了文件内容]\n{request.user_diff}")
# ← 删除以下 3 行
# if request.user_extra:
#     tool_parts.append(f"[用户留言]\n{request.user_extra}")

tool_content = "\n\n".join(tool_parts) if tool_parts else result_json
```

**第 637-647 行的 user_extra 用户消息添加逻辑保持不变**——在所有 tool 执行完毕后，`user_extra` 作为独立 user 消息出现，这是正确的位置。

## 修改后的数据流

```
用户批准 tool_call1 + 输入额外文本 "帮我修改颜色"
  │
  ├─→ [后端] 执行工具 call1，创建 tool1 消息
  │          tool1.content = "[工具执行结果]"          ← 干净，无 [用户留言]
  │
  ├─→ [后端] 发送 state_update
  │
  ├─→ [后端] 检查 pending
  │     ├─ 还有 call2、call3 待审批 → 返回，前端显示下一个工具
  │     │
  │     └─ 所有工具执行完毕
  │          └─ user_extra = "帮我修改颜色" 作为独立 user 消息添加  ← 唯一出现位置
  │          └─ 流式 AI 响应
```

## 涉及文件

| 文件 | 修改 | 说明 |
|------|------|------|
| [`backend/api/chat_api2.py`](../backend/api/chat_api2.py:609-610) | 删除 3 行 | 移除 tool 消息中的 `[用户留言]\n{user_extra}` |
