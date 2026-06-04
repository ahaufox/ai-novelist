# HITL final_content 丢失导致 "Write requires HITL approval" 报错

## 问题描述

启动器（iframe/Webview2）模式下，用户批准 AI 的 `write` 文件写入操作后，后端返回 `"Write requires HITL approval. Please approve the change in the UI."` 错误。浏览器直接访问（localhost:3000）无此问题。

## 报错位置

- [`backend/ai_agent/tool/file_tool/write.py:56`](../backend/ai_agent/tool/file_tool/write.py:56)
- [`backend/ai_agent/tool/file_tool/edit.py:66`](../backend/ai_agent/tool/file_tool/edit.py:66)

触发条件：`ctx.extra["final_content"]` 不存在或为 `None`。

## 排查过程

### 1. 后端日志确认

后端添加 `print` 日志后确认：

```
[HITL-DEBUG] write 工具缺少 final_content: ctx.extra=None, filepath=...
```

`ctx.extra` 为 `None`，说明前端 `POST /api/chat2/function_calling` 请求中 `final_content` 字段为 `undefined`。

### 2. 前端 Alert 弹窗定位

在 `ToolRequestPanel.tsx` 的 `handleFunctionCalling` 中加入 alert 弹窗，打印诊断信息：

```
[HITL-DEBUG] 处理工具: write
args长度: 7374
path: F:/1/0.2.2/qingzhu/data/...
currentData keys(1个): F:/1/0.2.2/qingzhu/...
path in currentData: true
currentData[path]: 存在(7297字符)
aiSuggestContent[path]: 存在(6923字符)
❌ 解析工具参数失败: URIError: URI malformed
```

说明 `JSON.parse` 成功、`path` 和 `currentData` 都存在，但后续代码抛出 `URIError`。

### 3. 根因定位

问题出在代码执行顺序（修复前）：

```typescript
// 旧代码顺序（有Bug）
if (approved) {
    const aiContent = aiSuggestContent[path];
    const currentContent = currentData[path];
    if (hasDiff(aiContent, currentContent)) {
        userDiff = computeDiff(aiContent, currentContent);  // ← 第1步：先计算 diff
    }
    if (currentContent !== undefined) {
        finalContent = currentContent;  // ← 第2步：再设 finalContent
    }
}
```

`computeDiff()` 在 [`frontend/src/utils/diffUtils.ts:22`](../frontend/src/utils/diffUtils.ts:22) 中调用 `decodeURIComponent(patchText)`，当 patchText 含 emoji（如 🚀）等特殊字符时抛出 `URIError: URI malformed`。异常被外层 catch 捕获，导致第2步的 `finalContent = currentContent` 永远没执行到。

### 4. 为什么只在启动器模式下出现？

`computeDiff` 在两种情况下都会被调用：
- **浏览器直接访问**：前端的 `processFileToolCalls`（在流式响应解析中触发 `handleFileToolCall`）创建 diff 标签页时，不调用 `computeDiff`
- **启动器 iframe**：同样创建 diff 标签页时不调用 `computeDiff`

`computeDiff` 只在 **用户点击批准** 时在 `handleFunctionCalling` 中被调用。`URIError` 是内容本身的问题（含 emoji `🚀`），与 iframe 无关——浏览器模式下可能刚好没测试到含 emoji 的内容，或者 Webview2 对 `decodeURIComponent` 的行为与 Chrome 不同。

**实际触发条件**：只要 AI 生成的内容包含 `decodeURIComponent` 无法处理的字符（emoji 代理对），就会触发此 Bug，与运行模式无关。

## 修复方案

### 修复1：调整 finalContent 赋值顺序（关键修复）

[`frontend/src/components/chat/ToolRequestPanel.tsx`](../frontend/src/components/chat/ToolRequestPanel.tsx)

将 `finalContent = currentContent` 移到 `computeDiff` **之前**，确保即使 diff 计算失败也不影响文件内容传递。

```typescript
// 修复后的代码顺序
if (approved) {
    const currentContent = currentData[path];
    // 先设置 finalContent，避免 computeDiff 抛异常时 content 丢失
    if (currentContent !== undefined) {
        finalContent = currentContent;
    }
    if (hasDiff(aiContent, currentContent)) {
        try {
            userDiff = computeDiff(aiContent, currentContent);
        } catch (diffErr) {
            console.error('[computeDiff] 失败:', diffErr);
        }
    }
}
```

### 修复2：computeDiff 容错

[`frontend/src/utils/diffUtils.ts`](../frontend/src/utils/diffUtils.ts)

`decodeURIComponent(patchText)` 用 try-catch 包裹，失败时返回原始 `patchText`。

```typescript
try {
    return decodeURIComponent(patchText);
} catch {
    return patchText;  // 降级返回原始文本
}
```

## 涉及文件

| 文件 | 修改类型 |
|------|----------|
| [`frontend/src/components/chat/ToolRequestPanel.tsx`](../frontend/src/components/chat/ToolRequestPanel.tsx) | 修复：调整 `finalContent` 赋值顺序 |
| [`frontend/src/utils/diffUtils.ts`](../frontend/src/utils/diffUtils.ts) | 修复：`decodeURIComponent` 加 try-catch |
| [`backend/ai_agent/tool/file_tool/write.py`](../backend/ai_agent/tool/file_tool/write.py) | 临时调试日志（已清理） |
| [`backend/ai_agent/tool/file_tool/edit.py`](../backend/ai_agent/tool/file_tool/edit.py) | 临时调试日志（已清理） |
