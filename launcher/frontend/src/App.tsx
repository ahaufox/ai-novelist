import { useEffect, useRef, useState, useCallback } from 'react';
import './App.css';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from './store/store';
import {
  addLog,
  setLogs,
  setCopied,
  setBackendRunning,
  setFrontendRunning,
  setProgress,
  setUpdateStatus,
  setCheckingUpdate,
  setUpdating,
  setVersion,
  resetProgress,
  addWebviewTab,
} from './store/launcher';
import { useTheme } from './context/ThemeContext';
import {
  CheckUpdate,
  GetLogs,
  GetVersion,
  BackendRunning,
  FrontendRunning,
  IsProjectDeployed,
  PrepareEnvironment,
  BackendStart,
  BackendStop,
  FrontendStart,
  FrontendStop,
  LoadConfig,
  PerformUpdate,
} from '../wailsjs/go/main/App';
import { EventsOn } from '../wailsjs/runtime';
import GitManager from './components/GitManager';
import WebviewTab from './components/WebviewTab';

function App() {
  const dispatch = useDispatch();
  const appFrameRef = useRef<HTMLIFrameElement>(null);
  const {
    logs,
    version,
    updateStatus,
    checkingUpdate,
    updating,
    progress,
    copied,
    backendRunning,
    frontendRunning,
    webviewTabs,
  } = useSelector((state: RootState) => state.launcherSlice);

  const { theme } = useTheme();
  const logRef = useRef<HTMLDivElement>(null);
  const [mainTab, setMainTab] = useState<'main' | 'version' | 'website' | 'app'>('website');
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appTabReadyRef = useRef(false);
  const [deployed, setDeployed] = useState<boolean>(false);
  const [preparing, setPreparing] = useState(false);
  const [backendLoading, setBackendLoading] = useState(false);
  const [frontendLoading, setFrontendLoading] = useState(false);

  const stopPolling = useCallback(() => {
    if (pollingRef.current !== null) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  // 刷新 iframe
  const refreshIframe = useCallback(() => {
    if (appFrameRef.current) {
      appFrameRef.current.src = 'http://localhost:3000';
    }
  }, []);

  // 打开"青烛"标签页：检查前后端状态，决定显示内容
  const handleAppTabClick = useCallback(async () => {
    setMainTab('app');
    stopPolling();

    // 查询最新状态
    const beRunning = await BackendRunning();
    const feRunning = await FrontendRunning();
    dispatch(setBackendRunning(beRunning));
    dispatch(setFrontendRunning(feRunning));

    if (beRunning && feRunning) {
      if (!appTabReadyRef.current) {
        // 首次加载 → 刷新 iframe
        appTabReadyRef.current = true;
        refreshIframe();
      }
      // 非首次（切换标签回来）→ 不自动刷新，保留已有内容
    } else {
      // 服务未就绪 → 重置标记，下次就绪时重新加载
      appTabReadyRef.current = false;
    }
  }, [dispatch, stopPolling, refreshIframe]);

  const refreshStatus = async () => {
    try {
      const v = await GetVersion();
      dispatch(setVersion(v));
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    LoadConfig().then(() => {
      IsProjectDeployed().then((d: boolean) => {
        setDeployed(d);
        if (!d) {
          dispatch(setLogs([
            '初次部署项目，请点击「下载项目」按钮\n',
          ]));
        }
        refreshStatus();
      });
      // 查询后端/前端运行状态
      BackendRunning().then((r: boolean) => dispatch(setBackendRunning(r)));
      FrontendRunning().then((r: boolean) => dispatch(setFrontendRunning(r)));
    });

    const offLog = EventsOn('log', (data: string) => {
      dispatch(addLog(data));
    });

    const offProgress = EventsOn('progress', (p: number) => {
      dispatch(setProgress(p));
    });

    const offMainState = EventsOn('main-program-state', () => {
      // 当后端或前端状态变化时，重新查询
      BackendRunning().then((r: boolean) => dispatch(setBackendRunning(r)));
      FrontendRunning().then((r: boolean) => dispatch(setFrontendRunning(r)));
    });

    const offWebview = EventsOn('open-webview-tab', (data: { title: string; url: string }) => {
      dispatch(addWebviewTab({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        title: data.title,
        url: data.url,
      }));
    });

    return () => {
      offLog?.();
      offProgress?.();
      offMainState?.();
      offWebview?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 清理轮询定时器
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  const handleCheckUpdate = async () => {
    if (checkingUpdate) return;
    dispatch(setCheckingUpdate(true));
    try {
      const status = await CheckUpdate();
      dispatch(setUpdateStatus(status));
    } catch {
      dispatch(setUpdateStatus(null));
    } finally {
      dispatch(setCheckingUpdate(false));
    }
  };

  const handleUpdate = async () => {
    dispatch(setUpdating(true));
    try {
      await PerformUpdate();
      setDeployed(true);
      await refreshStatus();
      dispatch(setUpdateStatus(null));
      dispatch(resetProgress());
    } catch {
      dispatch(resetProgress());
    } finally {
      dispatch(setUpdating(false));
    }
  };

  const handlePrepareEnvironment = async () => {
    setPreparing(true);
    try {
      await PrepareEnvironment();
      const d = await IsProjectDeployed();
      setDeployed(d);
    } catch (err: any) {
      const msg = err?.message || String(err);
      dispatch(addLog(`环境准备失败: ${msg}\n`));
    } finally {
      setPreparing(false);
    }
  };

  const handleBackendToggle = async () => {
    if (backendRunning) {
      setBackendLoading(true);
      try {
        await BackendStop();
        dispatch(setBackendRunning(false));
      } catch (err: any) {
        const msg = err?.message || String(err);
        dispatch(addLog(`关闭后端失败: ${msg}\n`));
      } finally {
        setBackendLoading(false);
      }
    } else {
      setBackendLoading(true);
      try {
        await BackendStart();
        dispatch(setBackendRunning(true));
      } catch (err: any) {
        const msg = err?.message || String(err);
        dispatch(addLog(`启动后端失败: ${msg}\n`));
      } finally {
        setBackendLoading(false);
      }
    }
  };

  const handleFrontendToggle = async () => {
    if (frontendRunning) {
      setFrontendLoading(true);
      try {
        await FrontendStop();
        dispatch(setFrontendRunning(false));
      } catch (err: any) {
        const msg = err?.message || String(err);
        dispatch(addLog(`关闭前端失败: ${msg}\n`));
      } finally {
        setFrontendLoading(false);
      }
    } else {
      setFrontendLoading(true);
      try {
        await FrontendStart();
        dispatch(setFrontendRunning(true));
      } catch (err: any) {
        const msg = err?.message || String(err);
        dispatch(addLog(`启动前端失败: ${msg}\n`));
      } finally {
        setFrontendLoading(false);
      }
    }
  };

  const handleCopyLogs = async () => {
    const text = await GetLogs();
    await navigator.clipboard.writeText(text);
    dispatch(setCopied(true));
    setTimeout(() => dispatch(setCopied(false)), 1500);
  };

  const getUpdateButtonText = () => {
    if (checkingUpdate) return '检查中...';
    if (updating) return '更新中...';
    if (!deployed) return '下载项目';
    if (updateStatus?.has_update) return '下载更新';
    if (updateStatus !== null) return '已是最新';
    return '检查更新';
  };

  const handleUpdateButtonClick = () => {
    if (!deployed) {
      handleUpdate();
      return;
    }
    if (updateStatus?.has_update) {
      handleUpdate();
    } else {
      handleCheckUpdate();
    }
  };

  const backendBtnText = backendRunning
    ? (backendLoading ? '关闭中...' : '关闭后端')
    : (backendLoading ? '启动中...' : '后端启动');

  const frontendBtnText = frontendRunning
    ? (frontendLoading ? '关闭中...' : '关闭前端')
    : (frontendLoading ? '启动中...' : '前端启动');

  return (
    <div className="app" style={{ background: theme.black, color: theme.white }}>
      <div className="main-tab-bar">
        <button
          className={`main-tab ${mainTab === 'website' ? 'active' : ''}`}
          onClick={() => setMainTab('website')}
        >
          官网
        </button>
        <button
          className={`main-tab ${mainTab === 'main' ? 'active' : ''}`}
          onClick={() => setMainTab('main')}
        >
          启动
        </button>
        <button
          className={`main-tab ${mainTab === 'version' ? 'active' : ''}`}
          onClick={() => setMainTab('version')}
        >
          版本
        </button>
        <button
          className={`main-tab ${mainTab === 'app' ? 'active' : ''}`}
          onClick={handleAppTabClick}
        >
          青烛
        </button>
      </div>

      <main className="main" style={mainTab === 'website' || mainTab === 'app' ? { padding: 0, gap: 0 } : undefined}>
        {mainTab === 'main' ? (
          <>
            <div className="toolbar">
              <div className="toolbar-left">
                <button
                  className="btn warn"
                  onClick={handleUpdateButtonClick}
                  disabled={checkingUpdate || updating || preparing}
                >
                  {getUpdateButtonText()}
                </button>
                <button
                  className="btn"
                  onClick={handlePrepareEnvironment}
                  disabled={preparing || updating}
                >
                  {preparing ? '准备中...' : '准备环境'}
                </button>
                <button
                  className={`btn ${backendRunning ? 'danger' : 'primary'}`}
                  onClick={handleBackendToggle}
                  disabled={backendLoading || preparing || !deployed}
                  title={!deployed ? '请先下载项目' : ''}
                >
                  {backendBtnText}
                </button>
                <button
                  className={`btn ${frontendRunning ? 'danger' : 'primary'}`}
                  onClick={handleFrontendToggle}
                  disabled={frontendLoading || preparing || !deployed}
                  title={!deployed ? '请先下载项目' : ''}
                >
                  {frontendBtnText}
                </button>
                <button
                  className={`btn ${copied ? 'success' : ''}`}
                  onClick={handleCopyLogs}
                  disabled={copied}
                >
                  {copied ? '复制成功' : '复制日志'}
                </button>
              </div>
              <div className="toolbar-right">
                <div className="meta">
                  <span className="version">本地版本: {version || '-'}</span>
                </div>
              </div>
            </div>

            {progress > 0 && progress < 100 && (
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${progress}%` }} />
                <span className="progress-text">{progress}%</span>
              </div>
            )}

            <div className="log-box" ref={logRef}>
              {logs.map((line, idx) => (
                <div key={idx} className="log-line">
                  <span className="log-prefix">{'>'}</span>
                  <span className="log-content">{line.replace(/\n$/, '')}</span>
                </div>
              ))}
            </div>

          {webviewTabs.length > 0 && (
            <div className="webview-tabs-panel">
              {webviewTabs.map((t) => (
                <WebviewTab key={t.id} id={t.id} title={t.title} url={t.url} />
              ))}
            </div>
          )}
          </>
        ) : mainTab === 'version' ? (
          <GitManager />
        ) : null}

        {/* 始终渲染 iframe，display:none 隐藏不活动的标签页，避免切换时销毁重建 */}
        <iframe
          className="website-frame"
          src="https://denghuominghui.top/"
          title="官网"
          style={{ display: mainTab === 'website' ? 'block' : 'none' }}
          sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-downloads allow-top-navigation-by-user-activation allow-popups-to-escape-sandbox"
        />
        <div className="iframe-container" style={{ display: mainTab === 'app' ? 'block' : 'none' }}>
          {/* 状态面板覆盖层 - 服务未就绪时遮挡 iframe */}
          {(!backendRunning || !frontendRunning) && (
            <div className="app-status-panel">
              <div className="app-status-icon app-status-icon-error">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
              </div>
              <div className="app-status-title">服务未就绪</div>
              <div className="app-status-desc">
                请前往「<span className="app-status-link" onClick={() => setMainTab('main')}>启动</span>」页面启动全部服务后重试。
              </div>
              <div className="app-status-detail">
                <div className="app-status-item">
                  <span className={`app-status-dot ${backendRunning ? 'dot-green' : 'dot-red'}`} />
                  <span>后端服务：{backendRunning ? '运行中' : '未启动'}</span>
                </div>
                <div className="app-status-item">
                  <span className={`app-status-dot ${frontendRunning ? 'dot-green' : 'dot-red'}`} />
                  <span>前端服务：{frontendRunning ? '运行中' : '未启动'}</span>
                </div>
              </div>
            </div>
          )}

          {/* iframe 始终渲染，不销毁重建；服务未就绪时被状态面板遮挡 */}
          <iframe
            ref={appFrameRef}
            className="website-frame"
            src="http://localhost:3000"
            title="青烛"
            style={{ display: (backendRunning && frontendRunning) ? 'block' : 'none' }}
          />
        </div>
      </main>
    </div>
  );
}

export default App;
