# 前端 HITL 适配方案（最终版）

## 核心理念

**所有文件修改逻辑前置到前端，后端工具退化为纯写入。**

## 工具分类

### 读操作（展示结果，用户确认）
| 工具 | 前端行为 | 后端行为 |
|---|---|---|
| `read` | 展示工具结果文本 | 正常执行 read，返回内容 |
| `grep` | 展示搜索结果 | 正常执行 grep，返回匹配 |
| `glob` | 展示匹配文件列表 | 正常执行 glob，返回列表 |
| `skill` | 展示 Skill 内容 | 正常执行 skill，返回内容 |

### 写操作（显示差异，用户审批）
| 工具 | 前端行为 | 后端行为 |
|---|---|---|
| `edit` | 前端复现搜索替换，显示 diff 视图 | **退化为纯写入**: 接收最终内容，直接写文件 |
| `write` | 显示文件将要被创建/覆写 | **退化为纯写入**: 接收最终内容，直接写文件 |
| `shell` | 显示命令详情，用户确认 | 正常执行 shell 命令 |

### 交互操作
| 工具 | 前端行为 | 后端行为 |
|---|---|---|
| `question` | 展示问题，用户回答 | 正常返回用户回答 |

## HITL 数据流

```
用户审查后点击批准
    ↓
POST /api/chat2/function_calling
{
  tool_call_id: "call_xxx",
  approved: true,
  user_diff: "+line 1 modified\n-line 1 original",   // 前端 computed diff
  user_extra: "措辞调整了一下"                         // 用户文字反馈
}
    ↓
后端处理函数
```

### 写操作处理逻辑

```python
@router.post("/function_calling")
async def function_calling(request: FunctionCallingRequest):
    tr_info = get_tool_request_info(...)
    tool_name = tr_info["tool_name"]
    arguments = tr_info["arguments"]  # AI 原始参数
    
    if request.approved:
        if request.user_diff and tool_name in ("edit", "write"):
            # 用户手动修改了内容
            # 前端传的 user_diff 中包含最终完整内容（以特定格式）
            # 直接从 user_diff 提取最终内容写入
            filepath = extract_filepath(arguments)
            final_content = extract_final_content(request.user_diff, arguments)
            write_file(filepath, final_content)
            result = {"success": True}
        else:
            # 用户批准 AI 原始提议 → 正常执行工具
            result = await _execute_tool(tool_dict, tool_name, arguments)
    
    # 构建返回给 AI 的消息
    tool_message_parts = []
    if request.user_diff:
        tool_message_parts.append(f"[用户修改了文件内容]\n{request.user_diff}")
    if request.user_extra:
        tool_message_parts.append(f"[用户留言]\n{request.user_extra}")
    if result:
        tool_message_parts.append(format_result(result))
    
    tool_content = "\n\n".join(tool_message_parts)
```

### AI 收到的信息格式

```
[用户修改了文件内容]
+new line 1
-new line 2
 ## 或其他 diff 格式

[用户留言]
措辞调整了一下
```

AI 不会收到完整文件内容。如果 AI 需要看完整内容，应该自己调用 `read` 工具。

## 前端改动清单

### 1. `fileToolHandler.ts` — 重写核心逻辑

```typescript
// 所有工具都需要展示给用户
const FILE_TOOLS = ['write', 'edit'];
const SHELL_TOOL = 'shell';
const QUESTION_TOOL = 'question';
const READ_TOOLS = ['read', 'grep', 'glob', 'skill'];
```

**`handleFileToolCall` 改为**：

```typescript
async function handleFileToolCall(toolName: string, args: any) {
  switch (toolName) {
    case 'edit': {
      const { filePath, oldString, newString, replaceAll } = args;
      const original = await fetchFileContent(filePath);
      
      // 前端复现搜索替换逻辑
      const matchResult = findMatchingString(original.content, oldString);
      if (matchResult === null) {
        // 匹配失败，提示用户
        showToast('AI 建议的修改无法在前端预览匹配');
        return;
      }
      
      const modified = replaceAll
        ? original.content.split(matchResult).join(newString)
        : original.content.replace(matchResult, newString);
      
      // 计算用户可见的 diff
      const userDiff = computeDiff(original.content, modified);
      
      // 创建 diff 标签页
      dispatch(createTempDiffTab({
        id: filePath,
        originalContent: original.content,
        modifiedContent: modified,
        userDiff,   // 暂存，批准时发送
      }));
      break;
    }
    
    case 'write': {
      const { filePath, content } = args;
      const original = await fetchFileContent(filePath);
      
      dispatch(createTempDiffTab({
        id: filePath,
        originalContent: original.content,
        modifiedContent: content,
      }));
      break;
    }
    
    case 'shell': {
      // 展示命令预览，等待用户确认
      dispatch(showShellPreview({
        command: args.command,
        description: args.description,
        workdir: args.workdir,
        timeout: args.timeout,
      }));
      break;
    }
    
    case 'question': {
      // 展示问题给用户
      dispatch(showQuestionDialog(args.questions));
      break;
    }
  }
}
```

### 2. 新建 `editMatcher.ts`

前端复现后端的搜索替换匹配逻辑：

```typescript
export function findMatchingString(content: string, search: string): string | null {
  // 策略1: 精确匹配
  if (content.includes(search)) return search;
  
  // 策略2: 逐行去空白
  const contentLines = content.split('\n');
  const searchLines = search.split('\n').filter(l => l !== '');
  
  for (let i = 0; i <= contentLines.length - searchLines.length; i++) {
    let match = true;
    for (let j = 0; j < searchLines.length; j++) {
      if (contentLines[i + j].trim() !== searchLines[j].trim()) {
        match = false;
        break;
      }
    }
    if (match) {
      return contentLines.slice(i, i + searchLines.length).join('\n');
    }
  }
  
  // 策略3: 首尾锚点
  if (searchLines.length >= 3) {
    const first = searchLines[0].trim();
    const last = searchLines[searchLines.length - 1].trim();
    for (let i = 0; i < contentLines.length; i++) {
      if (contentLines[i].trim() !== first) continue;
      for (let j = i + 2; j < contentLines.length; j++) {
        if (contentLines[j].trim() === last) {
          return contentLines.slice(i, j + 1).join('\n');
        }
      }
    }
  }
  
  return null;
}
```

## 后端改动清单

| 文件 | 改动 |
|---|---|
| `backend/ai_agent/tool/file_tool/edit.py` | **简化**：移除搜索替换逻辑，改为纯写入 |
| `backend/ai_agent/tool/file_tool/write.py` | **基本不变**，本来就是纯写入 |
| `backend/api/chat_api2.py` | `function_calling` 端点：user_diff 时直接写文件 |

## 不需要改动的部分

- WebSocket 文件同步 (`fileSyncHandler.ts`)
- diff 标签页渲染 (`createTempDiffTab`)
- 工具请求状态管理 (`chatStore`)
- monaco 编辑器交互
- `read` / `grep` / `glob` / `skill` / `shell` / `question` 的后端逻辑
