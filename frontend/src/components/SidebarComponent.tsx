import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBrain,
  faDatabase,
  faRobot,
  faPencil,
  faServer,
  faGear,
  faRightToBracket,
  faUser,
} from '@fortawesome/free-solid-svg-icons';
import { useSelector } from 'react-redux';
import type { SidebarComponentProps, SidebarItem } from '../types';
import type { RootState } from '../types/store';

const SidebarComponent = ({ activePanel, setActivePanel, onUserClick, onSettingsClick }: SidebarComponentProps) => {
  const { isAuthenticated, user } = useSelector((state: RootState) => state.authSlice);

  // 顶部面板项目
  const topSidebarItems: SidebarItem[] = [
    { id: 'home', icon: faPencil, label: '首页', panelId: null },
    { id: 'api', icon: faBrain, label: 'API设置', panelId: 'api' },
    { id: 'rag', icon: faDatabase, label: 'RAG知识库', panelId: 'rag' },
    { id: 'agent', icon: faRobot, label: 'Agent设置', panelId: 'agent' },
    { id: 'mcp', icon: faServer, label: 'MCP配置', panelId: 'mcp' },
  ];

  const handleItemClick = (item: SidebarItem) => {
    if (activePanel === item.panelId) {
      setActivePanel(null);
    } else {
      setActivePanel(item.panelId);
    }
  };

  return (
    <div className="w-[50px] h-full bg-theme-black flex flex-col">
      {/* 顶部面板图标（从上到下） */}
      <div className="flex-1 py-[10px] flex flex-col gap-2">
        {topSidebarItems.map((item) => (
          <div
            key={item.id}
            className={`flex items-center justify-center p-3 cursor-pointer border-l-[3px] border-transparent relative ${activePanel === item.panelId ? 'border-l-theme-green' : ''}`}
            onClick={() => handleItemClick(item)}
            title={item.label}
          >
            <FontAwesomeIcon
              icon={item.icon}
              className={`text-[18px] ${activePanel === item.panelId ? 'text-theme-green' : 'text-theme-white hover:text-theme-green'}`}
            />
          </div>
        ))}
      </div>

      {/* 底部操作图标（从下到上） */}
      <div className="flex flex-col gap-2 pb-[10px] border-t border-theme-gray3 pt-2">
        {/* 设置齿轮 */}
        <div
          className="flex items-center justify-center p-3 cursor-pointer border-l-[3px] border-transparent relative"
          onClick={onSettingsClick}
          title="主题色设置"
        >
          <FontAwesomeIcon
            icon={faGear}
            className="text-[18px] text-theme-white hover:text-theme-green"
          />
        </div>
        {/* 登录/用户按钮 */}
        <div
          className="flex items-center justify-center p-3 cursor-pointer border-l-[3px] border-transparent relative"
          onClick={onUserClick}
          title={isAuthenticated && user ? user.email : '登录'}
        >
          <FontAwesomeIcon
            icon={isAuthenticated ? faUser : faRightToBracket}
            className="text-[18px] text-theme-white hover:text-theme-green"
          />
        </div>
      </div>
    </div>
  );
};

export default SidebarComponent;
