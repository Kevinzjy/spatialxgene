# 项目协作规则

本文档记录项目开发编程助手的协作要求。**当出现错误/异常/结果不符合预期时，必须按本文流程处理并沉淀经验**。

---

## 0. 当前状态（简要）

- **已完成**：子路径部署、数据集/表达加载进度、无空间或 UMAP 时的快速提示、Annotation 类别过多/过少时的稳健展示、多级 data-dir 扫描、下拉框显示 .h5ad、preprocess 输出 leiden/louvain 与 counts layer、含多个点的 h5ad 路径解析、in_tissue 跳过 spot 过滤、adata.raw→layers['counts'] 后清空 raw、**pixi 迁移**、**seurat2h5ad**、**Preprocess + CellTypist**。**Multi-gene**：Pie/Grid 布局；Color range 与 Log scale 与 Gene 一致；无表达 spot 不画；Grid proportion≥5%；**部分基因在样本中缺失时仍正常展示**（至少一个基因有数据即显示 multigene，全 NaN 的基因层不传入，SpatialPlot 中 NaN 按 0 处理并保护 vmin/vmax）；**每样本右下角紧凑 color bar**（基因名 + 表达范围）。**多样本**：Gene/Annotation/Co-expression/Multi-gene 均支持多样本网格；**侧栏拖拽排序**已选数据集顺序；**Spot size** 最大 300%（UMAP 等适用）；**侧栏**整体上下滚动、隐蔽滚动条（`.sidebar-scroll`）、各区块 minHeight 保证可读。**Annotation 多样本图例**：每个样本图内的 categorical 图例只显示该样本的 color/label 与数量，不显示全样本合计。**顶部工具栏与 Export PDF**：主内容区顶部工具栏提供「Export PDF」按钮，通过 `exportPlotVector.ts` + jsPDF 矢量导出**单页 180×210 mm PDF**：spots、文字与图例为矢量，背景组织为栅格；所有 categorical/gene/multigene 图例与 color bar 对齐到每个样本 **panel** 的右下角，支持 Annotation（色块 + 标签 + 数量）、Gene（带标题的竖向 color bar，高在上）、Multi-gene（逐基因窄条 + 范围文字，行内垂直居中）。**Export PDF 编组**：每样本 plot（背景+组织图+spots）与 legend（color bar/图例+背景框）分别输出为 Form XObject（plotFormKey、legendFormKey），Illustrator 中可整体拖动；Form BBox 与 doFormObject 矩阵统一为 points（scaleFactor），位置与尺寸正确。**超分辨相关已移除**：BayesSpace / TESLA / H&E super_resolution 已删除。**本批**：**前端增量加载**（新增 dataset 只加载新 id，复用 cache，增量时不清 expression 等状态）；**Server adata LRU 缓存**（默认 16 条，`SPATIALXGENE_CACHE_MAX_DATASETS`）；**Preprocess 日志**（CLI 用 logging，Leiden 回退 warning）与**输入校验**（X 非空、n_obs/n_vars、X.size）；**Launch 目录提示**（data-dir 不存在或非目录时 stderr 提示 + 当前 DATA_DIR）；**后端单测**（pytest：list_datasets、get_dataset_meta、_get_plot_coordinates、run_preprocess）；**空数据集提示**（侧栏「No h5ad files found under {path}」，path 来自 /api/config 的 data_dir）；**主题色抽离**（:root CSS 变量 + theme.ts）；**基因列表说明**（Gene/Gene1/Gene2/Multi-gene 标题旁 ? 图标，悬停英文提示前 200 条 + 搜索）。**Pixi 依赖**：pytz、python-dateutil 在 pixi.toml 中显式声明（pandas 时区等）；lockfile 与磁盘环境不同步时用 `pixi reinstall` 同步。**get_dataset_meta 空坐标**：当 x/y 坐标数组为空（如 n_obs=0）时不再对空数组调用 np.nanmin/nanmax，改为返回默认 bounds (0,1)，避免 500。
- **待做**：见 [docs/tasks.md](docs/tasks.md)（如连续配色、前端单测、CI 等）。

---

## 1. 遇到错误时的处理流程（必须遵守）

当你（AI）在执行命令、构建、运行、测试或实现需求时遇到任何错误（含 TypeScript/Python 报错、运行时异常、结果不正确、性能不可用等），按以下顺序处理：

1. **先尝试直接修代码解决**
   - 优先从报错栈/编译报错定位到最小可疑范围。
   - 进行最小改动（smallest change）修复，并再次复现/验证错误是否消失。
   - 不要“猜测式大改”；每次修改都要能解释“为什么能修复这个错误”。

2. **如果无法解决：加 logging 输出更详细日志 → 通过日志分析再修**
   - 在关键路径加入更细粒度的日志（例如：输入参数、关键分支选择、数据尺寸/范围、耗时、返回值摘要等）。
   - 日志必须能帮助回答：**程序走到了哪一步？输入是什么？关键中间量是什么？异常前最后一次成功的状态是什么？**
   - 基于日志再定位问题，继续做最小修复并验证。

3. **如果仍然解决不了：输出可能的关键代码片段给我**
   - 把“最可能相关”的关键文件与函数片段输出出来（含必要上下文）。
   - 同时给出你认为的 3–5 个最可能原因与下一步排查建议。
   - 方便我把关键代码交给其他代码模型评估或人工进一步排查。

4. **当问题经过反复修改最终解决后：总结如何提问才能一次性解决，并写入本文件**
   - 总结“这次为什么没能一次性解决”的根因（信息缺失/环境差异/复现步骤不完整/日志不足/边界条件未说明等）。
   - 产出一个“下次提问模板”，说明用户应该提供哪些信息（命令、输出、文件路径、环境、期望结果等）。
   - 将上述教训追加到本文档的「4. 经验教训与提问模板」中，作为长期改进。

---

## 2. 日志规范（建议）

当进入步骤 (2) 时，日志建议包含：

- **输入与配置**：CLI 参数、环境变量、数据目录、数据集 id、host/port 等。
- **数据摘要**：`n_obs/n_vars`、坐标范围、类别数量、表达值 min/max（必要时采样）。
- **关键分支**：选择了 spatial/umap、使用了哪个 obs 列、是否命中缓存、是否走 fallback。
- **性能**：读文件耗时、API 响应耗时、前端绘制耗时（必要时）。
- **错误上下文**：异常栈、最后成功步骤、请求路径与参数。

---

## 3. 我（用户）对你（AI）的通用偏好

- **语言**：日常沟通使用中文。
- **代码与注释**：代码与代码注释使用英文（除非我明确要求中文注释）。
- **行动原则**：优先最小改动、可复现、可验证；不要在不确定时停下。

---

## 4. 经验教训与提问模板（持续追加）

### 4.1 下次我应该如何提问，帮助你一次性解决问题

**面向用户的精简版**：见 [docs/how_to_ask.md](docs/how_to_ask.md)，按问题类型（功能需求 / 报错 / 资源不显示 / 导出）组织信息，一次写全可减少往返。

当我报告一个问题时，尽量提供：

- **复现命令**：完整命令（含参数），例如：`make dev DATA_DIR=... HOST=... PORT=...`
- **完整输出**：从第一行到最后一行的报错（含 stacktrace）
- **环境信息**：OS、Python 版本、Node 版本、pixi 版本（如相关）
- **改动范围**：最近修改了哪些文件/功能（如果我知道）
- **期望行为**：我希望最终看到什么结果（例如页面显示、API 返回、构建通过）

**针对「某个图片/图标/资源 404 或不显示」类问题，第一次就修对的提问要点：**

- **说清楚是哪一个 UI 元素**：例如「**不是**浏览器标签页上的小图标，是**页面里**侧边栏/顶栏上 SPATIALxGENE 标题**左边**的那个 logo 不显示」。
- **区分「标签页 favicon」和「页面内的 logo」**：两者都可能请求 `favicon.svg`，控制台报错一样，但修复位置不同（前者改 HTML 注入/nginx，后者改前端组件里的 `img src`）。若只说「favicon 不显示」，AI 会默认当成标签页图标去改。
- **若该资源的 URL 不在网页源码里**：可以补一句「这个图在浏览器查看网页源代码里找不到 href/地址」，这样会提示 AI 去查 **前端代码**（React 组件、`img` 的 `src`）而不是只查 HTML 或 nginx。
- **简短模板**：「页面上 [位置，如侧边栏顶部] 的 [元素，如 logo/图标] 不显示，控制台报 [资源] 404；不是标签页图标，是页面内容里的。」

**针对「Export PDF / 导出类」问题，一次性说清可减少往返：**

- **场景**：单样本还是多样本？当前颜色模式（Gene / Annotation / Multi-gene / Co-expression）？
- **现象**：缺标题 / 标题重复 / 点全灰 / 图例错位 / 尺度不对 / 其他（一句话描述）。
- **可选**：导出后的 PDF 截图 + 当前界面截图（或说明「和界面一致/不一致」）。
- **简短模板**：「Export PDF： [单样本/多样本]， [Gene/Multi-gene/…] 模式， [现象，如标题出现两次/多基因单样本全是灰点]。 [可选：附 PDF 与界面截图]。」

**通用「一次提问就解决」模板（功能/需求类）：**

- **目标**：用一句话说清要做什么（例如「在 Gene 标题右边加一个 ? 图标，悬停提示仅显示前 200 条」）。
- **范围**：指明模块或文件（如「侧栏 / Sidebar」「后端 list_datasets」），避免 AI 猜错位置。
- **约束**：如有（如「提示词用英文」「不要改 API 路径」）一并写上。
- **可选**：期望的交互/文案/样式细节；若可接受默认实现则可不写。
- **示例**：「在 Gene / Gene1 / Gene2 / Multi-gene 四个列表标题右侧都加上和 Gene 一样的 ? 说明图标，悬停文案统一用英文：Only the first 200 entries are shown; use search to narrow the range.」

**针对「pixi 依赖 / 环境」类（如 pytz、dateutil 找不到）：**

- 说明是否始终用 `pixi run launch` / `pixi run python`；贴报错全文与 `pixi list <包名>` 输出；若刚在 toml 里加了依赖，说明是否已执行 `pixi install` 或 `pixi reinstall`。详见 docs/how_to_ask.md §5。

**针对「API 500 / 后端报错」类：**

- 贴完整 traceback（含最后一层异常与文件名、行号）；请求方法与路径（如 GET /api/datasets/xxx）；若与某数据集相关，给 dataset id 或说明特点（如 n_obs=0、空坐标）；期望是 200 带默认值还是 404。详见 docs/how_to_ask.md §6。

### 4.2 教训记录（模板）

> 每次“反复修改后才解决”的问题，都要在此追加一条记录。

- **问题**：<简述现象与报错>

#### pixi 迁移与测试数据统一（2026-02）

- **背景**：依赖与开发/生产统一由 pixi 管理；测试与示例数据从 data/ 迁到 tests/，便于与自动化测试一致。
- **约定**：① 依赖在 pixi.toml 中锁定为具体版本（`==x.y.z`），不发布 PyPI。② CLI 统一用 `spatialxgene`，不在任务中混用 `python -m spatialxgene.cli`。③ 测试数据：Visium 以 `tests/HCC1R.tar` 存放，`pixi run test` 解压→visium2h5ad→preprocess→launch，退出后删除生成的 h5ad。④ 日常 launch 默认 DATA_DIR=`./tests/h5ad`；Docker 挂载 `../tests/h5ad:/data`。⑤ clean 任务不再删除 `.venv`（pixi 环境在 .pixi/ 下）。
- **文档**：RULES §0 与 §4.3、development.md、deployment.md、docker/README、README、Makefile 的默认 DATA_DIR 与目录说明需与上述约定一致。
- **根因**：<信息缺失/边界条件/环境差异/实现错误/工具链问题等>
- **最有效的补充信息**：<如果一开始就提供，会更快解决的内容>
- **下次提问要点**：<可复制的提问模板>

---

#### Preprocess + CellTypist 自动注释（2026-02）

- **问题**：preprocess 需要为 spot 提供自动细胞类型注释，支持不同组织、人/鼠样本，且用 majority_voting 优化结果。
- **实现**：新增 `spatialxgene/celltypist_annotate.py`：物种推断（基因名 human 全大写 / mouse 首字母大写+小写）→ 一档快速注释推断组织 → 模型路由（免疫/组织表）→ 最终注释 majority_voting + over_clustering=leiden；小鼠使用 Immune_All_* 时对模型做 `Model.convert()` 人→鼠。结果写 `obs['auto_cell_type']`，可选 `obs['auto_cell_type_coarse']`，摘要写 `uns['celltypist_inferred']`。
- **根因/教训**：① CellTypist 在 majority_voting 下返回的 `predicted_labels` 可能是 DataFrame 或 2D 数组，直接 `pd.Series(labels)` 会触发 ValueError；需先判断类型，取第一列或 ravel 再建 Series。② 类型注解：项目用 Python 3.9，`str | None` 需改为 `Optional[str]`。③ 依赖 celltypist 通过 pixi pypi-dependencies 引入，版本用 `>=1.7,<2`（2.x 尚未发布）。
- **下次提问要点**：若扩展更多组织/物种，在 `HUMAN_LABEL_KEYWORD_TO_MODEL` / `MOUSE_LABEL_KEYWORD_TO_MODEL` 中增加 keyword→model 映射；新增物种需考虑是否有 CellTypist convert 或独立模型。

---

#### 子路径部署下「favicon/logo」不显示（2026-02）

- **问题**：nginx 用 `location /spatialxgene/` 反代到 5005，页面能打开，但控制台报 `GET .../favicon.svg 404`，页面上有图标/logo 显示不出来。
- **根因**：
  - 存在**两种**会请求 `favicon.svg` 的地方：① 浏览器**标签页图标**（HTML 里 `<link rel="icon" href="...">`）；② 前端**页面内的 logo**（Sidebar 里 `<img src="/favicon.svg">`）。控制台都只显示「favicon.svg 404」，无法区分。
  - 前期默认按「标签页 favicon」处理：改后端 HTML 注入、nginx 代理、根路径重定向等，没有去查前端组件里是否还有硬编码的 `src="/favicon.svg"`。直到用户明确说「不是标签页的 favicon，是页面左侧状态栏 SPATIALxGENE 标题左边的 logo」「源码里看不到 href」，才去搜 Sidebar，发现 `<img src="/favicon.svg">` 需改成带 `API_BASE` 的路径。
- **最有效的补充信息**：一开始就说清「是页面内容里的 logo（侧边栏/标题旁），不是浏览器标签页上的小图标」；或补充「这个图在网页源码里找不到地址」。
- **下次提问要点**：见 4.1 中「针对 某个图片/图标/资源 404 或不显示」的提问要点。

---

#### 本批功能与单测（增量加载、缓存、preprocess、空数据提示、主题、基因说明）（2026-02）

- **背景**：一批小需求与稳健性改进：前端增量加载 dataset、后端 adata LRU 缓存、preprocess 日志与输入校验、launch 时 data-dir 不存在提示、后端 pytest、空数据集时侧栏显示 data_dir、主题色抽离（CSS 变量 + theme.ts）、Gene/Gene1/Gene2/Multi-gene 旁 ? 说明图标。
- **教训**：① **增量加载**：选中 id 变化时只对「未在 cache 中已有 spatial 的 id」发起加载，并传入 `allSelectedIds` 供后端按需返回；增量模式下不清 expression/gene 等状态，避免闪烁。② **LRU 缓存**：用 `OrderedDict` 实现，get 时 move_to_end；环境变量 `SPATIALXGENE_CACHE_MAX_DATASETS`（1–128）控制上限。③ **Preprocess 单测**：fixture 的 `n_vars` 需 ≥ 200（scanpy QC 的 percent_top 含 200），否则会 IndexError；若断言「返回同一对象」易因实现细节失败，可只断言返回内容。④ **空数据提示**：后端 `/api/config` 提供 `data_dir`（解析后的路径），前端侧栏无 dataset 时显示 "No h5ad files found under {path}"，避免用户不知道检查哪个目录。⑤ **主题**：`:root` 变量与 `theme.ts` 同步，组件用 `var(--...)`，导出 SVG 时用 `THEME.xxx` 保证一致。⑥ **一次提问**：功能类需求若在第一次就给出「目标 + 范围 + 约束 + 可选细节」（见 4.1 通用模板），可减少多轮补充。
- **下次提问要点**：见 4.1「通用『一次提问就解决』模板（功能/需求类）」。

### 4.3 项目规范与发布教训（Spatialxgene）

- **环境与发布策略 (pixi + release pipeline)**
  - **开发环境**：所有依赖（含 Node.js）统一在默认环境中，简化开发流程。
  - **发布流程 (make release)**：在现代开发机上执行一键发布，自动产出前端静态资源、Python Wheel (`dist/`)、Docker 镜像、Docker Tar 以及 Singularity SIF 镜像 (`docker/`)。
  - **CentOS 7 部署**：由于 CentOS 7 glibc (2.17) 过低，无法直接安装 Node.js 22+ 及部分新版 Python/R 库，**统一使用 Singularity (SIF) 镜像进行部署**。SIF 内部包含完整的运行时库，完美解决兼容性问题。详见 `docs/deployment.md`。

- **测试数据与目录约定**
  - **tests/**：测试与示例数据所在目录。Visium 原始数据以 tar 存放（如 `tests/HCC1R.tar`），`pixi run test` 会解压到 `tests/HCC1R`、跑 visium2h5ad → preprocess、用 `--data-dir ./tests` 启动 viewer，退出后删除生成的 `tests/HCC1R*.h5ad`。
  - **tests/h5ad/**：日常 launch 的默认数据目录（pixi.toml 中 launch 的 DATA_DIR）。将预处理的 h5ad 放在此目录，`pixi run launch` 即可在侧边栏看到。Docker 默认挂载 `../tests/h5ad:/data`，与本地一致。
  - 不再使用 `data/` 作为默认数据目录；若需自建目录，可通过 `DATA_DIR=... pixi run launch` 或 compose 的 volumes 覆盖。

- **服务器网络权限**
  - 生产环境网络权限较严：**只能获得一个代理端口的权限**（例如 nginx 上仅能配置一个 `location /spatialxgene/` 反代到本应用）。不能为项目单独增加根路径或其它全局路由（如 `/favicon.svg`、`/api` 等）。
  - 因此子路径部署时，所有静态资源与 API 必须都落在该唯一 location 下（如 `/spatialxgene/...`）。后端通过 `--api-base` / `SPATIALXGENE_API_BASE` 注入 base，前端 HTML 与组件（含 favicon、logo、assets、API）全部使用该 base，不依赖 nginx 侧再配其它 location。本地 nginx 测试配置（`docker/nginx-test.conf`）也仅保留该一个 location，与生产一致。

- **数据集加载进度条**
  - 采用按步骤的进度（4 个请求：meta / spatial / obs / var，每完成一个 +25%），避免用户误以为页面卡死。全部完成后保持 100% 约 400ms 再关闭 loading，避免“到 75% 就突然结束”的体感；若在等待期间用户切换了数据集则直接 return，由 finally 收尾。

- **打包与前端**
  - 若需打包（如 Docker 或本地安装），前端必须打进包：用 `[tool.setuptools.package-data]` 包含预构建的 `frontend/dist/**`；打包前必须先 `pixi run build`。否则 `spatialxgene launch` 会报 “Frontend not found”。项目不发布到 PyPI，依赖与部署均由 pixi 管理。

- **README**
  - 项目不发布 PyPI，README 面向从源码/仓库使用或部署的用户。可包含 Requirements、Install（pixi 从源码）、Commands、Quick start、Data format、`--help` 提示；可链到 docs、make、pixi 等。

- **发布与版本文档**
  - 发布说明统一放在 CHANGELOG.md；不再维护单独的 `docs/release_notes_*.md`，避免两处不一致。新版本在 CHANGELOG 增加条目，重要版本可在条目下用 “Release notes (merged)” 子段概括 scope 与教训。
  - **版本号必须三处同步**：发版时同时修改 `spatialxgene/__init__.py`（`__version__`）、`pyproject.toml`（`version`）、`spatialxgene/frontend/package.json`（`version`），以及 `spatialxgene/frontend/package-lock.json` 中顶层和 `""` 包的 `version`；否则 API/前端显示的版本会不一致。
  - 默认配置（如 host/port）若在代码中修改，需同步改文档（README、docs/development.md、前端 vite proxy 等），避免文档与行为不一致。

- **前端：大数组不要用 spread 展开**
  - 在 JavaScript/TypeScript 中，`Math.min(...arr)`、`Math.max(...arr)` 会把数组元素展开为函数参数。当 `arr` 长度很大（例如几十万，如基因表达向量）时，会触发 **RangeError: Maximum call stack size exceeded**。
  - 规则：**任何可能很大的数组（如 expression、continuousValues、colorBy）求 min/max 或类似聚合时，必须用 for 循环逐项比较，禁止 `Math.min(...arr)` / `Math.max(...arr)`。** 同理，避免对超大数组做 `sort`、递归或其它会导致调用栈/参数列表过长的操作；百分位等已有 `utils/percentile` 的直方图 O(n) 实现，可复用。
  - 适用文件：前端所有涉及「全量数组聚合」的 useMemo / 绘图逻辑（如 App.tsx 的 continuousColorRange、Sidebar 的 colorbarStats、SpatialPlot 里连续模式的 vmin/vmax）。

- **前端：跨浏览器与 canvas 性能**
  - 拖拽、缩放、悬停等高频更新必须用 **requestAnimationFrame** 批量（每帧最多一次 setState），避免每事件一次 setState 导致卡顿或 Safari/Firefox 表现异常。
  - 悬停/命中检测要做 rAF 节流，避免在 mousemove 里做重计算或重复 setState。
  - Canvas 的 **devicePixelRatio** 建议封顶（如 2），避免高 DPR 设备上 canvas 过大导致内存与帧率问题。
  - 修改拖拽/悬停逻辑时注意 **useEffect、useCallback 的依赖**：漏掉依赖会导致闭包陈旧或重复订阅，出现“松手后仍跟手”“悬停不更新”等问题；多写依赖则可能造成不必要的重绘，需在正确性与性能之间权衡。
  - 浏览器差异：Firefox 等可对 LOD（可见点数上限）使用更保守的值（如 60k vs 120k），避免缩放时卡顿。

- **后端：无空间/UMAP 数据集的快速判断**
  - 若仅需判断「是否有可绘图坐标」而不需要完整 AnnData，用 **h5py** 只读 HDF5 结构（obsm 的 key、shape），避免 `anndata.read_h5ad()` 全量加载。这样在「不可视」数据集上可立即返回 200 + `viewable: false`，前端直接提示重选，无需等加载再 404/500。
  - API 设计：对「存在但不可视」用 200 + 布尔/原因字段，比 404 更清晰，且前端可区分「未找到」与「找到但无坐标」。

- **前端：Annotation 类别过多/过少**
  - 不要用弹窗打断用户。当唯一值过多（如 barcode）或过少时，视为「非有效分类」：所有点统一默认色，图例中显示 "nan (too many categories)" 或 "nan (too few categories)"。常量与 colorScale 中约定一致（如 `LABEL_NAN_TOO_MANY`），便于图与图例一致。

- **前端：useMemo 依赖与 UI 切换**
  - 凡由用户切换控制的计算（如 Annotation 的 Numerical/Categorical），**切换状态（如 obsValueType）必须放进 useMemo 的依赖数组**。否则切换后图例更新而图上颜色不更新（闭包用了旧的 computed 值）。

- **Preprocess 管道：返回值与 layers**
  - **问题**：preprocess 跑完后，前端 Annotation 下拉里没有 leiden/louvain；counts layer 与 X 无区别（未在标准化前保存）。
  - **根因**：① `preprocess_file()` 调用了 `run_preprocess(adata, **kwargs)` 但**没有用返回值**，写盘时写的是原始 adata，所以 dimred/cluster 和 layers 的修改都没进输出。② counts 必须在 **normalize_total / log1p 之前** 执行 `adata.layers["counts"] = adata.X.copy()`，否则 X 已被覆盖。
  - **经验**：管道函数若返回「修改后的副本」，调用方**必须**用返回值写盘（如 `adata = run_preprocess(adata, **kwargs)`）；从 HVG 子集复制回完整 adata 时，**leiden 和 louvain 都要复制**（若存在），保证两个聚类列都出现在最终 h5ad 的 obs 里；保存 counts layer 的时机固定为「filter 之后、normalize 之前」，并在代码中加注释说明。可在 `run_preprocess` 末尾和 `preprocess_file` 写盘前打日志（obs 含 leiden/louvain、layers 列表），便于排查。

- **后端：dataset id 与含多个点的文件名**
  - **问题**：如 `2025_NC_SPATCH/HCC_Stereo-seq_v1.3.h5ad`，前端选后报 "Dataset 2025_NC_SPATCH/HCC_Stereo-seq_v1.3 not found"，其他 h5ad 正常。
  - **根因**：`_get_dataset_path` 用 `(DATA_DIR / dataset_id).with_suffix(".h5ad")` 拼路径。pathlib 的 `with_suffix` 只替换**最后一个**点及其后的「后缀」；对 `HCC_Stereo-seq_v1.3` 而言最后一个后缀是 `.3`，被换成 `.h5ad` 后得到错误路径 `.../HCC_Stereo-seq_v1.h5ad`。
  - **经验**：由 id 还原 h5ad 路径时，不要用 `Path.with_suffix(".h5ad")`；应判断 id 是否已以 `.h5ad` 结尾，否则用字符串拼接 `DATA_DIR / (dataset_id + ".h5ad")`，这样 `sample_v1.3`、`foo.v2.reprocessed` 等中间带点的文件名都能正确解析。列表接口里 `rel.with_suffix("")` 去掉的是整段路径的最后一个后缀（即 `.h5ad`），得到的 id 本身是正确的，无需改。

- **Preprocess：in_tissue 时跳过 spot 过滤**
  - **问题**：Visium 等数据有 `obs['in_tissue']`，若仍按 `min_genes` 过滤细胞，会删掉大量组织上的 spot，图上可见点变少。
  - **经验**：若 `"in_tissue" in adata.obs.columns`，则**不**做按基因数的 cell 过滤（保留所有 spot）；仅在无 `in_tissue` 时执行 `min_genes` 过滤。基因过滤（min_cells）照常。

- **Preprocess：adata.raw 与写盘**
  - **问题**：CosMx 等流程会设置 `adata.raw`，且 `raw.var` 可能含保留列 `_index`，anndata 写 h5ad 时报 `ValueError: '_index' is a reserved name`。
  - **经验**：写盘前若存在 `adata.raw`，先将 `raw.X` 写入 `layers['counts']`（当 `raw.n_obs == adata.n_obs` 且 var 可对齐时：同序或 adata.var_names ⊆ raw.var_names），再执行 `adata.raw = None`，既保留原始计数又避免写盘错误；viewer 只依赖 X 与 layers。

- **Layers 命名约定**
  - 未标准化计数层统一用 **`layers['counts']`**，与 scanpy/AnnData 常见用法一致，避免使用 `raw_counts` 等非主流命名。文档与日志、CLI 帮助、前端注释中的示例均使用 `counts`。

- **seurat2h5ad：R 与空转 h5ad 格式**
  - **SeuratObject 5 API**：`GetAssayData(obj, slot = "counts")` 已废弃，须改用 **`layer = "counts"`**（及 `layer = "data"` 作 fallback），否则 R 报 defunct。
  - **R writeBin 与 array**：对 3D array 直接 `writeBin(arr, con)` 时，R 可能只写出少量字节（如仅 8 字节头）。须改为 **`writeBin(as.vector(arr), con)`** 再写像素数据，Python 端按列优先 (F-order) 按 channel 分段 reshape 读回。
  - **空转 h5ad 组织图格式（与 viewer 对齐）**：以「格式正确的」参考 h5ad（如 Control06_processed.h5ad）为准。① 坐标与图像同空间时（Seurat 的 imagecol/imagerow = 图像像素），**`tissue_hires_scalef = 1.0`**，viewer 约定 `image_pixel = data_coord * scale_factor`，故 1.0 才能对齐。② 图像键名用 **`hires`**、**`lowres`**（与 Visium/参考一致）；图像存 **float32 [0,1]**。③ 可选 lowres：从 hires 缩放到 max 400px，`tissue_lowres_scalef = lowres_width / fullres_width`。④ 不要误用 Seurat 自带的 scale.factors 作为 tissue_*_scalef（语义不同，会导致图与 spot 错位）。
  - **测试**：`pixi run test` 在存在 `tests/P2N_Spatial.rds.gz` 时会跑 seurat2h5ad，退出后清理 `tests/P2N_Spatial*.h5ad`。

- **Preprocess + CellTypist 自动注释**
  - **功能**：preprocess 默认在降维聚类后跑 CellTypist，将预测的细胞类型写入 **`obs['auto_cell_type']`**；免疫富集样本可选写入 **`obs['auto_cell_type_coarse']`**（Immune_All_High 粗分类）。推断结果摘要存 **`uns['celltypist_inferred']`**（含 `species`、`tissue_context`、`suggested_model`、`immune_frac`、`top_labels` 等）。
  - **物种推断**：根据 `var_names` 基因命名约定自动判断人/鼠：人（全大写字母，如 CD4、CD8A）vs 鼠（首字母大写+小写，如 Cd4、Cd8a）；`unknown` 时按人处理。小鼠使用免疫模型（Immune_All_Low/High）时通过 CellTypist `Model.convert()` 做人→鼠同源转换后再预测。
  - **模型路由**：先快速一档注释（默认 Immune_All_Low，小鼠则先 convert）得到标签分布 → 推断组织上下文（immune_enriched / tissue_specific / unknown）→ 选定模型（免疫富集用 Immune_All_Low；或按 top labels 选组织模型，人用 HUMAN_LABEL_KEYWORD_TO_MODEL、鼠用 MOUSE_LABEL_KEYWORD_TO_MODEL）。最终注释使用 **majority_voting=True**、**over_clustering='leiden'**（或 louvain）优化结果。
  - **依赖**：celltypist（PyPI，pixi 的 pypi-dependencies；pyproject.toml 亦声明）。首次运行会从 CellTypist 服务器下载模型（如 Immune_All_Low.pkl）到 `~/.celltypist/data/models`。
  - **CLI**：`--no-celltypist` 跳过注释；`--celltypist-model NAME` 强制指定模型；`--celltypist-min-prop FLOAT` 设置 majority voting 的 min_prop。
  - **教训**：① CellTypist 开启 majority_voting 时 `result.predicted_labels` 可能为 DataFrame 或 2D 数组，需统一取第一列再转 Series，否则 pd.Series(labels) 会报 ValueError。② Python 3.9 不支持 `str | None` 类型语法，preprocess 参数需用 `typing.Optional[str]`。③ pixi global install 本地项目需用 `pixi global install --path .` 而非 `pixi global install .`（后者会把 `.` 当包名）。

- **Multi-gene：Pie/Grid 布局与 Color range/Log scale 统一（2026-02）**
  - **取舍**：多基因从「jitter 点图（Cell2Location 风格）」改为 **Pie**（圆形 spot 饼图）与 **Grid**（方形 spot 等大小方块、正多边形中心排布、clip 在 spot 内），便于解读比例与共定位；无表达 spot 不画。
  - **与 Gene 模式统一**：Color range（pmin/pmax）与 Log scale 的 UI（Sidebar 两个输入框 + 解析展示）与数据流与 Gene 模式一致：App 状态 `multigeneRangeMinInput` / `multigeneRangeMaxInput` → 传给 SpatialPlot → `parseMultigeneRange` + `percentile` 得到每基因 vmin/vmax，避免两套逻辑分叉。
  - **Grid 设计**：统一像素大小（`squareSide` 由 maxK 决定，所有 spot 一致，LED 式）；仅绘制 proportion ≥ 5%（`MIN_PROPORTION_GRID`）的基因，减少噪声；按表达量排序排布小方块。
  - **教训**：若 Sidebar 与 Plot 共用「percentile 解析」逻辑，解析函数参数（如是否 log、用哪一层）要与调用方一致，且依赖数组（如 genes、layer、layout）变化时 useMemo 需包含这些依赖，否则会出现切换基因/布局后范围或绘图未更新的问题。

- **Multi-gene 部分基因在样本中缺失（2026-02）**
  - **问题**：若多基因模式下某个基因在某个样本中不存在或全为 NaN，该样本整图一直显示 nan 状态，其他有表达的基因也不更新。
  - **根因**：① 多样本时 slotPlotMode 要求「所有基因都有数据」才返回 multigene，导致缺基因的样本直接 fallback 为 none。② 单样本 multigeneLayers 只过滤 length，未过滤全 NaN 的层。③ SpatialPlot 中某层为 NaN 时 sum 变为 NaN，导致 spot 被跳过或比例异常；vmin/vmax 若 percentile 得到 NaN 会破坏颜色尺度。
  - **修复**：① App：slotPlotMode / plotColorMode 改为「至少一个基因有数据」即显示 multigene（hasAnyLoaded / hasAnyWithData）。② slotMultigeneLayers 与单样本 multigeneLayers：在 length 检查后增加 `slice.some(Number.isFinite)`，排除全 NaN 的基因层。③ SpatialPlot：取值用 `Number.isFinite(raw) ? Math.max(0, raw) : 0`；sum 检查 `Number.isFinite(sum) && sum > 0`；vmin/vmax 若非法则 fallback 为 0 与 vmin+1。
  - **下次要点**：多模式「部分数据缺失」时应按「有则显示」而非「全有才显示」；传入绘图组件的 layers 需过滤掉无效层；绘图侧对 NaN 做防护与 fallback。

- **侧栏整体滚动与隐蔽滚动条（2026-02）**
  - **需求**：侧栏内容多时显示不全，需要整体上下滚动，且滚动条不要特别明显；Datasets、Gene 等区块给定一定空间，避免被压缩到看不见。
  - **实现**：① 在 index.html 中增加全局样式类 `.sidebar-scroll`：Firefox 用 `scrollbar-width: thin` + `scrollbar-color`；WebKit 用 `::-webkit-scrollbar` 宽度 6px、轨道透明、滑块半透明白。② 侧栏主内容区 div 加 `className="sidebar-scroll"` 并保持 `overflow: auto`、`flex: 1`、`minHeight: 0`。③ 各列表容器（Datasets、Gene、Co-expression Gene1/Gene2、Multi-gene 列表、Annotation legend、拖拽排序列表等）设置 `minHeight`（如 80–120px）和 `maxHeight`，并加 `sidebar-scroll` 与 `flexShrink: 0`，保证区块不被压扁。
  - **教训**：滚动条样式依赖伪元素，需在全局 CSS 或 index.html 的 `<style>` 中定义；inline style 无法设置 `::-webkit-scrollbar`。

- **JSX 闭合标签与构建校验（2026-02）**
  - **问题**：SpatialPlot 中 multigene color bar 块移入 canvas 容器后，少写了一个 `</div>`，导致 "JSX element 'div' has no corresponding closing tag" 及 TS1381/TS1005，`pixi run build` 失败。
  - **根因**：在 return 中新增一块条件渲染（multigene color bar）并放入 containerRef 的 div 内后，只保留了一个 `</div>` 收尾，实际需要先关闭 containerRef 的 div，再关闭最外层 div。
  - **下次要点**：改 JSX 结构（尤其是嵌套 div、条件块）后务必跑一次 `npm run build` 或 `tsc -b`；每增加一个开标签要确认对应一个闭标签，可按层级缩进或注释标清每层对应关系。

- **Export PDF 向量化与多样本缩放（2026-02）**
  - **实现（向量导出）**：顶栏「Export PDF」按钮通过 `jspdf` + `exportPlotVector.ts` 直接画向量，而不是截图 DOM：  
    - PDF 页面固定为 **180×210 mm**（竖版，单页导出当前所有样本）；按样本数选择 2 或 3 列、若干行，给每个样本分配等大的 cell，cell 里再划分标题带与内容区域。  
    - 对每个样本用最近邻搜索估计「典型相邻 spot 间距」，结合最大有效范围（spots 与背景图 bounds 的 union），计算一个全局 `scaleMmPerData`，使所有样本在 PDF 中的 **spot 中心间距统一到同一物理尺度**。  
    - 背景组织图作为 raster 图层嵌入，位置/尺寸完全由 `backgroundImageBounds` 与有效 bounds 决定；spots、标题、legend、color bar 等全部由 jsPDF 画成可编辑的向量元素。前端为每个样本计算 `panelRect`（该样本 panel 在 PDF 中的 cell 区域），PDF 端所有图例与 color bar 都以 `panelRect` 的右下角为锚点，对齐到 **panel** 而不是 spots 范围。  
  - **模式对齐与图例布局**：  
    - Annotation（categorical）：App 为单/多样本构建 per-sample legend（label、color、count），PDF 在 panel 右下角画带背景框的紧凑 legend：每行「色块 + 标签（浅色）+ 数量（灰色）」，标签与数量之间固定留一个字符宽度，内容 `contentY` 做轻微下移，使整个块在背景框内视觉上垂直居中；图例只统计当前样本的类别与数量。  
    - Gene（continuous）：App 计算 `colorBarStats = {lo, mid, hi}` 与 `colorBarTitle`（基因或数值字段名），PDF 在 panel 右下角画包含标题的背景框：上方一行标题文本（左对齐并与竖条左边缘对齐），下方是竖直渐变色条（顶部为高表达、底部为低表达）及右侧 hi/mid/lo 数值刻度；色条通过 `continuousPalette` / `continuousPaletteReverse` 与 UI 保持同一配色与是否反转。  
    - Multi-gene：导出时传入每个样本的 multigene spots（x/y+segments）与 per-gene vmin/vmax 和 paletteId，PDF 端根据 layout=Pie/Grid 画扇形或方块，并在 panel 右下角画带背景框的 multigene 图例：每个基因占一行，包含一条窄梯度条（黑→强调色）与「gene vmin–vmax」文本，通过 `centerY` 让色条与文字在该行内垂直居中，整体布局与前端 multigene legend 一致。  
  - **多样本网格 layout**：前端多样本视图使用 CSS grid，列数由样本数决定，并为每个 cell 定义最小宽/高；当窗口过窄时由外层滚动容器承担滚动，而不是无限压缩某些样本，PDF 端也遵守「先按样本数限定 cell 尺寸，再在 cell 内画图」的思路。
  - **教训**：  
    - jsPDF 的 `setGState` 必须传 `new GState({...})` 实例，传字面对象会导致 `Zt[q].equals is not a function`；需在动态导入时显式解构 `GState` 并作为构造函数传入导出函数。  
    - 不要用「统一 spot 半径」这种硬方式去同步尺度；更稳妥的做法是以 **相邻 spot 中心间距** 为基准，统一「邻距→毫米」映射，再用 fixed page + cell 布局控制 panel 尺寸。  
    - 调试尺度/排版问题时，第一次提问就尽量提供：① 前端截图（包含 spotSize、背景开关、multi-gene 布局等）；② 对应 PDF 截图；③ 导出时控制台中每个样本的 metrics（dataW/dataH/spacing/scaleMmPerData 等），否则很难一次把「屏幕效果」和「PDF 排版」同时修对。

- **Export PDF 单样本标题与 Multi-gene、标题不重复（2026-02）**
  - **问题**：① 单样本导出 PDF 没有标题；② Multi-gene 单样本导出 PDF 所有点为灰色，无多基因表达；③ 单/多样本导出后 PDF 中出现两个样本名（一个在标题带，一个在图内）。
  - **根因**：① 单样本分支 scatter 任务传了 `title: undefined`，且 draw 函数未画标题；后改为传 `singleTitle` 并在 App 的标题带画标题。② 单样本分支未按 `plotColorMode` 分支，Multi-gene 时仍走 scatter，`colorByToHex` 无 multigene 分支→灰色；改为 `plotColorMode === "multigene"` 时构建 **multigene** 任务（spots + legendLayers），与多样本一致。③ 标题在 App 布局的 **title band**（cellTop + 3.5）已画一次，传入 draw 的 `pageRect` 实为 **contentRect**（绘图区）；若在 `drawPlotToPdfVector`/`drawMultigenePlotToPdfVector` 内再画 title，会画在 contentRect 顶部即图内→重复。  
  - **约定**：**样本标题只画一次**，在 App.tsx 的 PDF 布局循环里、按 cell 的 title band 位置画（`cellLeft + cellSize/2`, `cellTop + 3.5`）；`exportPlotVector.ts` 的 draw 函数**不再**画 title，只负责背景+图+图例。单样本导出须与多样本一致按 **plotColorMode** 分支：multigene → 建 multigene 任务（layers、vmin/vmax、spots、legendLayers），否则 → scatter。
  - **下次提问要点**：报 PDF 导出问题时说明：单样本还是多样本、当前是 Gene/Annotation/Multi-gene/Co-expression、现象是缺标题/颜色全灰/标题重复/图例错位等；若方便附导出 PDF 截图与当前界面截图。

---

#### Pixi 依赖与环境不同步（pytz/dateutil 等，2026-02）

- **问题**：后端报 "Unable to import required dependencies: pytz" 或 "dateutil"；`pixi list pytz` 显示包已存在，但 `pixi run python -c "import pytz"` 报 ModuleNotFoundError。
- **根因**：`pixi list` 显示的是 **lockfile 解析结果**，不是磁盘上当前环境的安装列表。若环境是 lockfile 更新前创建的，或 install 未把新依赖写入磁盘，就会出现「list 有、import 无」。
- **修复**：① 在 pixi.toml 中显式声明 `pytz` 与 `python-dateutil`（pandas 时区等需要）。② 运行 **`pixi reinstall`** 按 lockfile 完整重装 default 环境，缺失的包会被装上。仅 `pixi install` 有时不会补装已存在于 lockfile 但未写入 env 的包。
- **下次提问要点**：说明是否用 `pixi run` 启动；贴报错与 `pixi list` 输出；若刚改过 toml，说明是否已执行 reinstall。见 4.1「pixi 依赖/环境」与 docs/how_to_ask.md §5。

---

#### get_dataset_meta 空坐标数组导致 500（2026-02）

- **问题**：请求 `GET /api/datasets/{id}` 返回 500，traceback 为 `ValueError: zero-size array to reduction operation fmin which has no identity`，发生在 `get_dataset_meta` 的 `np.nanmin(x)`。
- **根因**：当数据集 **n_obs=0** 或坐标数组 x/y 为空时，`np.nanmin`/`np.nanmax` 对空数组归约会抛错。
- **修复**：在计算 bounds 前判断 `x.size == 0 or y.size == 0`；若为空则使用默认 `(0.0, 1.0, 0.0, 1.0)` 作为 x_min/x_max/y_min/y_max，与「无空间/无 UMAP」时的 fallback 一致，API 仍返回 200，前端可正常展示空数据集。
- **教训**：对来自 adata 的坐标做 nanmin/nanmax 前应先检查数组 size，避免零长数组归约。
- **下次提问要点**：API 500 类需贴完整 traceback + 请求路径 + 数据集 id 或特点（是否空/零观测）。见 4.1「API 500/后端」与 docs/how_to_ask.md §6。

---

#### Export PDF Form XObject 编组与单位统一（2026-02）

- **需求**：导出的 PDF 中「组织图+spots」和「color bar/图例+背景」在 Illustrator 中能分别整体拖动；编组后位置与大小需与未编组时一致。
- **实现**：① App 在导出循环中为每个样本设置 `plotFormKey`、`legendFormKey`，使 `exportPlotVector.ts` 将 plot 与 legend 分别画入 Form XObject 再 `doFormObject` 放置。② **单位统一**：jsPDF 在 COMPAT 下写入 stream 时用 `scale()`，坐标为 **points**（scaleFactor×用户单位）；Form 的 BBox 来自 `beginFormObject` 的 width/height，若传 mm 则 BBox 为 mm、stream 为 points，会错位与缩放错误。修复：用 `getScaleFactor(pdf)`（`pdf.internal.scaleFactor`，mm 下约 72/25.4），`beginFormObject(0, 0, w*scaleFactor, h*scaleFactor)` 使 BBox 与 stream 均为 points；`formPlaceMatrix` 的 tx/ty 改为 `x*scaleFactor`、`(pageHeightMm - y - h)*scaleFactor`，与页面 stream 单位一致。
- **教训**：使用 jsPDF Form XObject 时，**BBox 与 doFormObject 的矩阵必须与 Form 内部 stream 及页面 stream 单位一致**（均为 points）；用户单位（如 mm）需乘 `scaleFactor` 后再传 `beginFormObject` 和放置矩阵。
- **下次提问要点**：若导出 PDF「编组后位置/大小不对」，说明是 plot 还是 legend、现象（偏左下/尺寸错等），并附 PDF 截图；便于判断是否为 Form 单位或放置矩阵问题。

---

## 5. 开发经验规则总结（快速参考）

以下为 §4 的提炼，新成员或 AI 协作时优先遵守。

| 领域 | 规则 |
|------|------|
| **错误处理** | 先最小改动修代码 → 加日志再定位 → 仍不行则输出关键片段与可能原因；解决后把提问模板写入 §4.1。 |
| **沟通** | 日常用中文；代码与注释用英文。 |
| **版本号** | 发版时同步改 `spatialxgene/__init__.py`、`pyproject.toml`、`frontend/package.json`（及 package-lock 顶层 version）。 |
| **前端大数组** | 禁止 `Math.min(...arr)` / `Math.max(...arr)`，用 for 循环或 `utils/percentile`；避免对超大数组 spread/递归。 |
| **前端交互** | 拖拽/悬停用 rAF 节流；useMemo/useCallback 依赖要完整，否则闭包陈旧。 |
| **后端路径** | 由 dataset_id 拼 h5ad 路径用 `id + ".h5ad"`，不用 `Path.with_suffix(".h5ad")`（中间带点的文件名会错）。 |
| **后端 viewable** | 用 h5py 只读结构判断是否有空间/UMAP，避免全量读 adata；返回 200 + `viewable: false`。 |
| **Preprocess** | 调用方必须用 `run_preprocess` 返回值写盘；counts 在 normalize 之前写入 layers；有 in_tissue 时跳过 min_genes 过滤；写盘前有 raw 则拷到 layers['counts'] 后清空 raw。 |
| **子路径部署** | 所有资源与 API 落在同一 location；前端用 `API_BASE`；favicon/logo 404 时区分「标签页图标」与「页面内 logo」。 |
| **文档** | 变更行为后同步 README、CHANGELOG、RULES、docs；发布说明只维护 CHANGELOG。 |
| **Multi-gene** | 与 Gene 模式共用 Color range（pmin/pmax）/Log scale 的解析与状态流；Grid 布局统一像素、仅画 proportion≥5%；useMemo 依赖含 genes/layout/layer 等。**部分基因缺失**：至少一个基因有数据即显示 multigene；传入的 layers 排除全 NaN 的基因；SpatialPlot 中 NaN 按 0、vmin/vmax 做 fallback。 |
| **侧栏滚动** | 主内容区用 `.sidebar-scroll`（index.html 定义）+ overflow auto；列表区块设 minHeight/maxHeight 与 flexShrink:0，避免压扁。 |
| **JSX 结构** | 增删条件块或嵌套 div 后跑 build 校验；每个开标签必须有对应闭标签，注意层级。 |
| **Export PDF** | 通过 `exportPlotVector.ts` + jsPDF 直接画向量，生成单页 **180×210 mm** PDF；spots/文字/图例为矢量、组织背景为栅格；样本标题仅在 App 布局的 title band 画一次，draw 函数只收 contentRect、不画 title（避免重复）；单样本 Multi-gene 须建 multigene 任务，否则灰点；图例对齐 panel 右下角。**编组**：plot 与 legend 分别用 Form XObject（plotFormKey/legendFormKey），Illustrator 可整体拖动；BBox 与放置矩阵用 scaleFactor 统一为 points。 |
| **Pixi 环境** | 依赖在 pixi.toml 显式声明（如 pytz、python-dateutil）；若 `pixi list` 有包但运行时 import 失败，说明磁盘环境与 lockfile 不同步，用 **`pixi reinstall`** 重装。 |
| **后端空数组** | 对坐标等做 `np.nanmin`/`np.nanmax` 前检查 `array.size`，空则用默认 bounds（如 0,1），避免 zero-size array reduction 报错（如 get_dataset_meta）。 |

