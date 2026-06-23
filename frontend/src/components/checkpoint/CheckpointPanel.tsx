import { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faHistory,
  faFile,
  faSync,
  faCodeBranch,
  faRotateLeft,
  faCheck,
  faWarning,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import httpClient from '../../utils/httpClient';
import GitGraph from './GitGraph';
import type {
  CheckpointPanelProps,
  ApiCheckpoint,
  ApiGitChange,
  ApiGitStatus,
  GraphData,
  GraphNode,
} from '@/types';

const CheckpointPanel = ({ onDiffDisplay }: CheckpointPanelProps) => {
  const [status, setStatus] = useState<ApiGitStatus | null>(null);
  const [checkpoints, setCheckpoints] = useState<ApiCheckpoint[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  // ─── 时间线 ────────────────────────────────────────
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);

  // ─── 弹窗状态 ──────────────────────────────────────
  const [modalNode, setModalNode] = useState<GraphNode | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreMsg, setRestoreMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => { fetchStatus(); }, []);
  useEffect(() => { fetchCheckpoints(); }, []);
  useEffect(() => { fetchGraph(); }, []);

  const fetchStatus = async () => {
    try {
      const response = await httpClient.get('/api/checkpoints/status');
      setStatus(response);
    } catch (error) {
      console.error('获取状态失败:', error);
    }
  };

  const fetchCheckpoints = async () => {
    try {
      const response = await httpClient.get('/api/checkpoints/list');
      setCheckpoints(response.checkpoints || []);
    } catch (error) {
      console.error('获取存档点列表失败:', error);
    }
  };

  const fetchGraph = async () => {
    setGraphLoading(true);
    try {
      const response = await httpClient.get('/api/checkpoints/graph?count=200');
      if (response.success && response.graph) {
        setGraphData(response.graph);
      }
    } catch (error) {
      console.error('获取时间线失败:', error);
    } finally {
      setGraphLoading(false);
    }
  };

  // ─── 保存存档点 ────────────────────────────────────
  const handleSaveCheckpoint = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const response = await httpClient.post('/api/checkpoints/save', {
        message: message || undefined,
      });
      if (response.success) {
        setMessage('');
        await Promise.all([fetchStatus(), fetchCheckpoints(), fetchGraph()]);
      }
    } catch (error) {
      console.error('保存存档点失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // ─── 点击节点 → 弹出回档确认 ──────────────────────
  const handleNodeClick = (node: GraphNode) => {
    setModalNode(node);
    setRestoreMsg(null);
  };

  const closeModal = () => {
    setModalNode(null);
    setRestoreMsg(null);
  };

  // ─── 回档 ──────────────────────────────────────────
  const handleCheckout = async () => {
    if (!modalNode) return;
    setRestoring(true);
    setRestoreMsg(null);
    try {
      const response = await httpClient.post('/api/checkpoints/checkout', {
        commit_hash: modalNode.sha,
      });
      if (response.success) {
        setRestoreMsg({ ok: true, text: '回档成功' });
        await Promise.all([fetchStatus(), fetchCheckpoints(), fetchGraph()]);
      } else {
        setRestoreMsg({ ok: false, text: response.message || '回档失败' });
      }
    } catch (error: any) {
      const detail = error?.detail || error?.message || '网络错误';
      setRestoreMsg({ ok: false, text: detail });
    } finally {
      setRestoring(false);
    }
  };

  // ─── 变更文件列表 ──────────────────────────────────
  const renderChangesList = () => {
    if (!status) return null;
    const untrackedChanges: ApiGitChange[] = (
      status.untracked_files || []
    ).map((file: string) => ({
      path: file,
      change_type: 'A' as const,
    }));
    const allChanges = [
      ...(status.changes || []),
      ...untrackedChanges,
    ].sort((a, b) => a.path.localeCompare(b.path));

    if (allChanges.length === 0) {
      return <p className="text-xs text-theme-gray4">没有更改</p>;
    }

    return allChanges.map((change, index) => (
      <div
        key={`change-${index}`}
        className="flex items-center gap-2 px-2 py-1 hover:bg-theme-gray2 rounded cursor-pointer transition-colors"
      >
        <FontAwesomeIcon
          icon={faFile}
          className={
            change.change_type === 'A'
              ? 'text-theme-green text-xs'
              : change.change_type === 'D'
                ? 'text-theme-red text-xs'
                : 'text-theme-yellow text-xs'
          }
        />
        <span className="text-xs text-theme-white truncate">{change.path}</span>
      </div>
    ));
  };

  return (
    <div className="w-full h-full bg-theme-black overflow-hidden flex flex-col">
      {/* ─── 上半部分：保存存档点 ─────────────────────── */}
      <div className="h-[45%] flex flex-col p-2 border-b border-theme-gray3 overflow-hidden">
        <div className="flex items-center gap-2 mb-2">
          <FontAwesomeIcon icon={faHistory} className="text-theme-green text-xs" />
          <h2 className="text-sm font-semibold text-theme-white">当前更改</h2>
        </div>

        <div className="flex gap-2 mb-2">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="存档描述（可选）"
            className="flex-1 bg-theme-gray2 border border-theme-gray3 text-sm px-2 py-1 rounded outline-none text-theme-white"
            disabled={loading}
          />
          <button
            onClick={handleSaveCheckpoint}
            disabled={loading}
            className="bg-theme-green text-black rounded text-sm font-semibold px-3 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? '保存中...' : '保存'}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">{renderChangesList()}</div>
      </div>

      {/* ─── 下半部分：存档点时间线 ───────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        <div className="flex items-center justify-between px-2 py-1 border-b border-theme-gray3">
          <div className="flex items-center gap-2">
            <FontAwesomeIcon icon={faCodeBranch} className="text-theme-green text-xs" />
            <h3 className="text-sm font-semibold text-theme-white">存档点</h3>
          </div>
          <button
            onClick={fetchGraph}
            disabled={graphLoading}
            className="p-1 rounded text-xs text-theme-gray4 hover:text-theme-white transition-colors"
            title="刷新"
          >
            <FontAwesomeIcon icon={faSync} spin={graphLoading} />
          </button>
        </div>

        <div className="flex-1 overflow-auto min-h-0">
          {graphLoading ? (
            <div className="flex items-center justify-center h-full text-theme-gray4 text-xs">
              加载中...
            </div>
          ) : !graphData || graphData.nodes.length === 0 ? (
            <div className="flex items-center justify-center h-full text-theme-gray4 text-xs">
              暂无存档点，请先保存
            </div>
          ) : (
            <GitGraph
              data={graphData}
              onNodeClick={handleNodeClick}
            />
          )}
        </div>
      </div>

      {/* ─── 回档确认弹窗 ────────────────────────────── */}
      {modalNode && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={closeModal}
        >
          <div
            className="bg-[#1a1a2e] border border-theme-gray3 rounded-lg p-4 min-w-[300px] max-w-[420px] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 关闭按钮 */}
            <div className="flex justify-end mb-1">
              <button
                onClick={closeModal}
                className="text-theme-gray4 hover:text-theme-white transition-colors"
              >
                <FontAwesomeIcon icon={faXmark} />
              </button>
            </div>

            {/* 哈希值 */}
            <div className="font-mono text-theme-green text-xs mb-2">
              {modalNode.sha.slice(0, 8)}
            </div>

            {/* 完整 message */}
            <div className="text-sm text-theme-white leading-relaxed mb-3 break-words">
              {modalNode.message}
            </div>

            {/* 作者 & 日期 */}
            <div className="text-xs text-theme-gray4 mb-4">
              {modalNode.author && <div>{modalNode.author}</div>}
              {modalNode.date && (
                <div>{new Date(modalNode.date).toLocaleString('zh-CN')}</div>
              )}
            </div>

            {/* 回档结果提示 */}
            {restoreMsg && (
              <div
                className={`text-xs px-2 py-1 rounded mb-3 flex items-center gap-1 ${
                  restoreMsg.ok
                    ? 'bg-theme-green/10 text-theme-green border border-theme-green/30'
                    : 'bg-theme-red/10 text-theme-red border border-theme-red/30'
                }`}
              >
                <FontAwesomeIcon icon={restoreMsg.ok ? faCheck : faWarning} />
                <span>{restoreMsg.text}</span>
              </div>
            )}

            {/* 回档按钮 */}
            <button
              onClick={handleCheckout}
              disabled={restoring}
              className="w-full bg-theme-red/20 border border-theme-red/40 text-theme-red text-sm rounded px-3 py-2 hover:bg-theme-red/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              <FontAwesomeIcon icon={faRotateLeft} />
              {restoring ? '回档中...' : '回档到该版本'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CheckpointPanel;
