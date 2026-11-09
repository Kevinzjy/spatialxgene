# Spatialxgene

**v0.2.6** — 基于浏览器的空间转录组可视化分析与预处理工具（cellxgene 风格）。启动查看器以探索空间图谱（支持缩放/平移，按 **注释 (Annotation)**、**基因 (Gene)**、**双特征 (Dual Feature)** 或 **多特征 (Multi-Feature)** 着色；可选组织背景图；特征可以是基因，也可以是 `obs` 数值元数据；基因支持从 `X` 或 `adata.layers` 读取表达值），或对原始 h5ad 进行 **预处理 (preprocess)**。支持通过 **visium2h5ad** 将 **Visium** Space Ranger 输出转换为 h5ad，或通过 **seurat2h5ad** 将 **Seurat RDS** 转换为 h5ad。

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

安装后 `spatialxgene` 将被添加到你的 `$PATH` 中（请确保 `~/.pixi/bin` 在 PATH 中）。通过 `pixi global install --path .` 安装时，`Rscript`、Seurat 和 Matrix 会随全局环境一起安装，`seurat2h5ad` 可直接运行。若你之前已安装过旧版本，请重新执行 `pixi global install --path . --force-reinstall`。

## 容器化部署 (Docker & Singularity)

为了解决不同服务器环境（特别是 **CentOS 7** 等旧版本系统）下的 **glibc 兼容性**问题，本项目提供了完整的容器化分发方案：

- **Docker Compose**: 适用于 Web 服务器，作为长期稳定的服务运行。
- **Singularity (Apptainer)**: 适用于超算集群 (HPC) 或无 root 权限环境，提供单文件 (`.sif`) 部署。

> **详细说明请参考：[docker/README.md](docker/README.md)**

## 核心命令

| 命令 | 描述 |
|---------|-------------|
| `spatialxgene launch` | 启动浏览器查看器；提供指定目录下的预处理 h5ad 文件。 |
| `spatialxgene visium2h5ad <dir or .h5>` | 将 Visium Space Ranger 输出目录转换为带空间信息的 h5ad；或将单个 10x `.h5` count matrix 转换为带推断规则 Visium spot 坐标、但无组织图片的 h5ad。 |
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
   *   **Panel Split / Merge**：每个样本 panel 标题栏的 **− / + / Reset** 左侧有 **Split** 按钮。点击后可选择一个 `obs` key（推荐 2–200 个分组），panel 会按该 key 拆成多个虚拟子 panel 并自动改名；拆分后的子 panel 提供 **Merge** 按钮，可随时恢复为原始 merged panel。不会写出额外的 h5ad 文件。
   *   **显示调节**：支持调节 **Spot Size**（20%–300%）。Spatial 坐标使用邻近 spot 间距估算默认大小；UMAP/PCA/tSNE 等 embedding 坐标按 `max(xRange, yRange) / sqrt(n_spots)` 自适应归一化，默认值较保守，便于在多样本和导出 PDF 中保持一致。

   ### 可视化模式
   *   **Annotation (注释)**：按细胞类型或聚类着色。图例显示单样本内的类别计数。
   *   **Gene (基因)**：支持从 `X` 或 `layers` 读取数据，支持颜色范围调节 (pmin/pmax) 与 Log 缩放。
   *   **Dual Feature (双特征)**：选择两个数值特征（基因或 `obs` 元数据列），使用 2D 调色板展示它们的空间关系。基因可从 `X` 或 `layers` 读取；元数据直接来自 `obs`。
   *   **Multi-Feature (多特征)**：单点展示多个数值特征（基因或 `obs` 元数据列）。支持 **Pie** 或 **Grid** 布局。Layout 行中的 `Log scale` 控制 spot 内 segment 比例是否用 `log1p` 计算；Color range 中的 `Log scale` 独立控制颜色映射。勾选 Layout 行的 Log scale 时会自动开启 Color range 的 Log scale。每个样本右下角带有独立的颜色指示条。

   ### 结果导出 (Export PDF)
   *   **导出菜单**：点击顶部工具栏的 **Export PDF** 可选择 `Raw PDF`、`Rasterized PDF (300dpi)`、`Rasterized PDF (600dpi)` 或 `Rasterized PDF (1200dpi)`。
   *   **Raw PDF**：生成单页 PDF (180x210mm)，spots/图例/文字保持矢量，适合后期编辑。
   *   **Rasterized PDF**：将表达 plot marks 按所选 DPI 栅格化以减小文件体积；背景组织图层与表达图层保持分离，图例与文字仍为矢量。
   *   **文件保存**：支持的浏览器会弹出保存对话框，可自行指定 PDF 文件名和保存位置；其他浏览器会降级为带时间戳文件名的普通下载。
   *   **图例对齐**：所有图例与色带均自动对齐到样本面板的右下角。
   *   **后期友好**：Raw PDF 中，图表区与图例区已分别**自动编组**。Rasterized PDF 中，背景组织图层与表达图层保持独立，便于后期调整。

2. **将 Visium / 10x count matrix 转换为 h5ad**

   ```bash
   spatialxgene visium2h5ad /path/to/visium_sample
   spatialxgene visium2h5ad /path/to/visium_sample -o output.h5ad
   spatialxgene visium2h5ad GSM8479159_O3FA_filtered_feature_bc_matrix.h5
   ```

   输入可为 Visium 样本目录，或单个 10x `.h5/.hdf5` count matrix。目录输入会读取 `spatial/`、坐标和组织图片；单文件输入会根据 Visium V1/V2 6.5mm 固定 barcode layout 推断规则 spot 坐标，写入 `obsm["spatial"]`，但不包含组织图片，也不与 `.tif` 配准。输出默认为该路径加 `.h5ad`。

3. **将 Seurat RDS 转换为 h5ad** (空间 RDS → 单个 h5ad)

   ```bash
   spatialxgene seurat2h5ad tests/P2N_Spatial.rds.gz
   spatialxgene seurat2h5ad sample.rds -o sample.h5ad
   ```

   输入为保存为 `.rds` 或 `.rds.gz` 的 Seurat 空间对象。输出默认为输入文件名加 `.h5ad`。通过 `pixi global install --path .` 或源码目录 `pixi run spatialxgene ...` 运行时，pixi 环境会提供 `Rscript`、Seurat 和 Matrix。`filtered_feature_bc_matrix.h5` 这类 10x count matrix HDF5 不是 Seurat RDS；应改用 `spatialxgene visium2h5ad <file.h5>` 生成带推断规则 spot 坐标的 h5ad，或在有 `spatial/` 目录时用 `spatialxgene visium2h5ad <sample_dir> --count-file <file.h5>`，或先在 R 中创建 Seurat 对象并 `saveRDS()`。产物可直接用于 `launch` 或下一步的 **preprocess**。

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
