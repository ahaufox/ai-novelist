import { useState, useEffect, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEnvelope, faSpinner, faXmark, faArrowLeft, faKey } from '@fortawesome/free-solid-svg-icons';
import httpClient from '../../utils/httpClient';

interface ForgotPasswordPanelProps {
  onClose: () => void;
  onBackToLogin: () => void;
}

function ForgotPasswordPanel({ onClose, onBackToLogin }: ForgotPasswordPanelProps) {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 倒计时 effect：cooldown > 0 时每秒减 1
  useEffect(() => {
    if (cooldown <= 0) return;
    cooldownRef.current = setInterval(() => {
      setCooldown((prev) => {
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
  }, [cooldown]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      await httpClient.post('/api/auth/forgot-password', { email });
      setSent(true);
      setCooldown(30);
    } catch (err: any) {
      setError(err.message || '发送失败');
      setCooldown(30);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  const isButtonDisabled = isLoading || cooldown > 0;

  const getButtonText = () => {
    if (isLoading) return <FontAwesomeIcon icon={faSpinner} spin />;
    if (cooldown > 0) return `重新发送 (${cooldown}s)`;
    return sent ? '重新发送' : '发送重置邮件';
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
            <h2 className="text-theme-white text-lg font-medium m-0">忘记密码</h2>
          </div>
          <button
            onClick={onClose}
            className="text-theme-gray5 hover:text-theme-white bg-transparent border-none cursor-pointer text-lg p-1"
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-6 flex flex-col gap-4">
          <p className="text-theme-gray5 text-xs m-0">输入注册邮箱，我们将发送重置链接。</p>

          {/* 成功提示 */}
          {sent && (
            <div className="flex items-center gap-2 bg-green-900/30 border border-green-700 rounded px-3 py-2.5">
              <FontAwesomeIcon icon={faKey} className="text-theme-green text-sm" />
              <span className="text-theme-green text-sm">密码重置邮件已发送，请检查邮箱</span>
            </div>
          )}

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

          {error && <p className="text-red-400 text-xs m-0">{error}</p>}

          <button
            type="submit"
            disabled={isButtonDisabled}
            className="w-full bg-theme-green text-theme-black border-none rounded py-2.5 text-sm font-medium cursor-pointer hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-opacity"
          >
            {getButtonText()}
          </button>

          <div className="text-center">
            <button
              type="button"
              onClick={onBackToLogin}
              className="text-theme-green bg-transparent border-none cursor-pointer p-0 underline text-xs"
            >
              已完成密码重置？点击回到登录页面
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ForgotPasswordPanel;
