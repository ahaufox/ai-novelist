import { useState, useRef, useEffect, useCallback } from 'react';
import { PanelGroup, Panel, PanelResizeHandle, type ImperativePanelHandle } from 'react-resizable-panels';
import { useDispatch, useSelector } from 'react-redux';
import { addTab, setActiveTab } from '../store/editor';
import type { RootState, LayoutComponentProps } from '../types';
import SidebarComponent from './SidebarComponent';
import ProviderSettingsPanel from './aiprovider/ProviderSettingsPanel';
import RagManagementPanel from './rag/KnowledgeBasePanel';
import AgentPanel from './agent/AgentPanel';
import MCPSettingsPanel from './mcp/MCPSettingsPanel';
import TopActionBar from './others/TopActionBar';
import SearchPanel from './search/SearchPanel';
import CheckpointPanel from './checkpoint/CheckpointPanel';
import httpClient from '../utils/httpClient';
import LoginPanel from './auth/LoginPanel';
import UserPanel from './auth/UserPanel';
import ForgotPasswordPanel from './auth/ForgotPasswordPanel';
import { ThemeSettingsPanel } from './theme';

function LayoutComponent({ chapterPanel, editorPanel, chatPanel }: LayoutComponentProps) {
  const dispatch = useDispatch();
  const { isAuthenticated } = useSelector((state: RootState) => state.authSlice);
  const [activePanel, setActivePanel] = useState<string | null>(null);
  const [isLeftPanelCollapsed, setIsLeftPanelCollapsed] = useState(false);
  const [leftPanelContent, setLeftPanelContent] = useState<'chapter' | 'search' | 'checkpoint'>('chapter');
  const [leftPanelSize, setLeftPanelSize] = useState(15);
  const [rightPanelSize, setRightPanelSize] = useState(25);
  const leftPanelRef = useRef<ImperativePanelHandle>(null);

  // 同步折叠状态
  useEffect(() => {
    if (leftPanelRef.current) {
      if (isLeftPanelCollapsed) {
        leftPanelRef.current.collapse();
      } else {
        leftPanelRef.current.expand();
      }
    }
  }, [isLeftPanelCollapsed]);

  // 处理左侧面板尺寸变化
  const handleLeftPanelChange = (size: number) => {
    setLeftPanelSize(size);
  };

  // 处理右侧面板尺寸变化
  const handleRightPanelChange = (size: number) => {
    setRightPanelSize(size);
  };

  // 切换左侧面板折叠状态
  const handleToggleCollapse = () => {
    setIsLeftPanelCollapsed(prev => !prev);
  };

  // 切换左侧面板内容
  const handleLeftPanelContentChange = (content: 'chapter' | 'search' | 'checkpoint') => {
    setLeftPanelContent(content);
    if (isLeftPanelCollapsed) {
      setIsLeftPanelCollapsed(false);
    }
  };

  // 监听键盘快捷键
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ctrl+` 保留（原为切换终端，终端功能已废弃）
      if (event.ctrlKey && event.key === '`') {
        event.preventDefault();
      }
    };
    // 添加事件监听回调函数到DOM的window对象上
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // 认证弹窗状态：'login' | 'user' | 'forgot' | null
  const [authModal, setAuthModal] = useState<'login' | 'user' | 'forgot' | null>(null);

  // 处理用户图标点击：已登录显示用户面板，未登录显示登录弹窗
  const handleUserClick = useCallback(() => {
    if (isAuthenticated) {
      setAuthModal('user');
    } else {
      setAuthModal('login');
    }
  }, [isAuthenticated]);

  // 主题设置弹窗状态
  const [showThemeSettings, setShowThemeSettings] = useState(false);

  // 处理搜索结果中的文件选择
  const handleFileSelect = async (filePath: string) => {
    try {
      const response = await httpClient.get(`/api/file/read/${filePath}`);
      dispatch(addTab({ id: response.id, content: response.content }));
      dispatch(setActiveTab({ tabId: filePath }));
    } catch (error) {
      console.error('获取文件内容失败:', error);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <TopActionBar
        isLeftPanelCollapsed={isLeftPanelCollapsed}
        leftPanelContent={leftPanelContent}
        onToggleCollapse={handleToggleCollapse}
        onLeftPanelContentChange={handleLeftPanelContentChange}
        isTerminalVisible={false}
        onToggleTerminal={() => {}}
      />
      <div className="h-[97%] flex-grow flex">
        <PanelGroup direction="horizontal" className="flex-grow flex h-full overflow-hidden min-h-0">
          {/* 左侧组件栏 - 固定宽度 */}
          <div className="bg-theme-black p-0 w-[50px] flex-shrink-0 overflow-hidden border-r border-theme-gray3">
            <SidebarComponent
              activePanel={activePanel}
              setActivePanel={setActivePanel}
              onUserClick={handleUserClick}
              onSettingsClick={() => setShowThemeSettings(true)}
            />
          </div>
          
          {/* 左侧面板 - 章节列表或搜索面板 */}
          <Panel
            ref={leftPanelRef}
            defaultSize={leftPanelSize}
            collapsible={true}
            onResize={handleLeftPanelChange}
            onCollapse={() => setIsLeftPanelCollapsed(true)}
            onExpand={() => setIsLeftPanelCollapsed(false)}
            className="bg-theme-black p-0 flex flex-col w-full h-full overflow-hidden"
          >
            {leftPanelContent === 'chapter' && chapterPanel}
            {leftPanelContent === 'search' && (
              <SearchPanel onFileSelect={handleFileSelect} />
            )}
            {leftPanelContent === 'checkpoint' && (
              <CheckpointPanel />
            )}
          </Panel>
          
          <PanelResizeHandle className="w-[1px] bg-theme-gray3 cursor-ew-resize flex-shrink-0 relative" />
          
          {/* 编辑器面板 */}
          <Panel
            defaultSize={60}
            className="bg-theme-black p-0 flex flex-col h-full overflow-hidden"
          >
            {editorPanel}
          </Panel>

          <PanelResizeHandle className="w-[1px] bg-theme-gray3 cursor-ew-resize flex-shrink-0 relative" />
          
          {/* 聊天面板 */}
          <Panel
            defaultSize={rightPanelSize}
            className="bg-theme-black p-0 flex flex-col h-full overflow-hidden"
            onResize={handleRightPanelChange}
          >
            {chatPanel}
          </Panel>
        </PanelGroup>

        {/* 设置面板 - 全屏覆盖 */}
        {activePanel && (
          <div className="fixed top-[3%] left-[51px] right-0 bottom-0 bg-theme-black z-[1000]">
            {activePanel === 'api' && (
              <ProviderSettingsPanel />
            )}
            {activePanel === 'rag' && (
              <RagManagementPanel />
            )}
            {activePanel === 'agent' && (
              <AgentPanel />
            )}
            {activePanel === 'mcp' && (
              <MCPSettingsPanel />
            )}
          </div>
        )}

        {/* 认证弹窗组 */}
        {authModal === 'login' && (
          <LoginPanel
            onClose={() => setAuthModal(null)}
            onForgotPassword={() => setAuthModal('forgot')}
          />
        )}
        {authModal === 'user' && (
          <UserPanel onClose={() => setAuthModal(null)} />
        )}
        {authModal === 'forgot' && (
          <ForgotPasswordPanel
            onClose={() => setAuthModal(null)}
            onBackToLogin={() => setAuthModal('login')}
          />
        )}

        {/* 主题设置弹窗 */}
        {showThemeSettings && (
          <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center">
            <div className="w-[90%] max-w-md h-[80%] bg-theme-black rounded-lg shadow-2xl overflow-hidden">
              <ThemeSettingsPanel onClose={() => setShowThemeSettings(false)} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default LayoutComponent;
