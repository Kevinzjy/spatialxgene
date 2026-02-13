# 项目协作规则（zhangjy ↔ AI 编程助手）

本文档记录 zhangjy 对 AI 编程助手的协作要求。**当出现错误/异常/结果不符合预期时，必须按本文流程处理并沉淀经验**。

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

当我报告一个问题时，尽量提供：

- **复现命令**：完整命令（含参数），例如：`make dev DATA_DIR=... HOST=... PORT=...`
- **完整输出**：从第一行到最后一行的报错（含 stacktrace）
- **环境信息**：OS、Python 版本、Node 版本、uv 版本（如相关）
- **改动范围**：最近修改了哪些文件/功能（如果我知道）
- **期望行为**：我希望最终看到什么结果（例如页面显示、API 返回、构建通过）

**针对「某个图片/图标/资源 404 或不显示」类问题，第一次就修对的提问要点：**

- **说清楚是哪一个 UI 元素**：例如「**不是**浏览器标签页上的小图标，是**页面里**侧边栏/顶栏上 SPATIALxGENE 标题**左边**的那个 logo 不显示」。
- **区分「标签页 favicon」和「页面内的 logo」**：两者都可能请求 `favicon.svg`，控制台报错一样，但修复位置不同（前者改 HTML 注入/nginx，后者改前端组件里的 `img src`）。若只说「favicon 不显示」，AI 会默认当成标签页图标去改。
- **若该资源的 URL 不在网页源码里**：可以补一句「这个图在浏览器查看网页源代码里找不到 href/地址」，这样会提示 AI 去查 **前端代码**（React 组件、`img` 的 `src`）而不是只查 HTML 或 nginx。
- **简短模板**：「页面上 [位置，如侧边栏顶部] 的 [元素，如 logo/图标] 不显示，控制台报 [资源] 404；不是标签页图标，是页面内容里的。」

### 4.2 教训记录（模板）

> 每次“反复修改后才解决”的问题，都要在此追加一条记录。

- **问题**：<简述现象与报错>
- **根因**：<信息缺失/边界条件/环境差异/实现错误/工具链问题等>
- **最有效的补充信息**：<如果一开始就提供，会更快解决的内容>
- **下次提问要点**：<可复制的提问模板>

---

#### 子路径部署下「favicon/logo」不显示（2026-02）

- **问题**：nginx 用 `location /spatialxgene/` 反代到 5005，页面能打开，但控制台报 `GET .../favicon.svg 404`，页面上有图标/logo 显示不出来。
- **根因**：
  - 存在**两种**会请求 `favicon.svg` 的地方：① 浏览器**标签页图标**（HTML 里 `<link rel="icon" href="...">`）；② 前端**页面内的 logo**（Sidebar 里 `<img src="/favicon.svg">`）。控制台都只显示「favicon.svg 404」，无法区分。
  - 前期默认按「标签页 favicon」处理：改后端 HTML 注入、nginx 代理、根路径重定向等，没有去查前端组件里是否还有硬编码的 `src="/favicon.svg"`。直到用户明确说「不是标签页的 favicon，是页面左侧状态栏 SPATIALxGENE 标题左边的 logo」「源码里看不到 href」，才去搜 Sidebar，发现 `<img src="/favicon.svg">` 需改成带 `API_BASE` 的路径。
- **最有效的补充信息**：一开始就说清「是页面内容里的 logo（侧边栏/标题旁），不是浏览器标签页上的小图标」；或补充「这个图在网页源码里找不到地址」。
- **下次提问要点**：见 4.1 中「针对 某个图片/图标/资源 404 或不显示」的提问要点。

### 4.3 项目规范与发布教训（Spatialxgene）

- **服务器网络权限**
  - 生产环境网络权限较严：**只能获得一个代理端口的权限**（例如 nginx 上仅能配置一个 `location /spatialxgene/` 反代到本应用）。不能为项目单独增加根路径或其它全局路由（如 `/favicon.svg`、`/api` 等）。
  - 因此子路径部署时，所有静态资源与 API 必须都落在该唯一 location 下（如 `/spatialxgene/...`）。后端通过 `--api-base` / `SPATIALXGENE_API_BASE` 注入 base，前端 HTML 与组件（含 favicon、logo、assets、API）全部使用该 base，不依赖 nginx 侧再配其它 location。本地 nginx 测试配置（`docker/nginx-test.conf`）也仅保留该一个 location，与生产一致。

- **数据集加载进度条**
  - 采用按步骤的进度（4 个请求：meta / spatial / obs / var，每完成一个 +25%），避免用户误以为页面卡死。全部完成后保持 100% 约 400ms 再关闭 loading，避免“到 75% 就突然结束”的体感；若在等待期间用户切换了数据集则直接 return，由 finally 收尾。

- **打包与 wheel**
  - 只上传 wheel 到 PyPI、不上传源码时，前端必须打进 wheel：用 `[tool.setuptools.package-data]` 包含预构建的 `frontend/dist/**`；打 wheel 前必须先 `npm run build`（如 Makefile 的 `publish`/`publish-test` 先 `make build-frontend`）。否则 pip 安装后 `spatialxgene launch` 会报 “Frontend not found”。
  - 仅发布时需要的依赖（如 twine）放在 `[project.optional-dependencies]` 的 `publish` 里；发布前 `uv sync --extra publish`，普通用户安装不会带上。

- **PyPI 上的 README**
  - README.md 会作为 PyPI 项目页的说明，面向的是只做 `pip install` 的用户，没有源码、没有 repo 里的路径。不要写 “from source”、“docs/…”、“spatialxgene/frontend”、“make” 等；只保留：Requirements、Install（pip only）、Commands、Quick start、Data format、`--help` 提示。链接只保留相对锚点或必要的外部链接，不要链到 repo 内 docs。

- **发布与版本文档**
  - 发布说明统一放在 CHANGELOG.md；不再维护单独的 `docs/release_notes_*.md`，避免两处不一致。新版本在 CHANGELOG 增加条目，重要版本可在条目下用 “Release notes (merged)” 子段概括 scope 与教训。
  - **版本号必须三处同步**：每次发版前同时修改 `spatialxgene/__init__.py`（`__version__`）、`pyproject.toml`（`version`）、`spatialxgene/frontend/package.json`（`version`），以及 `spatialxgene/frontend/package-lock.json` 中顶层和 `""` 包的 `version`；否则 API/前端显示的版本会与 PyPI 不一致。
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

