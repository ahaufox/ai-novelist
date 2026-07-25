"""
系统提示词构建器
负责构建包含文件树结构和持久记忆的完整系统提示词

架构说明：
- 系统提示词 (SystemMessage): 静态核心指令，变化极少
- 上下文消息 (HumanMessage): 动态环境信息，拼接到消息列表末尾
"""

import os
import re
import time
from pathlib import Path
from typing import Optional, List, Tuple
import logging

from backend.settings.settings import settings
from backend.file.file_service import get_file_tree_for_ai, read_file, resolve_file_path, normalize_to_absolute
from backend.ai_agent.embedding import get_all_knowledge_bases, asearch_emb, get_two_step_rag_config
from backend.ai_agent.skill import get_skill_loader
from backend.ai_agent.utils.file_utils import split_paragraphs, format_file_with_hashes
from backend.websocket.handlers.tab_handler import request_tab_state, format_tab_state_for_prompt

logger = logging.getLogger(__name__)


def _log_step(step_name: str, start: float):
    """记录单个步骤的耗时"""
    elapsed = time.perf_counter() - start
    logger.info(f"[耗时] {step_name}: {elapsed*1000:.1f}ms")


class SystemPromptBuilder:
    """系统提示词构建器"""
    
    def __init__(self):
        self.data_dir = settings.DATA_DIR
        self.file_tree_cache = None
        self.last_cache_time = None
        self.cache_timeout = 30  # 缓存30秒
    
    def _extract_at_paths(self, user_input: str) -> List[str]:
        """从用户输入中提取 @+路径 模式的路径列表
        
        匹配规则：@后面跟随的路径不包含空格或换行
        例如："请查看 @folder/file.txt 和 @readme.md" -> ["folder/file.txt", "readme.md"]
        
        Args:
            user_input: 用户输入文本
            
        Returns:
            提取的文件路径列表（去重）
        """
        if not user_input:
            return []
        
        # 匹配 @ 后面跟随的非空白字符（路径），贪婪匹配以获取完整路径
        # 路径可以包含字母、数字、下划线、连字符、点、斜杠、反斜杠、冒号（支持Windows绝对路径如 C:\）
        pattern = r'@(\S+)'
        matches = re.findall(pattern, user_input)
        
        # 清理路径：去除末尾的标点符号（逗号、句号、感叹号、问号、括号等）
        cleaned_paths = []
        for path in matches:
            path = path.rstrip('.,!?;:，。！？；：、\'"）)》】】')
            if path:
                cleaned_paths.append(path)
        
        # 去重并保持顺序
        seen = set()
        unique_paths = []
        for path in cleaned_paths:
            if path not in seen:
                seen.add(path)
                unique_paths.append(path)
        
        return unique_paths
    
    def _get_skills_info(self, mode: str) -> str:
        """获取所有已安装 Skills 的简要信息（仅名称和描述）
        
        不再依赖 store.yaml 中的 "skills" 配置键，
        直接读取 data/skills/ 目录下所有已安装的 Skill。
        
        Args:
            mode: 模式名称（保留参数，暂未使用）
            
        Returns:
            格式化的 Skills 简要信息字符串
        """
        try:
            # 直接加载所有已安装的 Skills
            skill_loader = get_skill_loader()
            all_skills = skill_loader.load_all_skills()
            
            if not all_skills:
                return ""
            
            skills_list = list(all_skills.values())
            
            # 格式化 Skills 简要信息（只显示名称和描述）
            return skill_loader.format_skills_for_prompt(skills_list)
            
        except Exception as e:
            logger.error(f"获取 Skills 信息失败: {e}")
            return ""
    
    # _get_loaded_skills_content 已移除。
    # 不再持久化加载 skill 内容到系统环境。
    # AI 通过 skill tool 按需加载 skill 内容。
    
    def _get_knowledge_bases_info(self) -> str:
        """获取知识库列表信息
        
        Returns:
            格式化的知识库列表信息字符串
        """
        try:
            knowledge_bases = get_all_knowledge_bases()
            
            if not knowledge_bases:
                return ""
            
            # 构建格式化的知识库列表
            kb_parts = []
            for kb_id, kb_config in knowledge_bases.items():
                name = kb_config.get("name", "")
                
                if name:
                    kb_parts.append(f"id: {kb_id}\nname: {name}")
            
            if kb_parts:
                return "\n\n".join(kb_parts)
            else:
                return ""
                
        except Exception as e:
            logger.error(f"获取知识库列表信息失败: {e}")
            return ""
    
    async def _perform_rag_search(self, user_input: str) -> str:
        """执行RAG检索，获取相关文档内容
        
        Args:
            user_input: 用户输入文本，作为检索查询
            
        Returns:
            格式化的RAG检索结果字符串
        """
        try:
            _t = time.perf_counter()
            # 获取两步RAG配置
            rag_config = get_two_step_rag_config()
            kb_id = rag_config.get("id")
            kb_name = rag_config.get("name")
            
            if not kb_id:
                logger.info("未配置两步RAG知识库，跳过RAG检索")
                return ""
            
            # 验证知识库是否存在
            knowledge_bases = get_all_knowledge_bases()
            if kb_id not in knowledge_bases:
                logger.warning(f"配置的知识库 {kb_name} (ID: {kb_id}) 不存在，跳过RAG检索")
                return ""
            _log_step("RAG - 获取配置和验证知识库", _t)
            logger.info(f"使用配置的知识库进行RAG检索: {kb_name} (ID: {kb_id})")

            # 执行异步检索
            _t = time.perf_counter()
            results = await asearch_emb(
                collection_name=kb_id,
                search_input=user_input
            )
            _log_step("RAG - asearch_emb 检索", _t)
            
            if not results:
                logger.info("RAG检索未返回结果")
                return ""
            
            # 格式化检索结果
            _t = time.perf_counter()
            rag_parts = []
            for doc, score in results:
                filename = doc.metadata.get('original_filename', '未知文件')
                rag_parts.append(f"[来源: {filename}, 相似度: {score:.4f}]\n{doc.page_content}")
            
            rag_content = "\n\n".join(rag_parts)
            _log_step("RAG - 格式化结果", _t)
            logger.info(f"RAG检索完成，共找到 {len(results)} 条相关文档")
            
            return rag_content
            
        except Exception as e:
            logger.error(f"RAG检索失败: {e}")
            return ""
    
    async def get_file_tree_content(self) -> str:
        """获取格式化的文件树内容
         
        Returns:
            格式化的文件树文本，如：
            ```
            [当前工作区文件结构]:
            - 文件夹1/
              - 文件1.txt
              - 文件2.txt
            - 文件2.txt
            ```
        """
        try:
            # 获取data目录路径
            data_path = self.data_dir
             
            # 确保data目录存在
            os.makedirs(data_path, exist_ok=True)
             
            # 获取文件树（返回 FileTreeResult 对象，包含统计信息）
            from backend.file.smart_file_tree import format_tree_for_prompt
            file_tree_result = await get_file_tree_for_ai(data_path, data_path)
             
            # 格式化文件树为文本，包含统计信息让AI了解显示范围
            tree_text = format_tree_for_prompt(file_tree_result, data_path)
             
            # 如果文件树为空，显示"暂无文件"
            if not file_tree_result.tree:
                tree_text = "[当前工作区文件结构]:\n暂无文件"
             
            return tree_text
             
        except Exception as e:
            logger.error(f"获取文件树内容时出错: {e}")
            return "[当前工作区文件结构]:\n(获取文件树出错)"
    
    def _format_tree_to_text(self, nodes: list, indent: int = 0) -> str:
        """将文件树节点格式化为文本
        
        Args:
            nodes: 文件树节点列表
            indent: 缩进级别
            
        Returns:
            格式化的文本
        """
        lines = []
        indent_str = "  " * indent
        
        for node in nodes:
            if node.get("isFolder", False):
                # 文件夹
                lines.append(f"{indent_str}- {node['title']}/")
                # 递归处理子节点
                children = node.get("children", [])
                if children:
                    children_text = self._format_tree_to_text(children, indent + 1)
                    lines.append(children_text)
            else:
                # 文件
                lines.append(f"{indent_str}- {node['title']}")
        
        return "\n".join(lines)
    
    async def build_system_prompt(
        self,
        mode: Optional[str] = None
    ) -> str:
        """构建静态系统提示词（SystemMessage）
        
        这部分内容变化极少，是真正的"系统级"指令
        
        Args:
            mode: 对话模式 (outline/writing/adjustment)
            
        Returns:
            静态系统提示词
        """
        try:
            # 基础系统提示词
            prompt_configs = settings.get_config("mode", mode, "prompt", default="你是一个AI助手，负责为用户解决各种需求。")
            
            logger.info(f"系统提示词构建完成，模式: {mode}")
            return prompt_configs
            
        except Exception as e:
            logger.error(f"构建系统提示词时出错: {e}")
            return settings.get_config("mode", mode, "prompt", default="你是一个AI助手，负责为用户解决各种需求。")
    
    async def _load_additional_info_files(self, mode: str) -> List[str]:
        """加载模式配置中 additionalInfo 指定的文件内容
        
        从 store.yaml 中读取当前模式的 additionalInfo 配置，
        遍历其中的文件路径，读取文件内容并格式化返回。
        
        Args:
            mode: 模式名称
            
        Returns:
            文件内容列表，每个元素是 "<文件路径>:\n<内容>" 的格式
        """
        try:
            # 获取当前模式的 additionalInfo 配置
            additional_info_paths = settings.get_config("mode", mode, "additionalInfo", default=[])
            
            if not additional_info_paths:
                return []
            
            file_contents = []
            for file_path in additional_info_paths:
                try:
                    # 读取文件内容
                    content = await read_file(file_path)
                    if content:
                        file_contents.append(f"[{file_path}]:\n{content}")
                    else:
                        logger.warning(f"additionalInfo 文件内容为空: {file_path}")
                except Exception as e:
                    logger.error(f"读取 additionalInfo 文件失败: {file_path}, 错误: {e}")
            
            return file_contents
            
        except Exception as e:
            logger.error(f"加载 additionalInfo 文件时出错: {e}")
            return []
    
    async def build_context_message(
        self,
        mode: Optional[str] = None,
        include_file_tree: bool = True,
        include_knowledge_bases: bool = True,
        include_loaded_files: bool = True,
        include_skills: bool = True,
        user_input: Optional[str] = None,
        enable_rag: bool = True,
        summary: Optional[str] = None
    ) -> str:
        """构建上下文消息内容（将作为末尾HumanMessage附加）
        
        这部分内容变化频繁，包含动态环境信息
        
        Args:
            mode: 对话模式
            include_file_tree: 是否包含文件树结构
            include_knowledge_bases: 是否包含知识库列表信息
            include_loaded_files: 是否包含已加载文件内容
            include_skills: 是否包含 Skills 信息
            user_input: 用户输入文本，用于RAG检索
            enable_rag: 是否启用RAG检索
            summary: 过往消息总结
            
        Returns:
            上下文消息内容字符串
        """
        try:
            context_parts = []
            _ctx_start = time.perf_counter()
            
            # 添加过往消息总结
            if summary:
                context_parts.append(f"【过往消息总结】\n{summary}")
            
            # 添加 Skills 信息
            if include_skills:
                _t = time.perf_counter()
                skills_info = self._get_skills_info(mode or "")
                _log_step("获取 Skills 信息", _t)
                if skills_info:
                    context_parts.append(skills_info)
            
            # 添加知识库列表信息
            if include_knowledge_bases:
                _t = time.perf_counter()
                knowledge_bases_info = self._get_knowledge_bases_info()
                _log_step("获取知识库列表信息", _t)
                if knowledge_bases_info:
                    context_parts.append(f"【可用知识库】\n{knowledge_bases_info}")
            
            # 添加文件树结构
            if include_file_tree:
                _t = time.perf_counter()
                file_tree_content = await self.get_file_tree_content()
                _log_step("获取文件树结构", _t)
                if file_tree_content:
                    context_parts.append(f"【当前工作区文件结构】\n{file_tree_content}")
            
            # 添加标签栏状态
            _t = time.perf_counter()
            tab_state = await request_tab_state()
            tab_state_content = format_tab_state_for_prompt(tab_state)
            _log_step("获取标签栏状态", _t)
            if tab_state_content:
                context_parts.append(tab_state_content)
            
            # 添加已加载的 additionalInfo 文件内容
            if include_loaded_files and mode:
                _t = time.perf_counter()
                loaded_files = await self._load_additional_info_files(mode)
                _log_step("加载 additionalInfo 文件", _t)
                if loaded_files:
                    combined = "\n\n".join(loaded_files)
                    context_parts.append(f"【已加载的文件内容】\n{combined}")
            
            # 执行RAG检索并添加结果
            if enable_rag and user_input:
                _t = time.perf_counter()
                rag_content = await self._perform_rag_search(user_input)
                _log_step("RAG 检索", _t)
                if rag_content:
                    context_parts.append(f"【RAG检索结果】\n{rag_content}")
            
            # 合并所有部分
            if context_parts:
                context_message = "\n\n".join(context_parts)
                _log_step("上下文消息构建（总计）", _ctx_start)
                logger.info(f"上下文消息构建完成，包含 {len(context_parts)} 个部分")
                return context_message
            else:
                _log_step("上下文消息构建（总计）", _ctx_start)
                return ""
                
        except Exception as e:
            logger.error(f"构建上下文消息时出错: {e}")
            return ""
    
    async def build_prompts(
        self,
        mode: Optional[str] = None,
        user_input: Optional[str] = None,
        summary: Optional[str] = None
    ) -> Tuple[str, str]:
        """同时构建系统提示词和上下文消息（便捷方法）
        
        Args:
            mode: 对话模式
            user_input: 用户输入文本
            summary: 过往消息总结
            
        Returns:
            (system_prompt, context_message) 元组
        """
        system_prompt = await self.build_system_prompt(mode=mode)
        context_message = await self.build_context_message(
            mode=mode,
            user_input=user_input,
            summary=summary
        )
        return system_prompt, context_message


# 创建全局实例
system_prompt_builder = SystemPromptBuilder()
