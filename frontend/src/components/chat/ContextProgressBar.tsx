import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '../../types';
import httpClient from '../../utils/httpClient';
import { setAllProvidersData, setSelectedModelId, setSelectedProviderId } from '../../store/provider';

const ContextProgressBar = () => {
  const dispatch = useDispatch();

  // 从Redux获取状态
  const allProvidersData = useSelector((state: RootState) => state.providerSlice.allProvidersData);
  const selectedProviderId = useSelector((state: RootState) => state.providerSlice.selectedProviderId);
  const selectedModelId = useSelector((state: RootState) => state.providerSlice.selectedModelId);
  const allModesData = useSelector((state: RootState) => state.modeSlice.allModesData);
  const selectedModeId = useSelector((state: RootState) => state.chatSlice.selectedModeId);

  // 自包含加载 provider 数据和选中的模型，不依赖其他组件
  useEffect(() => {
    const loadData = async () => {
      try {
        const [providersResult, selectedModelData] = await Promise.all([
          httpClient.get('/api/provider/providers'),
          httpClient.get('/api/chat/selected-model'),
        ]);
        if (providersResult) {
          dispatch(setAllProvidersData(providersResult));
        }
        if (selectedModelData?.selectedModel) {
          dispatch(setSelectedModelId(selectedModelData.selectedModel));
        }
        if (selectedModelData?.selectedProvider) {
          dispatch(setSelectedProviderId(selectedModelData.selectedProvider));
        }
      } catch (error) {
        console.error('[ContextProgressBar] 加载数据失败:', error);
      }
    };
    loadData();
  }, [dispatch]);
  
  // 从state获取最新AI消息的tokens
  const currentTokens = useSelector((state: RootState) => {
    const messages = state.chatSlice.state?.values?.messages || [];
    const lastAiMessage = messages.filter(msg => msg.role === 'assistant').pop();
    if (!lastAiMessage) return 0;
    
    // 从usage_metadata获取输入token数（即上下文实际占用）
    if (lastAiMessage.usage_metadata?.input_tokens) {
      return lastAiMessage.usage_metadata.input_tokens;
    }
    
    return 0;
  });

  // 计算当前模型的最大上下文长度
  const getModelContextLength = (): number => {
    if (!selectedProviderId || !selectedModelId) return 0;
    const providerData = allProvidersData[selectedProviderId as string];
    if (!providerData) return 0;
    const contextLength = providerData.favoriteModels?.chat?.[selectedModelId as string];
    return typeof contextLength === 'number' ? contextLength : 0;
  };

  // 获取当前模式的上下文比例
  const getModeContextRatio = (): number => {
    if (!selectedModeId || !allModesData[selectedModeId]) return 0.8;
    return allModesData[selectedModeId].context_ratio ?? 0.8;
  };

  const modelContextLength = getModelContextLength();
  const modeContextRatio = getModeContextRatio();

  // 上下文比例标记点（百分比位置）
  const modePercentage = modeContextRatio * 100;

  return (
    <div className="px-2.5 py-1.5 border-b border-theme-gray1">
      <div className="flex items-center gap-2">
        <span className="text-theme-white text-[12px] whitespace-nowrap">上下文占用:</span>
        <div className="flex-1 h-4 bg-theme-gray1 rounded-small relative overflow-hidden">
          {/* 背景进度条（模型最大上下文） */}
          <div className="h-full bg-theme-gray3 rounded-small" style={{ width: '100%' }}></div>
          
          {/* 模式上下文比例标记点 */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-theme-green"
            style={{ left: `${modePercentage}%` }}
            title={`上下文比例: ${Math.round(modeContextRatio * 100)}%`}
          ></div>
          
          {/* 当前使用tokens进度条 */}
          <div
            className="absolute top-0 bottom-0 left-0 bg-theme-green/50 rounded-small transition-all duration-300"
            style={{ width: `${Math.min((currentTokens / modelContextLength) * 100, 100)}%` }}
          ></div>
        </div>
        <span className="text-theme-white text-[12px] whitespace-nowrap">
          {currentTokens.toLocaleString()} / {modelContextLength.toLocaleString()}
        </span>
      </div>
    </div>
  );
};

export default ContextProgressBar;
