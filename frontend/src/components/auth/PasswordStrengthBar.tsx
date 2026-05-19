import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheckCircle, faXmarkCircle } from '@fortawesome/free-solid-svg-icons';
import type { PasswordStrengthResult } from '../../utils/passwordStrength';

interface PasswordStrengthBarProps {
  result: PasswordStrengthResult;
  visible: boolean;
}

function PasswordStrengthBar({ result, visible }: PasswordStrengthBarProps) {
  if (!visible) return null;

  const { score, levelLabel, color, checks, feedback } = result;
  const percent = Math.min((score / 105) * 100, 100);

  const checkItems = [
    { key: 'minLength8' as const, label: '至少 8 个字符' },
    { key: 'hasUpper' as const, label: '包含大写字母' },
    { key: 'hasLower' as const, label: '包含小写字母' },
    { key: 'hasDigit' as const, label: '包含数字' },
    { key: 'hasSpecial' as const, label: '包含特殊字符' },
  ];

  return (
    <div className="flex flex-col gap-2 mt-2">
      {/* 强度条 */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-theme-gray1 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-300 ease-out"
            style={{ width: `${percent}%`, backgroundColor: color }}
          />
        </div>
        <span className="text-xs font-medium shrink-0" style={{ color }}>
          {levelLabel}
        </span>
      </div>

      {/* 要求清单 */}
      <div className="flex flex-col gap-1">
        {checkItems.map((item) => {
          const done = checks[item.key];
          // 特殊处理长度，两个检查合并显示
          if (item.key === 'minLength8') {
            return (
              <div key={item.key} className="flex items-center gap-1.5">
                <FontAwesomeIcon
                  icon={checks.minLength8 || checks.minLength12 ? faCheckCircle : faXmarkCircle}
                  className={checks.minLength8 || checks.minLength12 ? 'text-theme-green text-xs' : 'text-red-400 text-xs'}
                />
                <span className="text-xs text-theme-gray5">至少 8 个字符</span>
                {checks.minLength12 && (
                  <span className="text-[10px] text-theme-green ml-1">(已超 12 个)</span>
                )}
              </div>
            );
          }
          return (
            <div key={item.key} className="flex items-center gap-1.5">
              <FontAwesomeIcon
                icon={done ? faCheckCircle : faXmarkCircle}
                className={done ? 'text-theme-green text-xs' : 'text-red-400 text-xs'}
              />
              <span className={`text-xs ${done ? 'text-theme-gray5' : 'text-red-400'}`}>
                {item.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* 分数不足提示（仅当密码非空且分数 < 50） */}
      {score > 0 && score < 50 && feedback.length > 0 && (
        <p className="text-red-400 text-xs m-0">
          密码强度不足，请完善以上要求
        </p>
      )}
    </div>
  );
}

export default PasswordStrengthBar;
