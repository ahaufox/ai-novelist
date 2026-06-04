# Git 分支图改造方案：解析 `git log --graph --all` 直接渲染

## 关键前提：git CLI 可用性

查看 [`launcher/internal/updater/updater.go:148-195`](../launcher/internal/updater/updater.go:148) 发现启动器**自带 PortableGit**：

- `EnsureGit()` 函数会下载 PortableGit-2.54.0 并解压到 `projectDir/bin/git/`
- 最终 git.exe 位于 `projectDir/bin/git/bin/git.exe`
- 启动器的更新流程（clone/fetch）都依赖 go-git 库，但**同时也管理着独立 git 安装**

因此 `os/exec` 执行 `git log --graph --all` 的方案完全可行。启动器已经有 git CLI。

## 问题

当前 `分支图` tab 使用 `@gitgraph/react` 的 `import()` 方法渲染，但：
1. **数据排序问题**：后端按时间排序而非拓扑序，导致 `@gitgraph/react` 渲染连线混乱
2. **limit 截断**：200 commit 上限可能砍掉关键 merge base
3. **refs 标注不全**：只在 tip commit 标注，中间节点无分支标签
4. **白底与暗色主题不协调**：CSS 用了 `background: #fff`

## 方案：直接解析 Git 原生 `--graph` 输出

### 核心理念

```mermaid
flowchart LR
    A[后端 git log --graph --all] --> B[解析为结构化 GraphLine]
    B --> C[前端 monospace 渲染器]
    C --> D[分支全景拓扑图]
```

Git 的 `--graph` 标志已经能完美计算 branch lane 分配和 ASCII 连线，我们只需要：
1. 后端：调用 `git log --graph --all --format=...`，将输出解析为结构化行
2. 前端：用 monospace + 颜色高亮渲染

### 架构决策记录

| 决策 | 选择 | 理由 |
|------|------|------|
| Git 调用方式 | `os/exec` 执行 git 命令 | `go-git` 库不支持 `--graph` 标志 |
| 分隔符 | `\x1F` (Unit Separator) | 不可能出现在 commit message 中 |
| 前端渲染 | `<pre>` monospace + 行内颜色高亮 | 最可靠，和终端效果一致，无需额外依赖 |
| `@gitgraph/react` | 移除 | 不再需要 |

---

## 实施步骤

### Step 1: 后端 — 添加 `GraphLine` 类型和 `GetGraphOutput` 函数

**文件**: [`launcher/internal/gitman/gitman.go`](launcher/internal/gitman/gitman.go)

新增结构体：

```go
// GraphLine 分支图中的一行（可能是 commit 行或连接线）
type GraphLine struct {
    Graph     string `json:"graph"`      // ASCII 图前缀 (如 "*   ", "| * ", "|\\", "|/")
    Hash      string `json:"hash"`       // commit hash（连接线行为空）
    Parents   string `json:"parents"`    // 父 commit hash（连接线行为空）
    Message   string `json:"message"`    // commit message 首行（连接线行为空）
    Author    string `json:"author"`     // 作者（连接线行为空）
    Date      string `json:"date"`       // ISO 日期（连接线行为空）
    Refs      string `json:"refs"`       // refs 字符串如 "HEAD -> main, origin/main"（连接线行为空）
    IsCommit  bool   `json:"is_commit"`  // 是否为 commit 行
}
```

新增函数：

```go
const graphDelimiter = "\x1F"

func GetGraphOutput(projectDir string, maxCount int) ([]GraphLine, error)
```

实现逻辑：

```
1. 构造 git 命令:
   git -C <projectDir> log --graph --all 
       --format="%H%x1F%P%x1F%s%x1F%an%x1F%aI%x1F%D"
       --max-count=<maxCount>

2. 通过 os/exec 执行，捕获 stdout

3. 遍历 stdout 每行:
   a. 若包含 \x1F → commit 行
      - 在第一个 \x1F 处分割
      - 前半部分 = graph 前缀（如 "*   " 或 "| * " 等）
      - 后半部分按 \x1F 分割为 hash, parents, message, author, date, refs
      - IsCommit = true
   b. 若不包含 \x1F → 连接线行
      - 整行 = graph 前缀
      - IsCommit = false

4. 返回 []GraphLine
```

### Step 2: 后端 — 添加 Wails 绑定

**文件**: [`launcher/app.go`](launcher/app.go)

新增方法：

```go
func (a *App) GitGraphOutput(maxCount int) ([]gitman.GraphLine, error) {
    projectDir := a.getProjectDir()
    return gitman.GetGraphOutput(projectDir, maxCount)
}
```

Wails 会自动：
- 在 [`launcher/frontend/wailsjs/go/main/App.d.ts`](launcher/frontend/wailsjs/go/main/App.d.ts) 生成 `GitGraphOutput(arg1:number):Promise<Array<gitman.GraphLine>>`
- 在 [`launcher/frontend/wailsjs/go/models.ts`](launcher/frontend/wailsjs/go/models.ts) 的 `gitman` namespace 下生成 `GraphLine` 类

### Step 3: 前端 — 重构 GitManager.tsx 的分支图 tab

**文件**: [`launcher/frontend/src/components/GitManager.tsx`](launcher/frontend/src/components/GitManager.tsx)

修改点：

1. **移除 `@gitgraph/react` 导入**（第 18 行 `import { Gitgraph, TemplateName } from '@gitgraph/react'`）
2. **添加 `GitGraphOutput` 的 Wails 导入**（第 12 行附近）
3. **删除旧的 `GitGraphView` 组件**（第 210-265 行）
4. **替换为新的 `GraphAsciiView` 组件**：

```tsx
// 新增 GraphLine 接口（或从 wailsjs 生成的 models 中导入）
interface GraphLine {
  graph: string;
  hash: string;
  parents: string;
  message: string;
  author: string;
  date: string;
  refs: string;
  is_commit: boolean;
}

// 新增 GraphAsciiView 组件
function GraphAsciiView({ lines }: { lines: GraphLine[] }) {
  return (
    <div className="git-graph-scroll">
      {lines.map((line, i) => (
        <div key={i} className="git-graph-row">
          <pre className="git-graph-pre">{line.graph}</pre>
          {line.is_commit && (
            <span className="git-graph-commit-info">
              <span className="git-graph-hash">{line.hash.slice(0, 7)}</span>
              {line.refs && <span className="git-graph-refs">{line.refs}</span>}
              <span className="git-graph-msg">{line.message}</span>
              <span className="git-graph-author">{line.author}</span>
              <span className="git-graph-date">{formatDate(line.date)}</span>
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
```

5. **修改 graph tab 的数据获取逻辑**（第 72-85 行）：
   - 将 `GitFullGraph(200)` 替换为 `GitGraphOutput(200)`
   - 将 `setGraphCommits` 替换为新的 state `setGraphLines`

### Step 4: 前端 — 更新 CSS

**文件**: [`launcher/frontend/src/App.css`](launcher/frontend/src/App.css)

替换旧的 `.git-graph-panel` 相关样式（第 493-537 行）为：

```css
/* 分支图 ASCII 渲染 */
.git-graph-panel {
  height: 100%;
  overflow: auto;
  padding: 12px;
  background: var(--color-black);
  border: 1px solid var(--color-gray2);
  border-radius: 8px;
}

.git-graph-row {
  display: flex;
  align-items: center;
  gap: 0;
  font-size: 13px;
  line-height: 1.5;
  white-space: nowrap;
}

.git-graph-pre {
  margin: 0;
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, Courier, monospace;
  font-size: 13px;
  color: var(--color-gray4);
  white-space: pre;
  /* 保留 git 输出的原始间距 */
}

.git-graph-commit-info {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  margin-left: 4px;
  font-family: "SFMono-Regular", Consolas, monospace;
  font-size: 12px;
}

.git-graph-hash {
  color: var(--color-yellow);
  font-weight: 500;
  min-width: 56px;
}

.git-graph-refs {
  color: var(--color-green1);
  font-size: 11px;
  background: rgba(52, 235, 92, 0.1);
  padding: 0 6px;
  border-radius: 3px;
}

.git-graph-msg {
  color: var(--color-white);
  max-width: 400px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.git-graph-author {
  color: var(--color-gray4);
  font-size: 11px;
}

.git-graph-date {
  color: var(--color-gray5);
  font-size: 11px;
}
```

### Step 5: 清理 — 移除 `@gitgraph/react` 依赖

**文件**: [`launcher/frontend/package.json`](launcher/frontend/package.json)

移除：
- `"@gitgraph/core": "^1.5.0"`
- `"@gitgraph/react": "^1.6.0"`

然后执行 `npm install` 更新 lock 文件。

---

## 数据流示例

假设仓库有以下结构：

```
*   abc123 (HEAD -> main) Merge branch 'feature'
|\
| * def456 (feature) Add new feature
* | 789abc Fix typo
|/
* 111222 (origin/main) Initial commit
```

执行 `git log --graph --all --format="%H\x1F%P\x1F%s\x1F%an\x1F%aI\x1F%D" --max-count=200` 输出：

```
*   abc123\x1Fdef456 789abc\x1FMerge branch 'feature'\x1FAUTHOR\x1F2024-01-03\x1FHEAD -> main
|\x1F
| * def456\x1F111222\x1FAdd new feature\x1FAUTHOR\x1F2024-01-02\x1Ffeature
* | 789abc\x1F111222\x1FFix typo\x1FAUTHOR\x1F2024-01-02\x1F
|/\x1F
* 111222\x1F\x1FInitial commit\x1FAUTHOR\x1F2024-01-01\x1Forigin/main
```

注意：连接线行（`|\`, `|/`）后面也可能跟有 `\x1F`？不，实际上在 `--graph` 输出中，连接线行不包含 `--format` 的内容。所以连接线行只有 `|\` 或 `|/`，没有 `\x1F`。

等等，让我重新思考这个问题。`git log --graph --all --format="..."` 的输出格式是：

```
*   \x1Fhash\x1F...   (commit line with graph prefix + format data)
|\                    (connector line, no format data appended)
| * \x1Fhash\x1F...  (another commit line)
|/                    (connector line)
* \x1Fhash\x1F...    (commit line)
```

所以对于连接线行（`|\`, `|/`, `| |`, `| |\` 等），它们**不包含** `--format` 的内容。这意味着：
- 连接线行 = 原始 graph 前缀字符串
- Commit 行 = graph 前缀 + `\x1F` + 结构化数据

解析：判断行是否包含 `\x1F` 即可区分。

关于 limit：`--max-count=200` 限制的是 commit 数量，连接线行不计入。所以实际返回的行数会多于 200。

---

## 风险与注意事项

1. **git 命令可用性**：假设目标系统已安装 git。启动器需要 git 来拉取项目，所以这是合理的假设。
2. **长行截断**：graph 图可能很宽（多分支时），需要横向滚动。
3. **颜色支持**：`--graph` 默认无颜色，可加 `--color=always` 启用 ANSI 颜色，但前端解析复杂。建议不加颜色，前端自己按语义着色。
4. **`formatDate` 复用**：可以在 [`GitManager.tsx`](launcher/frontend/src/components/GitManager.tsx:267) 复用已有的 `formatDate` 函数。
5. **连接线行长度**：不同行的 graph 前缀长度可能不同，`<pre>` 的 monospace 确保对齐。
