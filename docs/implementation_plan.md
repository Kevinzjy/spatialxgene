# Spatialxgene 实施步骤与数据设计

本文档描述项目的实施顺序、数据层设计以及后端/前端的协作方式，供开发与排期参考。

---

## 1. 实施顺序（已采用）

项目采用 **后端优先、再前端、最后联调与体验优化** 的顺序。

### 1.1 后端先行（已完成主体）

1. **数据与 CLI**
   - 约定输入/输出为 h5ad；实现 `infer`（空间推断）与 `preprocess`（表达流水线）。
   - CLI 子命令：`infer`、`preprocess`、`launch`、`dev`，参数与默认值在 `cli.py` 中集中管理。

2. **API 与数据服务**
   - FastAPI 服务：`/api/datasets`、`/api/datasets/{id}`（含 meta：`image_keys`、`image_info`）、`/api/datasets/{id}/spatial`、`/api/datasets/{id}/obs`、`/api/datasets/{id}/expression/{gene}`、`/api/datasets/{id}/var`、`/api/datasets/{id}/images/{key}`（PNG 组织图）。
   - 数据目录由 launch 时 `--data-dir` 注入，无独立数据库；API 从文件系统读 h5ad 并可选内存缓存。

3. **静态资源**
   - 前端构建产物（如 `spatialxgene/frontend/dist/`）由 FastAPI 挂载，`launch` / `dev` 时一并提供。

### 1.2 前端随后（已完成主体）

1. **基础框架**
   - React + TypeScript + Vite；`api.ts` 封装所有后端请求，类型与后端响应一致。

2. **核心界面**
   - 侧栏：数据集选择、背景图（Background image：hires / lowres）、Color by（Annotation / Gene）、Spot size、背景透明度、注释/基因选择；Gene 模式下基因列表、配色、表达百分位范围。
   - 主区域：Canvas 空间图，支持缩放、平移、按基因或分类着色；背景图在数据空间按 scalefactors 对齐（lowres 使用 hires 的参考范围以对齐 spot）。

3. **与后端联调**
   - 通过 Vite proxy 或同源访问 API；错误信息解析后端 `detail` 并展示。

### 1.3 后续可做

- 测试：后端 pytest（API + preprocess/infer），前端单元/集成测试。
- 性能：大数据下缓存策略、降采样或 WebGL。
- 体验：Expression 加载态、空数据提示、无障碍与键盘支持等（见 [design_guidelines.md](design_guidelines.md) 与 [tasks.md](tasks.md)）。

---

## 2. 数据层设计（无传统数据库）

项目**不引入 MySQL/PostgreSQL 等数据库**，数据以 **h5ad 文件 + 文件系统目录** 为核心。

### 2.1 数据源

| 概念 | 说明 |
|------|------|
| **数据目录** | 由 `--data-dir` 指定，例如 `./data/sample/STDS0000323/preprocessed`。 |
| **数据集** | 目录下每个 `*.h5ad` 视为一个数据集；API 用**文件名 stem**（无扩展名）作为 `dataset_id`。 |
| **发现方式** | 启动时扫描 `DATA_DIR` 下所有 `.h5ad`，列表通过 `/api/datasets` 返回。 |

### 2.2 单文件结构（h5ad / AnnData）

依赖 AnnData 标准约定：

| 用途 | 位置 | 说明 |
|------|------|------|
| 空间坐标 | `obsm['spatial']` 或 `obsm['X_spatial']` 或 `obs['x']`,`obs['y']` | 至少一种；用于空间图。 |
| 降维 | `obsm['X_umap']` | 无空间时用作 2D 图坐标。 |
| 细胞/spot 注释 | `obs` | 列名通过 API 暴露，前端做分类着色（如 leiden）。 |
| 基因表达 | `X` + `var` 索引 | 按基因名/索引请求单列表达量。 |
| 元信息 | `uns` | 如 `spatial_platform`、`spatial_scale` 等，供后续扩展。 |
| 组织图 | `uns['spatial'][sample]['images']` + `scalefactors` | 可选；如 `hires`、`lowres`，Visium 风格；API 返回 `image_keys`、`image_info` 及 PNG 端点。 |

服务端**不**修改 h5ad 内容；infer/preprocess 由 **CLI 写新文件**（如 `*_preprocessed.h5ad`），查看器只读。

### 2.3 服务端状态与缓存

| 项目 | 设计 |
|------|------|
| **配置** | `DATA_DIR`、`STATIC_DIR` 在进程内由 CLI 设置，无配置文件或环境变量持久化（可后续加）。 |
| **内存缓存** | 已加载的 adata 按 `dataset_id` 缓存在进程内 dict；无过期与容量上限（改进见 [tasks.md](tasks.md)）。 |
| **并发** | 单进程 uvicorn；多用户同时访问同一数据集共享同一 adata 实例，只读无写。 |

### 2.4 若未来引入「项目/会话」

若需保存「当前选中的数据集、着色方式、spot size」等：

- **方案 A**：仅前端 localStorage，不落库。
- **方案 B**：轻量元数据（如 JSON 文件）放在数据目录或用户目录，仍不引入关系型数据库。
- **方案 C**：真正多用户、多项目时再考虑数据库（当前不在范围内）。

---

## 3. 后端与前端职责划分

| 层 | 职责 |
|------|------|
| **CLI** | 参数解析、infer/preprocess 调用、launch/dev 时启动 FastAPI 与前端构建/watch。 |
| **FastAPI** | 提供 REST API；读 h5ad、返回 JSON；挂载静态前端。 |
| **前端** | 请求 API、维护 UI 状态、Canvas 绘制与交互；不直接读文件。 |

数据流：**h5ad 文件 → FastAPI 读入 → JSON → 前端渲染**。  
预处理与空间推断：**用户运行 CLI → Python 写新 h5ad → 用户将 `--data-dir` 指向新目录或同一目录**。

---

## 4. 文档索引

- 整体目标与边界：[master_plan.md](master_plan.md)
- 设计规范：[design_guidelines.md](design_guidelines.md)
- 任务清单：[tasks.md](tasks.md)
