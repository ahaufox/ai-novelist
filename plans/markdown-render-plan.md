# AI 流式输出 Markdown 渲染方案

## 1. 背景

当前 [`MessageDisplayPanel.tsx`](../frontend/src/components/chat/MessageDisplayPanel.tsx:572) 中，AI 消息和用户消息均使用 `whitespace-pre-wrap` 纯文本渲染，没有任何 Markdown 解析。项目已安装 `react-markdown`、`remark-gfm`、`remark-math`、`rehype-katex`、`rehype-raw`、`rehype-slug` 和 `shiki` 等依赖，具备完整的 Markdown 渲染能力。

## 2. 目标

- AI 消息和用户消息均支持 Markdown 渲染
- 代码块支持 Shiki 语法高亮
- 用户消息中的 `@文件路径` 高亮保留
- 流式传输中不完整 Markdown 的兼容处理
- 深色主题适配

## 3. 架构设计

### 3.1 组件树

```
MessageDisplayPanel
  └── MarkdownRenderer (新建)
        ├── react-markdown
        │     ├── remark-gfm (表格、删除线等 GFM 扩展)
        │     ├── remark-math (LaTeX 数学公式)
        │     ├── rehype-raw (保留 HTML)
        │     ├── rehype-slug (标题锚点)
        │     ├── rehype-katex (公式渲染)
        │     └── components.code → ShikiCodeBlock (新建)
        └── markdown.css (新建样式)
```

### 3.2 数据流

```
流式 chunk → Redux store (content 累加) → MessageDisplayPanel
  → 判断消息类型
    → 用户消息: preprocessContent (处理 @path) → MarkdownRenderer
    → AI 消息: MarkdownRenderer (直接渲染)
```

## 4. 详细实现

### 4.1 新建 `MarkdownRenderer` 组件

**路径**: [`frontend/src/components/chat/MarkdownRenderer.tsx`](../frontend/src/components/chat/)

**职责**:
- 封装 `react-markdown` 及其插件
- 提供 `content` 和 `className` props
- 内部使用 `Suspense` 包裹，流式渲染时避免崩溃

**核心逻辑**:

```tsx
interface MarkdownRendererProps {
  content: string;
  className?: string;
}

// 使用 React.memo 避免不必要的重渲染（流式场景关键优化）
const MarkdownRenderer = React.memo(({ content, className }: MarkdownRendererProps) => {
  return (
    <div className={`markdown-body ${className || ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeRaw, rehypeSlug, rehypeKatex]}
        components={{
          code: CodeBlock,  // Shiki 高亮
          pre: PreBlock,    // 代码块容器
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
```

### 4.2 Shiki 代码语法高亮

**路径**: [`frontend/src/components/chat/ShikiCodeBlock.tsx`](../frontend/src/components/chat/ShikiCodeBlock.tsx)

**方案**: 使用 `shiki` 的 `createHighlighter` 创建高亮器实例，在 `code` 组件中按需高亮。

```tsx
// 单例模式创建 highlighter
let highlighter: Highlighter | null = null;
async function getHighlighter() {
  if (!highlighter) {
    highlighter = await createHighlighter({
      themes: ['github-dark', 'github-light'],
      langs: ['typescript', 'python', 'javascript', 'bash', 'json', 'html', 'css', 'sql', ...],
    });
  }
  return highlighter;
}
```

**关键设计**:
- 高亮器使用懒加载单例，仅在首次遇到代码块时初始化
- 使用 `useEffect` + `useState` 异步渲染高亮结果
- 高亮完成前显示 fallback（纯文本代码块）
- 主题跟随应用主题（深色/浅色）

### 4.3 用户消息 `@文件路径` 处理

**方案**: 在将用户消息内容传入 `MarkdownRenderer` 前，进行预处理：

```tsx
function preprocessUserContent(content: string): string {
  // 将 @path 替换为带样式的 HTML span
  return content.replace(
    /(@[^\s\n]+)/g,
    '<span class="file-path-mention">$1</span>'
  );
}
```

由于 `rehype-raw` 已启用，这些 HTML span 会被保留并正确渲染。

### 4.4 流式传输兼容性

**问题**: 流式传输中，Markdown 可能不完整（如未闭合的 ` ``` `、`**`、`$` 等）。

**解决方案**:
1. `react-markdown` 本身对不完整 Markdown 有较好的容错性
2. 使用 `React.memo` 避免不必要的重渲染
3. 代码块在流式传输中：Shiki 高亮组件检测到代码不完整时，使用 fallback 纯文本渲染
4. 添加 `ErrorBoundary` 包裹，防止渲染崩溃

### 4.5 CSS 样式

**路径**: [`frontend/src/components/chat/markdown.css`](../frontend/src/components/chat/markdown.css)

**样式覆盖范围**:

| 元素 | 样式要点 |
|------|---------|
| `h1`-`h6` | 标题层级，使用 `--color-white` |
| `p` | 段落间距 |
| `ul`/`ol` | 列表缩进和标记 |
| `code` (inline) | 内联代码背景色 `--color-gray1` |
| `pre code` | 代码块样式 |
| `blockquote` | 引用块左边框 `--color-green` |
| `table` | 表格边框 `--color-gray3` |
| `a` | 链接颜色 `--color-green` |
| `img` | 最大宽度限制 |
| `hr` | 分割线颜色 |
| `.file-path-mention` | `@路径` 高亮色 `--color-gray3` |

所有样式使用项目已有的 CSS 变量（`--color-*`），确保主题一致性。

## 5. 文件变更清单

| 操作 | 文件 | 说明 |
|------|------|------|
| **新建** | `frontend/src/components/chat/MarkdownRenderer.tsx` | 核心 Markdown 渲染组件 |
| **新建** | `frontend/src/components/chat/ShikiCodeBlock.tsx` | Shiki 代码高亮组件 |
| **新建** | `frontend/src/components/chat/markdown.css` | Markdown 渲染样式 |
| **修改** | `frontend/src/components/chat/MessageDisplayPanel.tsx` | 替换纯文本渲染为 MarkdownRenderer |

## 6. 实施步骤

1. 创建 `ShikiCodeBlock.tsx` — 代码高亮组件（独立可测试）
2. 创建 `markdown.css` — 样式定义
3. 创建 `MarkdownRenderer.tsx` — 核心渲染器，集成所有插件
4. 修改 `MessageDisplayPanel.tsx` — 替换渲染逻辑
   - AI 消息：直接使用 `<MarkdownRenderer content={msg.content} />`
   - 用户消息：预处理 `@path` 后使用 `<MarkdownRenderer content={preprocessed} />`
   - 工具结果消息：保持折叠/展开逻辑，展开后使用 MarkdownRenderer
5. 测试流式场景下的渲染稳定性

## 7. 注意事项

- `react-markdown` v10 是 ESM-only，与 Vite 项目兼容
- Shiki v3 也是 ESM-only，需确保 `vite.config.ts` 中正确处理
- 流式渲染时，`React.memo` 的 `areEqual` 需要正确处理 content 变化
- 代码高亮是异步操作，需处理好 loading 状态
- 考虑添加 `rehype-sanitize` 防止 XSS（如果用户消息允许 HTML）
