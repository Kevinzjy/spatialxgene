# Spatialxgene

**v0.2.2** — Browser-based spatial transcriptomics viewer and preprocessing (cellxgene-style). Launch the viewer to explore spatial plots (zoom/pan, color by gene or annotation, optional tissue image), or run **infer** / **preprocess** on raw h5ad.

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

   Opens http://127.0.0.1:5005 by default (use `--host` and `--port` to change). Use the sidebar to pick a dataset, color by annotation or gene, choose a tissue background image (if present), and zoom/pan the plot.

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

For all options: `spatialxgene launch --help`, `spatialxgene infer --help`, `spatialxgene preprocess --help`.
