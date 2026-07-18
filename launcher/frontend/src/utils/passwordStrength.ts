/**
 * 密码强度评估工具
 *
 * 评分规则（满分 105）：
 *   - 长度 ≥ 8:   +25
 *   - 长度 ≥ 12:  +15 (额外)
 *   - 包含大写:    +15
 *   - 包含小写:    +15
 *   - 包含数字:    +15
 *   - 包含特殊字符: +20
 */

export type PasswordLevel = 'very_weak' | 'weak' | 'fair' | 'strong' | 'very_strong';

export interface PasswordStrengthResult {
  /** 评分 0-105 */
  score: number;
  /** 强度等级 */
  level: PasswordLevel;
  /** 中文等级标签 */
  levelLabel: string;
  /** 等级对应颜色 */
  color: string;
  /** 各项检查明细 */
  checks: {
    minLength8: boolean;
    minLength12: boolean;
    hasUpper: boolean;
    hasLower: boolean;
    hasDigit: boolean;
    hasSpecial: boolean;
  };
  /** 改进建议列表 */
  feedback: string[];
}

const SPECIAL_CHARS = "!@#$%^&*()_+-=[]{}|;':\",./<>?";

/**
 * 评估密码强度
 */
export function evaluatePasswordStrength(password: string): PasswordStrengthResult {
  const checks = {
    minLength8: password.length >= 8,
    minLength12: password.length >= 12,
    hasUpper: /[A-Z]/.test(password),
    hasLower: /[a-z]/.test(password),
    hasDigit: /\d/.test(password),
    hasSpecial: new RegExp(`[${escapeRegex(SPECIAL_CHARS)}]`).test(password),
  };

  let score = 0;
  if (checks.minLength8) score += 25;
  if (checks.minLength12) score += 15;
  if (checks.hasUpper) score += 15;
  if (checks.hasLower) score += 15;
  if (checks.hasDigit) score += 15;
  if (checks.hasSpecial) score += 20;

  const { level, levelLabel, color } = getLevelInfo(score);

  const feedback: string[] = [];
  if (!checks.minLength8) feedback.push('至少 8 个字符');
  if (!checks.hasUpper) feedback.push('至少包含一个大写字母');
  if (!checks.hasLower) feedback.push('至少包含一个小写字母');
  if (!checks.hasDigit) feedback.push('至少包含一个数字');
  if (!checks.hasSpecial) feedback.push('至少包含一个特殊字符');

  return { score, level, levelLabel, color, checks, feedback };
}

/**
 * 密码是否达到注册最低门槛（≥ 50 分，即 "一般" 及以上）
 */
export function isPasswordStrongEnough(password: string): boolean {
  return evaluatePasswordStrength(password).score >= 50;
}

function getLevelInfo(score: number): {
  level: PasswordLevel;
  levelLabel: string;
  color: string;
} {
  if (score >= 90) return { level: 'very_strong', levelLabel: '非常强', color: '#16a34a' };
  if (score >= 70) return { level: 'strong', levelLabel: '强', color: '#22c55e' };
  if (score >= 50) return { level: 'fair', levelLabel: '一般', color: '#eab308' };
  if (score >= 30) return { level: 'weak', levelLabel: '弱', color: '#f97316' };
  return { level: 'very_weak', levelLabel: '极弱', color: '#ef4444' };
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
