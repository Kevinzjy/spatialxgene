"""
FastAPI backend for spatialxgene: serve h5ad spatial data and expression to the frontend.
"""
from pathlib import Path
from typing import Any, Optional

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# Lazy import anndata so server can start without it for static-only
try:
    import anndata as ad
except ImportError:
    ad = None

app = FastAPI(title="Spatialxgene API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Data directory: set by launch CLI
DATA_DIR: Optional[Path] = None
# Cache loaded adata by dataset id to avoid reloading
_adata_cache: dict[str, Any] = {}


def set_data_dir(path: Path) -> None:
    global DATA_DIR
    DATA_DIR = path


def _get_adata(dataset_id: str):
    if ad is None:
        raise HTTPException(status_code=500, detail="anndata not installed")
    if DATA_DIR is None:
        raise HTTPException(status_code=500, detail="Data directory not configured")
    if dataset_id in _adata_cache:
        return _adata_cache[dataset_id]
    # Dataset id is the stem of the h5ad file (e.g. HCC_S42_preprocessed)
    path = None
    for p in DATA_DIR.glob("*.h5ad"):
        if p.stem == dataset_id:
            path = p
            break
    if path is None:
        raise HTTPException(status_code=404, detail=f"Dataset {dataset_id} not found")
    adata = ad.read_h5ad(path)
    _adata_cache[dataset_id] = adata
    return adata


class DatasetMeta(BaseModel):
    id: str
    name: str
    n_obs: int
    n_vars: int
    obs_columns: list[str]
    var_index: list[str]
    x_min: float
    x_max: float
    y_min: float
    y_max: float
    layout: str  # "spatial" or "umap": which coordinates are used for the 2D plot


class SpatialResponse(BaseModel):
    x: list[float]
    y: list[float]


class ObsResponse(BaseModel):
    columns: list[str]
    data: dict[str, list[Any]]  # column name -> list of values


@app.get("/api/datasets")
def list_datasets():
    """List available h5ad datasets (by filename stem)."""
    if DATA_DIR is None or not DATA_DIR.exists():
        return []
    datasets = []
    for p in sorted(DATA_DIR.glob("*.h5ad")):
        datasets.append({"id": p.stem, "name": p.stem, "path": str(p.name)})
    return datasets


@app.get("/api/datasets/{dataset_id}", response_model=DatasetMeta)
def get_dataset_meta(dataset_id: str):
    """Get dataset metadata: dimensions, obs/var columns, plot bounds (spatial or UMAP)."""
    adata = _get_adata(dataset_id)
    x, y, layout = _get_plot_coordinates(adata)
    return DatasetMeta(
        id=dataset_id,
        name=dataset_id,
        n_obs=adata.n_obs,
        n_vars=adata.n_vars,
        obs_columns=list(adata.obs.columns),
        var_index=list(adata.var.index.astype(str)),
        x_min=float(np.nanmin(x)),
        x_max=float(np.nanmax(x)),
        y_min=float(np.nanmin(y)),
        y_max=float(np.nanmax(y)),
        layout=layout,
    )


def _has_spatial(adata) -> bool:
    """True if adata has spatial coordinates (obsm or obs x/y)."""
    if "spatial" in adata.obsm or "X_spatial" in adata.obsm:
        return True
    return "x" in adata.obs.columns and "y" in adata.obs.columns


def _get_plot_coordinates(adata):
    """
    Return (x, y) for the 2D plot: use spatial if present, otherwise UMAP.
    Raises ValueError if neither is available.
    Returns (x, y, layout) where layout is "spatial" or "umap".
    """
    if _has_spatial(adata):
        if "spatial" in adata.obsm:
            x = np.asarray(adata.obsm["spatial"][:, 0], dtype=np.float64)
            y = np.asarray(adata.obsm["spatial"][:, 1], dtype=np.float64)
        elif "X_spatial" in adata.obsm:
            x = np.asarray(adata.obsm["X_spatial"][:, 0], dtype=np.float64)
            y = np.asarray(adata.obsm["X_spatial"][:, 1], dtype=np.float64)
        else:
            x = np.asarray(adata.obs["x"].values, dtype=np.float64)
            y = np.asarray(adata.obs["y"].values, dtype=np.float64)
        return x, y, "spatial"
    if "X_umap" in adata.obsm and adata.obsm["X_umap"].shape[1] >= 2:
        x = np.asarray(adata.obsm["X_umap"][:, 0], dtype=np.float64)
        y = np.asarray(adata.obsm["X_umap"][:, 1], dtype=np.float64)
        return x, y, "umap"
    raise ValueError("No spatial coordinates or UMAP in adata (need obsm['spatial'] or obs x/y or obsm['X_umap'])")


@app.get("/api/datasets/{dataset_id}/spatial", response_model=SpatialResponse)
def get_spatial(dataset_id: str):
    """Get plot coordinates (x, y) for all cells: spatial if present, else UMAP."""
    adata = _get_adata(dataset_id)
    x, y, _ = _get_plot_coordinates(adata)
    return SpatialResponse(
        x=x.tolist(),
        y=y.tolist(),
    )


@app.get("/api/datasets/{dataset_id}/obs", response_model=ObsResponse)
def get_obs(dataset_id: str):
    """Get obs table as columnar: { column_name: [values] }."""
    adata = _get_adata(dataset_id)
    data = {}
    for col in adata.obs.columns:
        vals = adata.obs[col]
        if vals.dtype == "category":
            data[col] = vals.astype(str).tolist()
        else:
            data[col] = np.asarray(vals).tolist()
    return ObsResponse(columns=list(adata.obs.columns), data=data)


@app.get("/api/datasets/{dataset_id}/expression/{gene}")
def get_expression(dataset_id: str, gene: str):
    """Get expression vector for one gene (var index or gene name)."""
    adata = _get_adata(dataset_id)
    if gene not in adata.var.index:
        # Try as string match
        matches = [g for g in adata.var.index.astype(str) if g == gene or g.upper() == gene.upper()]
        if not matches:
            raise HTTPException(status_code=404, detail=f"Gene {gene} not found")
        gene = matches[0]
    vec = adata[:, gene].X
    if hasattr(vec, "toarray"):
        vec = vec.toarray().flatten()
    else:
        vec = np.asarray(vec).flatten()
    return np.asarray(vec, dtype=np.float64).tolist()


@app.get("/api/datasets/{dataset_id}/var")
def get_var_index(dataset_id: str):
    """Get gene list (var index) for dropdown."""
    adata = _get_adata(dataset_id)
    return list(adata.var.index.astype(str))


# Serve frontend static files when mounted
STATIC_DIR: Optional[Path] = None


def set_static_dir(path: Path) -> None:
    global STATIC_DIR
    STATIC_DIR = path


@app.get("/")
def index():
    """Serve frontend index."""
    if STATIC_DIR is not None and (STATIC_DIR / "index.html").exists():
        return FileResponse(STATIC_DIR / "index.html")
    return {"message": "Spatialxgene API. Build frontend and set static dir, or use frontend dev server."}


def mount_static(static_dir: Path) -> None:
    """Mount static files (call after set_static_dir)."""
    if (static_dir / "assets").exists():
        app.mount("/assets", StaticFiles(directory=static_dir / "assets"), name="assets")
