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
    """Get dataset metadata: dimensions, obs/var columns, spatial bounds."""
    adata = _get_adata(dataset_id)
    x = _get_spatial_x(adata)
    y = _get_spatial_y(adata)
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
    )


def _get_spatial_x(adata):
    if "spatial" in adata.obsm:
        return adata.obsm["spatial"][:, 0]
    if "x" in adata.obs.columns:
        return adata.obs["x"].values
    raise ValueError("No spatial coordinates in adata")


def _get_spatial_y(adata):
    if "spatial" in adata.obsm:
        return adata.obsm["spatial"][:, 1]
    if "y" in adata.obs.columns:
        return adata.obs["y"].values
    raise ValueError("No spatial coordinates in adata")


@app.get("/api/datasets/{dataset_id}/spatial", response_model=SpatialResponse)
def get_spatial(dataset_id: str):
    """Get spatial coordinates (x, y) for all cells."""
    adata = _get_adata(dataset_id)
    x = _get_spatial_x(adata)
    y = _get_spatial_y(adata)
    return SpatialResponse(
        x=np.asarray(x, dtype=np.float64).tolist(),
        y=np.asarray(y, dtype=np.float64).tolist(),
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
