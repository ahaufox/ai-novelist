import { useState, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '../../store/store';
import { setAuthenticated, setUser, setAuthLoading } from '../../store/launcher';
import { AuthGetStatus, AuthLogout } from '../../../wailsjs/go/main/App';
import LoginPanel from './LoginPanel';
import ForgotPasswordPanel from './ForgotPasswordPanel';
import UserPanel from './UserPanel';

function AuthPanel() {
  const dispatch = useDispatch();
  const { isAuthenticated, user } = useSelector((state: RootState) => state.launcherSlice);
  const [showLogin, setShowLogin] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [showUser, setShowUser] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  // 检查登录状态
  const checkAuthStatus = useCallback(async () => {
    dispatch(setAuthLoading(true));
    try {
      const status = await AuthGetStatus();
      dispatch(setAuthenticated(status.isAuthenticated));
      dispatch(setUser(status.user || null));
    } catch {
      dispatch(setAuthenticated(false));
      dispatch(setUser(null));
    } finally {
      dispatch(setAuthLoading(false));
    }
  }, [dispatch]);

  // 登录成功
  const handleLoginSuccess = useCallback(() => {
    setShowLogin(false);
    setShowForgot(false);
    checkAuthStatus();
  }, [checkAuthStatus]);

  // 登出
  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await AuthLogout();
    } catch {
      // ignore
    }
    dispatch(setAuthenticated(false));
    dispatch(setUser(null));
    setLoggingOut(false);
    setShowUser(false);
  };

  // 未登录状态
  if (!isAuthenticated) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <div className="auth-header">
            <h2 className="auth-title">账户</h2>
          </div>
          <div className="auth-body">
            <div className="auth-actions">
              <button
                className="btn primary auth-action-btn"
                onClick={() => setShowLogin(true)}
              >
                登录 / 注册
              </button>
            </div>

            {/* 提示文字 */}
            <div className="auth-hint">
              <p>登录后可同步设置和使用高级功能。</p>
            </div>
          </div>
        </div>

        {showLogin && (
          <LoginPanel
            onClose={() => setShowLogin(false)}
            onForgotPassword={() => { setShowLogin(false); setShowForgot(true); }}
            onLoginSuccess={handleLoginSuccess}
          />
        )}

        {showForgot && (
          <ForgotPasswordPanel
            onClose={() => setShowForgot(false)}
            onBackToLogin={() => { setShowForgot(false); setShowLogin(true); }}
          />
        )}
      </div>
    );
  }

  // 已登录状态
  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <h2 className="auth-title">账户</h2>
        </div>
        <div className="auth-body">
          <div className="auth-user-info">
            <div className="auth-avatar">
              <span>{user?.email?.charAt(0).toUpperCase() || 'U'}</span>
            </div>
            <div className="auth-user-details">
              <span className="auth-user-email">{user?.email || '未知用户'}</span>
              <span className="auth-user-status">已登录</span>
            </div>
          </div>

          <div className="auth-info-row">
            <svg className="w-4 h-4 text-theme-gray5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <span className="text-theme-white text-sm">{user?.email}</span>
          </div>

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

      {showUser && (
        <UserPanel
          user={user}
          onClose={() => setShowUser(false)}
          onLogout={handleLogout}
        />
      )}
    </div>
  );
}

export default AuthPanel;
