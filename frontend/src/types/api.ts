/**
 * API 相关类型定义
 */

// ==================== Auth API 类型 ====================

/** 发送验证码请求（注册/重置共用） */
export interface SendCodeRequest {
  email: string;
}

/** 注册请求 */
export interface RegisterRequest {
  email: string;
  password: string;
  code: string;
}

/** 登录请求 */
export interface LoginRequest {
  username: string; // 邮箱地址
  password: string;
}

/** 重置密码请求 */
export interface ResetPasswordRequest {
  email: string;
  code: string;
  password: string;
}

/** 用户信息 */
export interface UserInfo {
  id: string;
  email: string;
  is_active: boolean;
  is_superuser: boolean;
  is_verified: boolean;
}

/** API 错误响应 */
export interface ApiError {
  detail: string;
}

// ==================== 通用 API 类型 ====================

/** 通用 API 响应 */
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/** 分页请求参数 */
export interface PaginationParams {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/** 分页响应 */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** 搜索请求 */
export interface SearchRequest {
  query: string;
  scope?: 'all' | 'current' | 'selected';
  caseSensitive?: boolean;
  wholeWord?: boolean;
  useRegex?: boolean;
}

/** 搜索结果 */
export interface SearchResult {
  path: string;
  content: string;
  lineNumber?: number;
  column?: number;
}

/** 文件操作请求 */
export interface FileOperationRequest {
  path: string;
  content?: string;
  encoding?: string;
}

/** 重命名/移动请求 */
export interface RenameRequest {
  oldPath: string;
  newPath: string;
}

/** 健康检查状态 */
export interface HealthStatus {
  isOnline: boolean;
  lastCheckTime: Date | null;
}

// ==================== Git Checkpoint API 类型 ====================

/** API 返回的存档点数据 */
export interface ApiCheckpoint {
  commit_hash: string;
  short_hash: string;
  message: string;
}

/** API 返回的文件变更数据 */
export interface ApiFileChange {
  path: string;
  change_type: string;  // 'M'=修改, 'A'=新增, 'D'=删除
  old_content?: string;
  new_content?: string;
}

/** API 返回的 Git 变更数据 */
export interface ApiGitChange {
  path: string;
  change_type: string;  // 'M'=修改, 'A'=新增, 'D'=删除
}

/** API 返回的 Git 状态数据 */
export interface ApiGitStatus {
  branch: string;
  dirty: boolean;
  untracked_files: string[];
  modified_files: string[];
  changes: ApiGitChange[];
}

// ==================== 文件工具类型 ====================

/** edit 工具参数 */
export interface EditToolParams {
  filePath: string;
  oldString: string;
  newString: string;
  replaceAll?: boolean;
}

/** write 工具参数 */
export interface WriteToolParams {
  filePath: string;
  content: string;
}

/** shell 工具参数 */
export interface ShellToolParams {
  command: string;
  description: string;
  timeout?: number;
  workdir?: string;
}

/** question 工具参数 */
export interface QuestionToolParams {
  questions: Array<{
    question: string;
    options?: string[];
  }>;
}
