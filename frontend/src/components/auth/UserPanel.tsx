import { useDispatch, useSelector } from 'react-redux';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faXmark, faArrowRightFromBracket, faEnvelope, faSpinner } from '@fortawesome/free-solid-svg-icons';
import type { RootState } from '../../types/store';
import { logoutAsync, fetchUserAsync } from '../../store/auth';
import { useState } from 'react';

interface UserPanelProps {
  onClose: () => void;
}

function UserPanel({ onClose }: UserPanelProps) {
  const dispatch = useDispatch();
  const { user, isLoading } = useSelector((state: RootState) => state.authSlice);
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    await dispatch(logoutAsync() as any);
    setLoggingOut(false);
    onClose();
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
            <FontAwesomeIcon icon={faXmark} />
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
            <FontAwesomeIcon icon={faEnvelope} className="text-theme-gray5 text-sm" />
            <span className="text-theme-white text-sm">{user?.email}</span>
          </div>

          {/* 退出按钮 */}
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="w-full bg-red-900/30 text-red-400 border border-red-800 rounded py-2.5 text-sm font-medium cursor-pointer hover:bg-red-900/50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
          >
            {loggingOut ? (
              <FontAwesomeIcon icon={faSpinner} spin />
            ) : (
              <FontAwesomeIcon icon={faArrowRightFromBracket} />
            )}
            退出登录
          </button>
        </div>
      </div>
    </div>
  );
}

export default UserPanel;
