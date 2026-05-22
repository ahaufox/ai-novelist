import { useState, useEffect, useRef } from 'react';
import { createHighlighter, type Highlighter } from 'shiki';

// 单例：全局共享一个 highlighter 实例
let highlighterPromise: Promise<Highlighter> | null = null;

function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ['github-dark'],
      langs: [
        'typescript',
        'javascript',
        'python',
        'bash',
        'json',
        'html',
        'css',
        'sql',
        'markdown',
        'yaml',
        'rust',
        'go',
        'shell',
        'xml',
        'diff',
        'docker',
        'powershell',
        'java',
        'cpp',
        'c',
      ],
    });
  }
  return highlighterPromise;
}

interface ShikiCodeBlockProps {
  className?: string | undefined;
  children?: React.ReactNode;
  inline?: boolean;
}

/**
 * Shiki 代码语法高亮组件
 *
 * - 内联代码（inline=true）：直接渲染 <code>
 * - 代码块（inline=false）：使用 Shiki 异步高亮，高亮完成前显示 fallback
 */
export function ShikiCodeBlock({ className, children, inline }: ShikiCodeBlockProps) {
  const codeText = String(children || '').replace(/\n$/, '');

  // 内联代码或未指定语言 → 直接渲染
  if (inline || !className?.startsWith('language-')) {
    return (
      <code className={className}>
        {children}
      </code>
    );
  }

  const lang = className.replace(/^language-/, '');

  return <HighlightedCode lang={lang} code={codeText} />;
}

function HighlightedCode({ lang, code }: { lang: string; code: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    setHtml(null);
    setError(false);

    getHighlighter()
      .then((hl) => {
        if (!mountedRef.current) return;
        try {
          const highlighted = hl.codeToHtml(code, {
            lang,
            theme: 'github-dark',
          });
          if (mountedRef.current) {
            setHtml(highlighted);
          }
        } catch {
          if (mountedRef.current) setError(true);
        }
      })
      .catch(() => {
        if (mountedRef.current) setError(true);
      });

    return () => {
      mountedRef.current = false;
    };
  }, [lang, code]);

  // 高亮完成 → 渲染 Shiki 生成的 HTML
  if (html) {
    return <div dangerouslySetInnerHTML={{ __html: html }} />;
  }

  // 高亮失败或尚未完成 → fallback 纯文本
  return (
    <pre className={error ? 'shiki-error' : 'shiki-loading'}>
      <code>{code}</code>
    </pre>
  );
}
