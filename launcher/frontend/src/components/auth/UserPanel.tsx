import { useState } from 'react';
import { AuthLogout } from '../../../wailsjs/go/main/App';

interface UserInfo {
  email?: string;
  is_verified?: boolean;
  created_at?: string;
}

interface UserPanelProps {
  user: UserInfo | null;
  onClose: () => void;
  onLogout?: () => void;
}

function UserPanel({ user, onClose, onLogout }: UserPanelProps) {
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await AuthLogout();
      onLogout?.();
      onClose();
    } catch {
      // 即使失败也清除本地状态
      onLogout?.();
      onClose();
    } finally {
      setLoggingOut(false);
    }
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center"
      onClick={handleOverlayClick}
    >
      <div className="bg-theme-black border border-theme-gray3 rounded-lg shadow-2xl w-[360px] overflow-hidden">
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-theme-gray3">
          <h2 className="text-theme-white text-lg font-medium m-0">用户</h2>
          <button
            onClick={onClose}
            className="text-theme-gray5 hover:text-theme-white bg-transparent border-none cursor-pointer text-lg p-1"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-6 flex flex-col gap-5">
          {/* 用户信息 */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-theme-green/20 flex items-center justify-center">
              <span className="text-theme-green text-lg font-medium">
                {user?.email?.charAt(0).toUpperCase() || 'U'}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-theme-white text-sm font-medium">{user?.email || '未知用户'}</span>
              <span className="text-theme-gray5 text-xs">已登录</span>
            </div>
          </div>

          {/* 邮箱详情 */}
          <div className="flex items-center gap-2 bg-theme-gray1 rounded px-3 py-2.5 border border-theme-gray3">
            <svg className="w-4 h-4 text-theme-gray5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <span className="text-theme-white text-sm">{user?.email}</span>
          </div>

          {/* 退出按钮 */}
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="w-full bg-red-900/30 text-red-400 border border-red-800 rounded py-2.5 text-sm font-medium cursor-pointer hover:bg-red-900/50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
          >
            {loggingOut ? (
              <span className="inline-block animate-spin">⟳</span>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            )}
            退出登录
          </button>
        </div>
      </div>
    </div>
  );
}

export default UserPanel;
