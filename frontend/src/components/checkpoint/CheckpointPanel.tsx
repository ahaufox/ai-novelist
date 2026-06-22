import { useState, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faHistory,
  faFile,
  faProjectDiagram,
  faSync,
  faCodeBranch,
} from '@fortawesome/free-solid-svg-icons';
import httpClient from '../../utils/httpClient';
import { setCheckpointPreview } from '../../store/editor.ts';
import GitGraph from './GitGraph';
import type {
  CheckpointPanelProps,
  ApiCheckpoint,
  ApiFileChange,
  ApiGitChange,
  ApiGitStatus,
  GraphData,
} from '@/types';

const CheckpointPanel = ({ onDiffDisplay }: CheckpointPanelProps) => {
  const dispatch = useDispatch();
  const [status, setStatus] = useState<ApiGitStatus | null>(null);
  const [checkpoints, setCheckpoints] = useState<ApiCheckpoint[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkpointChangesMap, setCheckpointChangesMap] = useState<Record<string, any>>({});
  const [restoring, setRestoring] = useState(false);

  // ─── 分支图状态 ──────────────────────────────────────
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);
  /** 在图上选中节点后显示的变更文件列表 */
  const [selectedNodeChanges, setSelectedNodeChanges] = useState<ApiFileChange[]>([]);
  const [selectedNodeChangesMap, setSelectedNodeChangesMap] = useState<Record<string, any>>({});
  const [selectedNodeSha, setSelectedNodeSha] = useState<string | null>(null);
  const [selectedNodeLoading, setSelectedNodeLoading] = useState(false);

  // 获取Git状态
  useEffect(() => {
    fetchStatus();
  }, []);

  // 获取所有存档点
  useEffect(() => {
    fetchCheckpoints();
  }, []);

  // 初始加载分支图
  useEffect(() => {
    fetchGraph();
  }, []);

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
      console.error('获取分支图失败:', error);
    } finally {
      setGraphLoading(false);
    }
  };

  const handleSaveCheckpoint = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const response = await httpClient.post('/api/checkpoints/save', {
        message: message || undefined,
      });

      if (response.success) {
        setMessage('');
        await fetchStatus();
        await fetchCheckpoints();
        await fetchGraph();
      }
    } catch (error) {
      console.error('保存存档点失败:', error);
    } finally {
      setLoading(false);
    }
  };

  /** 点击分支图节点时加载变更详情 */
  const handleGraphNodeClick = async (sha: string) => {
    if (selectedNodeSha === sha) {
      setSelectedNodeSha(null);
      setSelectedNodeChanges([]);
      setSelectedNodeChangesMap({});
      return;
    }
    setSelectedNodeSha(sha);
    setSelectedNodeChanges([]);
    setSelectedNodeChangesMap({});
    setSelectedNodeLoading(true);
    try {
      const response = await httpClient.get(`/api/checkpoints/diff/${sha}`);
      if (response.success) {
        if (response.is_initial_commit) {
          setSelectedNodeChanges([
            { path: '<初始提交>', change_type: 'INIT' } as any,
          ]);
          setSelectedNodeChangesMap({});
        } else {
          setSelectedNodeChanges(response.changes || []);
          const changesMap: Record<string, any> = {};
          (response.changes || []).forEach((change: any) => {
            changesMap[change.path] = change;
          });
          setSelectedNodeChangesMap(changesMap);
        }
      }
    } catch (error) {
      console.error('获取节点差异失败:', error);
    } finally {
      setSelectedNodeLoading(false);
    }
  };

  /** 图上回档 */
  const handleGraphCheckout = async (sha: string) => {
    setRestoring(true);
    try {
      const response = await httpClient.post('/api/checkpoints/checkout', {
        commit_hash: sha,
      });
      if (response.success) {
        await fetchStatus();
        await fetchCheckpoints();
        await fetchGraph();
        setSelectedNodeSha(null);
        setSelectedNodeChanges([]);
        setSelectedNodeChangesMap({});
      }
    } catch (error) {
      console.error('回档失败:', error);
    } finally {
      setRestoring(false);
    }
  };

  const handleShowFileDiff = async (filePath: string, commitHash?: string) => {
    try {
      if (commitHash) {
        const change = selectedNodeSha
          ? selectedNodeChangesMap[filePath]
          : checkpointChangesMap[filePath];
        if (change) {
          const originalContent = change.old_content || '';
          const modifiedContent = change.new_content || '';

          dispatch(
            setCheckpointPreview({
              id: filePath,
              checkpointContent: originalContent,
              currentContent: modifiedContent,
            })
          );
        } else {
          console.warn('未找到文件的变更信息:', filePath);
        }
      } else {
        const response = await httpClient.get(
          `/api/checkpoints/working-diff/${filePath}`
        );
        if (response.success) {
          dispatch(
            setCheckpointPreview({
              id: filePath,
              checkpointContent: response.old_content || '',
              currentContent: response.new_content || '',
            })
          );
        } else {
          console.warn('获取工作区差异失败:', response.message);
        }
      }
    } catch (error) {
      console.error('获取文件差异失败:', error);
    }
  };

  const getChangeTypeIcon = (change: ApiFileChange | ApiGitChange) => {
    if (change.change_type === 'A')
      return <FontAwesomeIcon icon={faFile} className="text-theme-green text-xs" />;
    if (change.change_type === 'D')
      return <FontAwesomeIcon icon={faFile} className="text-theme-red text-xs" />;
    if (change.change_type === 'M')
      return <FontAwesomeIcon icon={faFile} className="text-theme-yellow text-xs" />;
    return <FontAwesomeIcon icon={faFile} className="text-theme-gray4 text-xs" />;
  };

  // ─── 变更文件列表渲染 ────────────────────────────────
  const renderChangesList = (changes: ApiFileChange[], commitHash?: string) => {
    if (changes.length === 0) return null;
    return changes.map((change, index) => {
      const isInitialCommit = change.change_type === 'INIT';
      return (
        <div
          key={`change-${index}`}
          className={`flex items-center gap-2 px-2 py-1 hover:bg-theme-gray2 rounded transition-colors ${
            !isInitialCommit ? 'cursor-pointer' : ''
          }`}
          onClick={() =>
            !isInitialCommit && handleShowFileDiff(change.path, commitHash)
          }
        >
          {getChangeTypeIcon(change)}
          {isInitialCommit ? (
            <span className="text-xs text-theme-gray4 italic">{change.path}</span>
          ) : (
            <span className="text-xs text-theme-white truncate">{change.path}</span>
          )}
        </div>
      );
    });
  };

  return (
    <div className="w-full h-full bg-theme-black overflow-hidden">
      {/* ─── 上半部分：保存存档点 ─────────────────────────── */}
      <div className="h-[40%] flex flex-col p-1 border-b border-theme-gray3 overflow-hidden">
        <div className="flex items-center gap-2 mb-2">
          <h2 className="text-sm font-semibold text-theme-white">当前更改</h2>
        </div>
        <div className="flex flex-col gap-2">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="保存消息"
            className="w-full bg-theme-gray2 border border-theme-gray3 text-sm px-2 py-1 rounded"
            disabled={loading}
          />
          <button
            onClick={handleSaveCheckpoint}
            disabled={loading}
            className="w-full bg-theme-green text-black rounded text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors py-1"
          >
            {loading ? '保存中...' : '保存'}
          </button>
        </div>
        {/* 更改文件列表 */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="pb-1 border-b border-theme-gray3 flex items-center gap-2">
            <FontAwesomeIcon icon={faHistory} className="text-theme-green" />
            <span className="text-sm text-theme-white font-semibold">当前更改</span>
          </div>

          {status && (
            <div className="flex-1 overflow-y-auto">
              {(() => {
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
                    {getChangeTypeIcon(change)}
                    <span className="text-xs text-theme-white truncate">
                      {change.path}
                    </span>
                  </div>
                ));
              })()}
            </div>
          )}
        </div>
      </div>

      {/* ─── 下半部分：分支图 ─────────────────────────────── */}
      <div className="h-[60%] flex flex-col overflow-hidden">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-1 pb-1 border-b border-theme-gray3">
          <div className="flex items-center gap-2">
            <FontAwesomeIcon icon={faProjectDiagram} className="text-theme-green" />
            <h3 className="text-sm font-semibold text-theme-white">分支图</h3>
          </div>
          <button
            onClick={fetchGraph}
            disabled={graphLoading}
            className="p-1 rounded text-xs text-theme-gray4 hover:text-theme-white transition-colors"
            title="刷新分支图"
          >
            <FontAwesomeIcon icon={faSync} spin={graphLoading} />
          </button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* 分支图主体 */}
          <div className="flex-1 overflow-auto">
            {graphLoading ? (
              <div className="flex items-center justify-center h-full text-theme-gray4 text-xs">
                加载分支图中...
              </div>
            ) : !graphData || graphData.nodes.length === 0 ? (
              <div className="flex items-center justify-center h-full text-theme-gray4 text-xs">
                暂无分支图数据
              </div>
            ) : (
              <div className="h-full">
                <GitGraph
                  data={graphData}
                  onCheckout={handleGraphCheckout}
                  checkoutLoading={restoring}
                  onNodeClick={(node) => handleGraphNodeClick(node.sha)}
                />
              </div>
            )}
          </div>

          {/* 选中节点的变更文件详情侧栏 */}
          {selectedNodeSha && (
            <div className="w-56 flex-shrink-0 border-l border-theme-gray3 overflow-y-auto p-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-theme-green">
                  <FontAwesomeIcon icon={faCodeBranch} className="mr-1" />
                  {selectedNodeSha.slice(0, 8)}
                </span>
                <button
                  onClick={() => {
                    setSelectedNodeSha(null);
                    setSelectedNodeChanges([]);
                    setSelectedNodeChangesMap({});
                  }}
                  className="text-xs text-theme-gray4 hover:text-theme-white"
                >
                  ✕
                </button>
              </div>
              {selectedNodeLoading ? (
                <div className="text-xs text-theme-gray4">加载中...</div>
              ) : (
                renderChangesList(selectedNodeChanges, selectedNodeSha)
              )}
            </div>
          )}
        </div>
      </div>

    </div>
  );
};

export default CheckpointPanel;
