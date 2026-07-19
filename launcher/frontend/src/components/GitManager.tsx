import { useEffect, useState, useCallback } from 'react';
import {
  GitDualGraph,
  GitDualCheckout,
} from '../../wailsjs/go/main/App';
import { gitman } from '../../wailsjs/go/models';
import GitGraphCanvas from './GitGraphCanvas';

export default function GitManager() {
  const [graphData, setGraphData] = useState<gitman.DualGraphOutput | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  const loadGraph = useCallback(async () => {
    setGraphLoading(true);
    try {
      const data = await GitDualGraph(500);
      setGraphData(data || null);
    } catch (err: any) {
      console.error('[GitManager] 加载分支图失败:', err);
      alert('加载分支图失败: ' + (err?.message || err));
    } finally {
      setGraphLoading(false);
    }
  }, []);

  useEffect(() => {
    loadGraph();
  }, [loadGraph]);

  const handleCheckout = async (sha: string) => {
    setCheckoutLoading(true);
    try {
      const result = await GitDualCheckout(sha, 5000);
      setGraphData(result || null);
    } catch (e: any) {
      alert('回档失败: ' + (e?.message || e));
    } finally {
      setCheckoutLoading(false);
    }
  };

  return (
    <div className="git-manager">
      <div className="git-header">
        <h2>Git 存档管理</h2>
        <div className="git-actions">
          <button className="btn" onClick={loadGraph} disabled={graphLoading}>
            {graphLoading ? '刷新中...' : '刷新'}
          </button>
        </div>
      </div>

      <div className="git-content" style={{ overflow: 'hidden' }}>
        <div className="git-graph-panel" style={{ height: '100%' }}>
          {graphLoading ? (
            <div className="git-empty">加载分支图中...</div>
          ) : !graphData ? (
            <div className="git-empty">暂无分支图数据</div>
          ) : (
            <GitGraphCanvas
              data={graphData}
              onCheckout={handleCheckout}
              checkoutLoading={checkoutLoading}
            />
          )}
        </div>
      </div>
    </div>
  );
}
