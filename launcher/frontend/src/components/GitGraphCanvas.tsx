import { useState } from 'react';
import { gitman } from '../../wailsjs/go/models';

const ROW_H = 32;
const LANE_W = 24;
const DOT_R = 5;
const PAD_L = 16;
const PAD_T = 16;
const MSG_X = 320;

interface Props {
  data: gitman.GraphOutput | null;
}

export default function GitGraphCanvas({ data }: Props) {
  const [tooltip, setTooltip] = useState<gitman.NodeData | null>(null);

  if (!data || data.nodes.length === 0) return null;

  const { max_lane, rows, nodes, segments } = data;

  const svgW = PAD_L + max_lane * LANE_W + 400;
  const svgH = PAD_T + rows * ROW_H + 40;

  const y = (row: number) => PAD_T + row * ROW_H;
  const x = (lane: number) => PAD_L + lane * LANE_W + LANE_W / 2;

  return (
    <div className="git-graph-canvas-container" style={{ position: 'relative', overflow: 'auto', height: '100%' }}>
      <svg width={svgW} height={svgH} style={{ fontFamily: 'monospace', display: 'block' }}>
        {/* 1. 线段（竖线、fork、merge） */}
        {segments.map((seg, i) => {
          const sx = x(seg.from_lane);
          const sy = y(seg.row - 1);
          const ex = x(seg.to_lane);
          const ey = y(seg.row);
          return (
            <line
              key={`seg-${i}`}
              x1={sx} y1={sy} x2={ex} y2={ey}
              stroke={seg.color} strokeWidth={2} opacity={0.7}
            />
          );
        })}

        {/* 2. 圆点 + message */}
        {nodes.map((n) => {
          const cx = x(n.lane);
          const cy = y(n.row);
          return (
            <g key={n.sha}>
              <circle
                cx={cx} cy={cy} r={DOT_R}
                fill={n.color} stroke="#fff" strokeWidth={1.5}
                style={{ cursor: 'pointer' }}
                onClick={() => setTooltip(t => t?.sha === n.sha ? null : n)}
              />
              <text x={MSG_X} y={cy + 4} fontSize={12} fill="#ccc" dominantBaseline="middle">
                {n.message.slice(0, 80)}{n.message.length > 80 ? '…' : ''}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div className="git-graph-tooltip"
          style={{
            position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
            background: '#1a1a2e', border: '1px solid #333', borderRadius: 8,
            padding: 14, color: '#ddd', zIndex: 1000, minWidth: 260,
            boxShadow: '0 8px 24px rgba(0,0,0,.6)',
          }}
          onClick={() => setTooltip(null)}
        >
          <div style={{ color: '#4CAF50', fontWeight: 600, marginBottom: 6, cursor: 'pointer', textAlign: 'right' }}>✕</div>
          <div style={{ color: '#FFD700' }}>{tooltip.sha.slice(0, 8)}</div>
          <div style={{ margin: '6px 0' }}>{tooltip.message}</div>
          <div style={{ color: '#888', fontSize: 12 }}>{tooltip.author}</div>
          <div style={{ color: '#888', fontSize: 12 }}>
            {new Date(tooltip.date).toLocaleString('zh-CN')}
          </div>
        </div>
      )}
    </div>
  );
}
