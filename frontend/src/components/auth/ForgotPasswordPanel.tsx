import { useState, useEffect, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEnvelope, faSpinner, faXmark, faArrowLeft, faLock, faShield, faCheckCircle } from '@fortawesome/free-solid-svg-icons';
import httpClient from '../../utils/httpClient';
import { evaluatePasswordStrength, isPasswordStrongEnough } from '../../utils/passwordStrength';
import PasswordStrengthBar from './PasswordStrengthBar';
import { useMemo } from 'react';

interface ForgotPasswordPanelProps {
  onClose: () => void;
  onBackToLogin: () => void;
}

function ForgotPasswordPanel({ onClose, onBackToLogin }: ForgotPasswordPanelProps) {
  const [step, setStep] = useState<'email' | 'reset'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // 验证码相关
  const [codeLoading, setCodeLoading] = useState(false);
  const [codeCooldown, setCodeCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const passwordStrength = useMemo(() => {
    if (!password) return null;
    return evaluatePasswordStrength(password);
  }, [password]);

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

  const handleSendCode = async () => {
    if (!email) return;
    setCodeLoading(true);
    setError(null);
    try {
      await httpClient.post('/api/auth/send-reset-code', { email });
      setStep('reset');
      setCodeCooldown(60);
    } catch (err: any) {
      setError(err.message || '发送验证码失败');
    } finally {
      setCodeLoading(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) return;
    if (!isPasswordStrongEnough(password)) return;
    if (!code) return;

    setIsLoading(true);
    setError(null);
    try {
      await httpClient.post('/api/auth/reset-password', { email, code, password });
      setSuccess(true);
      setTimeout(() => onBackToLogin(), 2000);
    } catch (err: any) {
      setError(err.message || '重置密码失败');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  const codeButtonDisabled = codeLoading || codeCooldown > 0;

  const getCodeButtonText = () => {
    if (codeLoading) return <FontAwesomeIcon icon={faSpinner} spin />;
    if (codeCooldown > 0) return `${codeCooldown}s`;
    return '重新发送';
  };

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center"
      onClick={handleOverlayClick}
    >
      <div className="bg-theme-black border border-theme-gray3 rounded-lg shadow-2xl w-[380px] overflow-hidden">
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-theme-gray3">
          <div className="flex items-center gap-2">
            <button
              onClick={onBackToLogin}
              className="text-theme-gray5 hover:text-theme-white bg-transparent border-none cursor-pointer text-sm p-1"
              title="返回登录"
            >
              <FontAwesomeIcon icon={faArrowLeft} />
            </button>
            <h2 className="text-theme-white text-lg font-medium m-0">重置密码</h2>
          </div>
          <button
            onClick={onClose}
            className="text-theme-gray5 hover:text-theme-white bg-transparent border-none cursor-pointer text-lg p-1"
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>

        {/* 第一步：输入邮箱获取验证码 */}
        {step === 'email' && (
          <form onSubmit={(e) => { e.preventDefault(); handleSendCode(); }} className="px-5 py-6 flex flex-col gap-4">
            <p className="text-theme-gray5 text-xs m-0">输入注册邮箱获取验证码。</p>

            <div className="flex flex-col gap-1.5">
              <label className="text-theme-gray5 text-xs">邮箱</label>
              <div className="flex items-center gap-2 bg-theme-gray1 rounded px-3 py-2 border border-theme-gray3 focus-within:border-theme-green transition-colors">
                <FontAwesomeIcon icon={faEnvelope} className="text-theme-gray5 text-sm shrink-0" />
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

            {error && <p className="text-red-400 text-xs m-0">{error}</p>}

            <button
              type="submit"
              disabled={!email || codeLoading}
              className="w-full bg-theme-green text-theme-black border-none rounded py-2.5 text-sm font-medium cursor-pointer hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-opacity"
            >
              {codeLoading ? <FontAwesomeIcon icon={faSpinner} spin /> : null}
              获取验证码
            </button>

            <div className="text-center">
              <button
                type="button"
                onClick={onBackToLogin}
                className="text-theme-green bg-transparent border-none cursor-pointer p-0 underline text-xs"
              >
                返回登录
              </button>
            </div>
          </form>
        )}

        {/* 第二步：输入验证码和新密码 */}
        {step === 'reset' && (
          <form onSubmit={handleReset} className="px-5 py-6 flex flex-col gap-4">
            {/* 成功提示 */}
            {success && (
              <div className="flex items-center gap-2 bg-green-900/30 border border-green-700 rounded px-3 py-2.5">
                <FontAwesomeIcon icon={faCheckCircle} className="text-theme-green text-sm" />
                <span className="text-theme-green text-sm">密码重置成功！跳转登录...</span>
              </div>
            )}

            <div className="flex items-center gap-2 bg-theme-gray1 rounded px-3 py-2 border border-theme-gray3">
              <FontAwesomeIcon icon={faEnvelope} className="text-theme-gray5 text-sm shrink-0" />
              <span className="text-theme-white text-sm">{email}</span>
            </div>

            {/* 验证码 */}
            <div className="flex flex-col gap-1.5">
              <label className="text-theme-gray5 text-xs">验证码</label>
              <div className="flex gap-2">
                <div className="flex items-center gap-2 bg-theme-gray1 rounded px-3 py-2 border border-theme-gray3 focus-within:border-theme-green transition-colors flex-1 min-w-0">
                  <FontAwesomeIcon icon={faShield} className="text-theme-gray5 text-sm shrink-0" />
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

            {/* 新密码 */}
            <div className="flex flex-col gap-1.5">
              <label className="text-theme-gray5 text-xs">新密码</label>
              <div className="flex items-center gap-2 bg-theme-gray1 rounded px-3 py-2 border border-theme-gray3 focus-within:border-theme-green transition-colors">
                <FontAwesomeIcon icon={faLock} className="text-theme-gray5 text-sm shrink-0" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="flex-1 bg-transparent border-none outline-none text-theme-white text-sm placeholder:text-theme-gray5 min-w-0"
                />
              </div>
              {passwordStrength && (
                <PasswordStrengthBar result={passwordStrength} visible={password.length > 0} />
              )}
            </div>

            {/* 确认新密码 */}
            <div className="flex flex-col gap-1.5">
              <label className="text-theme-gray5 text-xs">确认新密码</label>
              <div className="flex items-center gap-2 bg-theme-gray1 rounded px-3 py-2 border border-theme-gray3 focus-within:border-theme-green transition-colors">
                <FontAwesomeIcon icon={faLock} className="text-theme-gray5 text-sm shrink-0" />
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

            {confirmPassword && password !== confirmPassword && (
              <p className="text-red-400 text-xs m-0">两次密码输入不一致</p>
            )}

            {passwordStrength && passwordStrength.score >= 50 && passwordStrength.score < 70 && (
              <p className="text-yellow-400 text-xs m-0">密码强度一般，建议使用更强的密码</p>
            )}

            {error && <p className="text-red-400 text-xs m-0">{error}</p>}

            <button
              type="submit"
              disabled={isLoading || !code || password !== confirmPassword || !isPasswordStrongEnough(password) || success}
              className="w-full bg-theme-green text-theme-black border-none rounded py-2.5 text-sm font-medium cursor-pointer hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-opacity"
            >
              {isLoading ? <FontAwesomeIcon icon={faSpinner} spin /> : null}
              重置密码
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default ForgotPasswordPanel;
