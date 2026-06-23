import type { GraphNode } from '@/types';

// ─── 布局常量 ────────────────────────────────────────
const ROW_H = 36;
const DOT_R = 5;
const LINE_LEFT = 14;
const MSG_X = 30;

interface GitGraphProps {
  data: { nodes: GraphNode[] } | null;
  /** 当前 HEAD 的 SHA */
  workingHead?: string;
  /** 点击节点 */
  onNodeClick?: (node: GraphNode) => void;
}

export default function GitGraph({ data, workingHead, onNodeClick }: GitGraphProps) {
  if (!data || !data.nodes || data.nodes.length === 0) return null;

  // 按 row 倒序，最新提交在最上面
  const nodes = [...data.nodes].sort((a, b) => b.row - a.row);
  const svgH = nodes.length * ROW_H + 16;

  const y = (index: number) => 8 + index * ROW_H;

  return (
    <svg
      width="100%"
      height={svgH}
      style={{ display: 'block' }}
    >
      {/* 垂直时间线 */}
      {nodes.length > 1 && (
        <line
          x1={LINE_LEFT}
          y1={y(0) + DOT_R}
          x2={LINE_LEFT}
          y2={y(nodes.length - 1) - DOT_R}
          stroke="#444"
          strokeWidth={2}
        />
      )}

      {/* 圆点 + message */}
      {nodes.map((n, i) => {
        const cy = y(i);
        const isHead = n.sha === workingHead;
        return (
          <g
            key={n.sha}
            style={{ cursor: 'pointer' }}
            onClick={() => onNodeClick?.(n)}
          >
            {/* HEAD 光环 */}
            {isHead && (
              <circle
                cx={LINE_LEFT}
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
              cx={LINE_LEFT}
              cy={cy}
              r={DOT_R}
              fill={isHead ? '#4CAF50' : '#777'}
              stroke={isHead ? '#4CAF50' : '#555'}
              strokeWidth={1.5}
            />
            {/* message 文字 */}
            <text
              x={MSG_X}
              y={cy + 4}
              fontSize={12}
              fill={isHead ? '#e0e0e0' : '#999'}
              dominantBaseline="middle"
              style={{ userSelect: 'none' }}
            >
              {n.message}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
