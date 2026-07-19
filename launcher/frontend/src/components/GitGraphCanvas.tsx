import { useState } from 'react';
import { gitman } from '../../wailsjs/go/models';

const ROW_H = 32;
const LANE_W = 24;
const DOT_R = 5;
const HEAD_R = 8;
const PAD_L = 16;
const PAD_T = 16;
const MSG_X = 280;
const BADGE_GAP = 4;    // ref badge 间距
const BADGE_H = 16;     // ref badge 高度

interface Props {
  data: gitman.DualGraphOutput | null;
  onCheckout?: (sha: string) => void;
  checkoutLoading?: boolean;
}

/** 从 refs 列表中提取可显示的分支名（过滤掉 HEAD、origin/HEAD） */
function getBranchRefs(refs: string[]): string[] {
  const out: string[] = [];
  for (const r of refs) {
    const name = r.replace(/^HEAD -> /, '').trim();
    if (name && name !== 'HEAD' && name !== 'origin/HEAD') {
      out.push(name);
    }
  }
  return out;
}

export default function GitGraphCanvas({ data, onCheckout, checkoutLoading }: Props) {
  const [tooltip, setTooltip] = useState<gitman.NodeData | null>(null);

  if (!data || !data.graph || data.graph.nodes.length === 0) return null;

  const { graph, working_head } = data;
  // 节点列表、线段列表、总行数、原始 ASCII
  const { rows, nodes, segments, raw_graph } = graph;

  // 打印原始 ASCII 分支图到控制台
  console.log('=== git log --graph 原始 ASCII 输出 ===');
  console.log(raw_graph);

  console.log('=== segments为 ===')
  console.log(segments)

  console.log("=== nodes ===")
  console.log(nodes)

  const svgH = PAD_T + rows * ROW_H + 40;

  const y = (row: number) => PAD_T + row * ROW_H;
  const x = (lane: number) => PAD_L + lane * LANE_W + LANE_W / 2;

  return (
    <div className="git-graph-canvas-container" style={{ position: 'relative', overflow: 'auto', height: '100%' }}>
      <svg width="100%" height={svgH} style={{ fontFamily: 'monospace', display: 'block' }}>
        {/* 1. 线段（竖线、分叉、合并），lane "车道"。当 git 历史出现分叉时，不同的分支会占据不同的垂直车道（lane=0、lane=1...），每条车道宽 24px */}
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

        {/* 2. 圆点 + message + ref 标签 
          * row, lane, sha, message, color, refs
          * 单个 commit 的位置/内容/颜色/分支引用
          */}
        {nodes.map((n) => {
          const cx = x(n.lane);
          const cy = y(n.row);
          const isHead = n.sha === working_head;
          const branchRefs = getBranchRefs(n.refs || []);
          return (
            <g key={n.sha}>
              {/* 如果是 working HEAD，画一个光环 */}
              {isHead && (
                <circle
                  cx={cx} cy={cy} r={HEAD_R + 3}
                  fill="none" stroke="#4CAF50" strokeWidth={2}
                  opacity={0.6}
                />
              )}
              <circle
                cx={cx} cy={cy} r={isHead ? HEAD_R : DOT_R}
                fill={n.color}
                stroke={isHead ? '#4CAF50' : '#fff'}
                strokeWidth={isHead ? 2.5 : 1.5}
                style={{ cursor: 'pointer' }}
                onClick={() => setTooltip(t => t?.sha === n.sha ? null : n)}
              />
              {/* HEAD 标签 */}
              {isHead && (
                <text
                  x={cx + HEAD_R + 6} y={cy + 4}
                  fontSize={10} fontWeight={600}
                  fill="#4CAF50" dominantBaseline="middle"
                >
                  HEAD
                </text>
              )}
              {/* 分支名标签（ref badge） */}
              {branchRefs.map((ref, idx) => {
                const badgeX = MSG_X - 8;
                const badgeY = cy - BADGE_H - BADGE_GAP - idx * (BADGE_H + BADGE_GAP);
                return (
                  <g key={ref}>
                    <rect
                      x={badgeX} y={badgeY}
                      width={8 + ref.length * 7.5} height={BADGE_H}
                      rx={3} ry={3}
                      fill={n.color} fillOpacity={0.25}
                      stroke={n.color} strokeWidth={1}
                    />
                    <text
                      x={badgeX + 4} y={badgeY + BADGE_H - 4}
                      fontSize={10} fontWeight={500}
                      fill={n.color} dominantBaseline="middle"
                    >
                      {ref}
                    </text>
                  </g>
                );
              })}
              {/* message */}
              <text x={MSG_X} y={cy + 4} fontSize={12} fill="#ccc" dominantBaseline="middle">
                {n.message.slice(0, 80)}{n.message.length > 80 ? '…' : ''}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Tooltip + 回档按钮 */}
      {tooltip && (
        <div className="git-graph-tooltip"
          style={{
            position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
            background: '#1a1a2e', border: '1px solid #333', borderRadius: 8,
            padding: 14, color: '#ddd', zIndex: 1000, minWidth: 280,
            boxShadow: '0 8px 24px rgba(0,0,0,.6)',
          }}
        >
          <div
            style={{ color: '#4CAF50', fontWeight: 600, marginBottom: 6, cursor: 'pointer', textAlign: 'right' }}
            onClick={() => setTooltip(null)}
          >
            ✕
          </div>
          <div style={{ color: '#FFD700', fontFamily: 'monospace' }}>{tooltip.sha.slice(0, 8)}</div>
          {/* tooltip 内也显示分支名 */}
          {tooltip.refs && tooltip.refs.length > 0 && (
            <div style={{ marginTop: 4, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {getBranchRefs(tooltip.refs).map(ref => (
                <span key={ref} style={{
                  display: 'inline-block', padding: '1px 6px', borderRadius: 3,
                  fontSize: 11, fontWeight: 500, color: '#000',
                  background: tooltip.color || '#888',
                }}>
                  {ref}
                </span>
              ))}
            </div>
          )}
          <div style={{ margin: '6px 0', lineHeight: 1.5 }}>{tooltip.message}</div>
          <div style={{ color: '#888', fontSize: 12 }}>{tooltip.author}</div>
          <div style={{ color: '#888', fontSize: 12 }}>
            {new Date(tooltip.date).toLocaleString('zh-CN')}
          </div>

          {onCheckout && (
            <div style={{ marginTop: 12, borderTop: '1px solid #333', paddingTop: 10 }}>
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
