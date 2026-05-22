import React, { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeRaw from 'rehype-raw';
import rehypeSlug from 'rehype-slug';
import rehypeKatex from 'rehype-katex';
import { ShikiCodeBlock } from './ShikiCodeBlock';
import './markdown.css';

export interface MarkdownRendererProps {
  /** Markdown 文本内容 */
  content: string;
  /** 额外的 CSS class */
  className?: string;
}

/**
 * MarkdownRenderer — 统一的 Markdown 渲染组件
 *
 * 封装 react-markdown + 常用插件，支持：
 * - GFM（表格、任务列表、删除线等）
 * - LaTeX 数学公式（remark-math + rehype-katex）
 * - 保留 HTML（rehype-raw）
 * - 标题锚点（rehype-slug）
 * - Shiki 代码语法高亮
 *
 * 使用 React.memo 优化流式场景下的重渲染性能。
 */
const MarkdownRenderer = memo(function MarkdownRenderer({
  content,
  className = '',
}: MarkdownRendererProps) {
  if (!content) return null;

  return (
    <div className={`markdown-body ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeRaw, rehypeSlug, rehypeKatex]}
        components={{
          code: ShikiCodeBlock,
          // 防止 react-markdown 默认的 <pre> 包裹与 Shiki 冲突
          pre: ({ children }) => <>{children}</>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});

export default MarkdownRenderer;
