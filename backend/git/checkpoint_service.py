"""基于Git的检查点服务，用于管理文件归档。"""

import logging
import re
import subprocess
from pathlib import Path
from typing import List, Optional, Dict, Any
from datetime import datetime
from git import Repo, GitCommandError

from backend.settings.settings import settings

logger = logging.getLogger(__name__)


class CheckpointService:
    """用于管理基于Git的文件检查点的服务。"""

    def __init__(self):
        """
        初始化检查点服务。
        """
        self.repo = Repo(Path(settings.DATA_DIR))

    def save_checkpoint(self, message: Optional[str] = None) -> Dict[str, Any]:
        """
        将当前状态保存为检查点。

        Args:
            message: 可选的检查点消息，默认为自动生成的消息。

        Returns:
            包含检查点信息的字典。
        """
        try:
            repo = self.repo

            # 如果未提供消息，则生成消息
            if message is None:
                timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                message = f"Checkpoint: {timestamp}"

            # 添加所有文件（包括未跟踪的文件）
            # 使用 git add -A 来添加所有更改，包括删除的文件
            repo.git.add("-A")

            # 检查是否有更改需要提交
            if repo.is_dirty(untracked_files=False):
                # 创建提交
                commit = repo.index.commit(message)

                logger.info(f"Created checkpoint: {commit.hexsha[:8]} - {message}")

                return {
                    "success": True,
                    "commit_hash": commit.hexsha,
                    "short_hash": commit.hexsha[:8],
                    "message": message,
                }
            else:
                logger.info("没有更改需要提交")
                return {
                    "success": False,
                    "message": "没有更改需要提交",
                }

        except GitCommandError as e:
            logger.error(f"保存检查点失败: {e}")
            return {
                "success": False,
                "message": f"保存检查点失败: {str(e)}",
            }

    def list_checkpoints(self) -> List[Dict[str, Any]]:
        """
        列出所有检查点。

        Returns:
            检查点信息字典列表。
        """
        try:
            repo = self.repo
            checkpoints = []

            # 获取提交历史
            for commit in repo.iter_commits():
                checkpoints.append(
                    {
                        "commit_hash": commit.hexsha,
                        "short_hash": commit.hexsha[:8],
                        "message": commit.message.strip(),
                    }
                )

            return checkpoints

        except GitCommandError as e:
            logger.error(f"列出检查点失败: {e}")
            return []

    def restore_checkpoint(self, commit_hash: str) -> Dict[str, Any]:
        """
        将工作区恢复到指定的检查点。

        Args:
            commit_hash: 要恢复的提交哈希。

        Returns:
            包含恢复结果的字典。
        """
        try:
            repo = self.repo

            # 获取提交
            commit = repo.commit(commit_hash)

            # 重置到该提交
            repo.git.reset("--hard", commit_hash)

            # 清理未跟踪的文件
            repo.git.clean("-fd")

            logger.info(f"Restored to checkpoint: {commit_hash[:8]}")

            return {
                "success": True,
                "commit_hash": commit.hexsha,
                "short_hash": commit.hexsha[:8],
                "message": commit.message.strip(),
            }

        except GitCommandError as e:
            logger.error(f"恢复检查点失败: {e}")
            return {
                "success": False,
                "message": f"恢复检查点失败: {str(e)}",
            }

    def get_checkpoint_diff(self, commit_hash: str) -> Dict[str, Any]:
        """
        获取检查点与其父提交之间的差异。

        Args:
            commit_hash: 要比较的提交哈希。

        Returns:
            包含差异信息的字典，包括详细的diff内容。
        """
        try:
            repo = self.repo

            # 获取提交
            commit = repo.commit(commit_hash)

            # 获取父提交
            parents = list(commit.parents)

            # 如果没有父提交（初始提交），返回空差异
            if not parents:
                return {
                    "success": True,
                    "commit_hash": commit_hash,
                    "short_hash": commit_hash[:8],
                    "changes": [],
                    "is_initial_commit": True,
                }

            # 获取与父提交的差异（使用 raw 模式）
            parent_commit = parents[0]
            diff = parent_commit.diff(commit)

            changes = []
            seen_paths = set()
            for item in diff:
                # 根据变更类型选择正确的路径
                if item.change_type == 'A':  # 新增的文件
                    file_path = item.b_path
                elif item.change_type == 'D':  # 删除的文件
                    file_path = item.a_path
                else:  # 修改的文件或其他
                    file_path = item.b_path if item.b_path else item.a_path

                # 标准化路径：移除 './' 前缀
                if file_path and file_path.startswith('./'):
                    file_path = file_path[2:]

                # 去重：如果路径已经处理过，跳过
                if file_path in seen_paths:
                    continue
                seen_paths.add(file_path)

                change_info = {
                    "path": file_path,
                    "change_type": item.change_type,
                }

                # 根据变更类型获取文件内容
                if item.change_type == 'M':  # 修改的文件
                    # 获取旧文件内容（父提交中的版本）
                    if item.a_blob:
                        change_info["old_content"] = item.a_blob.data_stream.read().decode('utf-8', errors='replace')
                    # 获取新文件内容（当前提交中的版本）
                    if item.b_blob:
                        change_info["new_content"] = item.b_blob.data_stream.read().decode('utf-8', errors='replace')
                elif item.change_type == 'A':  # 新增的文件
                    # 新文件只有新内容
                    if item.b_blob:
                        change_info["new_content"] = item.b_blob.data_stream.read().decode('utf-8', errors='replace')
                    change_info["old_content"] = ""
                elif item.change_type == 'D':  # 删除的文件
                    # 删除的文件只有旧内容
                    if item.a_blob:
                        change_info["old_content"] = item.a_blob.data_stream.read().decode('utf-8', errors='replace')
                    change_info["new_content"] = ""

                changes.append(change_info)

            return {
                "success": True,
                "commit_hash": commit_hash,
                "short_hash": commit_hash[:8],
                "changes": changes,
            }

        except GitCommandError as e:
            logger.error(f"获取差异失败: {e}")
            return {
                "success": False,
                "message": f"获取差异失败: {str(e)}",
            }

    def get_status(self) -> Dict[str, Any]:
        """
        获取当前Git状态。

        Returns:
            包含状态信息的字典，包含带变更类型的文件列表。
        """
        try:
            repo = self.repo

            # 获取工作区与暂存区之间的差异
            diff_items = repo.index.diff(None)
            changes = []
            seen_paths = set()
            for item in diff_items:
                # 根据变更类型选择正确的路径
                if item.change_type == 'D':  # 删除的文件使用旧路径
                    file_path = item.a_path
                else:  # 修改或新增的文件使用新路径
                    file_path = item.b_path if item.b_path else item.a_path

                # 标准化路径：移除 './' 前缀
                if file_path and file_path.startswith('./'):
                    file_path = file_path[2:]

                # 去重：如果路径已经处理过，跳过
                if file_path in seen_paths:
                    continue
                seen_paths.add(file_path)

                change_info = {
                    "path": file_path,
                    "change_type": item.change_type,  # 'M'=修改, 'A'=新增, 'D'=删除
                }
                changes.append(change_info)

            # 判断是否有更改
            dirty = repo.is_dirty(untracked_files=True)

            return {
                "branch": repo.active_branch.name,
                "dirty": dirty,
                "untracked_files": repo.untracked_files,
                "changes": changes,  # 带变更类型的文件列表
                # 保留旧字段以保持向后兼容
                "modified_files": [item["path"] for item in changes],
            }

        except GitCommandError as e:
            logger.error(f"获取状态失败: {e}")
            return {
                "initialized": False,
                "error": str(e),
            }

    def get_working_diff(self, file_path: str) -> Dict[str, Any]:
        """
        获取当前工作区中指定文件与最新提交之间的差异。

        Args:
            file_path: 文件路径（相对路径）。

        Returns:
            包含差异信息的字典，包括 old_content 和 new_content。
        """
        try:
            repo = self.repo
            data_dir = Path(settings.DATA_DIR)
            full_path = data_dir / file_path

            # 读取当前工作区的文件内容（新内容）
            # 如果文件不存在（被删除），则新内容为空字符串
            new_content = ""
            try:
                with open(full_path, 'r', encoding='utf-8', errors='replace') as f:
                    new_content = f.read()
            except FileNotFoundError:
                # 文件在工作区不存在（已被删除）
                new_content = ""
            except Exception as e:
                logger.error(f"读取文件失败: {e}")
                return {
                    "success": False,
                    "message": f"读取文件失败: {str(e)}",
                }

            # 尝试从最新提交获取文件内容（旧内容）
            old_content = ""
            try:
                # 获取最新提交
                latest_commit = repo.head.commit
                # 尝试获取该文件在最新提交中的内容
                blob = latest_commit.tree / file_path
                if blob:
                    old_content = blob.data_stream.read().decode('utf-8', errors='replace')
            except (KeyError, AttributeError):
                # 文件在最新提交中不存在（新文件）
                old_content = ""
            except Exception as e:
                logger.warning(f"获取文件在最新提交中的内容失败: {e}")
                old_content = ""

            return {
                "success": True,
                "path": file_path,
                "old_content": old_content,
                "new_content": new_content,
            }

        except GitCommandError as e:
            logger.error(f"获取工作区差异失败: {e}")
            return {
                "success": False,
                "message": f"获取工作区差异失败: {str(e)}",
            }


    # ─── 分支图 ──────────────────────────────────────────────

    BRANCH_COLORS = [
        "#F4A261", "#4CAF50", "#2196F3", "#E91E63", "#9C27B0",
        "#00BCD4", "#FF9800", "#8BC34A", "#FFEB3B", "#FF5722",
    ]

    @staticmethod
    def _hash_to_color(seed: str) -> str:
        """从字符串确定性分配颜色。"""
        h = 0
        for c in seed:
            h = ((h << 5) - h) + ord(c)
        h = abs(h)
        return CheckpointService.BRANCH_COLORS[h % len(CheckpointService.BRANCH_COLORS)]

    def get_graph(self, max_count: int = 200) -> Dict[str, Any]:
        """获取分支图结构化数据。
        
        返回:
            {
                "max_lane": int,
                "rows": int,
                "nodes": [{"row","lane","sha","message","author","date","color","refs"},...],
                "segments": [{"from_lane","to_lane","row","type","color"},...],
            }
        """
        try:
            repo = self.repo
            project_dir = repo.working_dir

            # Step 1: 获取 graph 拓扑（git log --graph --all --format=%H）
            graph_out = repo.git.log(
                graph=True, all=True, format="%H", max_count=max_count,
            )
            if not graph_out:
                return {"max_lane": 0, "rows": 0, "nodes": [], "segments": []}

            # Step 2: 获取 commit 详情
            details_out = repo.git.log(
                all=True, format="%H|%P|%s|%an|%aI|%D", max_count=max_count,
            )
            detail_map = self._parse_commit_details(details_out)

            # Step 3: 逐行扫描 graph 输出，生成 nodes 和 segments
            graph_lines = graph_out.split("\n")
            nodes: List[Dict[str, Any]] = []
            segments: List[Dict[str, Any]] = []
            max_lane = 0
            row = 0

            for line in graph_lines:
                line = line.rstrip("\r")
                if not line:
                    continue

                sha = self._extract_trailing_sha(line)
                graph_prefix = line[:len(line) - 40] if sha else line

                for pos in range(len(graph_prefix)):
                    ch = graph_prefix[pos]

                    if pos % 2 == 0:
                        # 偶数位置 → lane 指示符（* 或 |）
                        lane = pos // 2
                        if lane + 1 > max_lane:
                            max_lane = lane + 1

                        if ch == '|' and row > 0:
                            segments.append({
                                "from_lane": lane, "to_lane": lane,
                                "row": row, "type": "vline",
                            })
                        elif ch == '*' and sha:
                            d = detail_map.get(sha, {})
                            nodes.append({
                                "row": row,
                                "lane": lane,
                                "sha": sha,
                                "message": d.get("message", ""),
                                "author": d.get("author", ""),
                                "date": d.get("date", ""),
                                "refs": d.get("refs", []),
                            })
                    else:
                        # 奇数位置 → 连接线（\ 或 /）
                        if ch == '\\' and row > 0:
                            from_lane = (pos - 1) // 2
                            to_lane = (pos + 1) // 2
                            if to_lane + 1 > max_lane:
                                max_lane = to_lane + 1
                            segments.append({
                                "from_lane": from_lane, "to_lane": to_lane,
                                "row": row, "type": "fork",
                            })
                        elif ch == '/' and row > 0:
                            from_lane = (pos + 1) // 2
                            to_lane = (pos - 1) // 2
                            if from_lane + 1 > max_lane:
                                max_lane = from_lane + 1
                            segments.append({
                                "from_lane": from_lane, "to_lane": to_lane,
                                "row": row, "type": "merge",
                            })

                row += 1

            total_rows = row

            # Step 4: 补充缺失的竖线
            lane_active_rows: Dict[int, set] = {}
            def mark_lane(lane: int, r: int):
                if lane not in lane_active_rows:
                    lane_active_rows[lane] = set()
                lane_active_rows[lane].add(r)

            row = 0
            for line in graph_lines:
                line = line.rstrip("\r")
                if not line:
                    continue
                sha = self._extract_trailing_sha(line)
                graph_prefix = line[:len(line) - 40] if sha else line

                for pos in range(len(graph_prefix)):
                    ch = graph_prefix[pos]
                    if pos % 2 == 0:
                        if ch == '|' or ch == '*':
                            mark_lane(pos // 2, row)
                    else:
                        if ch == '\\':
                            mark_lane((pos + 1) // 2, row)
                        elif ch == '/':
                            mark_lane((pos + 1) // 2, row)
                row += 1

            vline_set = set()
            for seg in segments:
                if seg["type"] == "vline":
                    key = f"{seg['from_lane']}:{seg['row']-1}→{seg['row']}"
                    vline_set.add(key)

            for lane, row_set in lane_active_rows.items():
                sorted_rows = sorted(row_set)
                for i in range(1, len(sorted_rows)):
                    prev_row = sorted_rows[i - 1]
                    curr_row = sorted_rows[i]
                    if curr_row != prev_row + 1:
                        continue
                    key = f"{lane}:{prev_row}→{curr_row}"
                    if key not in vline_set:
                        segments.append({
                            "from_lane": lane, "to_lane": lane,
                            "row": curr_row, "type": "vline",
                        })

            # Step 5: 分配颜色
            lane_branch: Dict[int, str] = {}
            for n in nodes:
                if n["lane"] in lane_branch:
                    continue
                d = detail_map.get(n["sha"], {})
                for ref in d.get("refs", []):
                    branch = ref.replace("HEAD -> ", "").replace("origin/", "").strip()
                    if branch and branch != "HEAD":
                        lane_branch[n["lane"]] = branch
                        break

            lane_color: Dict[int, str] = {}
            for lane in range(max_lane):
                seed = f"lane-{lane}"
                if lane in lane_branch:
                    seed = lane_branch[lane]
                lane_color[lane] = self._hash_to_color(seed)

            for n in nodes:
                n["color"] = lane_color.get(n["lane"], "#888")
            for seg in segments:
                seg["color"] = lane_color.get(seg["from_lane"], "#888")

            return {
                "max_lane": max_lane,
                "rows": total_rows,
                "nodes": nodes,
                "segments": segments,
            }

        except GitCommandError as e:
            logger.error(f"获取分支图失败: {e}")
            return {"max_lane": 0, "rows": 0, "nodes": [], "segments": []}

    def _parse_commit_details(self, output: str) -> Dict[str, Dict[str, Any]]:
        """解析 git log --format 输出为 {sha: detail} 字典。"""
        detail_map: Dict[str, Dict[str, Any]] = {}
        if not output:
            return detail_map

        for line in output.split("\n"):
            line = line.strip()
            if not line:
                continue
            parts = line.split("|", 5)
            sha = parts[0]
            parents_str = parts[1] if len(parts) > 1 else ""
            message = parts[2] if len(parts) > 2 else ""
            author = parts[3] if len(parts) > 3 else ""
            date = parts[4] if len(parts) > 4 else ""
            refs_str = parts[5] if len(parts) > 5 else ""

            parents = parents_str.split() if parents_str else []
            refs = [r.strip() for r in refs_str.split(", ") if r.strip()] if refs_str else []
            is_head = any("HEAD" in r for r in refs)

            detail_map[sha] = {
                "parents": parents,
                "message": message,
                "author": author,
                "date": date,
                "refs": refs,
                "is_head": is_head,
            }
        return detail_map

    @staticmethod
    def _extract_trailing_sha(line: str) -> Optional[str]:
        """提取行末的 40 位 hex SHA，若不是则返回 None。"""
        if len(line) < 40:
            return None
        candidate = line[-40:]
        if re.fullmatch(r'[0-9a-f]{40}', candidate):
            return candidate
        return None

    def checkout_commit(self, commit_hash: str) -> Dict[str, Any]:
        """回档到指定提交（reset --hard）。"""
        try:
            repo = self.repo
            commit = repo.commit(commit_hash)
            repo.git.reset("--hard", commit_hash)
            repo.git.clean("-fd")
            logger.info(f"Checked out to commit: {commit_hash[:8]}")
            return {
                "success": True,
                "commit_hash": commit.hexsha,
                "short_hash": commit.hexsha[:8],
                "message": commit.message.strip(),
            }
        except GitCommandError as e:
            logger.error(f"回档失败: {e}")
            return {"success": False, "message": f"回档失败: {str(e)}"}


# 全局检查点服务实例
_checkpoint_service: Optional[CheckpointService] = None


def get_checkpoint_service() -> CheckpointService:
    """获取全局检查点服务实例。"""
    global _checkpoint_service
    if _checkpoint_service is None:
        _checkpoint_service = CheckpointService()
    return _checkpoint_service
