import { useState, useEffect, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faHistory,
  faFile,
  faSync,
  faCodeBranch,
  faRotateLeft,
  faCheck,
  faWarning,
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

  // ─── 时间线状态 ──────────────────────────────────
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);

  // ─── 选中存档点 ──────────────────────────────────
  const [selectedSha, setSelectedSha] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreMsg, setRestoreMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // 获取 Git 状态
  useEffect(() => { fetchStatus(); }, []);
  // 获取所有存档点
  useEffect(() => { fetchCheckpoints(); }, []);
  // 初始加载时间线
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

  // ─── 保存存档点 ──────────────────────────────────
  const handleSaveCheckpoint = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const response = await httpClient.post('/api/checkpoints/save', {
        message: message || undefined,
      });
      if (response.success) {
        setMessage('');
        setRestoreMsg(null);
        await Promise.all([fetchStatus(), fetchCheckpoints(), fetchGraph()]);
      }
    } catch (error) {
      console.error('保存存档点失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // ─── 点击时间线节点 ──────────────────────────────
  const handleNodeClick = useCallback((node: GraphNode) => {
    setSelectedSha((prev) => (prev === node.sha ? null : node.sha));
    setRestoreMsg(null);
  }, []);

  // ─── 回档 ────────────────────────────────────────
  const handleCheckout = async () => {
    if (!selectedSha) return;
    setRestoring(true);
    setRestoreMsg(null);
    try {
      const response = await httpClient.post('/api/checkpoints/checkout', {
        commit_hash: selectedSha,
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

  // ─── 当前选中存档点的 message ────────────────────
  const selectedCheckpoint = selectedSha
    ? checkpoints.find((c) => c.commit_hash === selectedSha)
    : null;

  // ─── 变更文件列表渲染 ────────────────────────────
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

        {/* 更改文件列表 */}
        <div className="flex-1 overflow-y-auto min-h-0">{renderChangesList()}</div>
      </div>

      {/* ─── 下半部分：存档点时间线 ─────────────────── */}
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

        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* ── 左侧：时间线 ──────────────────────────── */}
          <div className="w-[180px] flex-shrink-0 overflow-auto border-r border-theme-gray3">
            {graphLoading ? (
              <div className="flex items-center justify-center h-full text-theme-gray4 text-xs">
                加载中...
              </div>
            ) : !graphData || graphData.nodes.length === 0 ? (
              <div className="flex items-center justify-center h-full text-theme-gray4 text-xs">
                暂无存档点
              </div>
            ) : (
              <GitGraph
                data={graphData}
                selectedSha={selectedSha}
                onNodeClick={handleNodeClick}
                onCheckout={handleCheckout}
                checkoutLoading={restoring}
              />
            )}
          </div>

          {/* ── 右侧：存档点信息 ──────────────────────── */}
          <div className="flex-1 flex flex-col overflow-hidden min-h-0">
            {selectedSha && selectedCheckpoint ? (
              <div className="flex-1 flex flex-col p-2 overflow-hidden min-h-0">
                {/* 选中存档点的基本信息 */}
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-mono text-xs text-theme-green font-semibold">
                    {selectedCheckpoint.short_hash}
                  </span>
                  <span
                    className="text-xs text-theme-white truncate flex-1"
                    title={selectedCheckpoint.message}
                  >
                    {selectedCheckpoint.message}
                  </span>
                </div>

                {/* 回档按钮 */}
                <button
                  onClick={handleCheckout}
                  disabled={restoring}
                  className="w-full bg-theme-red/20 border border-theme-red/40 text-theme-red text-xs rounded px-2 py-1.5 mb-2 hover:bg-theme-red/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1"
                >
                  <FontAwesomeIcon icon={faRotateLeft} />
                  {restoring ? '回档中...' : '回档到该版本'}
                </button>

                {/* 回档结果提示 */}
                {restoreMsg && (
                  <div
                    className={`text-xs px-2 py-1 rounded mb-2 flex items-center gap-1 ${
                      restoreMsg.ok
                        ? 'bg-theme-green/10 text-theme-green border border-theme-green/30'
                        : 'bg-theme-red/10 text-theme-red border border-theme-red/30'
                    }`}
                  >
                    <FontAwesomeIcon icon={restoreMsg.ok ? faCheck : faWarning} />
                    <span className="truncate">{restoreMsg.text}</span>
                  </div>
                )}

                {/* 空状态 */}
                <div className="flex-1 flex items-center justify-center text-theme-gray4 text-xs">
                  选择存档点查看详情
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-theme-gray4 text-xs">
                {checkpoints.length === 0
                  ? '暂无存档点，请先保存'
                  : '点击左侧时间线上的存档点查看详情'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CheckpointPanel;
