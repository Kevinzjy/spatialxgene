# Spatialxgene 任务清单

本文档为当前与近期任务列表，按优先级与模块组织。完成或废弃项可勾选或移至「已完成」小节。

---

## 进行中 / 待办

### 后端

### 前端

- [ ] **连续配色选项**：在 colorScale 或 UI 中增加 viridis 等选项（可选）。
- [ ] **前端单测**：为 api、colorScale 及关键组件写单元/集成测试。

- [x] **自动化发布 (make release)**：一键构建 whl、版本化 Docker tar 及 Singularity SIF 镜像，实现全环境分发。
- [x] **CentOS 7 兼容性 (glibc 2.17)**：通过 Singularity (SIF) 镜像彻底解决旧系统 glibc 2.17 的兼容性问题，文档 (deployment.md) 已详细说明。
- [x] **中文化 README 与操作手册**：首页 README 已完整中文化，并整理为「快速上手」手册，方便内部团队与科研用户。

---

## 可选 / 中长期

- [x] **全局开发增强 (Skills)**：引入 `knowledge-to-skill` 与 `project-finalizer` 自动化总结经验，并配置了 `/commit` 自定义命令。

- [ ] **大数据可视化**：70 万+ spot 时考虑 WebGL 或服务端/前端降采样。
- [ ] **Canvas 无障碍**：为画布加 `role`、`aria-label`，缩放/平移若有按钮则支持键盘。
- [ ] **CORS / 生产部署**：通过环境变量配置 `allow_origins` 与 HTTPS 反向代理说明。

---

## 已完成（含 v0.1、v0.2）

- [x] 前端解析 API 错误 body，展示 `detail`。
- [x] SpatialPlot 使用 ResizeObserver 在容器 resize 时重绘。
- [x] FastAPI version 从 `spatialxgene.__version__` 读取。
- [x] 侧栏增加 Spot size 滑块，默认 80% 点大小。
- [x] Makefile：install、build、launch、test、clean、preprocess（pixi 任务包装）。
- [x] 四份项目文档：master_plan、implementation_plan、design_guidelines、tasks。
- [x] **v0.1 查看器**：后端提供 `image_keys`、`image_info` 与 `/api/datasets/{id}/images/{key}`；前端背景图（hires/lowres）、与 spot 对齐；侧栏 Dataset → Background image → Color by → Annotation/Gene → Spot size → Opacity；Gene 模式配色与百分位范围；loadDataset 使用 AbortController；文档与 CHANGELOG 更新至 v0.1。
- [x] **v0.2 查看器**：Embedding 切换（Spatial/UMAP），UMAP 下隐藏背景图；favicon 与侧栏 logo；spot 悬停 tooltip（Spot # + annotation/gene）；Annotation legend（按数量排序、显示 spot count）；画布工具栏 − / + / Reset；缩放以光标为中心；未选 annotation/gene 时全点灰色显示；切换数据集时主区域 Loading overlay；响应式全屏无滚动条；percentile 直方图法避免爆栈；Safari/Firefox 性能优化（rAF 节流、DPR 上限、Firefox LOD）；文档与 CHANGELOG 更新至 v0.2。
- [x] **v0.2.3**：Co-expression 模式（双基因、四角调色板、log scale）；Layer 选项（X + adata.layers）；Token 认证（--token，可选开启）；启动时打印带 token 的 Access URL；host `::` 支持与 IPv6 Access 行；docs/deployment.md（systemd、Nginx）；README/CHANGELOG 更新。
- [x] **v0.2.4**：seurat2h5ad 子命令（Seurat RDS → h5ad，Visium 风格组织图）；子路径部署、加载进度、无空间/UMAP 提示、preprocess 输出与 dataset 路径等修复；RULES/CHANGELOG 经验与版本文档更新。
- [x] **v0.2.5**：Export PDF 矢量导出与 legend/color bar 行为调整（单页 180×210 mm、panel 对齐 categorical/gene/multigene 图例与 color bar）；单样本 PDF 在标题带显示样本名、Multi-gene 单样本导出使用 multigene 任务（正确 Pie/Grid 颜色）；样本标题仅在 App 布局的标题带绘制一次，不在 exportPlotVector 内绘制，避免重复；侧栏去掉 Spot size / Color range 固定提示与 Multi-gene 百分位时的有效数字显示；版本文档已更新。
- [x] **v0.2.6**：版本号 bump（0.2.5 → 0.2.6）；代码与文档中版本字符串已同步。
- [x] **Preprocess + CellTypist**：自动细胞类型注释（obs['auto_cell_type']）、物种推断（人/鼠）、模型路由与 majority_voting；可选 obs['auto_cell_type_coarse']；依赖 celltypist（PyPI）；RULES §4.2/§4.3、CHANGELOG、README 已更新。
- [x] **visium2h5ad**：子命令 `spatialxgene visium2h5ad -i path_to_visium -o h5ad_file`；使用 scanpy.read_visium；支持 --count-file、--no-images；自动 var_names_make_unique，抑制 anndata 重复名警告。
- [x] **seurat2h5ad**：子命令 `spatialxgene seurat2h5ad <file.rds|file.rds.gz> [-o out.h5ad]`；R 脚本（Seurat + Matrix）导出 matrix/obs/空间坐标/组织图，Python 构建 AnnData，按 Visium 风格写 `uns['spatial']`（hires/lowres、scale 1.0 与 spot 对齐）；`pixi run test` 在存在 `tests/P2N_Spatial.rds.gz` 时执行 seurat2h5ad；经验见 RULES.md §4.3。
- [x] **Preprocess 输出**：preprocess 写盘使用 `run_preprocess` 返回值，输出含 leiden/louvain 与 counts layer（标准化前保存）；RULES 与 CHANGELOG 记录经验。
- [x] **Preprocess in_tissue**：有 `obs['in_tissue']` 时跳过按基因数的 spot 过滤，避免 Visium 等数据组织上点被滤掉。
- [x] **Preprocess adata.raw**：写盘前若存在 `adata.raw`，将 `raw.X` 写入 `layers['counts']`（维度可对齐时），再清空 raw，避免 `raw.var` 含 `_index` 导致写盘报错。
- [x] **Layers 命名**：统一使用 `layers['counts']`（替代 raw_counts），与常见约定一致；代码与文档已更新。
- [x] **Sidebar Loading**：加载数据集时不再在 Dataset 上方显示「Loading…」，仅主区域显示进度条/占位。
- [x] **含多个点的 h5ad 路径**：`_get_dataset_path` 改为按 id 拼接 `.h5ad` 而非 `with_suffix`，支持如 `sample_v1.3.h5ad` 等文件名。
- [x] **超分辨相关代码移除**：BayesSpace（R 脚本 + 后端/前端）、TESLA（Python 脚本 + /tesla API + 前端）、H&E CPU 超分辨（`/super_resolution`）全部删除。脚本 `run_bayesspace.R`、`run_tesla.py` 已删除。
- [x] **Multi-gene 无表达 spot**：总表达为 0 的 spot 不再绘制点，仅绘制有表达的 spot。
- [x] **Multi-gene Pie 布局**：圆形 spot 下按各基因表达比例画扇形（pie chart），多基因共现一目了然。
- [x] **Multi-gene Grid 布局**：方形 spot 下在正多边形中心排布等大小小方块，clip 在 spot 内；仅画 proportion≥5% 的基因；像素尺寸统一（LED 式），按表达量排序排布。
- [x] **Multi-gene Color range 与 Log scale**：与 Gene 模式一致，支持 pmin/pmax（如 p1–p99）与 Log scale；每基因 vmin/vmax 由 percentile 或原始范围计算，Sidebar 展示与 SpatialPlot 使用同一套解析逻辑。
- [x] **多样本拖拽排序**：侧栏已选数据集列表支持拖拽调整显示顺序，主界面网格顺序随之更新。
- [x] **Co-expression / Multi-gene 多样本视图**：Co-expression 与 Multi-gene 模式下选择多个数据集时以网格展示每个样本；按样本拉取 expression1/expression2 与 multigene 表达，每格独立渲染。
- [x] **Spot size 最大 300%**：滑块上限由 150% 调整为 300%，便于 UMAP 等点较密场景放大点。
- [x] **侧栏整体滚动与隐蔽滚动条**：主内容区可上下滚动，使用 `.sidebar-scroll` 细窄半透明滚动条；Datasets/Gene 等列表设 minHeight/maxHeight，保证区块可读。
- [x] **Multi-gene 每样本 color bar**：每个样本图右下角显示紧凑横向 color bar（每基因一条短条 + 基因名与表达范围），多基因纵向排列。
- [x] **Multi-gene 部分基因缺失**：某样本中某基因无数据或全 NaN 时，该样本仍用其余有数据的基因正常绘制 multigene spot；单/多样本均按「至少一个基因有数据」显示 multigene，layers 过滤全 NaN，SpatialPlot 对 NaN 与 vmin/vmax 做防护。
- [x] **Annotation 多样本图例按样本**：多样本时每个样本图内的 categorical 图例只显示该样本的类别与数量，不显示全样本合计（slotCategoricalLegend(id)）。
- [x] **顶部工具栏与 Export PDF**：主内容区顶部增加工具栏，提供「Export PDF」按钮；通过 `exportPlotVector.ts` 矢量导出，单页 180×210 mm，spots/图例/文字为矢量、组织背景为栅格；图例与 color bar 对齐到每样本 **panel** 右下角（`panelRect`），含 categorical（色块+标签+数量）、Gene（标题+竖条高在上）、Multi-gene（每行竖条+基因范围，行内垂直居中）。
- [x] **Server adata 缓存**：`_adata_cache` 改为 LRU 缓存，最大条数可配置（默认 16，环境变量 `SPATIALXGENE_CACHE_MAX_DATASETS`，范围 1–128），超出时淘汰最久未用条目，避免多数据集/大文件占满内存。
- [x] **Preprocess 日志**：CLI 的 preprocess 分支配置 `logging.basicConfig(level=INFO)`，preprocess 进度与结果用 `logger.info`、错误用 `logger.error`；preprocess 模块内已用 `logger`，Leiden 回退时打 `logger.warning`。
- [x] **Preprocess 输入校验**：`run_preprocess` 开头检查 `adata.X` 非空并提前报错（X is None、n_obs/n_vars 为 0、X.size 为 0 时抛出 ValueError）。
- [x] **Launch 目录提示**：当 `--data-dir` 不存在或不是目录时，启动时在 stderr 打印友好提示并列出当前 DATA_DIR（仍会启动服务，侧栏将无数据集）。
- [x] **后端单测**：为 server 的 `list_datasets`、`get_dataset_meta`、`_get_plot_coordinates` 及 preprocess 核心逻辑写 pytest；`tests/test_server.py`（API + _get_plot_coordinates）、`tests/test_preprocess.py`（输入校验 + 小数据 pipeline）；`pixi run pytest` 运行。
- [x] **空数据集提示**：当 `/api/datasets` 返回 `[]` 时，侧栏 Datasets 区域显示「No datasets found. Check data-dir (e.g. --data-dir).」；后改为「No h5ad files found under {data_dir}」，data_dir 由 /api/config 提供。
- [x] **主题色抽离**：侧栏/强调/背景等色值抽成 `index.html` 的 `:root` CSS 变量（`--sidebar-bg`、`--sidebar-border`、`--bg-main`、`--accent`、`--text-primary`、`--text-secondary`、`--text-muted`、`--error`、`--error-bg`）及 `src/theme.ts` 的 `THEME` 常量；Sidebar、App、SpatialPlot、exportPlotVector 已改用变量或 THEME，便于换肤与维护。
- [x] **基因列表说明**：在 Gene / Gene1 / Gene2 / Multi-gene 列表标题右侧增加实心圆问号图标，悬停提示「Only the first 200 entries are shown; use search to narrow the range.」

---

## 使用说明

- 新增任务写入对应模块的「进行中 / 待办」或「可选 / 中长期」。
- 完成时在项目前勾选 `[x]` 或把条目移到「已完成」。
- 任务与实施、设计规范的对应关系见 [implementation_plan.md](implementation_plan.md)、[design_guidelines.md](design_guidelines.md)。
