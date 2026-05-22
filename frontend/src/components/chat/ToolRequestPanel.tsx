import { useSelector, useDispatch, useStore } from 'react-redux';
import { readBinaryFrames } from '../../utils/binaryFrameReader';
import { useEffect, useRef, useCallback } from 'react';
import type { RootState } from '../../types';
import type { ToolCall } from '../../types/langgraph';
import { setIsStreaming, createAiMessage, updateAiMessage, addUserMessage, setMessage, setMessagesTree } from '../../store/chat';
import { exitDiffMode, saveTabContent, decreaseTab, clearAiSuggestContent } from '../../store/editor';
import { FILE_TOOLS, useFileToolHandler } from '../../utils/fileToolHandler';
import { computeDiff, hasDiff } from '../../utils/diffUtils';
import httpClient from '../../utils/httpClient';

const ToolRequestPanel = () => {
  const dispatch = useDispatch();
  const store = useStore();
  // 直接读取后端计算的待审批工具，前端不做任何推导
  const currentToolRequest = useSelector((state: RootState) => state.chatSlice.nextPendingTool);
  const message = useSelector((state: RootState) => state.chatSlice.message);
  const autoApproveEnabled = useSelector((state: RootState) => state.chatSlice.autoApproveEnabled);
  const currentData = useSelector((state: RootState) => state.tabSlice.currentData);
  const aiSuggestContent = useSelector((state: RootState) => state.tabSlice.aiSuggestContent);
  const autoApproveRef = useRef(false);
  const processingRef = useRef(false);

  const { processFileToolCalls } = useFileToolHandler();

  // 日志
  useEffect(() => {
    if (currentToolRequest) {
      console.log(
        '%c[ToolRequestPanel] 待审批工具（后端计算）:',
        'color: #4ec9b0; font-weight: bold;',
        '\n  tool_call_id:', currentToolRequest.tool_call_id,
        '\n  tool_name:', currentToolRequest.tool_name,
        '\n  arguments:', currentToolRequest.arguments,
      );
    }
  }, [currentToolRequest]);

  // 处理工具调用
  const handleFunctionCalling = useCallback(async (approved: boolean) => {
    if (processingRef.current || !currentToolRequest) return;
    processingRef.current = true;

    const extra = message || '';
    const toolName = currentToolRequest.tool_name;
    const argsStr = currentToolRequest.arguments;

    dispatch(setMessage(''));

    // 计算用户对AI建议内容的修改 diff + final_content
    let userDiff: string | null = null;
    let finalContent: string | undefined = undefined;
    if (argsStr && FILE_TOOLS.includes(toolName)) {
      try {
        const args = JSON.parse(argsStr);
        const path: string | undefined = args.filePath || args.path;
        if (path) {
          if (approved) {
            const aiContent = aiSuggestContent[path];
            const currentContent = currentData[path];
            if (aiContent !== undefined && currentContent !== undefined && hasDiff(aiContent, currentContent)) {
              userDiff = computeDiff(aiContent, currentContent);
            }
            if (currentContent !== undefined) {
              finalContent = currentContent;
            }
            dispatch(saveTabContent({ id: path }));
          } else {
            dispatch(decreaseTab({ tabId: path }));
          }
          dispatch(exitDiffMode({ id: path }));
          dispatch(clearAiSuggestContent({ id: path }));
        }
      } catch (e) {
        console.error('解析工具参数失败:', e);
      }
    }

    if (extra) {
      dispatch(addUserMessage({ id: `lc_run--${crypto.randomUUID()}`, content: extra }));
    }

    try {
      dispatch(setIsStreaming(true));

      const response = await httpClient.streamRequest('/api/chat2/function_calling', {
        method: 'POST',
        body: {
          tool_call_id: currentToolRequest.tool_call_id,
          approved,
          user_extra: extra,
          user_diff: userDiff || undefined,
          final_content: finalContent,
        }
      } as any);

      if (!response.ok) throw new Error('工具调用请求失败');

      const reader = response.body!.getReader();
      let currentAiMessageId: string | null = null;
      let newAiResponse = '';
      const toolCallChunksMap = new Map<number, { name?: string; args: string; id?: string }>();

      await readBinaryFrames(reader, (parsed) => {
        if (parsed.interrupted) {
          dispatch(setIsStreaming(false));
          return;
        }

        if (parsed.type === 'state_update') {
          console.log("正常进入state_update", parsed.next_pending_tool);
          dispatch(setMessagesTree({
            messages: parsed.messages as any,
            active_leaf: parsed.active_leaf as string | null,
            active_path: parsed.active_path as any,
            branch_points: parsed.branch_points as any,
            summaries: parsed.summaries as any,
            next_pending_tool: parsed.next_pending_tool as any,
          }));
          return;
        }

        if (parsed.content !== undefined || parsed.tool_calls) {
          if (!currentAiMessageId && (parsed.content || (parsed.tool_calls as any[])?.length)) {
            currentAiMessageId = `temp-ai-${Date.now()}`;
            dispatch(createAiMessage({ id: currentAiMessageId }));
          }

          if (parsed.content) {
            newAiResponse += parsed.content as string;
            if (currentAiMessageId) {
              dispatch(updateAiMessage({ id: currentAiMessageId, content: newAiResponse }));
            }
          }

          if (parsed.tool_calls && (parsed.tool_calls as any[]).length > 0) {
            for (const tc of parsed.tool_calls as any[]) {
              const index = tc.index ?? 0;
              toolCallChunksMap.set(index, {
                id: tc.id || toolCallChunksMap.get(index)?.id || '',
                name: tc.function?.name || toolCallChunksMap.get(index)?.name || '',
                args: tc.function?.arguments || ''
              });
            }

            const rawToolCalls: ToolCall[] = [];
            for (const [, existing] of toolCallChunksMap.entries()) {
              rawToolCalls.push({
                id: existing.id || 'unknown',
                type: 'function',
                function: { name: existing.name || 'unknown', arguments: existing.args }
              });
            }
            if (rawToolCalls.length > 0) {
              processFileToolCalls(rawToolCalls);
            }
          }
        }
      });
    } catch (error) {
      console.error('工具调用失败:', error);
    } finally {
      dispatch(setIsStreaming(false));
      processingRef.current = false;
    }
  }, [dispatch, store, currentToolRequest, message, aiSuggestContent, currentData, processFileToolCalls]);

  // 自动批准
  useEffect(() => {
    if (autoApproveEnabled && currentToolRequest && !autoApproveRef.current) {
      autoApproveRef.current = true;
      const timer = setTimeout(() => {
        handleFunctionCalling(true);
        autoApproveRef.current = false;
      }, 1000);
      return () => clearTimeout(timer);
    } else if (!currentToolRequest) {
      autoApproveRef.current = false;
    }
  }, [currentToolRequest, autoApproveEnabled, handleFunctionCalling]);

  // 解析工具参数用于渲染
  const toolArgs = currentToolRequest?.arguments
    ? (() => {
        try { return JSON.parse(currentToolRequest.arguments); }
        catch { return null; }
      })()
    : null;

  const renderQuestions = () => {
    if (!toolArgs?.questions) return null;
    const questions = toolArgs.questions as Array<{ question: string; options?: string[] }>;
    return (
      <div className="text-[13px] text-theme-white space-y-2 py-2">
        {questions.map((q, i) => (
          <div key={i} className="space-y-1">
            <div className="font-medium">{q.question}</div>
            {q.options && q.options.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-1">
                {q.options.map((opt, j) => (
                  <span key={j} className="text-theme-gray3 bg-theme-gray2 px-2 py-0.5 rounded">{opt}</span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="w-full bg-theme-gray1 p-2 space-y-2">
      {currentToolRequest && (
        <>
          <div className="text-theme-green text-[13px] font-medium">
            工具请求: {currentToolRequest.tool_name}
          </div>
          {currentToolRequest.tool_name === 'question' && renderQuestions()}
          <div className="flex gap-4">
            <button
              className="flex-1 text-theme-white border-none rounded-small py-2 px-4 text-[13px] font-medium cursor-pointer transition-all hover:border-1 hover:border-solid hover:border-theme-green hover:text-theme-green"
              onClick={() => handleFunctionCalling(true)}
            >
              批准
            </button>
            <button
              className="flex-1 text-theme-white border-none rounded-small py-2 px-4 text-[13px] font-medium cursor-pointer transition-all hover:border-1 hover:border-solid hover:border-theme-red hover:text-theme-red"
              onClick={() => handleFunctionCalling(false)}
            >
              取消
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default ToolRequestPanel;
