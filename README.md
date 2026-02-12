# Spatialxgene

**v0.2.1** — Browser-based spatial transcriptomics viewer and preprocessing (cellxgene-style). **Launch** the viewer to explore spatial plots (zoom/pan, color by gene or annotation, optional tissue image), or run **infer** / **preprocess** on raw h5ad.

## Requirements

- **Python ≥3.9**
- If you **install from PyPI** (`pip install spatialxgene`): no other requirements; the frontend is included.
- If you **install from source** (`pip install -e .`): [Node.js](https://nodejs.org/) is needed to build the frontend once (see [docs/development.md](docs/development.md)).

## Install

```bash
# From PyPI (recommended; frontend included)
pip install spatialxgene

# From source (e.g. for development)
git clone <repo> && cd spatialxgene
pip install -e .
# Then build frontend once: see docs/development.md
```

## Commands

| Command | Description |
|---------|-------------|
| `spatialxgene launch` | Start the browser viewer; serve preprocessed h5ad from a directory. |
| `spatialxgene infer` | Add spatial coordinates when the h5ad has none (e.g. Stereo-seq grid). |
| `spatialxgene preprocess` | Expression pipeline: QC, normalize, HVG, PCA, UMAP, Leiden. Does not change spatial. |

For development (frontend watch): `spatialxgene dev` — see [docs/development.md](docs/development.md).

## Quick start

1. **Launch the viewer**

   ```bash
   spatialxgene launch --data-dir /path/to/preprocessed/h5ad/dir
   ```

   Opens http://127.0.0.1:5005 (default port 5005). Use the sidebar to pick a dataset, color by annotation or gene, choose a tissue background image (if present), and zoom/pan the plot.

2. **Infer spatial** (when raw h5ad has no coordinates)

   ```bash
   spatialxgene infer /path/to/raw.h5ad
   # or a directory: spatialxgene infer /path/to/dir
   ```

3. **Preprocess expression** (QC, reduce, cluster)

   ```bash
   spatialxgene preprocess /path/to/raw.h5ad
   # Writes *_preprocessed.h5ad (or input/preprocessed/ for a directory)
   ```

## Data format (viewer)

Preprocessed h5ad for `launch` should have:

- **Spatial**: `obsm['spatial']` or `obs['x']` and `obs['y']`.
- **Expression**: `X`, `var` index = gene names.
- **Annotations** (optional): e.g. `obs['leiden']` for coloring.
- **Tissue images** (optional): Visium-style `uns['spatial'][sample]['images']` (e.g. `hires`, `lowres`) and `scalefactors`.

More options: `spatialxgene launch --help`, `spatialxgene infer --help`, `spatialxgene preprocess --help`.

## Documentation

- [CHANGELOG.md](CHANGELOG.md) — Release history.
- [docs/](docs/) — Development, project layout, design, and plans: [development.md](docs/development.md), [master_plan.md](docs/master_plan.md), [implementation_plan.md](docs/implementation_plan.md), [design_guidelines.md](docs/design_guidelines.md), [tasks.md](docs/tasks.md).
