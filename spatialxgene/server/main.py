"""
FastAPI backend for spatialxgene: serve h5ad spatial data and expression to the frontend.
"""
import io
import json
import re
from pathlib import Path
from typing import Any, Callable, Optional

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

# Lazy import anndata so server can start without it for static-only
_ad_import_error: Optional[str] = None
try:
    import anndata as ad
except ImportError as e:
    ad = None
    _ad_import_error = str(e)

from spatialxgene import __version__

app = FastAPI(title="Spatialxgene API", version=__version__)


class TokenAuthMiddleware(BaseHTTPMiddleware):
    """Require X-Token header, Authorization: Bearer <token>, or ?token= when TOKEN is set (for /api/*)."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        if not TOKEN or not request.url.path.startswith("/api/"):
            return await call_next(request)
        provided = (
            request.headers.get("x-token")
            or (request.headers.get("authorization") or "").replace("Bearer ", "").strip()
            or request.query_params.get("token")
        )
        if provided != TOKEN:
            return JSONResponse(status_code=401, content={"detail": "Invalid or missing token"})
        return await call_next(request)


app.add_middleware(TokenAuthMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Data directory: set by launch CLI
DATA_DIR: Optional[Path] = None
# Debug mode: when True, frontend can enable verbose console logs (see /api/config)
DEBUG: bool = False
# Optional token for simple auth: if set, /api/* requests must send X-Token, Authorization: Bearer <token>, or ?token=
TOKEN: Optional[str] = None
# API/base path when behind a reverse proxy subpath (e.g. /spatialxgene); empty string = root
API_BASE: str = ""


def set_api_base(value: str) -> None:
    """Set the public base path (e.g. spatialxgene or /spatialxgene). Normalized to leading slash, no trailing."""
    global API_BASE
    if not value or not value.strip():
        API_BASE = ""
        return
    p = value.strip().strip("/")
    API_BASE = "/" + p if p else ""
# Cache loaded adata by dataset id to avoid reloading
_adata_cache: dict[str, Any] = {}


def set_data_dir(path: Path) -> None:
    global DATA_DIR
    DATA_DIR = path


def set_debug(enabled: bool) -> None:
    global DEBUG
    DEBUG = enabled


def set_token(token: Optional[str]) -> None:
    """Set optional auth token; empty string or None disables token auth."""
    global TOKEN
    TOKEN = token if token and token.strip() else None


def _get_adata(dataset_id: str):
    if ad is None:
        msg = "anndata not installed"
        if _ad_import_error:
            msg += f": {_ad_import_error}"
            if "GLIBC" in _ad_import_error or "glibc" in _ad_import_error:
                msg += ". Your system glibc is older than required. Use a server with glibc 2.27+ or run via Docker (see docs/deployment.md)."
        raise HTTPException(status_code=500, detail=msg)
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


class ImageInfo(BaseModel):
    """Scale and size so frontend can place image in data (tissue) space. data_coord * scale_factor = image_pixel."""
    scale_factor: float  # e.g. tissue_hires_scalef: image_pixel = data * scale_factor
    width: int
    height: int


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
    layout: str  # "spatial", "umap", "pca", or "tsne": which coordinates are used for the default 2D plot
    has_spatial: bool  # True if adata has spatial coordinates
    has_umap: bool  # True if adata has UMAP embedding (obsm["X_umap"])
    has_pca: bool  # True if adata has PCA embedding (obsm["X_pca"])
    has_tsne: bool  # True if adata has t-SNE embedding (obsm["X_tsne"])
    image_keys: list[str]  # keys for background images in uns['spatial'] (e.g. hires, lowres); empty if none
    image_info: dict[str, ImageInfo]  # key -> scale_factor, width, height for alignment
    layer_keys: list[str]  # keys in adata.layers (e.g. raw_counts, logcounts); use "X" for adata.X


class SpatialResponse(BaseModel):
    x: list[float]
    y: list[float]


class ObsResponse(BaseModel):
    columns: list[str]
    data: dict[str, list[Any]]  # column name -> list of values


@app.get("/api/config")
def get_config():
    """Frontend config: debug enables verbose console logging; anndata_ok / anndata_error for backend status."""
    out: dict[str, Any] = {"debug": DEBUG}
    if ad is not None:
        out["anndata_ok"] = True
    else:
        out["anndata_ok"] = False
        if _ad_import_error:
            out["anndata_error"] = _ad_import_error
            if "GLIBC" in _ad_import_error or "glibc" in _ad_import_error:
                out["anndata_hint"] = (
                    "System glibc is too old. Use a server with glibc 2.27+ or run via Docker (see docs/deployment.md)."
                )
    return out


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
    """Get dataset metadata: dimensions, obs/var columns, plot bounds, image keys."""
    adata = _get_adata(dataset_id)
    x, y, layout = _get_plot_coordinates(adata)
    has_spatial = _has_spatial(adata)
    has_umap = "X_umap" in adata.obsm and adata.obsm["X_umap"].shape[1] >= 2
    has_pca = "X_pca" in adata.obsm and adata.obsm["X_pca"].shape[1] >= 2
    has_tsne = "X_tsne" in adata.obsm and adata.obsm["X_tsne"].shape[1] >= 2
    try:
        image_keys = _get_image_keys(adata)
        image_info = {}
        for k in image_keys:
            try:
                info = _get_image_info(adata, k)
                if info is not None:
                    image_info[k] = ImageInfo(**info)
            except Exception:
                pass
    except Exception:
        image_keys = []
        image_info = {}
    layer_keys = list(adata.layers.keys()) if hasattr(adata, "layers") and adata.layers else []
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
        has_spatial=has_spatial,
        has_umap=has_umap,
        has_pca=has_pca,
        has_tsne=has_tsne,
        image_keys=image_keys,
        image_info=image_info,
        layer_keys=layer_keys,
    )


def _get_spatial_nested(adata):
    """Return the nested dict that has 'images' and optionally 'scalefactors' (same as _get_image_keys)."""
    sp = adata.uns.get("spatial")
    if not sp or not isinstance(sp, dict):
        return None
    for v in sp.values():
        if isinstance(v, dict) and "images" in v:
            return v
    if "images" in sp:
        return sp
    return None


def _get_image_keys(adata) -> list[str]:
    """Return list of image keys from adata.uns['spatial'] (scanpy/Visium style)."""
    nested = _get_spatial_nested(adata)
    if nested is None:
        return []
    imgs = nested.get("images")
    if not isinstance(imgs, dict):
        return []
    return [k for k in imgs.keys() if _is_image_like(imgs.get(k))]


def _get_image_info(adata, key: str) -> Optional[dict]:
    """
    Return scale_factor, width, height for the image key so the frontend can place it in data space.
    Scanpy/Visium: scalefactors['tissue_hires_scalef'] means image_pixel = data_coord * scale_factor.
    So image (W, H) in pixels spans data rect (0, 0, W/scale_factor, H/scale_factor).
    """
    try:
        nested = _get_spatial_nested(adata)
        if nested is None:
            return None
        imgs = nested.get("images")
        if not imgs or key not in imgs:
            return None
        img = imgs[key]
        if isinstance(img, dict) and "array" in img:
            arr = np.asarray(img["array"])
        else:
            arr = np.asarray(img)
        if arr.ndim < 2:
            return None
        height, width = int(arr.shape[0]), int(arr.shape[1])
    except Exception:
        return None
    try:
        scalefactors = nested.get("scalefactors")
        if isinstance(scalefactors, dict):
            scale_key = f"tissue_{key}_scalef"
            scale_factor = scalefactors.get(scale_key)
            if scale_factor is not None:
                sf = float(scale_factor)
                if sf > 0:
                    return {"scale_factor": sf, "width": width, "height": height}
    except (TypeError, ValueError):
        pass
    return {"scale_factor": 1.0, "width": width, "height": height}


def _is_image_like(obj: Any) -> bool:
    """True if obj looks like an image array or dict with 'array'."""
    if obj is None:
        return False
    if hasattr(obj, "shape") and len(getattr(obj, "shape", ())) >= 2:
        return True
    if isinstance(obj, dict) and "array" in obj:
        return True
    return False


def _get_image_array(adata, key: str):
    """Return (H, W, 3) uint8 RGB array for the given image key, or None."""
    nested = _get_spatial_nested(adata)
    if nested is None:
        return None
    imgs = nested.get("images")
    if not isinstance(imgs, dict) or key not in imgs:
        return None
    img = imgs[key]
    if isinstance(img, dict) and "array" in img:
        img = img["array"]
    arr = np.asarray(img)
    if arr.ndim == 2:
        arr = np.stack([arr, arr, arr], axis=-1)
    elif arr.ndim == 3 and arr.shape[-1] == 4:
        arr = arr[:, :, :3]
    if arr.ndim != 3 or arr.shape[-1] != 3:
        return None
    if arr.dtype != np.uint8:
        if arr.max() <= 1.0:
            arr = (np.clip(arr, 0, 1) * 255).astype(np.uint8)
        else:
            arr = np.clip(arr, 0, 255).astype(np.uint8)
    return arr


def _has_spatial(adata) -> bool:
    """True if adata has spatial coordinates (obsm or obs x/y)."""
    if "spatial" in adata.obsm or "X_spatial" in adata.obsm:
        return True
    return "x" in adata.obs.columns and "y" in adata.obs.columns


def _get_plot_coordinates(adata):
    """
    Return (x, y) for the 2D plot: use spatial if present, otherwise UMAP.
    Raises ValueError if neither is available.
    Returns (x, y, layout) where layout is \"spatial\" or \"umap\".
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
def get_spatial(dataset_id: str, layout: Optional[str] = None):
    """
    Get plot coordinates (x, y) for all cells.

    - Default (layout is None): spatial if present, else UMAP (same as _get_plot_coordinates).
    - layout=\"spatial\": force spatial coordinates; 404 if none available.
    - layout=\"umap\": force UMAP embedding from obsm['X_umap']; 404 if none available.
    - layout=\"pca\": force PCA embedding from obsm['X_pca']; 404 if none available.
    - layout=\"tsne\": force t-SNE embedding from obsm['X_tsne']; 404 if none available.
    """
    adata = _get_adata(dataset_id)
    if layout == "spatial":
        if not _has_spatial(adata):
            raise HTTPException(
                status_code=404,
                detail="No spatial coordinates in adata (need obsm['spatial']/['X_spatial'] or obs x/y)",
            )
        if "spatial" in adata.obsm:
            x = np.asarray(adata.obsm["spatial"][:, 0], dtype=np.float64)
            y = np.asarray(adata.obsm["spatial"][:, 1], dtype=np.float64)
        elif "X_spatial" in adata.obsm:
            x = np.asarray(adata.obsm["X_spatial"][:, 0], dtype=np.float64)
            y = np.asarray(adata.obsm["X_spatial"][:, 1], dtype=np.float64)
        else:
            x = np.asarray(adata.obs["x"].values, dtype=np.float64)
            y = np.asarray(adata.obs["y"].values, dtype=np.float64)
    elif layout == "umap":
        umap = adata.obsm.get("X_umap")
        if umap is None or getattr(umap, "shape", (0, 0))[1] < 2:
            raise HTTPException(
                status_code=404,
                detail="No UMAP embedding in adata (need obsm['X_umap'] with at least 2 columns)",
            )
        x = np.asarray(umap[:, 0], dtype=np.float64)
        y = np.asarray(umap[:, 1], dtype=np.float64)
    elif layout == "pca":
        pca = adata.obsm.get("X_pca")
        if pca is None or getattr(pca, "shape", (0, 0))[1] < 2:
            raise HTTPException(
                status_code=404,
                detail="No PCA embedding in adata (need obsm['X_pca'] with at least 2 columns)",
            )
        x = np.asarray(pca[:, 0], dtype=np.float64)
        y = np.asarray(pca[:, 1], dtype=np.float64)
    elif layout == "tsne":
        tsne = adata.obsm.get("X_tsne")
        if tsne is None or getattr(tsne, "shape", (0, 0))[1] < 2:
            raise HTTPException(
                status_code=404,
                detail="No t-SNE embedding in adata (need obsm['X_tsne'] with at least 2 columns)",
            )
        x = np.asarray(tsne[:, 0], dtype=np.float64)
        y = np.asarray(tsne[:, 1], dtype=np.float64)
    else:
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
def get_expression(dataset_id: str, gene: str, layer: Optional[str] = None):
    """Get expression vector for one gene (var index or gene name). Use adata.X if layer is None or 'X', else adata.layers[layer]."""
    adata = _get_adata(dataset_id)
    if gene not in adata.var.index:
        # Try as string match
        matches = [g for g in adata.var.index.astype(str) if g == gene or g.upper() == gene.upper()]
        if not matches:
            raise HTTPException(status_code=404, detail=f"Gene {gene} not found")
        gene = matches[0]
    if layer and layer != "X":
        if not hasattr(adata, "layers") or adata.layers is None or layer not in adata.layers:
            raise HTTPException(status_code=404, detail=f"Layer {layer!r} not found")
        vec = adata[:, gene].layers[layer]
    else:
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


@app.get("/api/datasets/{dataset_id}/images/{image_key}", response_class=Response)
def get_dataset_image(dataset_id: str, image_key: str):
    """Get background image as PNG for the given image key (e.g. hires, lowres)."""
    adata = _get_adata(dataset_id)
    keys = _get_image_keys(adata)
    if image_key not in keys:
        raise HTTPException(status_code=404, detail=f"Image key {image_key!r} not found")
    arr = _get_image_array(adata, image_key)
    if arr is None:
        raise HTTPException(status_code=500, detail="Failed to decode image")
    from PIL import Image

    pil = Image.fromarray(arr, mode="RGB")
    buf = io.BytesIO()
    pil.save(buf, format="PNG")
    buf.seek(0)
    return Response(content=buf.read(), media_type="image/png")


# Serve frontend static files when mounted
STATIC_DIR: Optional[Path] = None


def set_static_dir(path: Path) -> None:
    global STATIC_DIR
    STATIC_DIR = path


@app.get("/")
def index():
    """Serve frontend index, injecting window.__API_BASE__ when --api-base is set."""
    if STATIC_DIR is None or not (STATIC_DIR / "index.html").exists():
        return {"message": "Spatialxgene API. Build frontend and set static dir, or use frontend dev server."}
    html_path = STATIC_DIR / "index.html"
    raw = html_path.read_text(encoding="utf-8")
    # Inject so frontend can prefix API and asset paths when behind a subpath (e.g. nginx location /spatialxgene/)
    inj = f'<script>window.__API_BASE__={json.dumps(API_BASE)};</script>'
    if "</head>" in raw:
        raw = raw.replace("</head>", f"{inj}\n</head>", 1)
    else:
        raw = inj + "\n" + raw
    # Favicon href: always use absolute path with API_BASE (./favicon.svg resolves to /favicon.svg when URL has no trailing slash)
    favicon_href = f"{API_BASE}/favicon.svg".lstrip("/") or "favicon.svg"
    favicon_href = "/" + favicon_href
    raw = re.sub(
        r'(<link\s+rel="icon"[^>]*\bhref=")([^"]*)(")',
        lambda m: f"{m.group(1)}{favicon_href}{m.group(3)}",
        raw,
        count=1,
    )
    return HTMLResponse(
        raw,
        headers={"Cache-Control": "no-store"},
    )


@app.get("/favicon.svg")
def favicon_svg():
    """
    Serve the frontend favicon from the built static directory.

    In dev mode (Vite) this is served by the dev server; in launch mode we
    need an explicit route because we only mount /assets by default.
    """
    if STATIC_DIR is not None:
        svg_path = STATIC_DIR / "favicon.svg"
        if svg_path.exists():
            return FileResponse(svg_path, media_type="image/svg+xml")
    raise HTTPException(status_code=404, detail="favicon.svg not found")


def mount_static(static_dir: Path) -> None:
    """Mount static files (call after set_static_dir)."""
    if (static_dir / "assets").exists():
        app.mount("/assets", StaticFiles(directory=static_dir / "assets"), name="assets")


def get_app():
    """
    Return the ASGI app to run. When API_BASE is set, mounts the main app at that path
    so you can test subpath locally: open http://localhost:5005/<api_base>/ and favicon/API/assets work.
    """
    if not API_BASE:
        return app
    from starlette.responses import RedirectResponse
    from starlette.routing import Mount

    root = FastAPI(title="Spatialxgene (root)")

    @root.get("/favicon.svg")
    def _redirect_favicon():
        return RedirectResponse(url=f"{API_BASE}/favicon.svg", status_code=302)

    root.mount(API_BASE.rstrip("/") or "/", app)
    return root
