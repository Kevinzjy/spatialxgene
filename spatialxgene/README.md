# Spatialxgene (package)

Spatial transcriptomics viewer and preprocessing. Use the `spatialxgene` CLI. The frontend is included when you install from PyPI.

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

One command: backend runs and frontend is watched. Saving a frontend file triggers a rebuild; refresh the browser to see changes. No need to run `npm run build` manually.

```bash
spatialxgene dev [--data-dir DIR] [--port N] [--no-browser]
```

### launch — Browser visualization (production build)

Start the web app to explore preprocessed h5ad with spatial coordinates.

```bash
spatialxgene launch [--data-dir DIR] [--port N] [--no-browser] [--build]
```

- **--data-dir** — Directory of preprocessed `.h5ad` files.
- **--port** — Port (default 5005). **--host** — Bind host (default 0.0.0.0 for launch, 127.0.0.1 for dev).
- **--no-browser** — Do not open the browser.
- **--build** — Rebuild frontend before starting (only when running from source).

**Viewer (spatial plot)**  
Canvas-based plot in data coordinates. Point radius from grid spacing; zoom (wheel, cursor-centered) and pan (drag); toolbar has zoom in/out and reset. Color by annotation or gene; unselected mode shows all points in gray. Optional tissue background (hires/lowres) when embedding is Spatial; sidebar can toggle Spatial/UMAP (background image hidden in UMAP). Gene mode: continuous palette and reverse option. Hover shows spot index and annotation/gene value; annotation legend (below Opacity) lists categories with counts, sorted by count. Dataset switch shows a loading overlay with a step-based progress bar (25% per request) and a brief hold at 100% so the user sees the full sequence; layout fills the viewport (no scrollbar).

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

## Deploying under a subpath (e.g. nginx)

One build works at the site root or any subpath. When the app is behind a reverse proxy at a path like `/spatialxgene/`, start the server with the same base so the frontend can prefix API requests correctly:

```bash
spatialxgene launch --api-base spatialxgene
# or any path, e.g. --api-base viewer
```

Nginx example (path can be anything; keep it in sync with `--api-base`):

```nginx
location /spatialxgene/ {
    proxy_pass http://127.0.0.1:5005/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Access the app at `https://your-domain/spatialxgene/`. For root access, run without `--api-base`.

**Test subpath locally** (no need to deploy): run `spatialxgene launch --api-base spatialxgene` and open `http://localhost:5005/spatialxgene/`; the app is mounted at that path so favicon, assets, and API all work as on production.

## Development

For project layout, `spatialxgene dev`, and build/run from source, see the project repository.
