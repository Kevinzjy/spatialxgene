# Spatialxgene

**v0.2.3** — Browser-based spatial transcriptomics viewer and preprocessing (cellxgene-style). Launch the viewer to explore spatial plots (zoom/pan, color by **annotation**, **gene**, or **co-expression**; optional tissue image; expression from `X` or `adata.layers`), or run **infer** / **preprocess** on raw h5ad.

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
| `spatialxgene infer` | Add spatial coordinates when the h5ad has none (e.g. Stereo-seq grid). |
| `spatialxgene preprocess` | Expression pipeline: QC, normalize, HVG, PCA, UMAP, Leiden. Does not change spatial. |

## Quick start

1. **Launch the viewer**

   ```bash
   spatialxgene launch --data-dir /path/to/preprocessed/h5ad/dir
   ```

   Opens http://127.0.0.1:5005 by default (use `--host` and `--port` to change). Use the sidebar to pick a dataset; color by **Annotation**, **Gene**, or **Co-expression** (two genes, 2D palette); choose a **Layer** (X or adata.layers) when coloring by gene; choose a tissue background image (if present); zoom/pan the plot. Optional `--token` (default `zhaoslab`) enables simple auth — open the app with `?token=zhaoslab` in the URL once. Use `--token ""` to disable.

2. **Infer spatial** (when raw h5ad has no coordinates)

   ```bash
   spatialxgene infer /path/to/raw.h5ad
   spatialxgene infer /path/to/dir
   ```

3. **Preprocess expression** (QC, reduce, cluster)

   ```bash
   spatialxgene preprocess /path/to/raw.h5ad
   ```

   Writes `*_preprocessed.h5ad`, or for a directory: `input/preprocessed/`.

## Data format (viewer)

Preprocessed h5ad for `launch` should have:

- **Spatial**: `obsm['spatial']` or `obs['x']` and `obs['y']`.
- **Expression**: `X`, `var` index = gene names.
- **Annotations** (optional): e.g. `obs['leiden']` for coloring.
- **Tissue images** (optional): Visium-style `uns['spatial'][sample]['images']` (e.g. `hires`, `lowres`) and `scalefactors`.
- **Layers** (optional): For gene/co-expression coloring, `adata.layers` (e.g. raw_counts, logcounts) are listed; default is `X`.

For all options: `spatialxgene launch --help`, `spatialxgene infer --help`, `spatialxgene preprocess --help`. To run as a long-lived service on Linux, see [docs/deployment.md](docs/deployment.md).
