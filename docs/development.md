# Development

Project layout, build and run from source, and where to find design/plan docs.

## Environment: pixi (Python from conda-forge)

The project uses **[pixi](https://pixi.sh/)** for environment management (install at `~/.pixi/bin/pixi` or ensure `pixi` is on PATH). Pixi manifest reference: <https://pixi.prefix.dev/latest/reference/pixi_manifest>. Pixi provides:

- **Python and Python packages** — From conda-forge (numpy, scanpy, anndata, fastapi, uvicorn, etc.); versions are pinned in `pixi.toml`.
- **nodejs** — Frontend (npm install, npm run build)
- **r-base** — R runtime for future R dependencies

Run `pixi run launch`; the install task runs `pip install -e . --no-deps` so the package uses pixi-installed deps. Add more R or conda packages in `pixi.toml` as needed.

**Pixi env sync:** If `pixi list <pkg>` shows a package but `pixi run python -c "import <pkg>"` fails (e.g. pytz, dateutil), the on-disk environment is out of sync with the lockfile. Run `pixi reinstall` to reinstall the default environment from the lockfile. Explicit deps like `pytz` and `python-dateutil` in `pixi.toml` ensure pandas timezone support; after adding them, run `pixi install` (or `pixi lock` then `pixi reinstall` if the env was created earlier).

**API robustness:** Datasets with zero observations (empty x/y coordinate arrays) are handled in `get_dataset_meta`: default bounds (0, 1) are returned instead of calling `np.nanmin`/`np.nanmax` on empty arrays, avoiding 500 errors.

The **Makefile** is a thin wrapper: each target runs `pixi run <task>`. You can run tasks directly with `pixi run <task>` (e.g. `pixi run install`, `pixi run launch`).

## Project layout

```
<project root>/
├── README.md
├── pyproject.toml         # Python package metadata; pip install -e . --no-deps
├── pixi.toml              # Pixi: deps (python, nodejs, r-base), tasks
├── CHANGELOG.md
├── Makefile               # Thin wrapper: make X → pixi run X
├── tests/                 # Test data and default launch data dir
│   ├── HCC1R.tar          # Visium sample (tar); test task extracts and runs pipeline
│   ├── P2N_Spatial.rds.gz  # (optional) Seurat RDS for seurat2h5ad in pixi run test
│   └── h5ad/              # Default DATA_DIR for launch; put preprocessed h5ad here
├── docs/                  # Design and development docs
│   ├── development.md     # This file
│   ├── deployment.md      # Run as systemd service, token, Nginx
│   ├── master_plan.md
│   ├── implementation_plan.md
│   ├── design_guidelines.md
│   └── tasks.md
└── spatialxgene/
    ├── __init__.py        # __version__
    ├── cli.py             # Subcommands: launch, preprocess, visium2h5ad
    ├── preprocess.py      # QC, HVG, PCA, UMAP, Leiden; optionally CellTypist (see celltypist_annotate.py)
    ├── celltypist_annotate.py  # Species inference, model routing, auto_cell_type annotation
    ├── visium2h5ad.py     # Visium Space Ranger dir → h5ad (scanpy.read_visium)
    ├── server/            # FastAPI backend
    ├── frontend/          # Vite + React UI (spatial plot, sidebar)
    └── scripts/           # R helper for seurat2h5ad (seurat2h5ad.R only)
```

## Install and run from source

1. Ensure pixi is installed (e.g. `~/.pixi/bin/pixi`). From project root:

   ```bash
   pixi run install
   # or: make install
   ```

   This installs pixi deps, builds the frontend, and `pip install -e . --no-deps`.

2. Launch the viewer:

   ```bash
   pixi run launch
   # or: make launch
   ```

   Default data dir is `./tests/h5ad` (see pixi.toml). Override: `DATA_DIR=/path HOST=0.0.0.0 PORT=5005 pixi run launch`. Optional: `--token zhaoslab` (default); use `--token ""` to disable. See [deployment.md](deployment.md) for production deployment.

## Development workflow

- **Backend only**: `pixi run python -m uvicorn spatialxgene.server.main:app --reload --host 127.0.0.1 --port 5005`.
- **Frontend only**: In `spatialxgene/frontend`, `npm run dev` (Vite proxies `/api` to 5005); run the backend separately on port 5005.

## Frontend tests (Playwright E2E)

- **Scope**: A small set of Playwright end-to-end smoke tests cover core flows (dataset selection, embedding/background toggles, Color by Annotation/Gene, Multi-gene layouts, Export PDF).
- **Setup**:
  - Browser system dependencies (like `libnss3`, `libatk`) are managed automatically via `pixi.toml` for Linux.
  - In `spatialxgene/frontend`, install dev deps: `npm install` (or `pixi run install` from root).
- **Run locally**:
  - Run the full test suite with: `make test-e2e` (starts backend and frontend automatically).
- **Troubleshooting**:
  - **PDF Export**: Full vector PDF generation for large datasets (e.g. 20k+ spots) is extremely CPU/memory intensive in headless browsers. The smoke test validates the process starts without error but does not wait for full high-res generation to avoid CI timeouts.

### Frontend behaviour: layout and PDF export

- **Responsive layout**:  
  - Root layout is flex-based; `#root` and the top-level `App` container use `flex: 1` with `min-height: 0` / `min-width: 0` so the viewer fills the browser window and can shrink when the window shrinks (both vertically and horizontally).  
  - Single-sample view wraps `SpatialPlot` in a flex column with `minWidth: 0` / `minHeight: 0`; the canvas size is driven by a `ResizeObserver` so zoomable plots always match the visible region.  
  - Multi-sample view uses a CSS grid with 2–3 columns depending on sample count; each sample card is a grid cell with a minimum pixel width/height. When the viewport is too small, the grid scroll container shows bars instead of shrinking individual samples to unreadable sizes.

- **Vector PDF export**:  
  - The toolbar’s “Export PDF” button calls a vector export path (`exportPlotVector.ts`) rather than screenshotting the DOM.  
  - The PDF page size is fixed to 180×210 mm (portrait). A global scale is computed from the union of spot bounds and background image bounds for all samples; a robust nearest-neighbour spacing estimate is used so adjacent spot centres have the same distance in mm across samples.  
  - Tissue images are raster layers; spots, titles, legends, and multigene Pie/Grid marks are true vector shapes.  
  - **Legend/color bar placement**: Each sample is given a `panelRect` (the full cell area in mm). All legends and color bars use this rectangle to anchor the bottom-right corner, so they align to the **panel** rather than to the spots or image bounds. This avoids misalignment when only spots are drawn (no background).  
  - **Categorical legend**: Background box with padding; rows of swatch + label (light) + count (grey), with a fixed one-character gap between label and count; content offset (`contentY = boxTop + PAD + 1.5`) so the block sits vertically centered in the box.  
  - **Gene color bar**: Background box contains a title line (gene or numeric field name, left-aligned with the bar), then a vertical gradient bar (high at top, low at bottom) and hi/mid/lo labels; bar uses `continuousToRgb` and the same palette/reverse as the UI.  
  - **Multi-gene legend**: Rows of narrow gradient bar + "gene vmin–vmax" text; each row uses a shared `centerY` so the bar and text are vertically centered. Same palettes and ranges as the on-screen multigene legend.
  - **Sample title**: Drawn **only once per cell** in the layout **title band** (App.tsx, before calling the draw functions). The draw functions receive `contentRect` (plot area only), so they must **not** draw the title—otherwise the title would appear twice (once in the band, once inside the plot). Single-sample export: when `plotColorMode === "multigene"`, App builds a **multigene** task (spots + legendLayers) instead of scatter, so the PDF shows the same pie/grid colors as the UI.
  - **Grouping for Illustrator**: Each sample’s plot (background rect + tissue image + spots) and its legend (color bar or categorical legend + background box) are drawn as separate **Form XObjects** (`plotFormKey`, `legendFormKey`), so in Illustrator they appear as two groups per panel that can be moved or edited independently. Form BBox and placement matrix use the same units (points via `pdf.internal.scaleFactor`) so position and size match the layout.

## Pixi tasks / Makefile targets

| Task | Description |
|------|-------------|
| `pixi run install` / `make install` | Pixi install, npm install, build frontend, pip install -e . --no-deps |
| `pixi run build` / `make build` | Build frontend only |
| `pixi run launch` / `make launch` | Run viewer; default DATA_DIR=./tests/h5ad (env: DATA_DIR, HOST, PORT) |
| `pixi run test` / `make test` | Extract tests/HCC1R.tar → visium2h5ad → preprocess; if tests/P2N_Spatial.rds.gz exists, run seurat2h5ad; then launch (data-dir ./tests). On exit removes generated HCC1R*.h5ad and P2N_Spatial*.h5ad. Override HOST/PORT. |
| `pixi run pytest` | Run backend unit tests (tests/test_server.py, tests/test_preprocess.py). |
| `pixi run clean` / `make clean` | Remove build, node_modules, dist, caches |
| `pixi run docker` / `make docker` | Build docker image, save to docker/spatialxgene.tar |
| `pixi run docker-test` / `make docker-test` | Run nginx + spatialxgene for subpath test |

List all tasks: `pixi task list`.

## Building the conda package

To build a `.conda` package for installation with mamba/conda (e.g. `mamba install spatialxgene-*.conda`):

1. Run `pixi run build` to build the frontend (required so the package contains the UI).
2. Run `pixi build` (requires the `pixi-build` preview feature; see `pixi.toml`).

Run dependencies are taken from `[package.run-dependencies]` in `pixi.toml` (exact versions; see RULES.md §4.3). The build config sets `ignore-pypi-mapping = false` so the backend emits run deps into the package; otherwise a fresh environment would only install the spatialxgene package with no dependencies.

## Test data

- **tests/HCC1R.tar**: Visium Space Ranger output (tar). `pixi run test` extracts it to `tests/HCC1R`, runs `spatialxgene visium2h5ad` and `spatialxgene preprocess`, then (if present) runs `spatialxgene seurat2h5ad tests/P2N_Spatial.rds.gz`, then launches the viewer with `--data-dir ./tests`. On exit the task removes generated `tests/HCC1R*.h5ad` and `tests/P2N_Spatial*.h5ad`.
- **tests/P2N_Spatial.rds.gz** (optional): Seurat spatial RDS for testing seurat2h5ad; used by `pixi run test` when present.
- **tests/h5ad/**: Default data directory for `pixi run launch`. Place preprocessed h5ad files here for daily use. Docker compose mounts this as `/data` in the container.

## Versioning

Bump in sync: `spatialxgene/__init__.py` (`__version__`), `pyproject.toml` (`version`), and `spatialxgene/frontend/package.json` (`version`). Document changes in root [CHANGELOG.md](../CHANGELOG.md); when behavior or defaults change, update README, RULES, and relevant docs.

## Rules and conventions (quick pointer)

- **Error handling and communication**: When errors occur, follow root [RULES.md](../RULES.md) §1 (minimal fix → logging → output snippets). Communicate in 中文; **code and comments in English**.
- **Detailed rules**: Frontend (large arrays, rAF, sidebar scroll, JSX, multigene), backend (dataset path, viewable), preprocess (return value, counts, in_tissue, raw), deployment (subpath, package): see [RULES.md](../RULES.md) §5 table and §4.3.

## Other docs

- [deployment.md](deployment.md) — Run as a systemd service on Linux
- [master_plan.md](master_plan.md) — Goals and scope
- [implementation_plan.md](implementation_plan.md) — Implementation order and data design
- [design_guidelines.md](design_guidelines.md) — UI/UX: colors, fonts, interaction
- [tasks.md](tasks.md) — Current task list

Release history and version notes: root [CHANGELOG.md](../CHANGELOG.md). Package-level CLI details (all subcommand options): [../spatialxgene/README.md](../spatialxgene/README.md).
