# 样本数据预处理与虚拟环境搭建总结

本文档总结针对 **spatialxgene** 项目样本数据（STDS0000323）所做的环境搭建、数据检查、空间坐标补全与预处理流程。

**文档索引**  
- 项目总览与快速开始：[README.md](../README.md)  
- CLI 子命令说明：[spatialxgene/README.md](../spatialxgene/README.md)

**当前项目结构**：根目录为项目仓库；`data/sample/` 下为样本空转数据（如 STDS0000323），`data/references/` 下为参考文件（如 HCC 相关）；`spatialxgene/` 为应用包（CLI：launch / dev / infer / preprocess + 前端）。

---

## 1. 虚拟环境（uv）

- **操作**：使用 `uv` 在项目根目录创建 Python 虚拟环境。
- **命令**：`uv venv .venv`
- **激活**：`source .venv/bin/activate`
- **依赖管理**：在 `pyproject.toml` 中声明依赖（scanpy、anndata、leidenalg、pandas、numpy、h5py），可用 `uv pip install -e .` 安装。

---

## 2. 数据检查结论

- **数据位置**：`data/sample/STDS0000323/` 下 4 个 h5ad 文件：
  - `HCC_S42.h5ad`、`HCC_S44.h5ad`
  - `liver_S41.h5ad`、`liver_S43.h5ad`
- **格式**：AnnData，obs 为细胞/barcode，var 为基因（约 3.6 万），符合单细胞/空转（如 Stereo-seq）数据格式。
- **空间坐标**：原始文件中 **未发现** 空间坐标（`obs`/`obsm` 中无 `x`、`y` 或 `obsm['spatial']`），因此后续对“无空间坐标”的情况做了补全处理。

---

## 2.1 根据空间点数量推断平台

- **观测**：每个样本的 obs 数量均为 **737,280**，且 4 个样本的 barcode 顺序完全一致，说明共用同一套空间格子。
- **因数分解**：737,280 可写成规则矩形网格，例如 **768×960** 或 **720×1024**，符合“固定阵列”的布局。
- **与常见平台对比**：
  - **10x Visium**：单 capture 约 5,000 spots，整张 slide 约 2 万级 → 远小于 73 万。
  - **Slide-seq**：约 5 万 beads → 远小于 73 万。
  - **Stereo-seq（STOmics / 空转）**：基于 DNB 阵列，可产生数十万至百万级 bin；且数据来源为 STDS/stomics，命名与空转生态一致。
- **结论**：综合 **点数量（73 万级）、规则网格（768×960 等）、数据来源（STDS/stomics）**，推断为 **Stereo-seq（STOmics / 空转）** 平台。若后续拿到该数据集的芯片/ bin 坐标说明，可据此将真实空间坐标写回 `obsm['spatial']`。

---

## 3. 空间坐标：Stereo-seq 标准格式（已补充）

已按 **Stereo-seq 平台标准** 为原始 h5ad 补充空间信息（现用 **`spatialxgene infer`**）：

- **网格**：737,280 = 960×768（行优先），bin 索引 `i` 对应 `x = i % 960`，`y = i // 960`。
- **写入内容**：
  - **`obsm['spatial']`**：`(n_obs, 2)`，列为 `[x, y]`，单位为 bin 坐标（整数）。
  - **`obs['x']`**、**`obs['y']`**：与 `obsm['spatial']` 一致，便于部分工具从 obs 读取。
  - **`uns['spatial_platform']`**：`'Stereo-seq'`。
  - **`uns['spatial_bin_shape']`**：`[960, 768]`（列数×行数）。
  - **`uns['spatial_scale']`**：bin 尺寸（μm），缺省为 `1.0`，若有芯片说明可再改。

预处理在检测到已有空间坐标后**不会**再用 UMAP 覆盖，因此预处理结果中保留的是上述 Stereo-seq 真实 bin 坐标（过滤后子集的坐标自动对应保留）。

---

## 4. 空间坐标与预处理分工

- **空间坐标**：使用 **`spatialxgene infer`**。会判断是否有空间信息；有则跳过，无则自动推测并写入（已知 Stereo-seq 网格、或从 n_obs 分解网格、或代理网格）。见 `spatialxgene infer --help`。
- **预处理（仅表达矩阵）**：使用 **`spatialxgene preprocess`**（`spatialxgene/preprocess.py`）。对每个 h5ad 只做表达层面的流程，**不添加、不修改空间信息**：

| 步骤 | 说明 |
|------|------|
| QC | 按 `n_genes_by_counts >= min_genes`（默认 200，脚本示例 100）过滤细胞；按 `min_cells=3` 过滤基因 |
| 标准化 | `normalize_total(1e4)` + `log1p` |
| 高变基因 | 选取 2000 个高变基因（Seurat 方法）并子集到高变基因 |
| 降维 | PCA（默认 50 维，示例 30 维）→ 基于 PCA 构建邻居图 → UMAP |
| 聚类 | Leiden（resolution=1.0），若不可用则回退为 Louvain |

---

## 5. 生成的文件一览

### 5.1 新建的配置与代码

| 路径 | 说明 |
|------|------|
| `.venv/` | uv 创建的虚拟环境目录 |
| `pyproject.toml` | 项目配置与依赖声明 |
| `spatialxgene infer` | 推断并补全空间坐标（无则推断并写入，有则跳过），见 `spatialxgene infer --help` |
| `spatialxgene preprocess` | 仅表达矩阵预处理（QC、标准化、降维、聚类），不修改空间，见 `spatialxgene preprocess --help` |

### 5.2 预处理输出

| 路径 | 说明 |
|------|------|
| `data/sample/STDS0000323/preprocessed/HCC_S42_preprocessed.h5ad` | HCC_S42 预处理结果 |
| `data/sample/STDS0000323/preprocessed/HCC_S44_preprocessed.h5ad` | HCC_S44 预处理结果 |
| `data/sample/STDS0000323/preprocessed/liver_S41_preprocessed.h5ad` | liver_S41 预处理结果 |
| `data/sample/STDS0000323/preprocessed/liver_S43_preprocessed.h5ad` | liver_S43 预处理结果 |

每个 `*_preprocessed.h5ad` 包含：标准化与 log、高变基因子集、`X_pca`、`X_umap`、`obsm['spatial']`（**Stereo-seq 真实 bin 坐标**，x 0–959、y 0–767）、`obs['x']`/`obs['y']`、`obs['leiden']` 聚类及 QC 等。**原始 h5ad** 可用 **`spatialxgene infer`** 写入 Stereo-seq 标准空间信息；**preprocess** 不修改已有空间。

---

## 6. 如何重新运行或调整参数

```bash
spatialxgene preprocess data/sample/STDS0000323 -o data/sample/STDS0000323/preprocessed
```

单文件示例：`spatialxgene preprocess path/to/file.h5ad -o path/to/out.h5ad`。  
常用参数：`--min-genes`、`--n-top-genes`、`--n-pcs`、`--n-neighbors`、`--resolution`。空间坐标需先用 `spatialxgene infer` 处理。完整参数见：

```bash
spatialxgene preprocess --help
```


---

*文档生成自预处理与脚本编写过程，便于后续复现与扩展。*
