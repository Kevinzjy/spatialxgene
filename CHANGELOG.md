# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [0.2.3] - 2026-02-12

### Added

- **Co-expression mode**: Color by two genes (Gene1, Gene2) with a 2D palette: four corners (both low / Gene1 high / Gene2 high / both high). Default palette: white–blue–orange–yellow. Optional log scale for expression; Spot size and Opacity at bottom like Gene mode. Hover shows both gene values.
- **Layer option**: When Color by is Gene or Co-expression, a **Layer** dropdown lists `X` (adata.X) plus all `adata.layers` keys (e.g. raw_counts, logcounts, CPM). Expression is read from the selected layer. Backend: `DatasetMeta.layer_keys`, `GET /api/datasets/{id}/expression/{gene}?layer=`.
- **Token auth**: `--token` option (default `zhaoslab`) requires a token for all `/api/*` requests. Send via header `X-Token` or `Authorization: Bearer <token>`, or query `?token=`. Frontend: open with `?token=...` once to store in sessionStorage; image URLs get `?token=` appended. Use `--token ""` to disable.
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
