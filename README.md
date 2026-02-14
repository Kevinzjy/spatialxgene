# Spatialxgene

**v0.2.4** — Browser-based spatial transcriptomics viewer and preprocessing (cellxgene-style). Launch the viewer to explore spatial plots (zoom/pan, color by **annotation**, **gene**, or **co-expression**; optional tissue image; expression from `X` or `adata.layers`), or run **preprocess** on raw h5ad. Convert **Visium** Space Ranger output to h5ad with **visium2h5ad**, or **Seurat RDS** to h5ad with **seurat2h5ad**.

## Requirements

- [pixi](https://pixi.sh/) (recommended) or Python ≥3.9 + Node.js for building the frontend. The packaged app includes the built frontend.

## Install

### From source with pixi (recommended)

```bash
git clone <repo> && cd spatialxgene
pixi run install
```

Then run `spatialxgene` from the pixi env (e.g. `pixi run launch` or `pixi run spatialxgene launch`). Default data dir for the viewer is `./tests/h5ad`; put preprocessed h5ad there or pass `--data-dir /path`.

Or, install globally (from the project root):

```bash
pixi global install --path .
```

Then `spatialxgene` is exposed to your `$PATH` (ensure `~/.pixi/bin` is on PATH).

## Commands

| Command | Description |
|---------|-------------|
| `spatialxgene launch` | Start the browser viewer; serve preprocessed h5ad from a directory. |
| `spatialxgene visium2h5ad <dir>` | Convert Visium Space Ranger output directory to a single h5ad file (default output: dir.h5ad). |
| `spatialxgene seurat2h5ad <file>` | Convert Seurat spatial RDS (.rds or .rds.gz) to a single h5ad file. Requires R with Seurat (pixi env includes r-seurat). |
| `spatialxgene preprocess <file or dir>` | Expression pipeline: QC, normalize, HVG, PCA, UMAP, Leiden. Input: single .h5ad file or directory of .h5ad. Does not change spatial. |

## Quick start

1. **Launch the viewer**

   ```bash
   pixi run launch
   # or: spatialxgene launch --data-dir /path/to/h5ad
   ```
   Default data dir is `./tests/h5ad`. Put preprocessed h5ad there, or override with `--data-dir`.

   Opens http://127.0.0.1:5005 by default (use `--host` and `--port` to change). Use the sidebar to pick a dataset (h5ad files are discovered in the data directory and all subdirectories; the dropdown shows paths including `.h5ad`; filenames with dots, e.g. `sample_v1.3.h5ad`, are supported); color by **Annotation**, **Gene**, or **Co-expression** (two genes, 2D palette); choose a **Layer** (X or adata.layers) when coloring by gene; choose a tissue background image (if present); zoom/pan the plot. Optional `--token` (default `zhaoslab`) enables simple auth — open the app with `?token=zhaoslab` in the URL once. Use `--token ""` to disable. When behind nginx at a subpath (e.g. `/spatialxgene/`), use `--api-base spatialxgene` so assets and API use that path.

2. **Convert Visium to h5ad** (Space Ranger output → single h5ad)

   ```bash
   spatialxgene visium2h5ad /path/to/visium_sample
   spatialxgene visium2h5ad /path/to/visium_sample -o output.h5ad
   ```

   Input is the Visium sample directory; output defaults to that path with `.h5ad` (e.g. `a/b/c` → `a/b/c.h5ad`). Use the output with `launch` or run **preprocess** next.

3. **Convert Seurat RDS to h5ad** (spatial RDS → single h5ad)

   ```bash
   spatialxgene seurat2h5ad tests/P2N_Spatial.rds.gz
   spatialxgene seurat2h5ad sample.rds -o sample.h5ad
   ```

   Input is a Seurat spatial object saved as `.rds` or `.rds.gz`. Output defaults to the input stem with `.h5ad` (e.g. `P2N_Spatial.rds.gz` → `P2N_Spatial.h5ad`). Requires R with Seurat (use `pixi run install` so the pixi env has `r-seurat`). Use the output with `launch` or run **preprocess** next.

4. **Preprocess expression** (QC, normalize, reduce, cluster)

   ```bash
   spatialxgene preprocess raw.h5ad
   spatialxgene preprocess raw.h5ad -o custom.h5ad
   ```

   Follows scanpy tutorial: QC, normalize_total, log1p, HVG (used only for PCA/UMAP/Leiden); output keeps **all genes** that passed QC. Writes **leiden** (and **louvain** when used) to `obs`, and **counts** to `adata.layers` before normalization so you can color by raw counts in the viewer. When `obs['in_tissue']` exists (e.g. Visium), spot filtering by gene count is skipped so on-tissue spots are kept; when the input has `adata.raw`, it is copied into `layers['counts']` when possible before writing. Default output: same dir with `*_processed.h5ad` (e.g. `a/b/c.h5ad` → `a/b/c_processed.h5ad`) or `input/preprocessed/` for a directory.

## Data format (viewer)

Preprocessed h5ad for `launch` should have:

- **Spatial**: `obsm['spatial']` or `obs['x']` and `obs['y']`.
- **Expression**: `X`, `var` index = gene names.
- **Annotations** (optional): e.g. `obs['leiden']`, `obs['louvain']` for coloring (written by `preprocess`).
- **Tissue images** (optional): Visium-style `uns['spatial'][sample]['images']` (e.g. `hires`, `lowres`) and `scalefactors`.
- **Layers** (optional): For gene/co-expression coloring, `adata.layers` (e.g. `counts` before normalization, logcounts) are listed; default is `X`. The `preprocess` command saves `counts` before normalizing so you can switch between raw and normalized in the viewer.

For all options: `spatialxgene launch --help`, `spatialxgene visium2h5ad --help`, `spatialxgene seurat2h5ad --help`, `spatialxgene preprocess --help`. To run as a long-lived service on Linux, see [docs/deployment.md](docs/deployment.md).
