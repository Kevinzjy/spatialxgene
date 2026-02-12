# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

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
