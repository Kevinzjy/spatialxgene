"""
Convert Visium Space Ranger output directory to a single h5ad file.

Uses scanpy.read_visium() to load count matrix, spatial coordinates,
scalefactors, and optional tissue images.

Expects a directory containing:
  - spatial/ (tissue_positions_list.csv, scalefactors_json.json, tissue_*_image.png)
  - filtered_feature_bc_matrix.h5 and/or filtered_feature_bc_matrix/ (barcodes, features, matrix.mtx)
"""

import warnings
from pathlib import Path
from typing import Optional

import anndata as ad
import pandas as pd

# Count file names used by Space Ranger
_COUNT_H5 = "filtered_feature_bc_matrix.h5"
_COUNT_MTX_DIR = "filtered_feature_bc_matrix"
_SPATIAL_DIR = "spatial"


def _detect_count_file(visium_path: Path) -> str:
    """Return count file or directory name: prefer .h5, else MTX directory."""
    if (visium_path / _COUNT_H5).is_file():
        return _COUNT_H5
    if (visium_path / _COUNT_MTX_DIR).is_dir():
        return _COUNT_MTX_DIR
    raise FileNotFoundError(
        f"Count matrix not found: expected '{_COUNT_H5}' or directory '{_COUNT_MTX_DIR}' under {visium_path}"
    )


def _check_spatial_dir(visium_path: Path) -> None:
    """Require spatial/ with tissue_positions_list.csv."""
    spatial = visium_path / _SPATIAL_DIR
    if not spatial.is_dir():
        raise FileNotFoundError(f"Missing '{_SPATIAL_DIR}/' directory under {visium_path}")
    positions = spatial / "tissue_positions_list.csv"
    if not positions.is_file():
        raise FileNotFoundError(f"Missing spatial/tissue_positions_list.csv under {visium_path}")


def visium_to_h5ad(
    visium_path: Path,
    output_path: Path,
    count_file: Optional[str] = None,
    load_images: bool = True,
) -> Path:
    """
    Read a Visium Space Ranger directory with scanpy and write a single h5ad file.

    Parameters
    ----------
    visium_path
        Path to the Visium sample directory (contains 'spatial/' and count matrix).
    output_path
        Output .h5ad file path (if suffix is not .h5ad, it is appended).
    count_file
        Count matrix file or directory name under visium_path. If None, auto-detect:
        use 'filtered_feature_bc_matrix.h5' if present, else 'filtered_feature_bc_matrix'.
    load_images
        If True, load tissue images into uns['spatial'][*]['images'] (hires, lowres).

    Returns
    -------
    Path
        The actual path written to.
    """
    visium_path = visium_path.resolve()
    output_path = output_path.resolve()

    if not visium_path.is_dir():
        raise FileNotFoundError(f"Input is not a directory: {visium_path}")

    _check_spatial_dir(visium_path)
    if count_file is None:
        count_file = _detect_count_file(visium_path)

    import scanpy as sc

    with warnings.catch_warnings():
        warnings.filterwarnings(
            "ignore",
            message=".*Variable names are not unique.*",
            category=UserWarning,
            module="anndata",
        )
        adata = sc.read_visium(
            str(visium_path),
            count_file=count_file,
            load_images=load_images,
        )
    adata.var_names_make_unique()

    output_path.parent.mkdir(parents=True, exist_ok=True)
    if output_path.suffix.lower() != ".h5ad":
        output_path = output_path.with_suffix(".h5ad")

    # anndata >=0.11: opt-in to writing pd.arrays.StringArray; anndata <0.11: no settings, convert to object
    if getattr(ad, "settings", None) is not None and hasattr(
        ad.settings, "allow_write_nullable_strings"
    ):
        prev = ad.settings.allow_write_nullable_strings
        try:
            ad.settings.allow_write_nullable_strings = True
            adata.write_h5ad(output_path)
        finally:
            ad.settings.allow_write_nullable_strings = prev
    else:
        # anndata <0.11: convert nullable string columns and index so h5ad write succeeds
        for frame in (adata.obs, adata.var):
            if getattr(frame.index.dtype, "name", None) == "string":
                frame.index = pd.Index(frame.index.astype(object), name=frame.index.name)
            for col in list(frame.columns):
                if getattr(frame[col].dtype, "name", None) == "string":
                    frame[col] = frame[col].astype(object)
        adata.write_h5ad(output_path)
    return output_path
