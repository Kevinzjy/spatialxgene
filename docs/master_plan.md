# Spatialxgene 总体目标与方向

本文档定义项目的整体目标与产品边界，作为所有设计与开发决策的顶层依据。

---

## 1. 项目定位

**Spatialxgene** 是一款 **本地优先、浏览器内使用的空间转录组学查看与预处理工具**，风格上参考 [cellxgene](https://github.com/chanzuckerberg/cellxgene)：

- **查看**：在浏览器中打开空间/UMAP 图，缩放平移、按基因表达或注释着色。
- **预处理**：对原始 h5ad 做表达侧流水线（QC、归一化、HVG、PCA、UMAP、Leiden），不改变空间坐标。数据需自带空间坐标或由上游流程提供。

目标用户为**本地拥有 h5ad 的分析人员**，在单机或内网环境快速查看与轻量预处理，无需部署大型服务或数据库。

---

## 2. 核心目标

| 目标 | 说明 |
|------|------|
| **易用** | 一条命令启动查看器（`spatialxgene launch`），数据目录指向预处理好的 h5ad 即可。 |
| **可复现** | 预处理由 CLI 完成，参数可配置，便于脚本化与复现。 |
| **性能可接受** | 支持万级到百万级 spot 的展示与交互；超大数据可通过 spot 大小、降采样或后续 WebGL 等手段平衡。 |
| **可扩展** | 架构上为「后端 API + 前端 SPA」，后续可增加多视图、导出、插件等而不推翻重做。 |

---

## 3. 不做的事（边界）

- **不做** 云端多用户平台、账号与权限、协作编辑。
- **不做** 替代 Scanpy/ Squidpy 的完整分析环境；仅提供「查看 + 标准化预处理 + 空间推断」。
- **不做** 原始测序数据处理（如 fastq → count matrix）；输入假定为已有 `AnnData`（h5ad）。
- **不做** 内置数据库；数据以**文件系统上的 h5ad** 为主，由 `--data-dir` 指定，无需 MySQL/PostgreSQL 等。

上述边界在需求膨胀时优先回溯本文档，避免项目范围无限扩大。

---

## 4. 技术方向

- **后端**：Python 3.9+，FastAPI 提供 REST API，scanpy/anndata 处理 h5ad；CLI 使用同一套 Python 包。
- **前端**：React + TypeScript，Vite 构建；空间图使用 Canvas 2D（后续可评估 WebGL 以应对超大规模）。
- **数据**：以 h5ad 为唯一数据源；服务端按需读取、可选内存缓存，不持久化到独立数据库。
- **部署**：单机/内网为主；通过 `--host` / `--port` 绑定地址，生产环境可配合 Nginx 反向代理与 HTTPS。

---

## 5. 成功标准（短期）

- 用户能在指定数据目录下启动查看器，选择数据集，在空间/UMAP 上按基因或注释着色并调节 spot 大小。
- 用户能运行 `preprocess` 得到聚类与 UMAP；数据需自带空间坐标或由上游流程提供。
- 文档与 pixi/Makefile 足以让新成员在一台干净机器上完成安装、构建与启动（`pixi run install` / `pixi run launch`）。

---

## 6. 文档索引

- **实施步骤与数据设计**：[implementation_plan.md](implementation_plan.md)
- **界面与交互规范**：[design_guidelines.md](design_guidelines.md)
- **当前任务清单**：[tasks.md](tasks.md)
