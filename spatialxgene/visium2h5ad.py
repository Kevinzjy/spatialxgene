"""
Convert Visium Space Ranger output or a standalone 10x HDF5 matrix to h5ad.

Directory input uses scanpy.read_visium() to load count matrix, spatial
coordinates, scalefactors, and optional tissue images. A standalone .h5 input
uses scanpy.read_10x_h5() and writes inferred regular Visium array
coordinates without image metadata.

Directory input expects:
  - spatial/ (tissue_positions_list.csv, scalefactors_json.json, tissue_*_image.png)
  - filtered_feature_bc_matrix.h5 and/or filtered_feature_bc_matrix/ (barcodes, features, matrix.mtx)
"""

import gzip
import math
import warnings
from pathlib import Path
from typing import Dict, Optional, Tuple

import anndata as ad
import numpy as np
import pandas as pd

# Count file names used by Space Ranger
_COUNT_H5 = "filtered_feature_bc_matrix.h5"
_COUNT_MTX_DIR = "filtered_feature_bc_matrix"
_SPATIAL_DIR = "spatial"
_VISIUM_V1_POSITIONS = "visium-v1_6p5mm_barcode_positions.csv.gz"


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



def _load_visium_v1_positions() -> Dict[str, Tuple[int, int]]:
    """Load built-in Visium V1 6.5 mm barcode array positions."""
    from importlib import resources

    mapping: Dict[str, Tuple[int, int]] = {}
    with resources.files("spatialxgene.resources").joinpath(_VISIUM_V1_POSITIONS).open("rb") as raw:
        with gzip.open(raw, "rt") as fh:
            header = fh.readline().strip().split(",")
            if header != ["barcode", "array_row", "array_col"]:
                raise ValueError(f"Unexpected Visium position header: {header}")
            for line in fh:
                barcode, array_row, array_col = line.strip().split(",")
                mapping[barcode] = (int(array_row), int(array_col))
    return mapping


def _strip_barcode_suffix(barcode: str) -> str:
    """Remove 10x GEM group suffix from a barcode."""
    return barcode.split("-", 1)[0]


def _add_inferred_visium_spatial(adata: ad.AnnData) -> bool:
    """Infer regular Visium V1 array coordinates from known barcode positions."""
    positions = _load_visium_v1_positions()
    rows = []
    cols = []
    missing = []
    for barcode in adata.obs_names.astype(str):
        pos = positions.get(_strip_barcode_suffix(barcode))
        if pos is None:
            missing.append(barcode)
            rows.append(np.nan)
            cols.append(np.nan)
        else:
            row, col = pos
            rows.append(row)
            cols.append(col)

    matched = len(adata.obs_names) - len(missing)
    if matched == 0:
        return False
    if missing:
        raise ValueError(
            f"Could not infer Visium V1 coordinates for {len(missing)} of {adata.n_obs} barcodes; "
            "standalone spatial inference currently supports Visium V1/V2 6.5 mm barcodes only."
        )

    array_row = np.asarray(rows, dtype=np.int32)
    array_col = np.asarray(cols, dtype=np.int32)
    adata.obs["in_tissue"] = 1
    adata.obs["array_row"] = array_row
    adata.obs["array_col"] = array_col
    adata.obsm["spatial"] = np.column_stack(
        [array_col.astype(np.float64), array_row.astype(np.float64) * math.sqrt(3.0)]
    )
    adata.uns["spatialxgene_inferred_spatial"] = {
        "source": "visium-v1_6p5mm_barcode_positions",
        "coordinate_space": "regular_array",
        "note": "Inferred from fixed Visium barcode array positions; not aligned to tissue image pixels.",
    }
    return True


def _write_h5ad(adata: ad.AnnData, output_path: Path) -> None:
    """Write h5ad across anndata versions with nullable string handling."""
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


def _is_10x_h5_path(path: Path) -> bool:
    """Return True for standalone 10x HDF5 count matrix inputs."""
    return path.is_file() and path.suffix.lower() in {".h5", ".hdf5"}


def visium_to_h5ad(
    visium_path: Path,
    output_path: Path,
    count_file: Optional[str] = None,
    load_images: bool = True,
) -> Path:
    """
    Read a Visium directory or standalone 10x HDF5 matrix and write h5ad.

    Parameters
    ----------
    visium_path
        Path to the Visium sample directory, or a standalone 10x .h5/.hdf5 count matrix.
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

    import scanpy as sc

    output_path.parent.mkdir(parents=True, exist_ok=True)
    if output_path.suffix.lower() != ".h5ad":
        output_path = output_path.with_suffix(".h5ad")

    with warnings.catch_warnings():
        warnings.filterwarnings(
            "ignore",
            message=".*Variable names are not unique.*",
            category=UserWarning,
            module="anndata",
        )
        if visium_path.is_dir():
            _check_spatial_dir(visium_path)
            if count_file is None:
                count_file = _detect_count_file(visium_path)
            adata = sc.read_visium(
                str(visium_path),
                count_file=count_file,
                load_images=load_images,
            )
        elif _is_10x_h5_path(visium_path):
            if count_file is not None:
                raise ValueError("--count-file is only valid when input is a Visium directory")
            adata = sc.read_10x_h5(str(visium_path))
            _add_inferred_visium_spatial(adata)
        else:
            raise FileNotFoundError(
                f"Input must be a Visium directory or standalone 10x .h5/.hdf5 count matrix: {visium_path}"
            )

    adata.var_names_make_unique()
    _write_h5ad(adata, output_path)
    return output_path
