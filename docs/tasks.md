# Spatialxgene 任务清单

本文档为当前与近期任务列表，按优先级与模块组织。完成或废弃项可勾选或移至「已完成」小节。

---

## 进行中 / 待办

### 后端

- [ ] **Server adata 缓存**：为 `_adata_cache` 增加 LRU 或最大条数，避免多数据集/大文件占满内存。
- [ ] **Preprocess 日志**：用 `logging` 替代/补充 `print`，Leiden 回退时打 `warning`。
- [ ] **Preprocess 输入校验**：`run_preprocess` 开头检查 `adata.X` 非空并提前报错。
- [ ] **Infer platform 区分**：用户指定 `grid_shape` 时与「已知 Stereo-seq 网格」区分，在 `uns` 中写不同 platform/note。
- [ ] **Launch 目录提示**：当 `--data-dir` 不存在时打印友好提示并列出当前 DATA_DIR。
- [ ] **后端单测**：为 server 的 `list_datasets`、`get_dataset_meta`、`_get_plot_coordinates` 及 preprocess/infer 核心逻辑写 pytest。

### 前端

- [ ] **Expression 加载态**：基因已选、expression 尚未返回时显示 loading 或 skeleton，避免闪旧数据。
- [ ] **空数据集提示**：当 `/api/datasets` 返回 `[]` 时在侧栏显示「未找到数据集，请检查 data-dir」。
- [ ] **基因列表说明**：在基因列表旁注明「仅显示前 200 条，请用搜索缩小范围」或引入虚拟列表。
- [ ] **主题色抽离**：将侧栏/强调/背景等色值抽成 CSS 变量或常量，便于换肤与维护。
- [ ] **连续配色选项**：在 colorScale 或 UI 中增加 viridis 等选项（可选）。
- [ ] **前端单测**：为 api、colorScale 及关键组件写单元/集成测试。

### 工程与文档

- [ ] **CI**：在 CI 中增加 `ruff check`、`tsc --noEmit`（及可选 mypy），保证 MR 通过。
- [ ] **README 与 Makefile**：确保新成员可通过 `make install`、`make build`、`make dev` 完成本地开发（当前已具备，仅需随变更更新）。

---

## 可选 / 中长期

- [ ] **大数据可视化**：70 万+ spot 时考虑 WebGL 或服务端/前端降采样。
- [ ] **Canvas 无障碍**：为画布加 `role`、`aria-label`，缩放/平移若有按钮则支持键盘。
- [ ] **CORS / 生产部署**：通过环境变量配置 `allow_origins` 与 HTTPS 反向代理说明。

---

## 已完成（含 v0.1）

- [x] 前端解析 API 错误 body，展示 `detail`。
- [x] SpatialPlot 使用 ResizeObserver 在容器 resize 时重绘。
- [x] FastAPI version 从 `spatialxgene.__version__` 读取。
- [x] 侧栏增加 Spot size 滑块，默认 80% 点大小。
- [x] Makefile：install、build、dev、launch、test、clean、infer、preprocess。
- [x] 四份项目文档：master_plan、implementation_plan、design_guidelines、tasks。
- [x] **v0.1 查看器**：后端提供 `image_keys`、`image_info` 与 `/api/datasets/{id}/images/{key}`；前端背景图（hires/lowres）、与 spot 对齐（lowres 使用 hires 参考范围）；侧栏顺序 Dataset → Background image → Color by → Annotation/Gene → Spot size → Opacity；Gene 模式配色与百分位范围；loadDataset 使用 AbortController 切换数据集时取消旧请求；文档与 CHANGELOG 更新至 v0.1。

---

## 使用说明

- 新增任务写入对应模块的「进行中 / 待办」或「可选 / 中长期」。
- 完成时在项目前勾选 `[x]` 或把条目移到「已完成」。
- 任务与实施、设计规范的对应关系见 [implementation_plan.md](implementation_plan.md)、[design_guidelines.md](design_guidelines.md)。
