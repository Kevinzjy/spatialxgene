# Spatialxgene 设计规范

本文档约定前端与界面的颜色、字体、布局与交互细节，便于统一视觉与体验，并为后续扩展（如主题、无障碍）留口子。

---

## 1. 颜色

### 1.1 主色与背景

| 用途 | 色值 | 说明 |
|------|------|------|
| 侧栏背景 | `#16213e` | 深蓝灰，主导航区。 |
| 侧栏边框 / 分割 | `#0f3460` | 略深于侧栏，用于边框与分割线。 |
| 主内容区 / 画布背景 | `#1a1a2e` | 深色底，与侧栏区分。 |
| 强调 / 主操作 | `#e94560` | 红粉，按钮选中、高亮、slider accent。 |
| 页面背景 | 与主内容区一致或略深 | 全屏一致深色。 |

### 1.2 文字

| 用途 | 色值 | 说明 |
|------|------|------|
| 主文字 | `#eee` / `#ffffff` | 侧栏与标题。 |
| 次要 / 说明 | `#a0a0a0` | 表单项 label。 |
| 弱化 / 辅助 | `#888` | 统计信息、百分比、loading。 |
| 错误 | `#ff8888` | 错误提示条；背景可用 `#4a0a0a`。 |

### 1.3 表单与控件

| 用途 | 色值 | 说明 |
|------|------|------|
| 输入框 / 下拉框背景 | `#1a1a2e` | 与主内容区一致。 |
| 边框 | `#0f3460` | 与侧栏边框统一。 |
| 范围滑块 accent | `#e94560` | 与主强调色一致（CSS `accent-color`）。 |

### 1.4 图表与数据可视化

| 用途 | 说明 |
|------|------|
| 分类着色 | 使用 `colorScale.ts` 中 `CAT_COLORS`（约 20 色，色盲友好风格）。 |
| 连续着色（基因表达） | 默认为 blue → white → red 渐变（`vlag` 风格），支持多种连续调色板（如 viridis 等），并统一在 `colorScale.ts` 中配置；侧栏提供 palette 下拉与 Reverse 选项（类似 `vlag` / `vlag_r`）。 |
| 未匹配 / 缺失 | 分类未匹配用 `#888`；连续 NaN 用梯度最低色。 |

### 1.5 建议实现方式

- 后续可将上述色值抽成 **CSS 变量**（如 `--sidebar-bg`、`--accent`、`--text-muted`），便于主题切换与维护。
- 新组件优先使用同一套变量或常量，避免硬编码新色。

---

## 2. 字体

| 场景 | 规范 |
|------|------|
| 字号 | 标题/品牌约 15px、加粗；表单项 label 12px、加粗；正文/列表 12–13px；辅助信息 11px。 |
| 字重 | 标题 600；正文 400。 |
| 字体族 | 使用系统默认无衬线（如 `system-ui, sans-serif`），未单独引入字体文件。 |
| 行高 | 默认即可；紧凑列表可略减小。 |

---

## 3. 布局与尺寸

| 项目 | 规范 |
|------|------|
| 侧栏宽度 | 固定 `280px`，`minWidth: 280`，保证选择器与滑块不挤压。 |
| 侧栏滚动 | 内容过多时整体可上下滚动，使用隐蔽滚动条（`.sidebar-scroll`）；Datasets、Gene 等列表设 minHeight/maxHeight，避免被压缩到不可读。 |
| Spot size | 滑块范围 20%–300%（默认约 70%）；300% 便于 UMAP 等密集布局下放大点。 |
| 内边距 | 侧栏块内 `12px 14px` 或 `12px`；表单项间距 `gap: 12`。 |
| 画布 | 主区域 flex 填满，最小高度 200px；留白（padding）约 20px。 |
| 全屏 | `html`/`body` 无 margin、height 100%、overflow hidden；`#root` 高度 100%，应用根 flex 填满，避免出现垂直滚动条。 |
| 圆角 | 按钮、输入框、下拉框统一 `border-radius: 6px`。 |

---

## 4. 交互细节

### 4.1 空间图（Canvas）

| 操作 | 行为 |
|------|------|
| 缩放 | 鼠标滚轮，以光标位置为中心；缩放范围限制（如 0.1–50 倍）。标题栏右侧提供 − / + / Reset 按钮，以画布中心缩放或重置视图。 |
| 平移 | 左键拖拽；拖拽中光标 `grabbing`，默认 `grab`。 |
| 悬停 | 鼠标移入画布时，在光标旁显示 tooltip：Spot #索引；若已选 Annotation 或 Gene，显示对应列名与值。 |
| 点大小 | 由「网格间距 + spot size 比例」决定；默认 80%，滑块 20%–120%。 |
| 重绘 | 容器 resize 时通过 ResizeObserver 触发重绘，保证比例正确。 |

### 4.2 侧栏

| 项目 | 规范 |
|------|------|
| 数据集 | 下拉框，必选其一；无数据时提示「未找到数据集」等；切换时取消上一请求（AbortController）避免卡在 Loading。 |
| Embedding 切换 | 若同一数据集中同时存在空间坐标与 UMAP（`has_spatial` / `has_umap`），在 Dataset 下方提供 Spatial / UMAP 两个按钮；当前选中态用强调色背景。切换时重新拉取对应坐标；默认优先使用空间坐标，其次 UMAP。 |
| 背景图 | 下拉框：None / hires / lowres（来自 `image_keys`）；与 spot 坐标对齐（hires 范围作为参考）。仅在 Embedding 为 Spatial 且存在 image_keys 时显示；UMAP 模式下不显示背景图选项。 |
| Color by | 两个按钮切换 Annotation / Gene；选中态用强调色背景。 |
| Spot size / 透明度 | 水平滑块；Spot size 百分比与背景图 opacity 实时生效。 |
| 注释 | 下拉框列出分类列（唯一值 2–50）；默认优先 `leiden`。 |
| 基因 | 搜索框 + 列表（当前最多 200 条）；点击即着色，选中项高亮；Gene 模式下可设连续配色（palette 下拉 + Reverse 开关）与表达百分位范围（pmin/pmax）。 |
| Annotation legend | 在 Opacity 下方：仅 Annotation 模式且已选列时显示；按该列每类 spot 数量从高到低排序，每行色块 + 标签 + 数量；区域可滚动（如 maxHeight 320px）。 |
| Loading | 数据集加载中仅在主区域显示「Loading dataset…」进度条/占位，侧栏 Dataset 上方不显示 Loading；切换数据集时主区域占位避免旧图残留。 |

### 4.3 错误与空状态

| 场景 | 规范 |
|------|------|
| API 错误 | 顶部条展示后端返回的 `detail` 或友好文案；颜色与「错误」一致。 |
| 未选数据集 | 主区域居中文案「Select a dataset from the sidebar」。 |
| 已选但未选着色 | 「Select an annotation or gene to color the plot」。 |
| 基因表达加载中 | 可增加 loading 或 skeleton，避免误以为无数据（见 [tasks.md](tasks.md)）。 |

### 4.4 无障碍（后续）

- Canvas 或容器加 `role="img"`、`aria-label` 描述图表含义。
- 若有缩放/平移按钮，支持键盘焦点与 Enter/Space 触发。
- 颜色对比度满足 WCAG AA（当前深底浅字一般已满足）。

---

## 5. 代码与资源

| 项目 | 规范 |
|------|------|
| 样式 | 当前以 inline style 为主；新组件可逐步改用 CSS 变量 + 类名，便于统一。 |
| 注释与类型 | 组件与 API 类型用 TypeScript 写清；复杂逻辑加英文注释。 |
| 图标 | 当前无图标库；若引入优先考虑轻量 SVG 或单一图标集，保持风格一致。 |

---

## 6. 文档索引

- 总体目标：[master_plan.md](master_plan.md)
- 实施与数据设计：[implementation_plan.md](implementation_plan.md)
- 任务清单：[tasks.md](tasks.md)
