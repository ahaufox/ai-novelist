package gitservice

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"launcher/internal/gitutil"
)

// GitService 提供Git操作服务
type GitService struct {
	projectDir string
}

// NewGitService 创建Git服务实例
func NewGitService(projectDir string) *GitService {
	return &GitService{projectDir: projectDir}
}

// SetProjectDir 设置项目目录
func (s *GitService) SetProjectDir(projectDir string) {
	s.projectDir = projectDir
}

// StatusResponse Git状态响应
type StatusResponse struct {
	Branch         string   `json:"branch"`
	Dirty          bool     `json:"dirty"`
	UntrackedFiles []string `json:"untracked_files"`
	Changes        []Change `json:"changes"`
	ModifiedFiles  []string `json:"modified_files"`
}

// Change 变更信息
type Change struct {
	Path       string `json:"path"`
	ChangeType string `json:"change_type"`
}

// GetStatus 获取Git状态
func (s *GitService) GetStatus() (*StatusResponse, error) {
	if s.projectDir == "" {
		return nil, fmt.Errorf("项目目录未设置")
	}

	// 获取当前分支
	branch, err := gitutil.OutputIn(s.projectDir, "rev-parse", "--abbrev-ref", "HEAD")
	if err != nil {
		return nil, fmt.Errorf("获取分支失败: %w", err)
	}
	branch = strings.TrimSpace(branch)

	// 获取状态 (porcelain 格式)
	statusOut, err := gitutil.OutputIn(s.projectDir, "status", "--porcelain")
	if err != nil {
		return nil, fmt.Errorf("获取状态失败: %w", err)
	}

	var untrackedFiles []string
	var changes []Change
	var modifiedFiles []string
	dirty := false

	if statusOut != "" {
		dirty = true
		for _, line := range strings.Split(statusOut, "\n") {
			line = strings.TrimRight(line, "\r")
			if len(line) < 4 {
				continue
			}
			xy := line[:2]
			path := strings.TrimSpace(line[3:])

			switch {
			case xy == "??":
				untrackedFiles = append(untrackedFiles, path)
			case xy[0] == 'A' || xy[1] == 'A':
				changes = append(changes, Change{Path: path, ChangeType: "A"})
				modifiedFiles = append(modifiedFiles, path)
			case xy[0] == 'D' || xy[1] == 'D':
				changes = append(changes, Change{Path: path, ChangeType: "D"})
				modifiedFiles = append(modifiedFiles, path)
			default:
				changes = append(changes, Change{Path: path, ChangeType: "M"})
				modifiedFiles = append(modifiedFiles, path)
			}
		}
	}

	return &StatusResponse{
		Branch:         branch,
		Dirty:          dirty,
		UntrackedFiles: untrackedFiles,
		Changes:        changes,
		ModifiedFiles:  modifiedFiles,
	}, nil
}

// CheckpointInfo 检查点信息
type CheckpointInfo struct {
	CommitHash string `json:"commit_hash"`
	ShortHash  string `json:"short_hash"`
	Message    string `json:"message"`
}

// ListCheckpoints 列出所有检查点
func (s *GitService) ListCheckpoints() ([]CheckpointInfo, error) {
	if s.projectDir == "" {
		return nil, fmt.Errorf("项目目录未设置")
	}

	out, err := gitutil.OutputIn(s.projectDir, "log", "--all", "--format=%H|%s", "--max-count=100")
	if err != nil {
		return nil, fmt.Errorf("获取日志失败: %w", err)
	}

	var checkpoints []CheckpointInfo
	if out != "" {
		for _, line := range strings.Split(out, "\n") {
			line = strings.TrimSpace(line)
			if line == "" {
				continue
			}
			parts := strings.SplitN(line, "|", 2)
			hash := parts[0]
			msg := ""
			if len(parts) >= 2 {
				msg = strings.TrimSpace(parts[1])
			}

			shortHash := hash
			if len(hash) > 8 {
				shortHash = hash[:8]
			}

			checkpoints = append(checkpoints, CheckpointInfo{
				CommitHash: hash,
				ShortHash:  shortHash,
				Message:    msg,
			})
		}
	}

	return checkpoints, nil
}

// SaveCheckpointRequest 保存检查点请求
type SaveCheckpointRequest struct {
	Message string `json:"message"`
}

// SaveCheckpointResponse 保存检查点响应
type SaveCheckpointResponse struct {
	Success    bool   `json:"success"`
	CommitHash string `json:"commit_hash,omitempty"`
	ShortHash  string `json:"short_hash,omitempty"`
	Message    string `json:"message,omitempty"`
}

// SaveCheckpoint 保存检查点
func (s *GitService) SaveCheckpoint(req *SaveCheckpointRequest) (*SaveCheckpointResponse, error) {
	if s.projectDir == "" {
		return nil, fmt.Errorf("项目目录未设置")
	}

	// git add -A
	if err := gitutil.RunIn(s.projectDir, "add", "-A"); err != nil {
		return nil, fmt.Errorf("添加文件失败: %w", err)
	}

	// 检查是否有更改
	statusOut, err := gitutil.OutputIn(s.projectDir, "status", "--porcelain")
	if err != nil {
		return nil, fmt.Errorf("获取状态失败: %w", err)
	}
	if strings.TrimSpace(statusOut) == "" {
		return &SaveCheckpointResponse{
			Success: false,
			Message: "没有更改需要提交",
		}, nil
	}

	// 生成提交消息
	message := req.Message
	if message == "" {
		timestamp := timeNow()
		message = fmt.Sprintf("Checkpoint: %s", timestamp)
	}

	// git commit -m <message>
	out, err := gitutil.CombinedOutputIn(s.projectDir, "commit", "-m", message)
	if err != nil {
		return nil, fmt.Errorf("创建提交失败: %w\n%s", err, out)
	}

	// 获取 commit hash
	hash, err := gitutil.OutputIn(s.projectDir, "rev-parse", "HEAD")
	if err != nil {
		return nil, fmt.Errorf("获取 commit hash 失败: %w", err)
	}
	hash = strings.TrimSpace(hash)

	shortHash := hash
	if len(hash) > 8 {
		shortHash = hash[:8]
	}

	return &SaveCheckpointResponse{
		Success:    true,
		CommitHash: hash,
		ShortHash:  shortHash,
		Message:    message,
	}, nil
}

// RestoreCheckpointRequest 恢复检查点请求
type RestoreCheckpointRequest struct {
	CommitHash string `json:"commit_hash"`
}

// RestoreCheckpointResponse 恢复检查点响应
type RestoreCheckpointResponse struct {
	Success    bool   `json:"success"`
	CommitHash string `json:"commit_hash,omitempty"`
	ShortHash  string `json:"short_hash,omitempty"`
	Message    string `json:"message,omitempty"`
}

// RestoreCheckpoint 恢复检查点
func (s *GitService) RestoreCheckpoint(req *RestoreCheckpointRequest) (*RestoreCheckpointResponse, error) {
	if s.projectDir == "" {
		return nil, fmt.Errorf("项目目录未设置")
	}

	// 获取提交信息
	info, err := gitutil.OutputIn(s.projectDir, "log", "-1", "--format=%H|%s", req.CommitHash)
	if err != nil {
		return nil, fmt.Errorf("获取提交失败: %w", err)
	}
	parts := strings.SplitN(info, "|", 2)
	hash := parts[0]
	msg := ""
	if len(parts) >= 2 {
		msg = strings.TrimSpace(parts[1])
	}

	// git reset --hard
	if err := gitutil.RunIn(s.projectDir, "reset", "--hard", req.CommitHash); err != nil {
		return nil, fmt.Errorf("重置失败: %w", err)
	}

	// 清理未跟踪的文件
	_ = gitutil.RunIn(s.projectDir, "clean", "-fd")

	shortHash := hash
	if len(hash) > 8 {
		shortHash = hash[:8]
	}

	return &RestoreCheckpointResponse{
		Success:    true,
		CommitHash: hash,
		ShortHash:  shortHash,
		Message:    msg,
	}, nil
}

// FileChange 文件变更详情
type FileChange struct {
	Path       string `json:"path"`
	ChangeType string `json:"change_type"`
	OldContent string `json:"old_content"`
	NewContent string `json:"new_content"`
}

// DiffResponse 差异响应
type DiffResponse struct {
	Success         bool         `json:"success"`
	CommitHash      string       `json:"commit_hash,omitempty"`
	ShortHash       string       `json:"short_hash,omitempty"`
	Changes         []FileChange `json:"changes,omitempty"`
	IsInitialCommit bool         `json:"is_initial_commit,omitempty"`
	Message         string       `json:"message,omitempty"`
}

// GetCheckpointDiff 获取检查点差异
func (s *GitService) GetCheckpointDiff(commitHash string) (*DiffResponse, error) {
	if s.projectDir == "" {
		return nil, fmt.Errorf("项目目录未设置")
	}

	// 检查是否为初始提交（没有父提交）
	parentCount, err := gitutil.OutputIn(s.projectDir, "rev-list", "--parents", "--max-count=1", commitHash)
	if err != nil {
		return nil, fmt.Errorf("获取提交信息失败: %w", err)
	}
	// rev-list --parents 输出: "hash parent1 parent2..."
	parentParts := strings.Fields(strings.TrimSpace(parentCount))
	if len(parentParts) <= 1 {
		// 初始提交
		return &DiffResponse{
			Success:         true,
			CommitHash:      commitHash,
			ShortHash:       truncateHash(commitHash),
			Changes:         []FileChange{},
			IsInitialCommit: true,
		}, nil
	}

	// 获取差异文件列表
	diffOut, err := gitutil.OutputIn(s.projectDir, "diff", "--name-status", fmt.Sprintf("%s^..%s", commitHash, commitHash))
	if err != nil {
		return nil, fmt.Errorf("获取差异列表失败: %w", err)
	}

	var fileChanges []FileChange
	if diffOut != "" {
		for _, line := range strings.Split(diffOut, "\n") {
			line = strings.TrimSpace(line)
			if line == "" {
				continue
			}
			parts := strings.Fields(line)
			if len(parts) < 2 {
				continue
			}
			changeType := parts[0]
			filePath := strings.TrimPrefix(parts[1], "./")

			change := FileChange{
				Path:       filePath,
				ChangeType: changeType,
			}

			// 获取文件内容
			if changeType == "M" || changeType == "D" {
				if content, err := gitutil.OutputIn(s.projectDir, "show", fmt.Sprintf("%s^:%s", commitHash, filePath)); err == nil {
					change.OldContent = content
				}
			}
			if changeType == "M" || changeType == "A" {
				if content, err := gitutil.OutputIn(s.projectDir, "show", fmt.Sprintf("%s:%s", commitHash, filePath)); err == nil {
					change.NewContent = content
				}
			}

			fileChanges = append(fileChanges, change)
		}
	}

	shortHash := truncateHash(commitHash)

	return &DiffResponse{
		Success:    true,
		CommitHash: commitHash,
		ShortHash:  shortHash,
		Changes:    fileChanges,
	}, nil
}

// WorkingDiffResponse 工作区差异响应
type WorkingDiffResponse struct {
	Success    bool   `json:"success"`
	Path       string `json:"path,omitempty"`
	OldContent string `json:"old_content,omitempty"`
	NewContent string `json:"new_content,omitempty"`
	Message    string `json:"message,omitempty"`
}

// GetWorkingDiff 获取工作区差异
func (s *GitService) GetWorkingDiff(filePath string) (*WorkingDiffResponse, error) {
	if s.projectDir == "" {
		return nil, fmt.Errorf("项目目录未设置")
	}

	// 读取当前工作区的文件内容（新内容）
	fullPath := filepath.Join(s.projectDir, filePath)
	var newContent string
	content, err := os.ReadFile(fullPath)
	if err != nil {
		if os.IsNotExist(err) {
			newContent = ""
		} else {
			return nil, fmt.Errorf("读取文件失败: %w", err)
		}
	} else {
		newContent = string(content)
	}

	// 获取最新提交中的文件内容（旧内容）
	oldContent, err := gitutil.OutputIn(s.projectDir, "show", "HEAD:"+filePath)
	if err != nil {
		// 文件在 HEAD 中不存在（新文件）
		oldContent = ""
	}

	return &WorkingDiffResponse{
		Success:    true,
		Path:       filePath,
		OldContent: oldContent,
		NewContent: newContent,
	}, nil
}

// InitRepoResponse 初始化仓库响应
type InitRepoResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
}

// InitRepo 初始化Git仓库
func (s *GitService) InitRepo() (*InitRepoResponse, error) {
	if s.projectDir == "" {
		return nil, fmt.Errorf("项目目录未设置")
	}

	gitDir := filepath.Join(s.projectDir, ".git")

	// 如果Git仓库已存在，跳过初始化
	if _, err := os.Stat(gitDir); err == nil {
		return &InitRepoResponse{
			Success: true,
			Message: "Git仓库已存在，跳过初始化",
		}, nil
	}

	// git init
	if err := gitutil.RunIn(s.projectDir, "init"); err != nil {
		return nil, fmt.Errorf("初始化仓库失败: %w", err)
	}

	// 配置 Git 用户信息
	_ = gitutil.RunIn(s.projectDir, "config", "user.name", "AI Novelist")
	_ = gitutil.RunIn(s.projectDir, "config", "user.email", "noreply@ai-novelist.local")

	// 创建空初始提交
	out, err := gitutil.CombinedOutputIn(s.projectDir, "commit", "--allow-empty", "-m", "Initial commit (empty)")
	if err != nil {
		return nil, fmt.Errorf("创建空初始提交失败: %w\n%s", err, out)
	}
	emptyHash, _ := gitutil.OutputIn(s.projectDir, "rev-parse", "HEAD")

	// 添加所有文件
	if err := gitutil.RunIn(s.projectDir, "add", "-A"); err != nil {
		return nil, fmt.Errorf("添加文件失败: %w", err)
	}

	// 提交
	out2, err := gitutil.CombinedOutputIn(s.projectDir, "commit", "-m", "Initial checkpoint")
	if err != nil {
		return nil, fmt.Errorf("创建初始存档点失败: %w\n%s", err, out2)
	}

	return &InitRepoResponse{
		Success: true,
		Message: fmt.Sprintf("Git仓库初始化成功, 空提交: %s", truncateHash(emptyHash)),
	}, nil
}

func timeNow() string {
	// 简单的时间格式化，不依赖 time 包
	out, err := gitutil.OutputIn("", "log", "-1", "--format=%ci")
	if err != nil {
		return ""
	}
	return strings.TrimSpace(out)
}

func truncateHash(hash string) string {
	if len(hash) > 8 {
		return hash[:8]
	}
	return hash
}
