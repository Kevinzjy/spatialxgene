# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Added

- **Panel-level split/merge**: Every loaded sample panel now has a **Split** button to the left of its zoom controls. Choosing an `obs` key creates local virtual child panels named `<parent> / <value>`; each child exposes **Merge** to restore the original merged panel. Splitting uses the already loaded coordinates/obs table, does not write new h5ad files, preserves the existing multi-sample grid, and keeps background image and gene expression requests pointed at the parent dataset (child values are sliced by the split indices).

- **Release Pipeline (`make release`)**: A fully automated pipeline that builds the frontend, Python Wheel (`dist/*.whl`), versioned Docker image tarball (`docker/spatialxgene-V.tar`), and versioned Singularity Image Format (`docker/spatialxgene-V.sif`) in one command.
- **Singularity (Apptainer) Support**: Dedicated tasks and documentation for running Spatialxgene on HPC clusters or old systems (e.g., CentOS 7 with glibc 2.17). SIF images bypass host library constraints.
- **Versioned Distribution Artifacts**: Docker tarballs and Singularity SIF files are now automatically named with the project version (e.g., `spatialxgene-0.2.6.sif`).
- **Chinese README**: The root `README.md` is now fully translated into Chinese, including a reorganized "Quick Start" manual for easier navigation.
- **Containerized Deployment Manual**: `docker/README.md` reorganized to distinguish between Docker Compose (web service) and Singularity (HPC/quick view) use cases, with direct container commands (no pixi/make required in production).

### Changed

- **Common morphology coordinate fallback**: The backend now recognizes `obs["Cx"]` / `obs["Cy"]` (and `center_x` / `center_y`) as spatial coordinates when `obsm["spatial"]` and `obs["x"]` / `obs["y"]` are absent. This also makes the lightweight h5ad viewability check consistent with the full coordinate resolver and prevents merged morphology tables from being incorrectly reported as non-viewable.

- **Generic numeric feature overlays**: Renamed user-facing **Co-expression** and **Multi-gene** modes to **Dual Feature** and **Multi-Feature**. Both modes now accept genes and numeric `obs` metadata columns. Only columns that are numeric across all selected samples are offered; metadata values are read from the already loaded `/obs` response, remain sample-aware in multi-sample grids, and use `column (obs)` in hover labels, legends, and PDF exports.
- **Internal feature naming/data model**: Renamed the former internal `coexpression`/`multigene` identifiers and state to `dualFeature`/`multiFeature`, use structured `gene:`/`obs:` feature IDs with encoded keys, and share the feature parsing helper between the sidebar and app.

- **Embedding spot size normalization**: PCA/UMAP/tSNE views now use coordinate-aware adaptive spot sizing based on the larger embedding axis span and spot count, with a conservative default where the previous trial default visual size is reached at about 200%. Spatial views keep nearest-neighbor sizing. PDF export uses the same spacing as the screen view.
- **visium2h5ad standalone 10x HDF5 input**: `spatialxgene visium2h5ad sample_filtered_feature_bc_matrix.h5` now uses `scanpy.read_10x_h5()` and writes an h5ad with inferred regular Visium V1/V2 6.5 mm spot coordinates in `obsm["spatial"]` and no image metadata. Directory input keeps the existing Space Ranger behavior via `scanpy.read_visium()`.
- **Build Task (`whl`)**: Switched from `python -m build` to `pip wheel . --no-deps -w dist/` to avoid conflicts with the local `build/` folder and simplify dependencies.
- **Export PDF saving**: The Export PDF button now opens the browser save dialog via the File System Access API when supported, allowing users to choose the PDF name and location. Browsers without that API fall back to a timestamped download name instead of a fixed filename.
- **Environment Management**: Unified the Pixi environment for development while providing clear container-based paths for old glibc deployments. Node.js remains in the default environment for build convenience.
- **README Reorganization**: The "Quick Start" section of the root README is now a modular manual with dedicated sections for Basic Operations, Visualization Modes, and Exporting.

### Added (Previous Unreleased Items)

- **Frontend E2E Tests (Playwright)**: Full suite of smoke tests covering dataset selection, embedding toggles, coloring by annotation/gene, multi-gene layouts, and PDF export. Run with `pixi run test-e2e` or `make test-e2e`.
- **Linux Dependency Management via Pixi**: System-level libraries for Chromium (nss, atk, gtk3, pango, alsa-lib) are now managed within the Pixi environment using `[target.linux-64.dependencies]`, allowing E2E tests to run in headless environments without global `sudo` installs.
- **Improved Sidebar Selectors**: Added `data-testid` and ARIA roles (`role="button"`) to dataset items in the sidebar for more robust automated testing.
- **Incremental dataset loading**: When adding a new dataset to the selection, only the newly selected dataset(s) are loaded; already loaded ones are reused from cache. Expression/gene state is preserved during incremental load to avoid flicker.
- **Server adata LRU cache**: Backend keeps loaded AnnData in an LRU cache (default max 16 datasets). Size is configurable via `SPATIALXGENE_CACHE_MAX_DATASETS` (1–128).
- **Preprocess logging and input validation**: Preprocess CLI uses `logging` (INFO) for messages; invalid input (e.g. `adata.X` None, empty, or zero n_obs/n_vars) raises `ValueError` with clear messages.
- **Launch data-dir hint**: If `--data-dir` does not exist or is not a directory, a friendly message is printed to stderr with the current DATA_DIR; the server still starts.
- **Backend unit tests**: Pytest suite for server (list_datasets, get_dataset_meta, _get_plot_coordinates) and preprocess (input validation and small pipeline with `run_celltypist=False`). Run with `pixi run pytest` or `make pytest`.
- **Empty datasets hint with data_dir**: When no h5ad files are found, the sidebar shows "No h5ad files found under {path}" (path from `/api/config` data_dir) or "(data-dir not set)".
- **Theme CSS variables and theme.ts**: `index.html` defines `:root` CSS variables for sidebar, background, accent, and text colors; `src/theme.ts` exports the same values for use in export/SVG. Sidebar, App, SpatialPlot, and exportPlotVector use these instead of hardcoded colors.
- **Gene list info tooltip**: A small "?" icon next to Gene, Gene1, Gene2, and Multi-gene labels in the sidebar shows a tooltip: "Only the first 200 entries are shown; use search to narrow the range."
- **Top toolbar and Export PDF**: A toolbar at the top of the main content shows an **Export PDF** button when at least one dataset has loaded. Clicking it captures all visible plot cards (single plot or one per sample in the grid) via `html2canvas`, adds each as a centered page in an A4 PDF, and downloads `spatialxgene-plots.pdf`. Plot containers are marked with `data-export-plot` so only the relevant nodes are captured.
- **Annotation categorical legend per sample**: In multi-sample view, the in-plot categorical legend for each sample now shows only that sample’s category counts (color/label and count), not the sum across all samples. Single-sample view is unchanged (one sample’s counts).
- **Multi-sample comparison and drag reorder**: When multiple datasets are selected, the viewer shows a grid of plots for Gene, Annotation, Co-expression, and Multi-gene modes. In the sidebar, a "Drag to reorder display" list appears; drag rows to change the order of samples in the grid.
- **Co-expression and Multi-gene multi-sample view**: Co-expression and Multi-gene modes now support multiple selected datasets: each sample is rendered in its own grid cell with per-sample expression data (expression1ByDataset/expression2ByDataset for co-expression; multigeneExpressionByDataset for multi-gene). Loading overlay is shown while fetching.
- **Sidebar scroll and layout**: The sidebar content area scrolls vertically when long; a **subtle scrollbar** (thin, low-contrast) is used via the `.sidebar-scroll` class. Sections (Datasets list, Gene lists, Annotation legend, etc.) have minimum heights so they are not compressed; list boxes use the same scrollbar style.
- **Spot size range 20%–300%**: Spot size slider maximum increased from 150% to 300% so UMAP and dense embeddings can show larger points.
- **Multi-gene per-sample color bar**: In Multi-gene mode, each sample plot shows a compact **color bar** in the bottom-right corner: one short horizontal bar per gene (gradient + gene name and min–max expression). Multiple genes are stacked vertically.
- **Multi-gene visualization**: **Multi-gene** color mode in the viewer. Each gene uses a black→accent palette. Pie layout (round spots) or Grid layout (square spots, proportion ≥ 5%, unified pixel size). Layer (X or adata.layers) applies. **Color range** (pmin/pmax) and **Log scale** like Gene mode. Hover shows per-gene values.
- **Preprocess + CellTypist automatic cell type annotation**: After QC, normalize, dimred, and clustering, preprocess optionally runs CellTypist to assign spot/cell types. Results are written to **`obs['auto_cell_type']`**; immune-enriched samples can get **`obs['auto_cell_type_coarse']`** from Immune_All_High. Inference summary (species, tissue context, model used) is stored in **`uns['celltypist_inferred']`**.
  - **Species inference**: Human vs mouse is inferred from gene symbols (human: all-caps e.g. CD4; mouse: title-case e.g. Cd4). For mouse, immune models (Immune_All_Low/High) are converted to mouse via CellTypist ortholog mapping before prediction.
  - **Model routing**: A quick first-pass annotation is used to infer tissue context (immune_enriched / tissue_specific / unknown) and to choose the final model (default Immune_All_Low, or a tissue-specific model when top labels match known keywords). Human and mouse each have a keyword→model map (e.g. Healthy_Human_Liver vs Healthy_Mouse_Liver, Adult_Mouse_Gut).
  - **Majority voting**: Annotation runs with `majority_voting=True` and `over_clustering='leiden'` (or louvain) to refine labels.
  - **CLI**: `--no-celltypist` to skip; `--celltypist-model NAME` to force a model; `--celltypist-min-prop FLOAT` for majority-voting min_prop.
  - **Dependency**: celltypist (PyPI, >=1.7,<2) added to pixi.toml [pypi-dependencies] and pyproject.toml. Models are downloaded on first use to `~/.celltypist/data/models`.

### Removed

- **Super-resolution code**: All super-resolution–related code removed for future refactor: BayesSpace, TESLA, H&E CPU endpoint. Scripts removed: `run_bayesspace.R`, `run_tesla.py`.

### Changed

- **Annotation categorical legend in multi-sample view**: The in-plot legend for each sample now shows only that sample’s category labels and counts (not the sum across all samples). Sidebar annotation legend still shows global totals.
- **Multi-gene**: Replaced jitter-dots with **Pie** (sectors by proportion) and **Grid** (equal-sized squares on regular polygon, clip inside spot). Spots with zero total expression are skipped. Color range (pmin/pmax) and Log scale aligned with Gene mode.
- **Multi-gene when some genes are missing in a sample**: If a selected gene has no (or all-NaN) expression in a given sample, that sample still shows Multi-gene spots using only the genes that have valid data. Single- and multi-sample logic: show multigene when **at least one** gene has finite data; layers passed to the plot exclude all-NaN genes; SpatialPlot treats NaN as 0 in the per-spot sum and guards vmin/vmax for color scale.

### Fixed

- **seurat2h5ad global install runtime**: `pixi global install --path .` now installs the runtime dependencies needed by `seurat2h5ad`, including `r-base` and `r-seurat`, through `[package.run-dependencies]`. Non-RDS inputs such as `filtered_feature_bc_matrix.h5` are rejected before calling R with a clear message directing users to `visium2h5ad` or `saveRDS()`; missing `Rscript` in non-pixi installs still reports actionable setup options instead of a raw `[Errno 2]`.
- **E2E task cleanup**: `pixi run test-e2e` now runs under explicit Bash cleanup logic so backend/frontend background processes are stopped without the task failing after Playwright has passed.
- **SpatialPlot JSX**: The canvas container `div` (ref={containerRef}) was missing a closing tag after the multigene color bar block, causing "JSX element 'div' has no corresponding closing tag" and build failure. Added the missing `</div>`.
- **Export PDF single-sample and title**: Single-sample PDF now shows the sample name in the **title band** above the plot (same format as multi-sample). Single-sample **Multi-gene** export now builds a multigene task (spots + legendLayers) so the PDF shows the same pie/grid colors as the UI instead of gray points. Sample title is drawn **only once** per cell, in the layout title band (App.tsx); the vector draw functions receive only the content rect and do not draw the title, so the title no longer appears twice (once in the band, once inside the plot).

## [0.2.6] - 2026-02-18

### Changed

- **Version bump**: 0.2.5 → 0.2.6. Version strings updated in `spatialxgene/__init__.py`, `pyproject.toml`, `spatialxgene/frontend/package.json`, `spatialxgene/frontend/package-lock.json`, `pixi.toml`, and README.

## [0.2.4] - 2026-02-14

### Fixed

- **Preprocess output missing leiden/louvain and counts layer**: `preprocess_file()` now uses the return value of `run_preprocess()` when writing the h5ad (previously it wrote the original adata, so dimred/cluster and layers were lost). When copying results back from the HVG subset to the full adata, both `leiden` and `louvain` are copied if present. `counts` is saved in `adata.layers` **before** `normalize_total`/`log1p` so it reflects true raw counts. Logging added to confirm obs columns (leiden, louvain) and layers before write.
- **Dataset path with multiple dots**: Filenames like `HCC_Stereo-seq_v1.3.h5ad` (dots in version) were resolved to `.../HCC_Stereo-seq_v1.h5ad` and caused "Dataset not found". Cause: `Path.with_suffix(".h5ad")` replaces the **last** suffix (e.g. `.3`), not only `.h5ad`. Fix: `_get_dataset_path` now appends `.h5ad` only when the id does not already end with `.h5ad` (i.e. `DATA_DIR / (dataset_id + ".h5ad")`), so names with dots work.
- **Sidebar loading text**: Removed the "Loading…" line above the Dataset selector when loading a dataset; loading state is shown only in the main content area (progress bar / overlay).
- **Preprocess write error when adata.raw.var has '_index'**: CosMx/other pipelines can set `adata.raw` whose `var` contains a column `_index` (reserved by anndata). Writing then raises. Fix: before write, when `adata.raw` exists, copy `raw.X` into `layers['counts']` when dimensions align (same n_obs, var_names match or subset), then set `adata.raw = None` so the write succeeds; viewer uses X and layers only.

### Added

- **Subpath deployment (nginx)**: When the app is behind a reverse proxy at a path (e.g. `location /spatialxgene/`), use `--api-base spatialxgene` or env `SPATIALXGENE_API_BASE=spatialxgene` so the frontend requests favicon, assets, and API under that path. Backend injects `window.__API_BASE__` and rewrites favicon href in index.html; Sidebar logo and API use the same base. Works with a single nginx location (no extra `/favicon.svg` route).
- **Local subpath test**: One-command `docker compose -f docker/docker-compose.nginx-test.yml up --build` runs nginx + spatialxgene; open http://localhost:8888/spatialxgene/ to test the same as production. Single config `docker/nginx-test.conf` (one location only).
- **Dataset loading progress bar**: Step-based progress (25% per request: meta, spatial, obs, var) with a visible bar and "Loading dataset… X%". After all complete, progress stays at 100% for 400 ms so the user sees the full sequence instead of an abrupt switch to content.
- **Gene expression loading progress**: When loading expression (single gene or co-expression), an overlay on the scatter plot shows "Loading expression for …" and an indeterminate progress bar, so slow networks do not look like "gene not expressed".
- **No spatial/UMAP handling**: Datasets without plottable coordinates (spatial/UMAP/PCA/t-SNE) are detected quickly via lightweight h5py structure check (no full AnnData load). API returns 200 with `viewable: false`; frontend shows a clear message and lets the user re-select dataset.
- **Categorical annotation edge cases**: When an annotation column has too many or too few unique categories (e.g. barcode-like), no popup; points are shown in a single default color and the legend shows "nan (too many categories)" or "nan (too few categories)".
- **Multi-level H5AD directory**: `--data-dir` now discovers `.h5ad` in subdirectories (`rglob`); dataset id is the relative path (e.g. `subdir/foo`), so the dropdown lists nested files.
- **Dataset dropdown shows extension**: The dataset selector displays the full relative path including `.h5ad` so users see the file type.
- **visium2h5ad subcommand**: Convert Visium Space Ranger output directory to a single `.h5ad` file. Usage: `spatialxgene visium2h5ad -i path_to_visium -o h5ad_file`. Uses `scanpy.read_visium()`; auto-detects `filtered_feature_bc_matrix.h5` or `filtered_feature_bc_matrix/`; optional `--count-file` and `--no-images`; var names made unique before writing (anndata duplicate-name warning suppressed).
- **seurat2h5ad subcommand**: Convert Seurat spatial RDS (`.rds` or `.rds.gz`) to a single `.h5ad` file. R script (Seurat + Matrix) reads RDS and exports matrix, obs, spatial coords, and tissue images to temp files; Python builds AnnData with Visium-style `uns['spatial'][sample]['images']` (hires + optional lowres) and `scalefactors`. Uses `tissue_hires_scalef = 1.0` when coords are in image pixel space (imagecol/imagerow) so the viewer aligns spots with the background image. Output format matches reference spatial h5ad (e.g. Control06_processed.h5ad): keys `hires`/`lowres`, float32 [0,1], optional lowres resized to max 400px. Requires R with Seurat (pixi env includes `r-seurat`). `pixi run test` runs seurat2h5ad when `tests/P2N_Spatial.rds.gz` exists.

### Removed

- **dev and infer subcommands**: The `spatialxgene dev` (backend + frontend watch) and `spatialxgene infer` (infer spatial coordinates when missing) subcommands and the `infer_spatial` module have been removed from the project. Use `spatialxgene launch` for the viewer; ensure h5ad has spatial coordinates from upstream or other tools.

### Changed

- **Preprocess cell filter for Visium**: When `obs['in_tissue']` exists (e.g. Visium), skip the `min_genes` cell filter so on-tissue spots are not removed; apply the filter only when `in_tissue` is absent.
- **Preprocess / viewer layer name**: Use `layers['counts']` instead of `layers['raw_counts']` for unnormalized counts (align with common scanpy/AnnData convention). Pipeline saves before normalize; when input has `adata.raw`, it is copied into `layers['counts']` when alignable before clearing raw.
- **Docker deployment**: `docker/README.md` documents build → `docker save` → upload → on server `docker load` + `cd docker` + `docker compose up -d`. Compose example uses `image: spatialxgene:latest` and `command: ["--token", "...", "--api-base", "spatialxgene"]`.
- **Backend when `--api-base` set**: Serves the app at both `/` (for nginx that strips the path) and at the subpath (for direct open). Serves `/favicon.svg` at root directly (no redirect) to avoid redirect loop behind nginx.
- **Annotation type label**: "Numeric" renamed to "Numerical" in the UI to match "Categorical" grammatically.
- **Backend viewable check**: `get_dataset_meta` uses `_check_viewable_h5()` (h5py) before loading full AnnData when the dataset has no spatial/UMAP, for fast response.
- **RULES.md**: Server has only one proxy port; all assets/API must live under that location. Favicon/logo 404: distinguish tab icon vs in-page logo; ask clearly to get the right fix first time. Added lessons: viewable fast check, categorical too many/few, useMemo deps.

### Summary of recent preprocess/data changes (this batch)

- **Preprocess**: (1) When `obs['in_tissue']` exists (e.g. Visium), skip cell filter by `min_genes` so on-tissue spots are kept. (2) When `adata.raw` exists, save `raw.X` to `layers['counts']` when dimensions align, then clear `raw` so write does not fail on reserved `_index` in `raw.var`. (3) Use `layers['counts']` (not `raw_counts`) for unnormalized counts everywhere; pipeline writes it before normalize; viewer and docs refer to `counts`.
- **Lessons** (see RULES.md §4.3): in_tissue → skip spot filter; raw.var reserved column → copy raw to layer then clear raw; standard layer name `counts`.
- **seurat2h5ad lessons** (RULES.md §4.3): SeuratObject 5 use `layer=` not `slot=` in GetAssayData; R writeBin use `as.vector(arr)` for 3D array or pixel data is not written; spatial h5ad tissue image alignment requires `tissue_*_scalef = 1.0` when coords are already in image pixel space; follow reference h5ad format (hires/lowres, float32 [0,1]).

## [0.2.3] - 2026-02-12

### Added

- **Co-expression mode**: Color by two genes (Gene1, Gene2) with a 2D palette: four corners (both low / Gene1 high / Gene2 high / both high). Default palette: white–blue–orange–yellow. Optional log scale for expression; Spot size and Opacity at bottom like Gene mode. Hover shows both gene values.
- **Layer option**: When Color by is Gene or Co-expression, a **Layer** dropdown lists `X` (adata.X) plus all `adata.layers` keys (e.g. counts, logcounts, CPM). Expression is read from the selected layer. Backend: `DatasetMeta.layer_keys`, `GET /api/datasets/{id}/expression/{gene}?layer=`.
- **Token auth**: `--token` option enables token protection for all `/api/*` requests. Send via header `X-Token` or `Authorization: Bearer <token>`, or query `?token=`. Frontend: open with `?token=...` once to store in sessionStorage; image URLs get `?token=` appended. Use `--token ""` to disable.
- **Launch URL display**: When binding to `0.0.0.0` or `::`, startup prints **Access:** with all IPv4 (and **Access (IPv6):** when host is `::`). If token is set, each URL includes `?token=...` so users can copy the correct link. Browser open URL also includes token when applicable.
- **docs/deployment.md**: Systemd unit template and step-by-step deployment on Linux; optional Nginx reverse proxy for HTTPS; token and data-dir placeholders.

### Changed

- **Host `::`**: Supported as bind address; URLs displayed as `http://[::]:5005`; IPv6 access line lists reachable IPv6 addresses (e.g. `::1`).
- **Branding**: Sidebar and page title use **SPATIALxGENE**.
- **Python 3.9**: Use `typing.Optional` instead of `str | None` in CLI for 3.9 compatibility.

## [0.2.2] - 2026-02-12

### Fixed

- **Large-array stack overflow**: When coloring by gene on datasets with many points (e.g. hundreds of thousands), the viewer could throw "Maximum call stack size exceeded". Cause: `Math.min(...arr)` / `Math.max(...arr)` spread too many arguments. Replaced with loop-based min/max in `App.tsx` (`finiteMinMax`, continuous color range), `Sidebar.tsx` (colorbar stats), and `SpatialPlot.tsx` (continuous mode vmin/vmax).

### Changed

- **RULES.md**: Added project rule "前端：大数组不要用 spread 展开" — do not use spread on large arrays (e.g. avoid `Math.min(...arr)` / `Math.max(...arr)`); use a for-loop instead. Applies to App.tsx, Sidebar, SpatialPlot and similar code.

## [0.2.1] - 2026-02-12

### Fixed

- **Packaging**: Pre-built frontend is now included in the wheel. After `pip install spatialxgene`, `spatialxgene launch` works without Node.js.

### Changed

- **Docs**: Root README is user-only (for PyPI; no source/repo paths). Release notes merged into CHANGELOG; `docs/release_notes_*` removed.

## [0.2.0] - 2026-02-12

### Added

- **Embedding toggle**: When a dataset has both spatial coordinates and UMAP (`obsm['X_umap']`), the sidebar shows Spatial / UMAP buttons; background image option is hidden in UMAP mode. API: `GET /api/datasets/{id}/spatial?layout=spatial|umap` and meta `has_spatial` / `has_umap`.
- **Favicon**: `favicon.svg` in `frontend/public/`; backend serves `/favicon.svg` in launch mode; sidebar header shows the same logo next to "Spatialxgene".
- **Spot hover tooltip**: Mouse over the plot shows a tooltip near the cursor with Spot #index and current annotation value or gene expression (when Annotation/Gene is selected).
- **Annotation legend**: In Annotation mode, a scrollable legend below Opacity lists each category with color swatch, label, and spot count; sorted by count descending.
- **View controls**: Plot toolbar has Zoom out (−), Zoom in (+), and Reset view; zoom is centered on the mouse cursor (wheel) or plot center (buttons).
- **Loading overlay**: When switching datasets, the main plot area shows "Loading dataset…" and the previous image is cleared so the transition is clear.
- **Default gray points**: When no annotation column or gene is selected, all points are still drawn in neutral gray so the layout is visible; switching Annotation/Gene only updates colors without changing the view.

### Changed

- **Percentile (pmin/pmax)**: Replaced sort-based implementation with a histogram-based O(n) method to avoid "Maximum call stack size exceeded" on very large or constant expression arrays (e.g. 390k cells, all zeros).
- **UMAP spot size**: Minimum radius is spacing-relative so the spot size slider works for dense UMAP embeddings; spatial grids keep the previous minimum.
- **Responsive layout**: `html`/`body` reset (margin 0, height 100%, overflow hidden) and `#root` flex so the app fills the viewport without a vertical scrollbar.
- **Performance (Safari/Firefox)**: Drag updates are batched with `requestAnimationFrame` (one setState per frame); hover hit-test is throttled with rAF; canvas DPR capped at 2; Firefox uses a lower LOD cap (60k vs 120k points) when zoomed out. Zoom remains centered on the cursor.

### Technical

- Backend: `DatasetMeta` has `has_spatial`, `has_umap`; `/spatial` accepts optional `layout` query.
- Frontend: `SpatialPlot` supports `colorMode: "none"` (gray points), hover props, and zoom/pan refs for rAF-driven updates.

### Release notes (v0.2 scope and lessons, merged from release_notes)

- **Scope**: Embedding toggle (Spatial/UMAP), hover tooltip, annotation legend (count-sorted), zoom/reset buttons, cursor-centered zoom, loading overlay, gray points when no annotation/gene selected, full viewport layout, favicon and sidebar logo. Robustness: histogram-based percentile; UMAP spot size; rAF-throttled drag/hover for Safari/Firefox. Performance: LOD, DPR cap, Firefox-specific LOD.
- **Lessons**: Cross-browser: rAF and DPR caps; keep drag/hover deps correct. Large arrays: O(n) histogram or subsampling; avoid sort/recursion on 300k+ elements. Versioning: bump `__version__`, `pyproject.toml`, and `frontend/package.json` together; document in CHANGELOG.

## [0.1.0] - 2025-02-12

### Added

- **Viewer (launch / dev)**
  - Spatial plot: Canvas-based 2D plot in data coordinates; zoom (wheel), pan (drag).
  - Color by annotation (e.g. Leiden) or by gene expression; categorical and continuous color scales.
  - Optional tissue background image: choose hires or lowres from `adata.uns['spatial']` (Visium-style); image aligned with spot coordinates (lowres uses hires extent as reference).
  - Sidebar: dataset selector, background image (None / hires / lowres), Color by (Annotation / Gene), spot size slider, background opacity slider, annotation dropdown, gene search and list (top 200); in Gene mode: color palette and expression percentile range (pmin / pmax).
  - Dataset switch cancels in-flight requests (AbortController) to avoid stuck Loading state.
- **Backend (FastAPI)**
  - Endpoints: `/api/config`, `/api/datasets`, `/api/datasets/{id}` (meta with `image_keys`, `image_info`), `/api/datasets/{id}/spatial`, `/api/datasets/{id}/obs`, `/api/datasets/{id}/expression/{gene}`, `/api/datasets/{id}/var`, `/api/datasets/{id}/images/{key}` (PNG).
  - Meta includes spatial bounds, layout (spatial/umap), and per-image scale_factor/width/height for frontend alignment.
- **CLI**
  - `spatialxgene launch`: serve viewer and preprocessed h5ad from `--data-dir`.
  - `spatialxgene dev`: backend + frontend watch; auto-rebuild on save, refresh browser to see changes.
  - `spatialxgene infer`: infer and add spatial coordinates when missing (e.g. Stereo-seq grid).
  - `spatialxgene preprocess`: QC, normalize, HVG, PCA, UMAP, Leiden; does not modify spatial.
- **Docs**
  - README (root and package), docs: master_plan, implementation_plan, design_guidelines, tasks; Makefile targets (install, build, dev, launch, test, clean, infer, preprocess).

### Technical

- Python 3.9+, FastAPI, anndata/scanpy; frontend React + TypeScript + Vite, Canvas 2D.
- Version from `pyproject.toml` / `spatialxgene.__version__` (0.1.0).
