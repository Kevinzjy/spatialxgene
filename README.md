# Spatialxgene

**v0.2.3** — Browser-based spatial transcriptomics viewer and preprocessing (cellxgene-style). Launch the viewer to explore spatial plots (zoom/pan, color by **annotation**, **gene**, or **co-expression**; optional tissue image; expression from `X` or `adata.layers`), or run **infer** / **preprocess** on raw h5ad. Convert **Visium** Space Ranger output to h5ad with **visium2h5ad**.

## Requirements

- **Python ≥3.9**
- No Node.js or other runtimes required; the frontend is included in the package.

## Install

```bash
pip install spatialxgene
```

## Commands

| Command | Description |
|---------|-------------|
| `spatialxgene launch` | Start the browser viewer; serve preprocessed h5ad from a directory. |
| `spatialxgene visium2h5ad <dir>` | Convert Visium Space Ranger output directory to a single h5ad file (default output: dir.h5ad). |
| `spatialxgene infer` | Add spatial coordinates when the h5ad has none (e.g. Stereo-seq grid). |
| `spatialxgene preprocess` | Expression pipeline: QC, normalize, HVG, PCA, UMAP, Leiden. Does not change spatial. |

## Quick start

1. **Launch the viewer**

   ```bash
   spatialxgene launch --data-dir /path/to/preprocessed/h5ad/dir
   ```

   Opens http://127.0.0.1:5005 by default (use `--host` and `--port` to change). Use the sidebar to pick a dataset (h5ad files are discovered in the data directory and all subdirectories; the dropdown shows paths including `.h5ad`; filenames with dots, e.g. `sample_v1.3.h5ad`, are supported); color by **Annotation**, **Gene**, or **Co-expression** (two genes, 2D palette); choose a **Layer** (X or adata.layers) when coloring by gene; choose a tissue background image (if present); zoom/pan the plot. Optional `--token` (default `zhaoslab`) enables simple auth — open the app with `?token=zhaoslab` in the URL once. Use `--token ""` to disable. When behind nginx at a subpath (e.g. `/spatialxgene/`), use `--api-base spatialxgene` so assets and API use that path.

2. **Infer spatial** (when raw h5ad has no coordinates)

   ```bash
   spatialxgene infer /path/to/raw.h5ad
   spatialxgene infer /path/to/dir
   ```

3. **Convert Visium to h5ad** (Space Ranger output → single h5ad)

   ```bash
   spatialxgene visium2h5ad /path/to/visium_sample
   spatialxgene visium2h5ad /path/to/visium_sample -o output.h5ad
   ```

   Input is the Visium sample directory; output defaults to that path with `.h5ad` (e.g. `a/b/c` → `a/b/c.h5ad`). Use the output with `launch` or run **preprocess** next.

4. **Preprocess expression** (QC, normalize, reduce, cluster)

   ```bash
   spatialxgene preprocess raw.h5ad
   spatialxgene preprocess raw.h5ad -o custom.h5ad
   ```

   Follows scanpy tutorial: QC, normalize_total, log1p, HVG (used only for PCA/UMAP/Leiden); output keeps **all genes** that passed QC. Writes **leiden** (and **louvain** when used) to `obs`, and **raw_counts** to `adata.layers` before normalization so you can color by raw counts in the viewer. Default output: same dir with `*_processed.h5ad` (e.g. `a/b/c.h5ad` → `a/b/c_processed.h5ad`) or `input/preprocessed/` for a directory.

## Data format (viewer)

Preprocessed h5ad for `launch` should have:

- **Spatial**: `obsm['spatial']` or `obs['x']` and `obs['y']`.
- **Expression**: `X`, `var` index = gene names.
- **Annotations** (optional): e.g. `obs['leiden']`, `obs['louvain']` for coloring (written by `preprocess`).
- **Tissue images** (optional): Visium-style `uns['spatial'][sample]['images']` (e.g. `hires`, `lowres`) and `scalefactors`.
- **Layers** (optional): For gene/co-expression coloring, `adata.layers` (e.g. `raw_counts` before normalization, logcounts) are listed; default is `X`. The `preprocess` command saves `raw_counts` before normalizing so you can switch between raw and normalized in the viewer.

For all options: `spatialxgene launch --help`, `spatialxgene visium2h5ad --help`, `spatialxgene infer --help`, `spatialxgene preprocess --help`. To run as a long-lived service on Linux, see [docs/deployment.md](docs/deployment.md).
