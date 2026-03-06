# Spatialxgene

**v0.2.6** — 基于浏览器的空间转录组可视化分析与预处理工具（cellxgene 风格）。启动查看器以探索空间图谱（支持缩放/平移，按 **注释 (Annotation)**、**基因 (Gene)**、**共表达 (Co-expression)** 或 **多基因 (Multi-gene)** 着色；可选组织背景图；支持从 `X` 或 `adata.layers` 读取表达值），或对原始 h5ad 进行 **预处理 (preprocess)**。支持通过 **visium2h5ad** 将 **Visium** Space Ranger 输出转换为 h5ad，或通过 **seurat2h5ad** 将 **Seurat RDS** 转换为 h5ad。

## 环境要求

- [pixi](https://pixi.sh/) (推荐) 或 Python ≥3.9 + Node.js (用于构建前端)。打包后的应用程序已包含构建好的前端。

## 安装说明

### 从源码安装 (推荐使用 pixi)

```bash
git clone <repo> && cd spatialxgene
pixi run install
```

然后从 pixi 环境运行 `spatialxgene`（例如 `pixi run launch` 或 `pixi run spatialxgene launch`）。查看器的默认数据目录为 `./tests/h5ad`；请将预处理好的 h5ad 放入该目录，或通过 `--data-dir /path` 指定路径。

或者，进行全局安装（在项目根目录）：

```bash
pixi global install --path .
```

安装后 `spatialxgene` 将被添加到你的 `$PATH` 中（请确保 `~/.pixi/bin` 在 PATH 中）。

## 容器化部署 (Docker & Singularity)

为了解决不同服务器环境（特别是 **CentOS 7** 等旧版本系统）下的 **glibc 兼容性**问题，本项目提供了完整的容器化分发方案：

- **Docker Compose**: 适用于 Web 服务器，作为长期稳定的服务运行。
- **Singularity (Apptainer)**: 适用于超算集群 (HPC) 或无 root 权限环境，提供单文件 (`.sif`) 部署。

> **详细说明请参考：[docker/README.md](docker/README.md)**

## 核心命令

| 命令 | 描述 |
|---------|-------------|
| `spatialxgene launch` | 启动浏览器查看器；提供指定目录下的预处理 h5ad 文件。 |
| `spatialxgene visium2h5ad <dir>` | 将 Visium Space Ranger 输出目录转换为单个 h5ad 文件（默认输出：目录名.h5ad）。 |
| `spatialxgene seurat2h5ad <file>` | 将 Seurat 空间 RDS (.rds 或 .rds.gz) 转换为单个 h5ad 文件。需要安装了 Seurat 的 R 环境（pixi 环境已包含 r-seurat）。 |
| `spatialxgene preprocess <file or dir>` | 表达量处理流程：QC、标准化、HVG、PCA、UMAP、Leiden 聚类；可选 CellTypist 自动细胞类型注释 (`obs['auto_cell_type']`)。输入：单个 .h5ad 或目录。不改变空间坐标。使用 `--no-celltypist` 跳过注释。 |

## 快速上手

1. **启动查看器**

   ```bash
   pixi run launch
   # 或者手动指定数据目录、主机和端口
   spatialxgene launch --data-dir /path/to/h5ad --host 0.0.0.0 --port 5005
   ```

   ### 基础操作
   *   **数据加载**：默认扫描 `./tests/h5ad` 及其子目录下的所有 `.h5ad` 文件。支持**增量加载**（切换数据集时仅加载新增项）和后端 **LRU 缓存**（默认缓存 16 个数据集）。
   *   **多样本对比**：在侧边栏选中多个数据集后，主界面将自动切换为**对比网格**。你可以通过**拖拽排序**侧边栏的已选列表来调整显示顺序。
   *   **显示调节**：支持调节 **Spot Size**（最高 300%），适用于 UMAP 或低密度切片。

   ### 可视化模式
   *   **Annotation (注释)**：按细胞类型或聚类着色。图例显示单样本内的类别计数。
   *   **Gene (基因)**：支持从 `X` 或 `layers` 读取数据，支持颜色范围调节 (pmin/pmax) 与 Log 缩放。
   *   **Co-expression (共表达)**：选择两个基因，使用 2D 调色板展示它们的空间分布。
   *   **Multi-gene (多基因)**：单点展示多个基因。支持 **Pie (饼图)** 或 **Grid (网格)** 布局。每个样本右下角带有独立的颜色指示条。

   ### 结果导出 (Export PDF)
   *   **矢量导出**：点击顶部工具栏的 **Export PDF**，生成单页矢量 PDF (180x210mm)。
   *   **图例对齐**：所有图例与色带均自动对齐到样本面板的右下角。
   *   **后期友好**：导出的 PDF 中，图表区与图例区已分别**自动编组**。在 Adobe Illustrator 中可以直接选中并整体移动，极大方便科研作图。

2. **将 Visium 转换为 h5ad** (Space Ranger 输出 → 单个 h5ad)

   ```bash
   spatialxgene visium2h5ad /path/to/visium_sample
   spatialxgene visium2h5ad /path/to/visium_sample -o output.h5ad
   ```

   输入为 Visium 样本目录；输出默认为该路径加 `.h5ad`。产物可直接用于 `launch` 或下一步的 **preprocess**。

3. **将 Seurat RDS 转换为 h5ad** (空间 RDS → 单个 h5ad)

   ```bash
   spatialxgene seurat2h5ad tests/P2N_Spatial.rds.gz
   spatialxgene seurat2h5ad sample.rds -o sample.h5ad
   ```

   输入为保存为 `.rds` 或 `.rds.gz` 的 Seurat 空间对象。输出默认为输入文件名加 `.h5ad`。需要安装了 Seurat 的 R 环境（建议使用 `pixi run install` 以确保 pixi 环境中有 `r-seurat`）。产物可直接用于 `launch` 或下一步的 **preprocess**。

4. **预处理表达量** (QC、标准化、降维聚类、可选 CellTypist 注释)

   ```bash
   spatialxgene preprocess raw.h5ad
   spatialxgene preprocess raw.h5ad -o custom.h5ad
   spatialxgene preprocess raw.h5ad --no-celltypist    # 跳过自动细胞类型注释
   ```

   遵循 scanpy 标准流程：QC、normalize_total、log1p、HVG（仅用于 PCA/UMAP/Leiden）；输出保留**所有通过 QC 的基因**。在 `obs` 中写入 **leiden**（及 **louvain**，如果运行了），并在标准化前将原始计数存入 **`adata.layers['counts']`**。开启 **CellTypist**（默认）时，根据基因名自动推断物种（人/鼠），通过模型路由和 majority voting 预测细胞类型；结果存入 **`obs['auto_cell_type']`**（免疫富集样本可选存入 `obs['auto_cell_type_coarse']`）。使用 `--no-celltypist` 跳过注释；`--celltypist-model NAME` 强制指定模型。当存在 `obs['in_tissue']`（如 Visium）时，跳过按基因数过滤 Spot；如果输入含 `adata.raw`，写盘前会尽可能将其拷贝到 `layers['counts']` 并清空 raw。默认输出：同目录下 `*_processed.h5ad`，或对目录输入产生 `input/preprocessed/`。

## 数据格式说明 (查看器)

用于 `launch` 的预处理 h5ad 建议包含：

- **空间坐标 (Spatial)**: `obsm['spatial']` 或 `obs['x']` 和 `obs['y']`。
- **基因表达 (Expression)**: `X` 矩阵，`var` 索引为基因名。
- **注释信息 (Annotations)** (可选): 例如用于着色的 `obs['leiden']`、`obs['louvain']`、`obs['auto_cell_type']`（由 `preprocess` 写入）。
- **组织图像 (Tissue images)** (可选): Visium 风格的 `uns['spatial'][sample]['images']`（例如 `hires`、`lowres`）及 `scalefactors`。
- **数据层 (Layers)** (可选): 用于基因/共表达/多基因着色的 `adata.layers`（如标准化前的 `counts`、logcounts）；默认为 `X`。`preprocess` 命令在标准化前会自动保存 `counts`，以便在查看器中切换原始计数和标准化值。

**注意：** 始终建议在 pixi 环境中运行查看器（如 `pixi run launch`）。如果后端报错 "Unable to import required dependencies: pytz" 或 "dateutil"，说明磁盘环境可能与 lockfile 不同步，请运行 `pixi reinstall`。支持零观测（空坐标数组）的数据集：API 会返回默认范围，查看器不会报 500 错误。

查看所有选项：`spatialxgene launch --help`, `spatialxgene visium2h5ad --help`, `spatialxgene seurat2h5ad --help`, `spatialxgene preprocess --help`。后端单元测试：`pixi run pytest` (或 `make pytest`)。如需在 Linux 上作为长期服务运行，请参阅 [docs/deployment.md](docs/deployment.md)。
