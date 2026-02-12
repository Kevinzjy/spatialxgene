# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

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
