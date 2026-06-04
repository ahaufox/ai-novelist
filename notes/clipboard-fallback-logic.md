# 剪贴板复制回退逻辑

## 背景

主前端（`frontend/`）在 Wails 启动器的 iframe 中加载（"青烛"标签页）。
WebView2（Chromium）的 Permissions Policy 会阻止跨域 iframe 使用 `navigator.clipboard.writeText()`，
即使添加 `allow="clipboard-write"` 在某些 Chromium 版本中也无效。

## 方案

采用**回退策略**：优先尝试 Clipboard API，失败后回退到 `document.execCommand('copy')`。

## 代码位置

[`frontend/src/components/chat/MessageDisplayPanel.tsx:116-141`](frontend/src/components/chat/MessageDisplayPanel.tsx:116)

## 执行流程

```
用户点击「复制」
    │
    ▼
尝试 navigator.clipboard.writeText(content)
    │
    ├── 成功 → 显示"已复制"状态 → 结束
    │
    └── 失败（抛出异常）
         │
         ▼
         创建隐藏的 <textarea>（position:fixed, opacity:0, pointer-events:none）
         将内容写入 textarea.value
         调用 textarea.focus()
         调用 textarea.select()
         调用 document.execCommand('copy')
         移除 textarea
         │
         ├── 成功 → 显示"已复制"状态 → 结束
         │
         └── 失败 → 弹出错误弹窗
```

## 为什么使用 execCommand

- `document.execCommand('copy')` 是旧版 API，在 Webview/iframe 受限环境下仍然可用
- 它不依赖 Permissions Policy，而是依赖用户手势（click 事件触发的复制）
- 在所有 Chromium 版本中均受支持（包括 WebView2）
- 不需要额外依赖或后端支持

## 为什么 allow="clipboard-write" 无效

WebView2 使用的 Chromium 版本可能不支持 `clipboard-write` 特征策略，
或者跨域 iframe 的权限策略实现存在 bug，导致 `allow` 属性被忽略。
