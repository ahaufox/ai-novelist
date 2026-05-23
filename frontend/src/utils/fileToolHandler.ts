/**
 * 文件工具处理器
 *
 * 处理 AI 的 edit/write 工具调用，在前端计算修改结果并显示 diff 预览。
 *
 * 核心逻辑：
 * - edit: 前端复现搜索替换匹配，计算修改后的内容，显示 diff 视图
 * - write: 显示文件将被创建/覆写的预览
 *
 * HITL 流程：
 * 1. AI 提议修改 → 前端计算预览 → 显示 diff
 * 2. 用户审查 → 可手动编辑
 * 3. 用户批准 → 前端将最终内容通过 final_content 发给后端
 * 4. 后端直接写入，不做任何 diff 计算
 */

import { useDispatch, useStore } from 'react-redux';
import { useRef } from 'react';
import { addTempFile } from '../store/file';
import { createTempDiffTab, updateBackUp, setAiSuggestContent } from '../store/editor';
import type { RootState } from '../types';
import { findMatchingString, computeEditResult } from './editMatcher';
import httpClient from './httpClient';
import { createPathStabilizer } from './paramStabilizer';
import { tryCompleteJSON } from './jsonUtils';

// 支持的文件工具列表
export const FILE_TOOLS = ['edit', 'write'];

// 需要显示 diff 预览的工具
const DIFF_TOOLS = ['edit', 'write'];

// ==================== 自定义 Hook ====================

export const useFileToolHandler = () => {
  const dispatch = useDispatch();
  const store = useStore();
  const pathStabilizerRef = useRef<ReturnType<typeof createPathStabilizer> | null>(null);

  // 获取文件内容（优先使用前端状态中的缓存）
  const fetchFileContent = async (path: string): Promise<string> => {
    try {
      const editorState = (store.getState() as RootState).tabSlice;
      const cachedContent = editorState.backUp[path];

      if (cachedContent !== undefined) {
        return cachedContent;
      }

      const result = await httpClient.get(`/api/file/read/${encodeURIComponent(path)}`);
      const content = result?.content || '';

      dispatch(updateBackUp({ id: path, content }));
      return content;
    } catch (error) {
      console.error(`读取文件 ${path} 失败:`, error);
      dispatch(updateBackUp({ id: path, content: '' }));
      return '';
    }
  };

  // 获取文件路径（兼容 edit 的 filePath 和 write 的 filePath）
  const getFilePath = (toolName: string, args: any): string | undefined => {
    return args.filePath || args.path;
  };

  // 处理文件工具调用
  const handleFileToolCall = async (toolName: string, args: any, isPartial: boolean = false) => {
    const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
    const path = getFilePath(toolName, parsedArgs);

    // 路径稳定检测（针对流式传输中的不完整路径）
    if (isPartial) {
      if (!pathStabilizerRef.current) {
        pathStabilizerRef.current = createPathStabilizer();
      }
      if (!pathStabilizerRef.current(path)) {
        return;
      }
    } else {
      pathStabilizerRef.current = null;
    }

    if (!path) return;

    // 获取原文件内容
    const originalContent = await fetchFileContent(path);

    // 根据工具类型计算修改后的内容
    switch (toolName) {
      case 'edit': {
        const { oldString, newString, replaceAll } = parsedArgs;

        if (oldString === undefined || newString === undefined) break;

        // 前端复现搜索替换逻辑
        const result = computeEditResult(originalContent, oldString, newString, replaceAll || false);

        if (!result.success) {
          console.warn(`edit 预览失败: ${result.error}`);
          // 即使匹配失败，也创建 diff 标签让用户看到错误信息
          dispatch(createTempDiffTab({
            id: path,
            originalContent,
            modifiedContent: originalContent,
          }));
          return;
        }

        // 创建 diff 标签页
        dispatch(createTempDiffTab({
          id: path,
          originalContent,
          modifiedContent: result.result,
        }));
        // 保存 AI 建议的内容快照，用于批准时计算用户修改 diff
        dispatch(setAiSuggestContent({ id: path, content: result.result }));
        break;
      }

      case 'write': {
        const { content } = parsedArgs;
        if (content === undefined) break;

        // 添加临时文件到文件树
        dispatch(addTempFile({ path }));

        // write 直接显示新内容 vs 原内容（如果文件存在）
        dispatch(createTempDiffTab({
          id: path,
          originalContent,
          modifiedContent: content,
        }));
        // 保存 AI 建议的内容快照，用于批准时计算用户修改 diff
        dispatch(setAiSuggestContent({ id: path, content }));
        break;
      }
    }
  };

  // 处理 AI 消息中的文件工具调用
  const processFileToolCalls = async (toolCalls: any[]) => {
    for (const toolCall of toolCalls) {
      const toolName = toolCall.function?.name;

      if (FILE_TOOLS.includes(toolName || '')) {
        const argsStr = toolCall.function?.arguments || '';
        let parsed: any;
        let isPartial = false;
        try {
          parsed = JSON.parse(argsStr);
        } catch {
          // 参数不完整，用 tryCompleteJSON 补全
          parsed = JSON.parse(tryCompleteJSON(argsStr));
          isPartial = true;
        }
        await handleFileToolCall(toolName || '', parsed, isPartial);
      }
    }
  };

  return { processFileToolCalls };
};

/**
 * 获取工具的 final_content（用于批准时发送给后端）
 *
 * @param toolName 工具名称
 * @param modifiedContent 用户确认后的最终内容（可能已被用户修改）
 * @returns final_content 字符串，或 undefined
 */
export function getFinalContent(
  toolName: string,
  modifiedContent: string | undefined,
): string | undefined {
  if (!DIFF_TOOLS.includes(toolName)) return undefined;
  return modifiedContent;
}
