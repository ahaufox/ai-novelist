import { useState, useEffect, useMemo, useRef } from 'react';
import {
  AuthLogin,
  AuthRegister,
  AuthSendVerifyCode,
} from '../../../wailsjs/go/main/App';
import { evaluatePasswordStrength, isPasswordStrongEnough } from '../../utils/passwordStrength';
import PasswordStrengthBar from './PasswordStrengthBar';

interface LoginPanelProps {
  onClose: () => void;
  onForgotPassword?: () => void;
  onLoginSuccess?: () => void;
}

function LoginPanel({ onClose, onForgotPassword, onLoginSuccess }: LoginPanelProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codeLoading, setCodeLoading] = useState(false);
  const [codeCooldown, setCodeCooldown] = useState(0);
  const [codeSent, setCodeSent] = useState(false);
  const [registerSuccess, setRegisterSuccess] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 密码强度
  const passwordStrength = useMemo(() => {
    if (mode !== 'register' || !password) return null;
    return evaluatePasswordStrength(password);
  }, [password, mode]);

  // 倒计时
  useEffect(() => {
    if (codeCooldown <= 0) return;
    cooldownRef.current = setInterval(() => {
      setCodeCooldown((prev) => {
        if (prev <= 1) {
          if (cooldownRef.current) clearInterval(cooldownRef.current);
          cooldownRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (cooldownRef.current) {
        clearInterval(cooldownRef.current);
        cooldownRef.current = null;
      }
    };
  }, [codeCooldown]);

  // 登录成功
  useEffect(() => {
    if (isAuthenticated) {
      onLoginSuccess?.();
      onClose();
    }
  }, [isAuthenticated, onClose, onLoginSuccess]);

  // 切换模式时清错误
  useEffect(() => {
    setError(null);
    setCode('');
    setCodeSent(false);
  }, [mode]);

  // 获取验证码
  const handleSendCode = async () => {
    if (!email) return;
    setCodeLoading(true);
    setError(null);
    try {
      await AuthSendVerifyCode(email);
      setCodeSent(true);
      setCodeCooldown(60);
    } catch (err: any) {
      setError(err?.message || '发送验证码失败');
    } finally {
      setCodeLoading(false);
    }
  };

  // 提交
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === 'register') {
      if (password !== confirmPassword) {
        setError('两次密码输入不一致');
        return;
      }
      if (!isPasswordStrongEnough(password)) {
        setError('密码强度不足');
        return;
      }
      if (!code) {
        setError('请输入验证码');
        return;
      }

      setIsLoading(true);
      try {
        await AuthRegister(email, password, code);
        setRegisterSuccess(true);
        setTimeout(() => {
          setRegisterSuccess(false);
          setMode('login');
        }, 2000);
      } catch (err: any) {
        setError(err?.message || '注册失败');
      } finally {
        setIsLoading(false);
      }
    } else {
      setIsLoading(true);
      try {
        const result = await AuthLogin(email, password);
        if (result?.isAuthenticated) {
          setIsAuthenticated(true);
        }
      } catch (err: any) {
        setError(err?.message || '登录失败');
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  const codeButtonDisabled = codeLoading || codeCooldown > 0 || !email;

  const getCodeButtonText = () => {
    if (codeLoading) return <span className="inline-block animate-spin">⟳</span>;
    if (codeCooldown > 0) return `${codeCooldown}s`;
    return codeSent ? '重新发送' : '获取验证码';
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
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 表单 */}
        <form onSubmit={handleSubmit} className="px-5 py-6 flex flex-col gap-4">
          {/* 注册成功提示 */}
          {registerSuccess && (
            <div className="flex items-center gap-2 bg-green-900/30 border border-green-700 rounded px-3 py-2.5">
              <svg className="w-4 h-4 text-theme-green" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-theme-green text-sm">注册成功！请登录</span>
            </div>
          )}

          {/* 邮箱 */}
          <div className="flex flex-col gap-1.5">
            <label className="text-theme-gray5 text-xs">邮箱</label>
            <div className="flex items-center gap-2 bg-theme-gray1 rounded px-3 py-2 border border-theme-gray3 focus-within:border-theme-green transition-colors">
              <svg className="w-4 h-4 text-theme-gray5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                className="flex-1 bg-transparent border-none outline-none text-theme-white text-sm placeholder:text-theme-gray5 min-w-0"
              />
            </div>
          </div>

          {/* 密码 */}
          <div className="flex flex-col gap-1.5">
            <label className="text-theme-gray5 text-xs">密码</label>
            <div className="flex items-center gap-2 bg-theme-gray1 rounded px-3 py-2 border border-theme-gray3 focus-within:border-theme-green transition-colors">
              <svg className="w-4 h-4 text-theme-gray5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0110 0v4" />
              </svg>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="flex-1 bg-transparent border-none outline-none text-theme-white text-sm placeholder:text-theme-gray5 min-w-0"
              />
            </div>

            {/* 密码强度条（仅注册） */}
            {mode === 'register' && passwordStrength && (
              <PasswordStrengthBar result={passwordStrength} visible={password.length > 0} />
            )}
          </div>

          {/* 确认密码（仅注册） */}
          {mode === 'register' && (
            <div className="flex flex-col gap-1.5">
              <label className="text-theme-gray5 text-xs">确认密码</label>
              <div className="flex items-center gap-2 bg-theme-gray1 rounded px-3 py-2 border border-theme-gray3 focus-within:border-theme-green transition-colors">
                <svg className="w-4 h-4 text-theme-gray5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0110 0v4" />
                </svg>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="再次输入密码"
                  required
                  className="flex-1 bg-transparent border-none outline-none text-theme-white text-sm placeholder:text-theme-gray5 min-w-0"
                />
              </div>
            </div>
          )}

          {/* 验证码（仅注册） */}
          {mode === 'register' && (
            <div className="flex flex-col gap-1.5">
              <label className="text-theme-gray5 text-xs">验证码</label>
              <div className="flex gap-2">
                <div className="flex items-center gap-2 bg-theme-gray1 rounded px-3 py-2 border border-theme-gray3 focus-within:border-theme-green transition-colors flex-1 min-w-0">
                  <svg className="w-4 h-4 text-theme-gray5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="6位验证码"
                    required
                    maxLength={6}
                    className="flex-1 bg-transparent border-none outline-none text-theme-white text-sm placeholder:text-theme-gray5 min-w-0"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleSendCode}
                  disabled={codeButtonDisabled}
                  className="shrink-0 bg-theme-green text-theme-black border-none rounded px-3 py-2 text-xs font-medium cursor-pointer hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity whitespace-nowrap"
                >
                  {getCodeButtonText()}
                </button>
              </div>
            </div>
          )}

          {/* 密码不匹配提示 */}
          {mode === 'register' && confirmPassword && password !== confirmPassword && (
            <p className="text-red-400 text-xs m-0">两次密码输入不一致</p>
          )}

          {/* 密码强度警告 */}
          {mode === 'register' && passwordStrength && passwordStrength.score >= 50 && passwordStrength.score < 70 && (
            <p className="text-yellow-400 text-xs m-0">密码强度一般，建议使用更强的密码</p>
          )}

          {/* 错误提示 */}
          {error && (
            <p className="text-red-400 text-xs m-0">{error}</p>
          )}

          {/* 提交按钮 */}
          {mode === 'register' ? (
            <button
              type="submit"
              disabled={isLoading || !code || password !== confirmPassword || !isPasswordStrongEnough(password)}
              className="w-full bg-theme-green text-theme-black border-none rounded py-2.5 text-sm font-medium cursor-pointer hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-opacity"
            >
              {isLoading ? <span className="inline-block animate-spin">⟳</span> : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                </svg>
              )}
              注册
            </button>
          ) : (
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-theme-green text-theme-black border-none rounded py-2.5 text-sm font-medium cursor-pointer hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-opacity"
            >
              {isLoading ? <span className="inline-block animate-spin">⟳</span> : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                </svg>
              )}
              登录
            </button>
          )}

          {/* 忘记密码 */}
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
