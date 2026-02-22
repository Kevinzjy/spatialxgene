# Spatialxgene

**v0.2.6** — Browser-based spatial transcriptomics viewer and preprocessing (cellxgene-style). Launch the viewer to explore spatial plots (zoom/pan, color by **annotation**, **gene**, or **co-expression**; optional tissue image; expression from `X` or `adata.layers`), or run **preprocess** on raw h5ad. Convert **Visium** Space Ranger output to h5ad with **visium2h5ad**, or **Seurat RDS** to h5ad with **seurat2h5ad**.

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
| `spatialxgene preprocess <file or dir>` | Expression pipeline: QC, normalize, HVG, PCA, UMAP, Leiden; optional CellTypist auto cell-type annotation (`obs['auto_cell_type']`). Input: single .h5ad or directory. Does not change spatial. Use `--no-celltypist` to skip annotation. |

## Quick start

1. **Launch the viewer**

   ```bash
   pixi run launch
   # or: spatialxgene launch --data-dir /path/to/h5ad
   ```
   Default data dir is `./tests/h5ad`. Put preprocessed h5ad there, or override with `--data-dir`. If the directory is missing, launch prints a hint to stderr; if it is empty, the sidebar shows “No h5ad files found under &lt;path&gt;” (path comes from the server). When you add another dataset to the selection, only the new one is loaded (incremental load); the server keeps an LRU cache of loaded adata (default max 16 datasets; set `SPATIALXGENE_CACHE_MAX_DATASETS` to change). Gene lists show the first 200 entries; use the search box to narrow results. A small (?) icon next to **Gene** / **Gene1** / **Gene2** / **Genes** explains this on hover.

   Opens http://127.0.0.1:5005 by default (use `--host` and `--port` to change). A **toolbar** at the top of the plot area includes an **Export PDF** button to download all visible plots as a single-page, vector-based PDF (180×210 mm): spots and legends are editable vectors; tissue images are raster. Legends (categorical swatches + label/count, gene color bar with title, multi-gene gradient bars) are drawn in the bottom-right of each sample **panel** with a compact background box. Each sample name appears once in the **title band** above the plot (single- or multi-sample). Single-sample multi-gene export uses the same pie/grid colors as on screen. Use the sidebar to pick one or more datasets (h5ad files are discovered in the data directory and all subdirectories; the dropdown shows paths including `.h5ad`). When multiple datasets are selected, a **comparison grid** is shown for **Gene**, **Annotation**, **Co-expression**, and **Multi-gene** modes; you can **drag to reorder** the selected list to change display order. Color by **Annotation**, **Gene**, **Co-expression** (two genes, 2D palette), or **Multi-gene** (multiple genes per spot: **Pie** or **Grid** layout, color range pmin/pmax and Log scale; each sample shows a compact **color bar** in the bottom-right with per-gene expression range; if a gene is missing in a sample, that sample still shows spots using the other genes). In multi-sample Annotation mode, the in-plot categorical legend shows **per-sample** category counts (not the total across samples). Choose a **Layer** (X or adata.layers) when coloring by gene; choose a tissue background image (if present). **Spot size** can be set up to 300% (useful for UMAP). The sidebar scrolls when content is long (subtle scrollbar); Datasets/Gene lists have minimum height so they stay readable. Zoom/pan the plot. Optional `--token` (default `zhaoslab`) enables simple auth — open the app with `?token=zhaoslab` in the URL once. Use `--token ""` to disable. When behind nginx at a subpath (e.g. `/spatialxgene/`), use `--api-base spatialxgene` so assets and API use that path.

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

4. **Preprocess expression** (QC, normalize, reduce, cluster, optional CellTypist annotation)

   ```bash
   spatialxgene preprocess raw.h5ad
   spatialxgene preprocess raw.h5ad -o custom.h5ad
   spatialxgene preprocess raw.h5ad --no-celltypist    # skip auto cell-type annotation
   ```

   Follows scanpy tutorial: QC, normalize_total, log1p, HVG (used only for PCA/UMAP/Leiden); output keeps **all genes** that passed QC. Writes **leiden** (and **louvain** when used) to `obs`, and **counts** to `adata.layers` before normalization. When **CellTypist** is enabled (default), species (human/mouse) is inferred from gene symbols and cell types are predicted with model routing and majority voting; results go to **`obs['auto_cell_type']`** (and optionally **`obs['auto_cell_type_coarse']`** for immune-enriched samples). Use `--no-celltypist` to skip annotation; `--celltypist-model NAME` to force a model. When `obs['in_tissue']` exists (e.g. Visium), spot filtering by gene count is skipped; when the input has `adata.raw`, it is copied into `layers['counts']` when possible before writing. Default output: same dir with `*_processed.h5ad` or `input/preprocessed/` for a directory.

## Data format (viewer)

Preprocessed h5ad for `launch` should have:

- **Spatial**: `obsm['spatial']` or `obs['x']` and `obs['y']`.
- **Expression**: `X`, `var` index = gene names.
- **Annotations** (optional): e.g. `obs['leiden']`, `obs['louvain']`, `obs['auto_cell_type']` for coloring (written by `preprocess`; `auto_cell_type` from CellTypist when not disabled).
- **Tissue images** (optional): Visium-style `uns['spatial'][sample]['images']` (e.g. `hires`, `lowres`) and `scalefactors`.
- **Layers** (optional): For gene/co-expression/multi-gene coloring, `adata.layers` (e.g. `counts` before normalization, logcounts) are listed; default is `X`. The `preprocess` command saves `counts` before normalizing so you can switch between raw and normalized in the viewer.

For all options: `spatialxgene launch --help`, `spatialxgene visium2h5ad --help`, `spatialxgene seurat2h5ad --help`, `spatialxgene preprocess --help`. Backend unit tests: `pixi run pytest` (or `make pytest`). To run as a long-lived service on Linux, see [docs/deployment.md](docs/deployment.md).
