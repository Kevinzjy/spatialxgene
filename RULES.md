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

### 4.2 教训记录（模板）

> 每次“反复修改后才解决”的问题，都要在此追加一条记录。

- **问题**：<简述现象与报错>
- **根因**：<信息缺失/边界条件/环境差异/实现错误/工具链问题等>
- **最有效的补充信息**：<如果一开始就提供，会更快解决的内容>
- **下次提问要点**：<可复制的提问模板>

### 4.3 项目规范与发布教训（Spatialxgene）

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

