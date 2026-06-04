# Git 分支图改造方案 v2 — 纯 go-git 实现

## 方案选择

基于"只用 go-git，不调外部 git CLI"的要求，有两种实现路径：

### 路径 A：修复数据管道，继续用 `@gitgraph/react`（改动最小）

| 改动 | 文件 | 说明 |
|------|------|------|
| 拓扑排序 | [`gitman.go`](../launcher/internal/gitman/gitman.go) `GetFullCommitGraph` | BFS 后改为拓扑排序（Kahn's algorithm），而非时间排序 |
| refs 传播 | [`gitman.go`](../launcher/internal/gitman/gitman.go) | 将分支标签传播到祖先节点，不只是 tip |
| 移除 limit | [`GitManager.tsx`](../launcher/frontend/src/components/GitManager.tsx) | 去掉 200 的硬限制，用 `-1`（不限）或更大值 |

**优点**：改动量小，只改 ~30 行 Go + ~10 行 TS
**缺点**：仍然依赖 `@gitgraph/react` 的 import 渲染质量

### 路径 B：在 Go 中实现分支列算法 + 生成 ASCII 图（彻底解决）

在 Go 中用 go-git 数据自行计算 branch lane，生成类似 `git log --graph` 的 ASCII 图前缀，前端只需用 monospace 渲染。

**优点**：
- 不依赖任何第三方渲染库（可移除 `@gitgraph/react`）
- 与 git CLI 输出一致，效果可预期
- 前端渲染极简单

**缺点**：需要实现列分配算法（中等复杂度，约 100-150 行 Go）

---

## 路径 B 详细方案

### 核心算法

```
输入：所有分支可达的 commit 列表（已拓扑排序，父在前子在后）
输出：每行对应的 graph 前缀字符串

算法：
1. 按拓扑序（父 → 子）遍历 commits
2. 维护 columns[] — 每列当前指向的 commit hash
3. 对每个 commit:
   a. 找到它所在的 column
   b. 生成 graph 前缀：
      - commit 所在列画 "*"
      - 有活动分支经过的列画 "|"  
      - 空列画 " "
   c. 更新 columns：
      - 此 commit 的第一个父继承该列
      - 额外父（merge）分配到新列
4. 按逆拓扑序（子 → 父，即 git log 展示顺序）输出
```

### Go 实现

```go
// gitman.go 新增

// GraphLine 分支图中的一行
type GraphLine struct {
    Graph     string `json:"graph"`     
    Hash      string `json:"hash"`       
    Parents   string `json:"parents"`    
    Message   string `json:"message"`    
    Author    string `json:"author"`     
    Date      string `json:"date"`       
    Refs      string `json:"refs"`       
    IsCommit  bool   `json:"is_commit"`  
}

// GetFullGraphASCII 生成完整分支图 ASCII
func GetFullGraphASCII(projectDir string, maxCount int) ([]GraphLine, error) {
    repo, err := git.PlainOpen(projectDir)
    if err != nil { return nil, err }
    
    head, err := repo.Head()
    if err != nil { return nil, err }
    
    // 1. 收集所有分支引用
    refsMap := collectAllRefs(repo, head)
    
    // 2. BFS 收集所有可达 commit
    allCommits := bfsCollectCommits(repo, refsMap, maxCount)
    
    // 3. 拓扑排序（父在前，子在后）
    topoCommits := topologicalSort(allCommits)
    
    // 4. 计算列分配
    graphLines := calculateBranchLanes(topoCommits, refsMap, head)
    
    // 5. 逆序输出（新的在前）
    reverse(graphLines)
    
    return graphLines, nil
}
```

### 拓扑排序实现

```go
func topologicalSort(commits []*object.Commit) []*object.Commit {
    inDegree := map[string]int{}
    children := map[string][]string{} // parent hash -> child hashes
    commitMap := map[string]*object.Commit{}
    
    for _, c := range commits {
        h := c.Hash.String()
        commitMap[h] = c
        if _, ok := inDegree[h]; !ok {
            inDegree[h] = 0
        }
        for _, p := range c.ParentHashes {
            ph := p.String()
            inDegree[ph]++
            children[ph] = append(children[ph], h)
        }
    }
    
    // Kahn's algorithm
    queue := []string{}
    for h, d := range inDegree {
        if d == 0 {
            queue = append(queue, h)
        }
    }
    
    result := []*object.Commit{}
    for len(queue) > 0 {
        h := queue[0]
        queue = queue[1:]
        if c, ok := commitMap[h]; ok {
            result = append(result, c)
        }
        for _, child := range children[h] {
            inDegree[child]--
            if inDegree[child] == 0 {
                queue = append(queue, child)
            }
        }
    }
    return result
}
```

### 列分配算法

```go
// 状态机示意图
//
// columns 初始为空
// 遍历每个 commit（从旧到新）：
//   commit C 在 columns 中找到自己 → C 所在列
//   找不到 → 分配新列
//   
//   生成 graph 行：
//   + *   → 当前 commit
//   + |   → 有分支经过
//   + \   → merge 分叉
//   + /   → merge 汇合
//   
//   更新 columns：
//   + 第一个父继承当前列
//   + 其余父分配到新列

func calculateBranchLanes(topoCommits []*object.Commit, 
                           refsMap map[string][]string, 
                           head *plumbing.Reference) []GraphLine {
    
    type column struct {
        hash string  // 当前列指向的 commit
        active bool  // 是否还有子提交在后面
    }
    columns := []column{}
    result := []GraphLine{}
    
    // 旧 → 新遍历
    for _, c := range topoCommits {
        h := c.Hash.String()
        
        // 找此 commit 所在的列
        colIdx := -1
        for i, col := range columns {
            if col.hash == h {
                colIdx = i
                break
            }
        }
        if colIdx == -1 {
            colIdx = len(columns)
            columns = append(columns, column{hash: h, active: true})
        }
        
        // 生成 graph 前缀
        var graphBuilder strings.Builder
        for i := 0; i < len(columns); i++ {
            if i == colIdx {
                graphBuilder.WriteByte('*')
            } else if columns[i].active {
                graphBuilder.WriteByte('|')
            } else {
                graphBuilder.WriteByte(' ')
            }
            if i < len(columns)-1 {
                graphBuilder.WriteByte(' ') // 列间分隔
            }
        }
        
        // 更新列状态
        parents := c.ParentHashes
        if len(parents) > 0 {
            // 第一个父继承当前列
            columns[colIdx].hash = parents[0].String()
            
            // 额外父分配到新列（merge）
            children_hashes := getChildren(topoCommits, h)
            for i := 1; i < len(parents); i++ {
                ph := parents[i].String()
                // 如果此父已有列或即将被其他子引用，复用
                found := false
                for j := range columns {
                    if columns[j].hash == ph {
                        found = true
                        break
                    }
                }
                if !found {
                    columns = append(columns, column{hash: ph, active: true})
                }
            }
        } else {
            // 根 commit，此列结束
            columns[colIdx].active = false
        }
        
        // ... 构建 GraphLine 对象
    }
    
    return result
}
```

### 前端渲染

移除 `@gitgraph/react`，改为简单的 monospace 渲染：

```tsx
function GraphAsciiView({ lines }: { lines: GraphLine[] }) {
  return (
    <div className="git-graph-scroll">
      {lines.map((line, i) => (
        <div key={i} className="git-graph-row">
          <pre className="git-graph-pre">{line.graph}</pre>
          {line.is_commit && (
            <span className="git-graph-info">
              <span className="git-graph-hash">{line.hash.slice(0, 7)}</span>
              {line.refs && <span className="git-graph-refs">{line.refs}</span>}
              <span className="git-graph-msg">{line.message}</span>
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
```

---

## 对比总结

| 维度 | 路径 A（修 @gitgraph/react） | 路径 B（Go 生成 ASCII） |
|------|:---:|:---:|
| 改动量 | ~40 行 | ~180 行 |
| 移除 @gitgraph/react | ❌ | ✅ |
| 纯 go-git | ✅ | ✅ |
| 渲染可靠性 | ⚠️ 依赖库质量 | ✅ 完全可控 |
| 与终端输出一致性 | ❌ | ✅ |

**推荐路径 B**：代码量虽大一些，但效果可控、无外部依赖、与 `git log --graph` 一致。
