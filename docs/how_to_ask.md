# 如何一次提问就解决问题

本文档总结：**在向 AI 编程助手提问时，怎样组织信息才能减少往返、一次就得到可用的修改**。来源于项目 RULES.md §4 的沉淀，供你直接参考。

---

## 1. 通用原则：说清「目标 + 范围 + 约束」

- **目标**：用一句话说明你要做什么（例如：「在 Gene 标题右边加一个 ? 图标，悬停提示仅显示前 200 条」）。
- **范围**：指明模块或文件（如「侧栏 / Sidebar」「后端 list_datasets」），避免 AI 猜错位置。
- **约束**：如有（如「提示词用英文」「不要改 API 路径」）一并写上。
- **可选**：期望的交互/文案/样式细节；若可接受默认实现则可不写。

**示例**：「在 Gene / Gene1 / Gene2 / Multi-gene 四个列表标题右侧都加上和 Gene 一样的 ? 说明图标，悬停文案统一用英文：Only the first 200 entries are shown; use search to narrow the range.」

---

## 2. 报错 / Bug 类：提供复现与期望

- **复现命令**：完整命令（含参数），例如：`make dev DATA_DIR=... HOST=... PORT=...`
- **完整输出**：从第一行到最后一行的报错（含 stacktrace），不要只贴最后几行。
- **环境信息**：OS、Python 版本、Node 版本、pixi 版本（如相关）。
- **改动范围**：最近修改了哪些文件/功能（如果知道）。
- **期望行为**：你希望最终看到什么结果（例如页面显示、API 返回、构建通过）。

---

## 3. 资源 404 / 不显示类（如图标、logo）

- **说清楚是哪一个 UI 元素**：例如「**不是**浏览器标签页上的小图标，是**页面里**侧边栏/顶栏上 SPATIALxGENE 标题**左边**的那个 logo 不显示」。
- **区分「标签页 favicon」和「页面内的 logo」**：两者都可能请求 `favicon.svg`，控制台报错一样，但修复位置不同。若只说「favicon 不显示」，AI 会默认当成标签页图标去改。
- **若该资源的 URL 不在网页源码里**：可补一句「这个图在浏览器查看网页源代码里找不到 href/地址」，这样会提示 AI 去查**前端代码**（React 组件、`img` 的 `src`）而不是只查 HTML 或 nginx。

**简短模板**：「页面上 [位置，如侧边栏顶部] 的 [元素，如 logo/图标] 不显示，控制台报 [资源] 404；不是标签页图标，是页面内容里的。」

---

## 4. Export PDF / 导出类

- **场景**：单样本还是多样本？当前颜色模式（Gene / Annotation / Multi-gene / Co-expression）？
- **现象**：缺标题 / 标题重复 / 点全灰 / 图例错位 / 尺度不对 / 编组后位置或大小不对 / 其他（一句话描述）。
- **可选**：导出后的 PDF 截图 + 当前界面截图（或说明「和界面一致/不一致」）。若涉及「在 Illustrator 中整体拖动图或图例」或「编组后位置/大小不对」，说明是 **plot**（组织图+点）还是 **legend**（色条/图例+背景），并附导出 PDF 截图。

**简短模板**：「Export PDF： [单样本/多样本]， [Gene/Multi-gene/…] 模式， [现象，如标题出现两次/多基因单样本全是灰点/编组后偏左下]。 [可选：附 PDF 与界面截图]。」

---

## 5. Pixi 依赖 / 环境问题（如 pytz、dateutil 找不到）

- **现象**：后端启动或 `pixi run python -c "import xxx"` 报 `ModuleNotFoundError: No module named 'pytz'`（或 dateutil），但 `pixi list pytz` 显示该包已存在。
- **说明**：`pixi list` 显示的是 **lockfile 里解析出的包**，不是当前磁盘环境的安装结果。若环境是早期创建的，lockfile 后来才加入该依赖，需要重新同步环境。
- **一次说清**：① 是否始终用 `pixi run launch` / `pixi run python`（不要用系统或其它环境的 Python）。② 报错全文 + `pixi list <包名>` 的输出。③ 若已加依赖到 pixi.toml，说明是否已执行过 `pixi install` 或 `pixi reinstall`。

**简短模板**：「依赖由 pixi 管理。现象： [报错原文]。`pixi list pytz` 有该包，但 `pixi run python -c \"import pytz\"` 报 ModuleNotFoundError。我用的启动方式是 [pixi run launch / 其他]。」

---

## 6. API 500 / 后端报错（如 dataset meta、坐标相关）

- **必给**：完整 traceback（含最后一层 ValueError/TypeError 与文件名、行号）；请求的 API 路径与参数（如 `GET /api/datasets/xxx`）；若与具体数据集相关，提供该数据集 id 或说明其特点（如 n_obs=0、无 spatial 等）。
- **可选**：该数据集是否特殊（空 h5ad、只有 meta 无坐标、中间带点的 id 等）；期望是返回 200 带默认值还是 404。

**简短模板**：「请求 [方法 + 路径，如 GET /api/datasets/MB_18mth-22_masked] 返回 500。报错： [粘贴完整 traceback]。该数据集 [是否为空/零观测/其它特点]。期望 [正常返回 meta / 返回 404]。」

---

## 7. 小结

| 类型           | 必给信息 |
|----------------|----------|
| 功能/需求      | 目标 + 范围 + 约束（可选：细节） |
| 报错/Bug       | 复现命令 + 完整输出 + 环境 + 期望 |
| 资源不显示     | 哪个 UI 元素、是否标签页图标、源码里能否找到地址 |
| 导出问题       | 单/多样本、颜色模式、现象（+ 截图更佳） |
| Pixi 依赖      | 报错全文 + 是否用 pixi run、是否做过 reinstall |
| API 500/后端   | 完整 traceback + 请求路径 + 数据集 id/特点 + 期望 |

一次把上述信息写全，助手就能更快定位并给出正确修改，减少多轮补充。
