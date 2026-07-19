package gitman

import (
	"fmt"
	"sort"
	"strings"

	"launcher/internal/gitutil"
)

// CommitDetail 单条提交详情
type CommitDetail struct {
	SHA     string   `json:"sha"`
	Message string   `json:"message"`
	Date    string   `json:"date"`
	Author  string   `json:"author"`
	Parents []string `json:"parents"`
	IsHEAD  bool     `json:"is_head"`
	Refs    []string `json:"refs"`
}

// BranchInfo 分支信息
type BranchInfo struct {
	Name      string `json:"name"`
	IsRemote  bool   `json:"is_remote"`
	IsCurrent bool   `json:"is_current"`
	SHA       string `json:"sha"`
}

// parseCommitLine 解析单行 git log --format 输出
// 格式: %H|%P|%s|%an|%aI|%D
// 其中 %D 可能为空（无 refs）
func parseCommitLine(line string) (CommitDetail, bool) {
	parts := strings.SplitN(line, "|", 6)
	if len(parts) < 5 {
		return CommitDetail{}, false
	}
	sha := parts[0]
	parentsStr := parts[1]
	message := parts[2]
	author := parts[3]
	date := parts[4]
	refsStr := ""
	if len(parts) >= 6 {
		refsStr = parts[5]
	}

	parents := []string{}
	if parentsStr != "" {
		parents = strings.Split(parentsStr, " ")
	}

	refs := []string{}
	if refsStr != "" {
		for _, r := range strings.Split(refsStr, ", ") {
			r = strings.TrimSpace(r)
			if r != "" {
				refs = append(refs, r)
			}
		}
	}

	isHead := false
	for _, r := range refs {
		if strings.Contains(r, "HEAD") {
			isHead = true
			break
		}
	}

	return CommitDetail{
		SHA:     sha,
		Message: message,
		Date:    date,
		Author:  author,
		Parents: parents,
		IsHEAD:  isHead,
		Refs:    refs,
	}, true
}

const logFormat = "--format=%H|%P|%s|%an|%aI|%D"

// GetCommitHistory 获取提交历史（从新到旧，当前 HEAD 可达）
func GetCommitHistory(projectDir string, limit int) ([]CommitDetail, error) {
	out, err := gitutil.OutputIn(projectDir, "log", logFormat, fmt.Sprintf("--max-count=%d", limit))
	if err != nil {
		return nil, fmt.Errorf("获取提交历史失败: %w", err)
	}
	if out == "" {
		return []CommitDetail{}, nil
	}

	var commits []CommitDetail
	for _, line := range strings.Split(out, "\n") {
		if c, ok := parseCommitLine(line); ok {
			commits = append(commits, c)
		}
	}
	return commits, nil
}

// FetchRemote 从远程获取最新引用（prune 会清理已删除的远程跟踪引用）
func FetchRemote(projectDir string) error {
	return gitutil.RunIn(projectDir, "fetch", "--prune", "origin")
}

// SyncRemoteBranches 同步远程分支到本地：
//   - 执行 git fetch --prune origin（清理已删除的远程跟踪分支）
//   - 本地不存在但远程有的分支：自动创建跟踪分支
//   - 远程已删除的分支：删除对应的本地分支（当前分支除外）
func SyncRemoteBranches(projectDir string) error {
	// 先 fetch
	if err := gitutil.RunIn(projectDir, "fetch", "--prune", "origin"); err != nil {
		return fmt.Errorf("fetch 失败: %w", err)
	}

	// 获取当前分支名
	currentBranch, err := gitutil.OutputIn(projectDir, "rev-parse", "--abbrev-ref", "HEAD")
	if err != nil {
		return fmt.Errorf("获取当前分支失败: %w", err)
	}
	currentBranch = strings.TrimSpace(currentBranch)

	// 获取所有远程分支名 (origin/xxx 格式)
	remoteBranchesOut, err := gitutil.OutputIn(projectDir, "branch", "-r", "--format=%(refname:short)")
	if err != nil {
		return err
	}
	remoteBranches := make(map[string]bool)
	if remoteBranchesOut != "" {
		for _, rb := range strings.Split(remoteBranchesOut, "\n") {
			rb = strings.TrimSpace(rb)
			if rb != "" {
				remoteBranches[rb] = true
			}
		}
	}

	// 获取所有本地分支名
	localBranchesOut, err := gitutil.OutputIn(projectDir, "branch", "--format=%(refname:short)")
	if err != nil {
		return err
	}

	if localBranchesOut != "" {
		for _, lb := range strings.Split(localBranchesOut, "\n") {
			lb = strings.TrimSpace(lb)
			if lb == "" {
				continue
			}
			// 检查此本地分支是否有对应的远程分支
			remoteRef := "origin/" + lb
			if !remoteBranches[remoteRef] {
				// 远程已删除，删除本地分支（当前分支除外）
				if lb != currentBranch {
					_ = gitutil.RunIn(projectDir, "branch", "-D", lb)
				}
			}
		}
	}

	// 创建远程有但本地没有的跟踪分支
	for remoteRef := range remoteBranches {
		localName := strings.TrimPrefix(remoteRef, "origin/")
		if localName == remoteRef {
			continue
		}
		// 检查本地是否已有
		out, _ := gitutil.OutputIn(projectDir, "rev-parse", "--verify", "--quiet", "refs/heads/"+localName)
		if out == "" {
			// 本地没有，创建跟踪分支
			_ = gitutil.RunIn(projectDir, "branch", "--track", localName, remoteRef)
		}
	}

	return nil
}

// GetBranches 获取本地分支列表
func GetBranches(projectDir string) ([]BranchInfo, error) {
	// 获取当前分支
	currentBranch, err := gitutil.OutputIn(projectDir, "rev-parse", "--abbrev-ref", "HEAD")
	if err != nil {
		// HEAD detached 等情况
		currentBranch = ""
	}
	currentBranch = strings.TrimSpace(currentBranch)

	// 获取本地分支列表（格式: refname:short|objectname）
	out, err := gitutil.OutputIn(projectDir, "branch", "--format=%(refname:short)|%(objectname)")
	if err != nil {
		return nil, err
	}

	var branches []BranchInfo
	if out != "" {
		for _, line := range strings.Split(out, "\n") {
			line = strings.TrimSpace(line)
			if line == "" {
				continue
			}
			parts := strings.SplitN(line, "|", 2)
			name := parts[0]
			sha := ""
			if len(parts) >= 2 {
				sha = parts[1]
			}
			branches = append(branches, BranchInfo{
				Name:      name,
				IsRemote:  false,
				IsCurrent: name == currentBranch,
				SHA:       sha,
			})
		}
	}

	return branches, nil
}

// CheckoutCommit 硬重置到指定提交（版本回溯）
func CheckoutCommit(projectDir string, hash string) error {
	return gitutil.RunIn(projectDir, "reset", "--hard", hash)
}

// SwitchBranch 切换到已有分支
// name 可以是 "main"（本地分支名）或 "origin/main"（远程分支名）
func SwitchBranch(projectDir string, name string) error {
	localName := name
	if strings.HasPrefix(name, "origin/") {
		localName = name[len("origin/"):]
	}

	// 检查本地是否有此分支
	out, _ := gitutil.OutputIn(projectDir, "rev-parse", "--verify", "--quiet", "refs/heads/"+localName)
	if out == "" {
		// 本地没有，尝试从远程创建跟踪分支
		remoteRef := "origin/" + localName
		if err := gitutil.RunIn(projectDir, "checkout", "--track", "-b", localName, remoteRef); err != nil {
			return fmt.Errorf("分支 %s 不存在（本地及远程）: %w", name, err)
		}
		return nil
	}

	return gitutil.RunIn(projectDir, "checkout", "--force", localName)
}

// CreateBranch 基于当前 HEAD 创建新分支
func CreateBranch(projectDir string, name string) error {
	return gitutil.RunIn(projectDir, "branch", name)
}

// GetAllCommitDetails 获取所有分支的提交详情（带 --all 标志，按时间倒序）
func GetAllCommitDetails(projectDir string, limit int) ([]CommitDetail, error) {
	out, err := gitutil.OutputIn(projectDir, "log", "--all", logFormat, fmt.Sprintf("--max-count=%d", limit))
	if err != nil {
		return nil, fmt.Errorf("获取全部分支提交失败: %w", err)
	}
	return parseCommitOutput(out), nil
}

// parseCommitOutput 解析 git log 输出为 CommitDetail 列表
func parseCommitOutput(out string) []CommitDetail {
	if out == "" {
		return []CommitDetail{}
	}
	var commits []CommitDetail
	for _, line := range strings.Split(out, "\n") {
		if c, ok := parseCommitLine(line); ok {
			commits = append(commits, c)
		}
	}
	return commits
}

// extractTrailingSHA 提取行末的 40 位 hex SHA，若不是则返回 ""
func extractTrailingSHA(line string) string {
	if len(line) < 40 {
		return ""
	}
	candidate := line[len(line)-40:]
	for _, c := range candidate {
		if !((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f')) {
			return ""
		}
	}
	return candidate
}

// ========== 结构化分支图（Go 端解析 --graph，前端纯渲染） ==========

// 分支颜色调色板（与前端 BRANCH_COLORS 保持一致）
var branchColors = []string{
	"#F4A261", // 橙
	"#4CAF50", // 绿
	"#2196F3", // 蓝
	"#E91E63", // 粉
	"#9C27B0", // 紫
	"#00BCD4", // 青
	"#FF9800", // 琥珀
	"#8BC34A", // 黄绿
	"#FFEB3B", // 黄
	"#FF5722", // 深橙
}

func hashToColor(seed string) string {
	h := int32(0)
	for _, c := range seed {
		h = ((h << 5) - h) + c
	}
	if h < 0 {
		h = -h
	}
	return branchColors[h%int32(len(branchColors))]
}

// GraphOutput 完整的分支图结构化数据，前端直接渲染
type GraphOutput struct {
	MaxLane  int        `json:"max_lane"`
	Rows     int        `json:"rows"`
	Nodes    []NodeData `json:"nodes"`
	Segments []SegData  `json:"segments"`
}

// NodeData 单个 commit 节点
type NodeData struct {
	Row     int      `json:"row"`
	Lane    int      `json:"lane"`
	SHA     string   `json:"sha"`
	Message string   `json:"message"`
	Author  string   `json:"author"`
	Date    string   `json:"date"`
	Color   string   `json:"color"`
	Refs    []string `json:"refs"`
}

// DualGraphOutput 双仓库分支图输出
// Graph: 基准仓库的完整 graph（用于渲染）
// WorkingHead: 可变仓库当前 HEAD SHA（用于在图上标记位置）
type DualGraphOutput struct {
	Graph       *GraphOutput `json:"graph"`
	WorkingHead string       `json:"working_head"`
}

// SegData 一条线段（竖线、fork 或 merge）
type SegData struct {
	FromLane int    `json:"from_lane"`
	ToLane   int    `json:"to_lane"`
	Row      int    `json:"row"`  // 终点行
	Type     string `json:"type"` // "vline" | "fork" | "merge"
	Color    string `json:"color"`
}

// GetStructuredGraph 返回结构化的分支图数据。
// 在 Go 端解析 git log --graph --all --format=%H 输出，
// 生成 nodes（commit 节点）和 segments（线段），附带预分配的颜色。
// 前端只需遍历渲染，无需任何解析逻辑。
func GetStructuredGraph(projectDir string, maxCount int) (*GraphOutput, error) {
	// 步骤 1：获取 graph 拓扑
	graphOut, err := gitutil.CombinedOutputIn(projectDir,
		"log", "--graph", "--all",
		"--format=%H",
		fmt.Sprintf("--max-count=%d", maxCount),
	)
	if err != nil {
		return nil, err
	}
	if graphOut == "" {
		return &GraphOutput{}, nil
	}

	// 步骤 2：获取 commit 详情
	details, err := GetAllCommitDetails(projectDir, maxCount)
	if err != nil {
		details = []CommitDetail{}
	}
	detailMap := make(map[string]CommitDetail, len(details))
	for _, d := range details {
		detailMap[d.SHA] = d
	}

	// 步骤 3：逐行扫描，生成 nodes 和 segments
	var nodes []NodeData
	var segments []SegData
	maxLane := 0
	row := 0

	graphLines := strings.Split(graphOut, "\n")

	for _, line := range graphLines {
		line = strings.TrimRight(line, "\r")
		if line == "" {
			continue
		}

		sha := extractTrailingSHA(line)
		var graphPrefix string
		if sha != "" {
			graphPrefix = line[:len(line)-40]
		} else {
			graphPrefix = line
		}

		for pos := 0; pos < len(graphPrefix); pos++ {
			ch := graphPrefix[pos]

			if pos%2 == 0 {
				// 偶数位置 → lane 指示符（* 或 |）
				lane := pos / 2
				if lane+1 > maxLane {
					maxLane = lane + 1
				}

				if ch == '|' && row > 0 {
					segments = append(segments, SegData{
						FromLane: lane, ToLane: lane,
						Row: row, Type: "vline",
					})
				} else if ch == '*' && sha != "" {
					d := detailMap[sha]
					nodes = append(nodes, NodeData{
						Row:     row,
						Lane:    lane,
						SHA:     sha,
						Message: d.Message,
						Author:  d.Author,
						Date:    d.Date,
						Refs:    d.Refs,
					})
				}
			} else {
				// 奇数位置 → 连接线（\ 或 /）
				if ch == '\\' && row > 0 {
					fromLane := (pos - 1) / 2
					toLane := (pos + 1) / 2
					if toLane+1 > maxLane {
						maxLane = toLane + 1
					}
					segments = append(segments, SegData{
						FromLane: fromLane, ToLane: toLane,
						Row: row, Type: "fork",
					})
				} else if ch == '/' && row > 0 {
					fromLane := (pos + 1) / 2
					toLane := (pos - 1) / 2
					if fromLane+1 > maxLane {
						maxLane = fromLane + 1
					}
					segments = append(segments, SegData{
						FromLane: fromLane, ToLane: toLane,
						Row: row, Type: "merge",
					})
				}
			}
		}
		row++
	}
	totalRows := row

	// 步骤 4：补充缺失的竖线
	// 收集每个 lane 的活动行（含奇数位置 \ / 隐式引入的 lane）
	laneActiveRows := make(map[int]map[int]bool)
	markLane := func(lane, r int) {
		if laneActiveRows[lane] == nil {
			laneActiveRows[lane] = make(map[int]bool)
		}
		laneActiveRows[lane][r] = true
	}

	row = 0
	for _, line := range graphLines {
		line = strings.TrimRight(line, "\r")
		if line == "" {
			continue
		}

		sha := extractTrailingSHA(line)
		var graphPrefix string
		if sha != "" {
			graphPrefix = line[:len(line)-40]
		} else {
			graphPrefix = line
		}

		for pos := 0; pos < len(graphPrefix); pos++ {
			ch := graphPrefix[pos]
			if pos%2 == 0 {
				if ch == '|' || ch == '*' {
					markLane(pos/2, row)
				}
			} else {
				if ch == '\\' {
					markLane((pos+1)/2, row) // toLane (fork 引入的 lane)
				} else if ch == '/' {
					markLane((pos+1)/2, row) // fromLane (merge 来源 lane)
				}
			}
		}
		row++
	}

	// 收集已有 vline
	vlineSet := make(map[string]bool)
	for _, seg := range segments {
		if seg.Type == "vline" {
			key := fmt.Sprintf("%d:%d→%d", seg.FromLane, seg.Row-1, seg.Row)
			vlineSet[key] = true
		}
	}

	// 补充缺失 vline
	for lane, rowSet := range laneActiveRows {
		var sorted []int
		for r := range rowSet {
			sorted = append(sorted, r)
		}
		sort.Ints(sorted)
		for i := 1; i < len(sorted); i++ {
			prevRow := sorted[i-1]
			currRow := sorted[i]
			if currRow != prevRow+1 {
				continue
			}
			key := fmt.Sprintf("%d:%d→%d", lane, prevRow, currRow)
			if !vlineSet[key] {
				segments = append(segments, SegData{
					FromLane: lane, ToLane: lane,
					Row: currRow, Type: "vline",
				})
			}
		}
	}

	// 步骤 5：分配颜色
	// lane → 分支名
	laneBranch := make(map[int]string)
	for _, n := range nodes {
		if _, ok := laneBranch[n.Lane]; ok {
			continue
		}
		d := detailMap[n.SHA]
		for _, ref := range d.Refs {
			branch := strings.TrimPrefix(ref, "HEAD -> ")
			branch = strings.TrimPrefix(branch, "origin/")
			branch = strings.TrimSpace(branch)
			if branch != "" && branch != "HEAD" {
				laneBranch[n.Lane] = branch
				break
			}
		}
	}

	// lane → 颜色
	laneColor := make(map[int]string)
	for lane := 0; lane < maxLane; lane++ {
		seed := fmt.Sprintf("lane-%d", lane)
		if branch, ok := laneBranch[lane]; ok {
			seed = branch
		}
		laneColor[lane] = hashToColor(seed)
	}

	// 应用颜色到节点
	for i := range nodes {
		nodes[i].Color = laneColor[nodes[i].Lane]
	}

	// 应用颜色到线段（使用来源 lane 的颜色）
	for i := range segments {
		segments[i].Color = laneColor[segments[i].FromLane]
	}

	return &GraphOutput{
		MaxLane:  maxLane,
		Rows:     totalRows,
		Nodes:    nodes,
		Segments: segments,
	}, nil
}

// IsCommitReachable 检查指定 commit SHA 在当前仓库的对象库中是否存在
func IsCommitReachable(projectDir string, sha string) (bool, error) {
	err := gitutil.RunIn(projectDir, "cat-file", "-e", sha)
	return err == nil, nil
}

// GetHeadSHA 获取当前 HEAD 的完整 SHA
func GetHeadSHA(projectDir string) (string, error) {
	out, err := gitutil.OutputIn(projectDir, "rev-parse", "HEAD")
	return strings.TrimSpace(out), err
}

// FetchFromRepo 从源仓库 fetch 到目标仓库
func FetchFromRepo(destDir, srcDir string) error {
	return gitutil.RunIn(destDir, "fetch", "--prune", srcDir)
}
