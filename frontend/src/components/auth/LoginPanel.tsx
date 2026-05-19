import { useState, useEffect, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEnvelope, faLock, faSpinner, faXmark, faUserPlus, faRightToBracket, faCheckCircle } from '@fortawesome/free-solid-svg-icons';
import type { RootState } from '../../types/store';
import { loginAsync, registerAsync, clearError, clearRegisterSuccess, fetchUserAsync } from '../../store/auth';
import { evaluatePasswordStrength, isPasswordStrongEnough } from '../../utils/passwordStrength';
import PasswordStrengthBar from './PasswordStrengthBar';

interface LoginPanelProps {
  onClose: () => void;
  onForgotPassword?: () => void;
}

function LoginPanel({ onClose, onForgotPassword }: LoginPanelProps) {
  const dispatch = useDispatch();
  const { isLoading, error, isAuthenticated, registerSuccess } = useSelector((state: RootState) => state.authSlice);

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showRegisterSuccess, setShowRegisterSuccess] = useState(false);

  // 密码强度评估
  const passwordStrength = useMemo(() => {
    if (mode !== 'register' || !password) return null;
    return evaluatePasswordStrength(password);
  }, [password, mode]);

  // 登录成功后自动获取用户信息并关闭
  useEffect(() => {
    if (isAuthenticated) {
      dispatch(fetchUserAsync() as any);
      onClose();
    }
  }, [isAuthenticated, dispatch, onClose]);

  // 注册成功后切换回登录模式并显示成功提示
  useEffect(() => {
    if (registerSuccess) {
      dispatch(clearRegisterSuccess() as any);
      setMode('login');
      setShowRegisterSuccess(true);
      setTimeout(() => setShowRegisterSuccess(false), 3000);
    }
  }, [registerSuccess, dispatch]);

  useEffect(() => {
    dispatch(clearError() as any);
  }, [mode, dispatch]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (mode === 'register') {
      if (password !== confirmPassword) return;
      if (!isPasswordStrongEnough(password)) return; // 密码强度不足，不提交
      dispatch(registerAsync({ email, password }) as any);
    } else {
      dispatch(loginAsync({ username: email, password }) as any);
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
      <div className="bg-theme-black border border-theme-gray3 rounded-lg shadow-2xl w-[380px] overflow-hidden">
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-theme-gray3">
          <h2 className="text-theme-white text-lg font-medium m-0">
            {mode === 'login' ? '登录' : '注册'}
          </h2>
          <button
            onClick={onClose}
            className="text-theme-gray5 hover:text-theme-white bg-transparent border-none cursor-pointer text-lg p-1"
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>

        {/* 表单 */}
        <form onSubmit={handleSubmit} className="px-5 py-6 flex flex-col gap-4">
          {/* 注册成功提示 */}
          {showRegisterSuccess && (
            <div className="flex items-center gap-2 bg-green-900/30 border border-green-700 rounded px-3 py-2.5">
              <FontAwesomeIcon icon={faCheckCircle} className="text-theme-green text-sm" />
              <span className="text-theme-green text-sm">注册成功，请登录</span>
            </div>
          )}

          {/* 邮箱 */}
          <div className="flex flex-col gap-1.5">
            <label className="text-theme-gray5 text-xs">邮箱</label>
            <div className="flex items-center gap-2 bg-theme-gray1 rounded px-3 py-2 border border-theme-gray3 focus-within:border-theme-green transition-colors">
              <FontAwesomeIcon icon={faEnvelope} className="text-theme-gray5 text-sm" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                className="flex-1 bg-transparent border-none outline-none text-theme-white text-sm placeholder:text-theme-gray5"
              />
            </div>
          </div>

          {/* 密码 */}
          <div className="flex flex-col gap-1.5">
            <label className="text-theme-gray5 text-xs">密码</label>
            <div className="flex items-center gap-2 bg-theme-gray1 rounded px-3 py-2 border border-theme-gray3 focus-within:border-theme-green transition-colors">
              <FontAwesomeIcon icon={faLock} className="text-theme-gray5 text-sm" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="flex-1 bg-transparent border-none outline-none text-theme-white text-sm placeholder:text-theme-gray5"
              />
            </div>

            {/* 密码强度条（仅注册模式） */}
            {mode === 'register' && passwordStrength && (
              <PasswordStrengthBar
                result={passwordStrength}
                visible={password.length > 0}
              />
            )}
          </div>

          {/* 确认密码（仅注册） */}
          {mode === 'register' && (
            <div className="flex flex-col gap-1.5">
              <label className="text-theme-gray5 text-xs">确认密码</label>
              <div className="flex items-center gap-2 bg-theme-gray1 rounded px-3 py-2 border border-theme-gray3 focus-within:border-theme-green transition-colors">
                <FontAwesomeIcon icon={faLock} className="text-theme-gray5 text-sm" />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="再次输入密码"
                  required
                  className="flex-1 bg-transparent border-none outline-none text-theme-white text-sm placeholder:text-theme-gray5"
                />
              </div>
            </div>
          )}

          {/* 密码不匹配提示 */}
          {mode === 'register' && confirmPassword && password !== confirmPassword && (
            <p className="text-red-400 text-xs m-0">两次密码输入不一致</p>
          )}

          {/* 密码强度警告（分数在 50-69 之间时） */}
          {mode === 'register' && passwordStrength && passwordStrength.score >= 50 && passwordStrength.score < 70 && (
            <p className="text-yellow-400 text-xs m-0">密码强度一般，建议使用更强的密码</p>
          )}

          {/* 错误提示 */}
          {error && (
            <p className="text-red-400 text-xs m-0">{error}</p>
          )}

          {/* 提交按钮 */}
          <button
            type="submit"
            disabled={isLoading || (mode === 'register' && (password !== confirmPassword || !isPasswordStrongEnough(password)))}
            className="w-full bg-theme-green text-theme-black border-none rounded py-2.5 text-sm font-medium cursor-pointer hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-opacity"
          >
            {isLoading ? (
              <FontAwesomeIcon icon={faSpinner} spin />
            ) : mode === 'login' ? (
              <FontAwesomeIcon icon={faRightToBracket} />
            ) : (
              <FontAwesomeIcon icon={faUserPlus} />
            )}
            {mode === 'login' ? '登录' : '注册'}
          </button>

          {/* 忘记密码（仅登录模式） */}
          {mode === 'login' && onForgotPassword && (
            <div className="text-center -mt-1">
              <button
                type="button"
                onClick={onForgotPassword}
                className="text-theme-gray5 hover:text-theme-green bg-transparent border-none cursor-pointer p-0 underline text-xs"
              >
                忘记密码？
              </button>
            </div>
          )}

          {/* 切换模式 */}
          <p className="text-center text-theme-gray5 text-xs m-0">
            {mode === 'login' ? (
              <>还没有账号？<button type="button" onClick={() => setMode('register')} className="text-theme-green bg-transparent border-none cursor-pointer p-0 underline text-xs">注册</button></>
            ) : (
              <>已有账号？<button type="button" onClick={() => setMode('login')} className="text-theme-green bg-transparent border-none cursor-pointer p-0 underline text-xs">登录</button></>
            )}
          </p>
        </form>
      </div>
    </div>
  );
}

export default LoginPanel;
