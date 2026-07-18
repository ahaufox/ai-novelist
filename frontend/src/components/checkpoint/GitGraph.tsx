import { useState, useRef, useEffect } from 'react';
import type { GraphNode } from '@/types';

// ─── 文件变更信息 ──────────────────────────────────────
export interface FileChangeInfo {
  path: string;
  change_type: string;
  old_content?: string;
  new_content?: string;
}

interface GitGraphProps {
  data: { nodes: GraphNode[] } | null;
  /** 当前 HEAD 的 SHA */
  workingHead?: string;
  /** 左键点击节点（展开/折叠） */
  onNodeClick?: (node: GraphNode) => void;
  /** 右键菜单 → 回档到该版本 */
  onRollback?: (sha: string) => void;
  /** 当前展开的节点 SHA */
  expandedSha?: string | null;
  /** 展开节点的文件变更列表 */
  expandedChanges?: FileChangeInfo[];
  /** 展开节点加载中 */
  expandedLoading?: boolean;
  /** 点击变更文件 → 打开差异对比 */
  onFileClick?: (change: FileChangeInfo, commitHash: string) => void;
}

const changeIcon = (type: string) => {
  switch (type) {
    case 'A': return '🟢';
    case 'D': return '🔴';
    case 'M': return '🟡';
    default: return '⚪';
  }
};

const changeLabel = (type: string) => {
  switch (type) {
    case 'A': return '新增';
    case 'D': return '删除';
    case 'M': return '修改';
    default: return type;
  }
};

export default function GitGraph({
  data,
  workingHead,
  onNodeClick,
  onRollback,
  expandedSha,
  expandedChanges,
  expandedLoading,
  onFileClick,
}: GitGraphProps) {
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    node: GraphNode;
  } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // 点击菜单外关闭
  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = () => setContextMenu(null);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [contextMenu]);

  if (!data || !data.nodes || data.nodes.length === 0) return null;

  // 按 row 升序（row 0 = 最新提交）
  const nodes = [...data.nodes].sort((a, b) => a.row - b.row);

  return (
    <div className="git-graph-container" style={{ minHeight: '100%', position: 'relative' }}>
      {/* 时间线行 */}
      {nodes.map((n) => {
        const isHead = n.sha === workingHead;
        const isExpanded = n.sha === expandedSha;
        return (
          <div key={n.sha}>
            {/* 主行 */}
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded cursor-pointer transition-colors select-none ${
                isExpanded ? 'bg-theme-gray2/50' : 'hover:bg-theme-gray2/30'
              }`}
              onClick={() => onNodeClick?.(n)}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setContextMenu({ x: e.clientX, y: e.clientY, node: n });
              }}
            >
              {/* 圆点 */}
              <div className="flex items-center justify-center w-3 h-3 flex-shrink-0">
                <div
                  className={`w-2.5 h-2.5 rounded-full border-2 ${
                    isHead || isExpanded
                      ? 'bg-theme-green border-theme-green'
                      : 'bg-transparent border-theme-gray5'
                  }`}
                />
              </div>
              {/* message */}
              <span
                className={`text-xs truncate flex-1 ${
                  isHead ? 'text-theme-white font-semibold' : 'text-theme-gray4'
                }`}
                title={n.message}
              >
                {n.message}
              </span>
              {/* 展开指示器 */}
              {isExpanded && (
                <span className="text-[10px] text-theme-green flex-shrink-0">▼</span>
              )}
            </div>

            {/* 展开的文件变更列表 */}
            {isExpanded && (
              <div className="ml-5 pl-3 border-l-2 border-theme-gray3 mb-1">
                {expandedLoading ? (
                  <div className="text-xs text-theme-gray5 px-2 py-1">加载中...</div>
                ) : expandedChanges && expandedChanges.length > 0 ? (
                  expandedChanges.map((chg, i) => (
                    <div
                      key={`${n.sha}-file-${i}`}
                      className="flex items-center gap-1.5 px-2 py-1 cursor-pointer hover:bg-theme-gray2 rounded text-xs text-theme-gray4 transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        onFileClick?.(chg, n.sha);
                      }}
                      title={`${chg.path} (${changeLabel(chg.change_type)})`}
                    >
                      <span className="flex-shrink-0 text-[10px]">{changeIcon(chg.change_type)}</span>
                      <span className="truncate">{chg.path}</span>
                      <span className="text-[10px] text-theme-gray5 flex-shrink-0 ml-auto">
                        {changeLabel(chg.change_type)}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-theme-gray5 px-2 py-1 italic">
                    无文件变更（初始提交）
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* ─── 右键菜单 ──────────────────────────────────── */}
      {contextMenu && (
        <div
          ref={menuRef}
          className="fixed z-50 bg-[#1e1e2e] border border-theme-gray3 rounded shadow-xl py-1 min-w-[130px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <div className="px-3 py-1.5 text-[10px] text-theme-gray5 border-b border-theme-gray3 mb-1 truncate max-w-[200px]">
            {contextMenu.node.sha.slice(0, 8)} — {contextMenu.node.message}
          </div>
          <div
            className="flex items-center gap-2 px-3 py-1.5 text-xs text-theme-red cursor-pointer hover:bg-theme-gray2 transition-colors"
            onClick={() => {
              const sha = contextMenu.node.sha;
              setContextMenu(null);
              onRollback?.(sha);
            }}
          >
            <span>↩</span>
            <span>回档到该版本</span>
          </div>
        </div>
      )}
    </div>
  );
}
