# Spatialxgene

**v0.1** — Browser-based spatial transcriptomics viewer and preprocessing (cellxgene-style). **Launch** the viewer to explore spatial plots (zoom/pan, color by gene or annotation, optional tissue background image), or run **infer** / **preprocess** on raw h5ad.

## Requirements

- **Python ≥3.9** (recommended: [uv](https://github.com/astral-sh/uv) for venv and install)
- **Node.js** (for building the frontend; required only for `launch` / `dev`)

## Project layout

```
<project root>/
├── README.md              # This file
├── pyproject.toml         # Python package: name = "spatialxgene"
├── data/
│   ├── sample/            # Sample data for testing
│   │   └── STDS0000323/   # Stereo-seq (raw + preprocessed/)
│   └── references/       # Reference files (HCC targets, etc.)
├── docs/               # master_plan, implementation_plan, design_guidelines, tasks
└── spatialxgene/          # Main package
    ├── cli.py             # Subcommands: launch, dev, infer, preprocess
    ├── preprocess.py      # Expression pipeline (QC, HVG, PCA, UMAP, Leiden)
    ├── infer_spatial.py   # Infer/add spatial coordinates (e.g. Stereo-seq grid)
    ├── server/            # FastAPI backend (for launch)
    └── frontend/          # Vite + React UI (spatial plot, sidebar)
```

## Commands

| Command | Description |
|---------|-------------|
| `spatialxgene launch` | Start the browser viewer; serve preprocessed h5ad from a directory. |
| `spatialxgene dev` | Same as launch but with **frontend watch**: save any file in `spatialxgene/frontend/` to auto-rebuild; refresh browser to see changes. No need to run `npm run build` manually. |
| `spatialxgene infer` | Detect if h5ad has spatial coords; if not, infer and add them. Skip if already present. |
| `spatialxgene preprocess` | Expression-only: QC, normalize, HVG, PCA, UMAP, Leiden. Does not add or change spatial. |

## Quick start

1. **Install** (from this directory):

   ```bash
   uv pip install -e .
   ```

2. **Launch the viewer** (build frontend first time only: `cd spatialxgene/frontend && npm install && npm run build`):

   ```bash
   spatialxgene launch
   ```

   Opens http://127.0.0.1:8000 with sample data. Use `--data-dir` to point to another folder of preprocessed h5ad.

   **While developing the frontend**, use **`spatialxgene dev`** instead: one command runs the backend and watches `spatialxgene/frontend/`; any save triggers a rebuild. Refresh the browser to see changes (no need to run `npm run build` each time).

**Viewer**: Spatial plot shows points in data coordinates; point size is derived from grid spacing (bounds + n_obs) so adjacent points have a small gap. You can zoom (wheel), pan (drag), color by gene expression or obs annotation, choose a tissue background image (hires / lowres from `adata.uns['spatial']` when present), and adjust spot size and background opacity. In gene mode, you can pick a continuous color palette and optionally reverse its direction (e.g. `vlag` vs. `vlag_r`-style).

3. **Infer spatial** (when raw h5ad has no coords):

   ```bash
   spatialxgene infer data/sample/STDS0000323
   # or: spatialxgene infer path/to/file.h5ad -o path/to/out.h5ad
   ```

   If data already has spatial, skips. Otherwise infers (e.g. Stereo-seq 960×768 for 737280 obs) or a factorized/proxy grid.

4. **Preprocess expression** (QC, reduce, cluster; does not modify spatial):

   ```bash
   spatialxgene preprocess data/sample/STDS0000323
   # or: spatialxgene preprocess path/to/file.h5ad -o path/to/out.h5ad
   ```

   Writes `*_preprocessed.h5ad` (or `input/preprocessed/` when input is a directory).

## Data

- **Sample**: `data/sample/STDS0000323/` — Stereo-seq sample; preprocessed in `data/sample/STDS0000323/preprocessed/`. Use `--data-dir` to point to your own folder.
- **References**: `data/references/` — HCC targets, etc. (not used by the app).
- **Viewer data format**: Preprocessed h5ad with `obsm['spatial']` (or `obs['x']`/`obs['y']`); optional `uns['spatial'][sample]['images']` (e.g. `hires`, `lowres`) and `scalefactors` for tissue background images (Visium-style).

## Documentation
| Doc | Description |
|-----|-------------|
| [CHANGELOG.md](CHANGELOG.md) | Release history (v0.1.0) |
| [docs/master_plan.md](docs/master_plan.md) | Project goals and scope |
| [docs/implementation_plan.md](docs/implementation_plan.md) | Implementation order and data design |
| [docs/design_guidelines.md](docs/design_guidelines.md) | UI/UX: colors, fonts, interaction |
| [docs/tasks.md](docs/tasks.md) | Current task list |

## Development

- Use **`spatialxgene dev`** for backend + frontend watch; edit `spatialxgene/frontend/` and refresh the browser.
- Root `.gitignore` covers Python, Node, IDE, and build artifacts.
