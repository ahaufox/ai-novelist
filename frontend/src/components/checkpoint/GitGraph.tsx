import type { GraphNode } from '@/types';

// ─── 布局常量 ────────────────────────────────────────
const ROW_H = 36;    // 每行高度
const DOT_R = 5;     // 圆点半径
const LINE_L = 14;   // 时间线距左侧
const MSG_X = 30;    // commit message 起始 X
const CIRCLE_CX = 7; // 圆点圆心 X

interface GitGraphProps {
  data: { nodes: GraphNode[] } | null;
  /** 当前 HEAD 的 SHA */
  workingHead?: string;
  onCheckout?: (sha: string) => void;
  checkoutLoading?: boolean;
  /** 选中节点 */
  selectedSha?: string | null;
  onNodeClick?: (node: GraphNode) => void;
}

export default function GitGraph({
  data,
  workingHead,
  onCheckout,
  checkoutLoading,
  selectedSha,
  onNodeClick,
}: GitGraphProps) {
  if (!data || !data.nodes || data.nodes.length === 0) return null;

  // 按 row 排序，保证时间线从上到下排列
  const nodes = [...data.nodes].sort((a, b) => b.row - a.row);
  const svgH = nodes.length * ROW_H + 16;

  const y = (rowIndex: number) => 8 + rowIndex * ROW_H;

  return (
    <div className="git-graph-container" style={{ height: '100%', overflow: 'auto' }}>
      <svg
        width="100%"
        height={svgH}
        style={{ display: 'block', minWidth: 260 }}
      >
        {/* 垂直时间线 */}
        {nodes.length > 1 && (
          <line
            x1={CIRCLE_CX}
            y1={y(0) + DOT_R}
            x2={CIRCLE_CX}
            y2={y(nodes.length - 1) - DOT_R}
            stroke="#555"
            strokeWidth={2}
          />
        )}

        {/* commit 圆点 + message */}
        {nodes.map((n, i) => {
          const cy = y(i);
          const isHead = n.sha === workingHead;
          const isSelected = n.sha === selectedSha;
          return (
            <g
              key={n.sha}
              style={{ cursor: 'pointer' }}
              onClick={() => onNodeClick?.(n)}
            >
              {/* 选中光环 */}
              {isSelected && (
                <circle
                  cx={CIRCLE_CX}
                  cy={cy}
                  r={DOT_R + 4}
                  fill="none"
                  stroke="#4CAF50"
                  strokeWidth={2}
                  opacity={0.7}
                />
              )}
              {/* HEAD 光环 */}
              {isHead && !isSelected && (
                <circle
                  cx={CIRCLE_CX}
                  cy={cy}
                  r={DOT_R + 3}
                  fill="none"
                  stroke="#4CAF50"
                  strokeWidth={1.5}
                  opacity={0.5}
                />
              )}
              {/* 圆点 */}
              <circle
                cx={CIRCLE_CX}
                cy={cy}
                r={DOT_R}
                fill={isHead || isSelected ? '#4CAF50' : '#888'}
                stroke={isHead || isSelected ? '#4CAF50' : '#666'}
                strokeWidth={1.5}
              />
              {/* message 文字（自动截断） */}
              <text
                x={MSG_X}
                y={cy + 4}
                fontSize={12}
                fill={isHead || isSelected ? '#e0e0e0' : '#999'}
                dominantBaseline="middle"
                style={{ userSelect: 'none' }}
              >
                {n.message}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
