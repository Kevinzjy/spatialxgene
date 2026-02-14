# Spatialxgene (package)

Spatial transcriptomics viewer and preprocessing. Use the `spatialxgene` CLI. The frontend is included when you install from PyPI.

## Subcommands

### launch — Browser visualization (production build)

Start the web app to explore preprocessed h5ad with spatial coordinates.

```bash
spatialxgene launch [--data-dir DIR] [--port N] [--no-browser] [--build]
```

- **--data-dir** — Directory of preprocessed `.h5ad` files.
- **--port** — Port (default 5005). **--host** — Bind host (default 0.0.0.0).
- **--no-browser** — Do not open the browser.
- **--build** — Rebuild frontend before starting (only when running from source).

**Viewer (spatial plot)**  
Canvas-based plot in data coordinates. Point radius from grid spacing; zoom (wheel, cursor-centered) and pan (drag); toolbar has zoom in/out and reset. Color by annotation or gene; unselected mode shows all points in gray. Optional tissue background (hires/lowres) when embedding is Spatial; sidebar can toggle Spatial/UMAP (background image hidden in UMAP). Gene mode: continuous palette and reverse option. Hover shows spot index and annotation/gene value; annotation legend (below Opacity) lists categories with counts, sorted by count. Dataset switch shows a loading overlay with a step-based progress bar (25% per request) and a brief hold at 100% so the user sees the full sequence; layout fills the viewport (no scrollbar).

### visium2h5ad — Convert Visium Space Ranger to h5ad

Convert a Visium Space Ranger output directory (with `spatial/` and `filtered_feature_bc_matrix` or `filtered_feature_bc_matrix.h5`) to a single `.h5ad` file for use with `launch` or downstream tools. Uses `scanpy.read_visium()`; var names are made unique before writing.

```bash
spatialxgene visium2h5ad /path/to/visium_sample
spatialxgene visium2h5ad /path/to/visium_sample -o output.h5ad
```

- **input** — (Positional) Path to the Visium sample directory (must contain `spatial/` and the count matrix).
- **-o, --output** — Output `.h5ad` file path. Default: input path with `.h5ad` suffix (e.g. `a/b/c` → `a/b/c.h5ad`).
- **--count-file** — Count matrix file or directory name under input (default: auto-detect `filtered_feature_bc_matrix.h5` or `filtered_feature_bc_matrix`).
- **--no-images** — Do not load tissue images into the h5ad (smaller file).

### seurat2h5ad — Convert Seurat spatial RDS to h5ad

Convert a Seurat spatial object saved as `.rds` or `.rds.gz` to a single `.h5ad` file. Uses an R script (Seurat + Matrix) to read the RDS and export matrix, metadata, spatial coordinates, and tissue images; Python builds AnnData and writes h5ad in **Visium-style format** so the viewer can show the background image aligned with spots. Requires R with Seurat (e.g. pixi env with `r-seurat`).

```bash
spatialxgene seurat2h5ad /path/to/sample.rds.gz
spatialxgene seurat2h5ad sample.rds -o sample.h5ad
```

- **input** — (Positional) Path to the Seurat RDS file (`.rds` or `.rds.gz`).
- **-o, --output** — Output `.h5ad` file path. Default: input stem with `.h5ad` (e.g. `sample.rds.gz` → `sample.h5ad`).
- **--rscript** — Path to Rscript executable (default: `RSCRIPT` env or `Rscript` on PATH).

**Output format (viewer-compatible):** `uns['spatial']['sample']['images']` with keys `hires` and (if image > 400px) `lowres`, float32 in [0,1]; `scalefactors` with `tissue_hires_scalef = 1.0` and `tissue_lowres_scalef` so spots align with the tissue image (Seurat imagecol/imagerow are in image pixel space).

### preprocess — QC, normalize, reduce, cluster (expression only)

Preprocess following scanpy tutorial: QC, normalize_total, log1p, HVG (marked but **not** used to subset genes); PCA, neighbors, UMAP, Leiden are run on HVG only; the **output h5ad keeps all genes** that passed QC (X = normalized log counts). Optional `counts` layer saved before normalization. **Does not add or modify spatial coordinates**.

```bash
# Single file (default output: same dir, name_processed.h5ad)
spatialxgene preprocess raw.h5ad
spatialxgene preprocess raw.h5ad -o custom.h5ad

# Directory: process all .h5ad, write to input/preprocessed/
spatialxgene preprocess data/sample/STDS0000323 -o data/sample/STDS0000323/preprocessed
```

- **input** — (Positional) Single `.h5ad` file or directory of `.h5ad` files.
- **-o, --output** — Output file or directory. Default: same dir with `_processed.h5ad` (e.g. `a/b/c.h5ad` → `a/b/c_processed.h5ad`) or `input/preprocessed/`.
- **--exclude** — Skip input files whose name contains this (default: processed, so `*_processed.h5ad` are not re-processed).
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

For project layout and build/run from source, see the project repository.
