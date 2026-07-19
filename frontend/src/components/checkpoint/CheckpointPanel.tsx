import { useState, useEffect } from 'react';
import { useDispatch } from 'react-redux';
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
import { setCheckpointPreview } from '../../store/editor.ts';
import GitGraph from './GitGraph';
import type { FileChangeInfo } from './GitGraph';
import type {
  CheckpointPanelProps,
  ApiCheckpoint,
  ApiGitChange,
  ApiGitStatus,
  GraphData,
  GraphNode,
} from '@/types';

const CheckpointPanel = ({ onDiffDisplay }: CheckpointPanelProps) => {
  const dispatch = useDispatch();
  const [status, setStatus] = useState<ApiGitStatus | null>(null);
  const [checkpoints, setCheckpoints] = useState<ApiCheckpoint[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  // ─── 时间线 ────────────────────────────────────────
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);

  // ─── 展开状态 ──────────────────────────────────────
  const [expandedSha, setExpandedSha] = useState<string | null>(null);
  const [expandedChanges, setExpandedChanges] = useState<FileChangeInfo[]>([]);
  const [expandedLoading, setExpandedLoading] = useState(false);

  // ─── 回档弹窗 ──────────────────────────────────────
  const [rollbackSha, setRollbackSha] = useState<string | null>(null);
  const [rollbackNode, setRollbackNode] = useState<GraphNode | null>(null);
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

  // ─── 左键节点：展开/折叠 ──────────────────────────
  const handleNodeClick = async (node: GraphNode) => {
    // 如果点击的是已展开的节点，折叠
    if (expandedSha === node.sha) {
      setExpandedSha(null);
      setExpandedChanges([]);
      return;
    }

    // 展开：获取差异
    setExpandedSha(node.sha);
    setExpandedLoading(true);
    setExpandedChanges([]);

    try {
      const response = await httpClient.get(`/api/checkpoints/diff/${node.sha}`);
      if (response.success) {
        if (response.is_initial_commit) {
          setExpandedChanges([]);
        } else {
          setExpandedChanges(response.changes || []);
        }
      } else {
        setExpandedChanges([]);
      }
    } catch (error) {
      console.error('获取差异失败:', error);
      setExpandedChanges([]);
    } finally {
      setExpandedLoading(false);
    }
  };

  // ─── 右键菜单 → 回档 ──────────────────────────────
  const handleRollback = (sha: string) => {
    // 获取该节点的信息用于弹窗
    const node = graphData?.nodes.find((n) => n.sha === sha) || null;
    setRollbackSha(sha);
    setRollbackNode(node);
    setRestoreMsg(null);
  };

  const closeRollbackModal = () => {
    setRollbackSha(null);
    setRollbackNode(null);
    setRestoreMsg(null);
  };

  const doRollback = async () => {
    if (!rollbackSha) return;
    setRestoring(true);
    setRestoreMsg(null);
    try {
      const response = await httpClient.post('/api/checkpoints/checkout', {
        commit_hash: rollbackSha,
      });
      if (response.success) {
        setRestoreMsg({ ok: true, text: '回档成功' });
        // 关闭弹窗并刷新
        setTimeout(() => {
          closeRollbackModal();
          Promise.all([fetchStatus(), fetchCheckpoints(), fetchGraph()]);
        }, 800);
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

  // ─── 点击变更文件 → 差异对比 ──────────────────────
  const handleFileClick = (change: FileChangeInfo, commitHash: string) => {
    const originalContent = change.old_content || '';
    const modifiedContent = change.new_content || '';

    if (onDiffDisplay) {
      onDiffDisplay(originalContent, modifiedContent);
    }

    // 同时 dispatch 到 Redux，给 diff editor 用
    dispatch(
      setCheckpointPreview({
        id: `${commitHash}:${change.path}`,
        checkpointContent: originalContent,
        currentContent: modifiedContent,
      })
    );
  };

  // ─── 当前更改 → 打开差异对比（允许修改） ──────────
  const handleShowFileDiff = async (filePath: string) => {
    try {
      const response = await httpClient.get(`/api/checkpoints/working-diff/${filePath}`);
      if (response.success) {
        dispatch(
          setCheckpointPreview({
            id: filePath,
            checkpointContent: response.old_content || '',
            currentContent: response.new_content || '',
          })
        );
      }
    } catch (error) {
      console.error('获取文件差异失败:', error);
    }
  };

  // ─── 变更文件列表渲染 ──────────────────────────────
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
        onClick={() => handleShowFileDiff(change.path)}
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

        <div className="flex flex-col gap-1.5 mb-2">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="存档描述"
            className="w-full bg-theme-gray2 border border-theme-gray3 text-sm px-2 py-1 rounded outline-none text-theme-white"
            disabled={loading}
          />
          <button
            onClick={handleSaveCheckpoint}
            disabled={loading}
            className="w-full bg-theme-green text-black rounded text-sm font-semibold py-1 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
              onRollback={handleRollback}
              expandedSha={expandedSha}
              expandedChanges={expandedChanges}
              expandedLoading={expandedLoading}
              onFileClick={handleFileClick}
            />
          )}
        </div>
      </div>

      {/* ─── 回档确认弹窗 ────────────────────────────── */}
      {rollbackNode && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={closeRollbackModal}
        >
          <div
            className="bg-[#1a1a2e] border border-theme-gray3 rounded-lg p-4 min-w-[300px] max-w-[420px] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 关闭 */}
            <div className="flex justify-end mb-1">
              <button
                onClick={closeRollbackModal}
                className="text-theme-gray4 hover:text-theme-white transition-colors text-sm"
              >
                ✕
              </button>
            </div>

            {/* 哈希 */}
            <div className="font-mono text-theme-green text-xs mb-2">
              {rollbackNode.sha.slice(0, 8)}
            </div>

            {/* message */}
            <div className="text-sm text-theme-white leading-relaxed mb-3 break-words">
              {rollbackNode.message}
            </div>

            {/* 作者 & 日期 */}
            <div className="text-xs text-theme-gray4 mb-4">
              {rollbackNode.author && <div>{rollbackNode.author}</div>}
              {rollbackNode.date && (
                <div>{new Date(rollbackNode.date).toLocaleString('zh-CN')}</div>
              )}
            </div>

            {/* 结果提示 */}
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
              onClick={doRollback}
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
