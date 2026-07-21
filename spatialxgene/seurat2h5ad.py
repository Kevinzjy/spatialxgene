"""
Convert Seurat spatial transcriptomics RDS (or .rds.gz) to a single h5ad file.

Uses an R script (Seurat + Matrix) to read the RDS and export matrix, obs, and
spatial coordinates to temp files; Python builds AnnData and writes h5ad.

Expects the RDS to contain a Seurat object with at least a default assay
(counts or data). Spatial coordinates are read from GetTissueCoordinates or
from meta.data (x/y, imagecol/imagerow, x_centroid/y_centroid).
"""

import os
import shutil
import subprocess
import tempfile
import warnings
from pathlib import Path
from typing import Optional

import anndata as ad
import numpy as np
import pandas as pd
from scipy.io import mmread


def _find_r_script() -> Path:
    """Return path to the bundled seurat2h5ad.R script."""
    try:
        from importlib import resources
        with resources.path("spatialxgene.scripts", "seurat2h5ad.R") as p:
            return Path(p)
    except Exception:
        pass
    # Fallback: next to this file
    return Path(__file__).resolve().parent / "scripts" / "seurat2h5ad.R"


def _find_rscript() -> str:
    """Return Rscript executable (prefer RSCRIPT env, else Rscript on PATH)."""
    exe = os.environ.get("RSCRIPT", "Rscript")
    return exe


def _is_rds_path(path: Path) -> bool:
    """Return True if path looks like a Seurat RDS input."""
    name = path.name.lower()
    return name.endswith(".rds") or name.endswith(".rds.gz")


def _non_rds_input_hint(path: Path) -> str:
    """Return a concrete conversion hint for common non-RDS mistakes."""
    name = path.name
    lower_name = name.lower()
    if lower_name.endswith(".h5") and "filtered_feature_bc_matrix" in lower_name:
        sample_dir = "." if path.parent == Path.cwd() else str(path.parent)
        return (
            "A 10x filtered_feature_bc_matrix.h5 file is not a Seurat object. "
            f"For a count-only h5ad without spatial images, run: `spatialxgene visium2h5ad {name}`. "
            f"If this directory also contains spatial/, run: "
            f"`spatialxgene visium2h5ad {sample_dir} --count-file {name}`."
        )
    return (
        "Use a Seurat .rds/.rds.gz file, or convert a Visium/10x sample directory with "
        "`spatialxgene visium2h5ad <sample_dir>`."
    )


def _resolve_rscript(rscript: Optional[str] = None) -> str:
    """Resolve Rscript and raise an actionable error if it is unavailable."""
    exe = rscript or _find_rscript()
    exe_path = Path(exe).expanduser()
    has_path_component = exe_path.name != exe

    if has_path_component:
        if exe_path.is_file() and os.access(exe_path, os.X_OK):
            return str(exe_path)
    else:
        found = shutil.which(exe)
        if found:
            return found

    source = "--rscript" if rscript else ("RSCRIPT" if os.environ.get("RSCRIPT") else "PATH")
    raise FileNotFoundError(
        f"Rscript executable not found from {source}: {exe}. "
        "seurat2h5ad requires an R runtime with Seurat and Matrix. "
        "Run inside the project pixi environment, for example: "
        "`pixi run spatialxgene seurat2h5ad sample.rds.gz`, "
        "or install R/Seurat and pass `--rscript /path/to/Rscript` "
        "or set `RSCRIPT=/path/to/Rscript`."
    )


def _run_r_export(input_rds: Path, output_dir: Path, rscript: str, r_script_path: Path) -> None:
    """Run the R script to export RDS contents to output_dir. Raises on failure."""
    cmd = [rscript, str(r_script_path), str(input_rds.resolve()), str(output_dir.resolve())]
    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=600,
        cwd=None,
    )
    if result.returncode != 0:
        err = (result.stderr or "").strip() or (result.stdout or "").strip()
        raise RuntimeError(f"R script failed (exit {result.returncode}): {err}")
    if not (output_dir / "status.txt").is_file():
        raise RuntimeError("R script did not write status.txt")
    status = (output_dir / "status.txt").read_text().strip()
    if status != "ok":
        raise RuntimeError(f"R script status: {status}")


def seurat_to_h5ad(
    input_path: Path,
    output_path: Path,
    rscript: Optional[str] = None,
) -> Path:
    """
    Read a Seurat RDS (or .rds.gz) and write a single h5ad file.

    Parameters
    ----------
    input_path
        Path to the .rds or .rds.gz file (Seurat spatial object).
    output_path
        Output .h5ad file path (if suffix is not .h5ad, it is appended).
    rscript
        Path to Rscript executable. If None, use RSCRIPT env or "Rscript" on PATH.

    Returns
    -------
    Path
        The actual path written to.
    """
    input_path = input_path.resolve()
    output_path = output_path.resolve()

    if not input_path.is_file():
        raise FileNotFoundError(f"Input file not found: {input_path}")
    if not _is_rds_path(input_path):
        raise ValueError(
            f"seurat2h5ad expects a Seurat RDS file (.rds or .rds.gz), got: {input_path.name}. "
            f"{_non_rds_input_hint(input_path)}"
        )

    r_script_path = _find_r_script()
    if not r_script_path.is_file():
        raise FileNotFoundError(
            f"R script not found: {r_script_path}. "
            "Install the spatialxgene package so scripts/seurat2h5ad.R is available."
        )

    rscript_exe = _resolve_rscript(rscript)

    with tempfile.TemporaryDirectory(prefix="seurat2h5ad_") as tmp:
        tmp_path = Path(tmp)
        _run_r_export(input_path, tmp_path, rscript_exe, r_script_path)

        # Read matrix (Matrix Market: genes x cells); AnnData is cells x genes -> transpose
        mtx_path = tmp_path / "matrix.mtx"
        if not mtx_path.is_file():
            raise FileNotFoundError(f"R script did not write {mtx_path}")
        mtx = mmread(str(mtx_path))
        if mtx.shape[0] != mtx.shape[1]:
            # Usually genes x cells
            if mtx.shape[1] < mtx.shape[0]:
                X = mtx.T.tocsr()
            else:
                X = mtx.tocsr()
        else:
            X = mtx.tocsr()

        barcodes_path = tmp_path / "barcodes.tsv"
        genes_path = tmp_path / "genes.tsv"
        barcodes = [s.strip() for s in barcodes_path.read_text().splitlines()]
        genes = [s.strip() for s in genes_path.read_text().splitlines()]

        # Align dimensions: R writes genes x cells (rows x cols in writeMM)
        # writeMM in R: rows = genes, cols = cells -> shape (n_genes, n_cells)
        n_genes = len(genes)
        n_cells = len(barcodes)
        if X.shape[0] == n_genes and X.shape[1] == n_cells:
            X = X.T
        elif X.shape[0] == n_cells and X.shape[1] == n_genes:
            pass
        else:
            raise ValueError(
                f"Matrix shape {X.shape} does not match genes={n_genes} and barcodes={n_cells}"
            )

        obs = pd.read_csv(tmp_path / "obs.csv")
        if "barcode" in obs.columns:
            obs = obs.set_index("barcode")
        # Align obs to barcodes order (same as matrix columns)
        obs = obs.reindex(barcodes)
        if obs.shape[0] != n_cells:
            raise ValueError(f"obs rows ({obs.shape[0]}) != n_cells ({n_cells})")

        adata = ad.AnnData(X=X, obs=obs, var=pd.DataFrame(index=genes))

        # Spatial coordinates
        spatial_path = tmp_path / "spatial.csv"
        if spatial_path.is_file():
            spatial = pd.read_csv(spatial_path)
            if "barcode" in spatial.columns and "x" in spatial.columns and "y" in spatial.columns:
                # Merge to barcode order
                xy = spatial.set_index("barcode").reindex(barcodes)
                xy = xy[["x", "y"]].astype(np.float64)
                adata.obsm["spatial"] = xy.values

        # Tissue images: Visium-style uns['spatial'][sample]['images'] + scalefactors
        # Reference: coords in same space as image pixels -> tissue_*_scalef = 1.0; use keys "hires"/"lowres"
        images_dir = tmp_path / "images"
        if images_dir.is_dir():
            x_min, x_max = float("inf"), float("-inf")
            y_min, y_max = float("inf"), float("-inf")
            if "spatial" in adata.obsm:
                xy = adata.obsm["spatial"]
                x_min, x_max = float(np.nanmin(xy[:, 0])), float(np.nanmax(xy[:, 0]))
                y_min, y_max = float(np.nanmin(xy[:, 1])), float(np.nanmax(xy[:, 1]))
            images_dict = {}
            scalefactors_dict = {}
            bin_files = sorted(images_dir.glob("*.bin"))
            for bin_file in bin_files:
                with open(bin_file, "rb") as f:
                    hw = np.frombuffer(f.read(8), dtype=np.int32)
                    if len(hw) < 2:
                        continue
                    h, w = int(hw[0]), int(hw[1])
                    data = np.frombuffer(f.read(), dtype=np.uint8)
                    if data.size != h * w * 3:
                        continue
                    # R writes column-major: ch0 then ch1 then ch2, each (h,w) F-order
                    arr = np.zeros((h, w, 3), dtype=np.uint8)
                    for c in range(3):
                        arr[:, :, c] = data[c * h * w : (c + 1) * h * w].reshape((h, w), order="F")
                # Seurat imagecol/imagerow = image pixel space; viewer: image_pixel = data_coord * scale
                # Use scale 1.0 so image aligns with spot coords (reference: Control06_processed.h5ad)
                images_dict["hires"] = arr.astype(np.float32) / 255.0  # float32 [0,1] like reference
                scalefactors_dict["tissue_hires_scalef"] = 1.0
                # Lowres for faster display: max 400px; tissue_lowres_scalef = lowres_w / fullres_w
                img_h, img_w = arr.shape[0], arr.shape[1]
                max_lowres = 400
                if max(img_h, img_w) > max_lowres:
                    from PIL import Image
                    scale_low = max_lowres / max(img_h, img_w)
                    low_h = max(1, int(round(img_h * scale_low)))
                    low_w = max(1, int(round(img_w * scale_low)))
                    pil = Image.fromarray(arr, mode="RGB")
                    resample = getattr(Image, "Resampling", getattr(Image, "LANCZOS", Image.BILINEAR))
                    if hasattr(resample, "LANCZOS"):
                        resample = resample.LANCZOS
                    lowres_pil = pil.resize((low_w, low_h), resample)
                    lowres_arr = np.asarray(lowres_pil, dtype=np.float32) / 255.0
                    images_dict["lowres"] = lowres_arr
                    scalefactors_dict["tissue_lowres_scalef"] = low_w / img_w
                break  # first image only -> hires + optional lowres
            if images_dict:
                adata.uns["spatial"] = {
                    "sample": {
                        "images": images_dict,
                        "scalefactors": scalefactors_dict,
                    }
                }

        adata.var_names_make_unique()

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
                for frame in (adata.obs, adata.var):
                    if getattr(frame.index.dtype, "name", None) == "string":
                        frame.index = pd.Index(frame.index.astype(object), name=frame.index.name)
                    for col in list(frame.columns):
                        if getattr(frame[col].dtype, "name", None) == "string":
                            frame[col] = frame[col].astype(object)
                adata.write_h5ad(output_path)

    return output_path
