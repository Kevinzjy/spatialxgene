"""
Infer and add spatial coordinates to h5ad when missing.
If data already has spatial info, skip. Otherwise infer (known grid, factorized grid, or proxy).
"""
from pathlib import Path
from typing import Optional

import numpy as np
import anndata as ad

# Known Stereo-seq / spatial grid sizes: (n_obs, n_cols, n_rows)
_KNOWN_GRIDS = [
    (737280, 960, 768),
    (737280, 768, 960),
    (737280, 720, 1024),
    (737280, 1024, 720),
]


def has_spatial(adata: ad.AnnData) -> bool:
    """True if adata has spatial coordinates in obsm or obs."""
    if "spatial" in adata.obsm or "X_spatial" in adata.obsm:
        return True
    for c in ("x", "y", "spatial_x", "spatial_y"):
        if c in adata.obs.columns:
            return True
    return False


def _add_spatial_columns(
    adata: ad.AnnData,
    x: np.ndarray,
    y: np.ndarray,
    platform: str = "inferred",
    bin_shape: Optional[list[int]] = None,
    note: Optional[str] = None,
) -> None:
    """Write x, y to obsm['spatial'] and obs['x'], obs['y']; set uns metadata. In place."""
    xy = np.column_stack([np.asarray(x, dtype=np.float64), np.asarray(y, dtype=np.float64)])
    adata.obsm["spatial"] = xy
    adata.obs["x"] = x
    adata.obs["y"] = y
    adata.uns["spatial_platform"] = platform
    if bin_shape is not None:
        adata.uns["spatial_bin_shape"] = bin_shape
    adata.uns["spatial_scale"] = 1.0
    if note:
        adata.uns["spatial_note"] = note
    elif "spatial_note" in adata.uns:
        del adata.uns["spatial_note"]


def _factor_grid(n: int) -> Optional[tuple[int, int]]:
    """Return (n_cols, n_rows) for a reasonable 2D grid with n_cols * n_rows == n. Prefer near-square."""
    if n <= 0:
        return None
    best = None
    best_diff = float("inf")
    for w in range(1, int(n**0.5) + 1):
        if n % w != 0:
            continue
        h = n // w
        diff = abs(w - h)
        if diff < best_diff:
            best_diff = diff
            best = (w, h)
    return best


def infer_and_add_spatial(
    adata: ad.AnnData,
    bin_scale_um: float = 1.0,
    flip_y: bool = False,
    grid_shape: Optional[tuple[int, int]] = None,
) -> bool:
    """
    If adata already has spatial coordinates, return False (no change).
    Otherwise infer and add spatial: try known Stereo-seq grids, else factor n_obs to grid, else proxy index grid.
    Modifies adata in place. Returns True if spatial was added.

    - flip_y: if True, set y = n_rows - 1 - y so that top-of-tissue matches display.
    - grid_shape: optional (n_cols, n_rows) to force grid for this n_obs (e.g. (768, 960) to swap aspect).
    """
    if has_spatial(adata):
        return False

    n = adata.n_obs
    n_cols, n_rows = None, None

    # 1) User-provided grid or known grids (e.g. Stereo-seq 737280 = 960x768)
    if grid_shape is not None and grid_shape[0] * grid_shape[1] == n:
        n_cols, n_rows = grid_shape
    else:
        for known_n, nc, nr in _KNOWN_GRIDS:
            if n == known_n:
                n_cols, n_rows = nc, nr
                break

    if n_cols is not None and n_rows is not None:
        ind = np.arange(n, dtype=np.int64)
        x = np.asarray(ind % n_cols, dtype=np.float64)
        y = np.asarray(ind // n_cols, dtype=np.float64)
        if flip_y:
            y = (n_rows - 1) - y
        _add_spatial_columns(
            adata,
            x,
            y,
            platform="Stereo-seq" if grid_shape is None else "Stereo-seq",
            bin_shape=[n_cols, n_rows],
            note=None,
        )
        adata.uns["spatial_scale"] = bin_scale_um
        return True

    # 2) Factor n_obs to get a 2D grid
    grid = _factor_grid(n)
    if grid is not None:
        n_cols, n_rows = grid
        ind = np.arange(n, dtype=np.int64)
        x = np.asarray(ind % n_cols, dtype=np.float64)
        y = np.asarray(ind // n_cols, dtype=np.float64)
        if flip_y:
            y = (n_rows - 1) - y
        _add_spatial_columns(
            adata,
            x,
            y,
            platform="inferred",
            bin_shape=[n_cols, n_rows],
            note=f"inferred grid {n_cols}x{n_rows} from n_obs",
        )
        adata.uns["spatial_scale"] = bin_scale_um
        return True

    # 3) Fallback: simple row-major grid by sqrt
    side = int(np.ceil(np.sqrt(n)))
    n_rows_fb = (n + side - 1) // side
    ind = np.arange(n, dtype=np.int64)
    x = np.asarray(ind % side, dtype=np.float64)
    y = np.asarray(ind // side, dtype=np.float64)
    if flip_y:
        y = (n_rows_fb - 1) - y
    _add_spatial_columns(
        adata,
        x,
        y,
        platform="proxy",
        bin_shape=[side, n_rows_fb],
        note="proxy grid from index (no known grid for n_obs)",
    )
    return True


def infer_file(
    input_path: Path,
    output_path: Optional[Path] = None,
    in_place: bool = True,
    flip_y: bool = False,
    grid_shape: Optional[tuple[int, int]] = None,
    **kwargs,
) -> bool:
    """Load one h5ad, run infer_and_add_spatial, save. Returns True if spatial was added."""
    adata = ad.read_h5ad(input_path)
    added = infer_and_add_spatial(
        adata,
        flip_y=flip_y,
        grid_shape=grid_shape,
        **kwargs,
    )
    out = Path(output_path) if output_path else Path(input_path)
    if not in_place:
        out.parent.mkdir(parents=True, exist_ok=True)
    adata.write_h5ad(out)
    return added


def infer_directory(
    input_dir: Path,
    output_dir: Optional[Path] = None,
    exclude_name_containing: str = "preprocessed",
    flip_y: bool = False,
    grid_shape: Optional[tuple[int, int]] = None,
    **kwargs,
) -> list[tuple[Path, bool]]:
    """Infer spatial for all h5ad in input_dir. Returns list of (output_path, added)."""
    input_dir = Path(input_dir)
    in_place = output_dir is None
    if not in_place:
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)

    files = sorted(p for p in input_dir.glob("*.h5ad") if exclude_name_containing not in p.name)
    results = []
    for p in files:
        out = (output_dir / p.name) if not in_place else p
        added = infer_file(
            p,
            out,
            in_place=in_place,
            flip_y=flip_y,
            grid_shape=grid_shape,
            **kwargs,
        )
        results.append((out, added))
    return results
