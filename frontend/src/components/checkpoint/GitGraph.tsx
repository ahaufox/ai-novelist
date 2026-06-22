import { useState } from 'react';
import type { GraphData, GraphNode } from '@/types';

// ─── 布局常量 ────────────────────────────────────────
const ROW_H = 32;   // 每行高度
const LANE_W = 24;  // 每列宽度
const DOT_R = 5;    // 节点圆半径
const HEAD_R = 8;   // HEAD 特殊圆半径
const PAD_L = 16;   // 左侧留白
const PAD_T = 16;   // 顶部留白
const MSG_X = 320;  // commit message 起始 X

interface GitGraphProps {
  data: GraphData | null;
  /** 当前 HEAD 的 SHA（自定义仓库模式下，用于标记当前可执行仓库位置） */
  workingHead?: string;
  onCheckout?: (sha: string) => void;
  checkoutLoading?: boolean;
  /** 点击节点时触发，可用来显示详情 */
  onNodeClick?: (node: GraphNode) => void;
}

export default function GitGraph({
  data,
  workingHead,
  onCheckout,
  checkoutLoading,
  onNodeClick,
}: GitGraphProps) {
  const [tooltip, setTooltip] = useState<GraphNode | null>(null);

  if (!data || !data.nodes || data.nodes.length === 0) return null;

  const { rows, nodes, segments } = data;
  const svgH = PAD_T + rows * ROW_H + 40;

  const y = (row: number) => PAD_T + row * ROW_H;
  const x = (lane: number) => PAD_L + lane * LANE_W + LANE_W / 2;

  const workingNode = workingHead
    ? nodes.find((n) => n.sha === workingHead)
    : undefined;

  const handleNodeClick = (node: GraphNode) => {
    setTooltip((t) => (t?.sha === node.sha ? null : node));
    onNodeClick?.(node);
  };

  return (
    <div
      className="git-graph-container"
      style={{ position: 'relative', overflow: 'auto', height: '100%', width: '100%' }}
    >
      <svg
        width="100%"
        height={svgH}
        style={{ fontFamily: 'monospace', display: 'block', minWidth: MSG_X + 200 }}
      >
        {/* 1. 线段（竖线、fork、merge） */}
        {segments.map((seg, i) => {
          const sx = x(seg.from_lane);
          const sy = y(seg.row - 1);
          const ex = x(seg.to_lane);
          const ey = y(seg.row);
          return (
            <line
              key={`seg-${i}`}
              x1={sx}
              y1={sy}
              x2={ex}
              y2={ey}
              stroke={seg.color}
              strokeWidth={2}
              opacity={0.7}
            />
          );
        })}

        {/* 2. commit 圆点 + message */}
        {nodes.map((n) => {
          const cx = x(n.lane);
          const cy = y(n.row);
          const isHead = n.sha === workingHead;
          return (
            <g key={n.sha} style={{ cursor: 'pointer' }}>
              {/* HEAD 光环 */}
              {isHead && (
                <circle
                  cx={cx}
                  cy={cy}
                  r={HEAD_R + 3}
                  fill="none"
                  stroke="#4CAF50"
                  strokeWidth={2}
                  opacity={0.6}
                />
              )}
              <circle
                cx={cx}
                cy={cy}
                r={isHead ? HEAD_R : DOT_R}
                fill={n.color}
                stroke={isHead ? '#4CAF50' : '#fff'}
                strokeWidth={isHead ? 2.5 : 1.5}
                onClick={() => handleNodeClick(n)}
              />
              {/* HEAD 标签 */}
              {isHead && (
                <text
                  x={cx + HEAD_R + 6}
                  y={cy + 4}
                  fontSize={10}
                  fontWeight={600}
                  fill="#4CAF50"
                  dominantBaseline="middle"
                >
                  HEAD
                </text>
              )}
              {/* refs 标签 */}
              {n.refs &&
                n.refs.length > 0 &&
                !n.refs.some((r) => r.includes('HEAD')) && (
                  <text
                    x={cx + DOT_R + 6}
                    y={cy + 4}
                    fontSize={9}
                    fill={n.color}
                    dominantBaseline="middle"
                  >
                    {(n.refs[0] ?? '').replace('HEAD -> ', '').replace('origin/', '')}
                  </text>
                )}
              {/* commit message */}
              <text
                x={MSG_X}
                y={cy + 4}
                fontSize={12}
                fill="#ccc"
                dominantBaseline="middle"
              >
                {n.message.slice(0, 80)}
                {n.message.length > 80 ? '…' : ''}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Tooltip 弹窗 */}
      {tooltip && (
        <div
          className="git-graph-tooltip"
          style={{
            position: 'fixed',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            background: '#1a1a2e',
            border: '1px solid #333',
            borderRadius: 8,
            padding: 14,
            color: '#ddd',
            zIndex: 1000,
            minWidth: 300,
            boxShadow: '0 8px 24px rgba(0,0,0,.6)',
          }}
        >
          <div
            style={{
              color: '#4CAF50',
              fontWeight: 600,
              marginBottom: 6,
              cursor: 'pointer',
              textAlign: 'right',
            }}
            onClick={() => setTooltip(null)}
          >
            ✕
          </div>
          <div style={{ color: '#FFD700', fontFamily: 'monospace', fontSize: 13 }}>
            {tooltip.sha.slice(0, 8)}
          </div>
          <div style={{ margin: '6px 0', lineHeight: 1.5, fontSize: 13 }}>
            {tooltip.message}
          </div>
          {tooltip.refs && tooltip.refs.length > 0 && (
            <div style={{ color: '#4CAF50', fontSize: 11, marginBottom: 4 }}>
              分支: {tooltip.refs.join(', ')}
            </div>
          )}
          <div style={{ color: '#888', fontSize: 12 }}>{tooltip.author}</div>
          <div style={{ color: '#888', fontSize: 12 }}>
            {tooltip.date
              ? new Date(tooltip.date).toLocaleString('zh-CN')
              : ''}
          </div>

          {onCheckout && (
            <div
              style={{
                marginTop: 12,
                borderTop: '1px solid #333',
                paddingTop: 10,
              }}
            >
              <button
                className="btn warn"
                style={{ width: '100%', padding: '8px 0', fontSize: 13 }}
                disabled={checkoutLoading}
                onClick={(e) => {
                  e.stopPropagation();
                  onCheckout(tooltip.sha);
                  setTooltip(null);
                }}
              >
                {checkoutLoading ? '回档中...' : '回档到该版本'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
