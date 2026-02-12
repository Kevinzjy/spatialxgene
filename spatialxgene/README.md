# Spatialxgene (package)

Spatial transcriptomics viewer and preprocessing. Use the `spatialxgene` CLI from the project root.

## Subcommands

### infer — Infer spatial coordinates

Check if h5ad has spatial coordinates; if not, infer and add them (known Stereo-seq grid, factorized grid from n_obs, or proxy). If already present, skip.

```bash
spatialxgene infer path/to/file.h5ad              # overwrite in place
spatialxgene infer path/to/dir -o path/to/out     # write to output dir
```

- **input** — Single `.h5ad` or directory of `.h5ad`.
- **-o** — Output file or directory (default: in place).
- **--bin-scale-um** — Bin size in micron (default 1.0).
- **--exclude** — Skip files whose name contains this (default: preprocessed).

### dev — Backend + frontend watch (for development)

One command: backend runs and frontend is watched. When you save any file under `spatialxgene/frontend/`, the app is rebuilt automatically; **refresh the browser** to see changes. No need to run `npm run build` manually.

```bash
spatialxgene dev [--data-dir DIR] [--port N] [--no-browser]
```

### launch — Browser visualization (production build)

Start the web app to explore preprocessed h5ad with spatial coordinates.

```bash
spatialxgene launch [--data-dir DIR] [--port N] [--no-browser] [--build]
```

- **--data-dir** — Directory of preprocessed `.h5ad` files (default: `data/sample/STDS0000323/preprocessed`).
- **--port** — Port (default 8000).
- **--no-browser** — Do not open the browser.
- **--build** — Run `npm run build` in `frontend/` before starting.

**Viewer (spatial plot)**  
Canvas-based plot in data coordinates. Point radius is computed from grid spacing (`sqrt(area/n)`) so points align with spatial layout with a small gap. Zoom (mouse wheel), pan (drag). Color by gene expression or obs annotation (e.g. Leiden). Optional tissue background image: choose hires or lowres from `adata.uns['spatial']` when present; spot size and background opacity are adjustable.

First time: build the frontend from project root:

```bash
cd spatialxgene/frontend && npm install && npm run build && cd ../..
```

### preprocess — QC, reduce, cluster (expression only)

Preprocess the expression matrix only: QC, normalize, log, HVG, PCA, neighbors, UMAP, Leiden. **Does not add or modify spatial coordinates**; run `spatialxgene infer` first if needed.

```bash
# Directory: process all .h5ad, write to input/preprocessed/
spatialxgene preprocess data/sample/STDS0000323

# Single file
spatialxgene preprocess path/to/raw.h5ad -o path/to/preprocessed.h5ad
```

- **input** — Single `.h5ad` file or directory of `.h5ad` files.
- **-o, --output** — Output file or directory. Default: same dir with `_preprocessed.h5ad` or `input/preprocessed/`.
- **--exclude** — Skip input files whose name contains this (default: preprocessed).
- **--min-genes, --min-cells, --n-top-genes, --n-pcs, --n-neighbors, --resolution** — Pipeline parameters (see `spatialxgene preprocess --help`).

## Data format (for launch)

Preprocessed h5ad should have:

- **Spatial**: `obsm['spatial']` or `obs['x']` and `obs['y']`.
- **Expression**: `X` (cells × genes), `var` index = gene names.
- **Annotations** (optional): e.g. `obs['leiden']` for coloring.
- **Tissue images** (optional): Visium-style `uns['spatial'][sample]['images']` (e.g. `hires`, `lowres`) and `scalefactors`; the viewer uses them for background and aligns with spot coordinates (hires extent as reference for lowres).

## Development

- **Backend**: `uvicorn spatialxgene.server.main:app --reload --port 8000` (set data dir in code or before mount).
- **Frontend**: In `spatialxgene/frontend`, `npm run dev` (Vite proxies `/api` to 8000); run backend separately.
