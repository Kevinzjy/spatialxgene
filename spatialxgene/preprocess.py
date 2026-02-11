"""
Preprocessing pipeline for expression matrix only: QC, normalize, HVG, PCA, neighbors, UMAP, Leiden.
Does not add or modify spatial coordinates; use `spatialxgene infer` for that.
"""
from pathlib import Path

import anndata as ad
import scanpy.preprocessing as sc_pp
import scanpy.tools as sc_tl


def run_preprocess(
    adata: ad.AnnData,
    *,
    min_genes: int = 200,
    min_cells: int = 3,
    n_top_genes: int = 2000,
    n_pcs: int = 50,
    n_neighbors: int = 15,
    resolution: float = 1.0,
) -> ad.AnnData:
    """
    Run expression-only preprocessing: QC, normalize, log, HVG, PCA, neighbors, UMAP, Leiden.
    Does not modify spatial information. Returns the modified adata (in place + return).
    """
    if "n_genes_by_counts" not in adata.obs.columns and adata.X is not None:
        sc_pp.calculate_qc_metrics(adata, inplace=True)
    if min_genes > 0 and "n_genes_by_counts" in adata.obs.columns:
        adata = adata[adata.obs["n_genes_by_counts"] >= min_genes].copy()
    if min_cells > 0 and adata.n_vars > 0:
        sc_pp.filter_genes(adata, min_cells=min_cells)

    sc_pp.normalize_total(adata, target_sum=1e4)
    sc_pp.log1p(adata)
    sc_pp.highly_variable_genes(adata, n_top_genes=n_top_genes, flavor="seurat", subset=True)

    n_pcs_use = min(n_pcs, min(adata.n_obs, adata.n_vars) - 1)
    sc_tl.pca(adata, n_comps=n_pcs_use, svd_solver="arpack")
    n_pcs_neighbors = min(30, adata.obsm["X_pca"].shape[1])
    sc_pp.neighbors(adata, n_neighbors=n_neighbors, n_pcs=n_pcs_neighbors)
    sc_tl.umap(adata)
    try:
        sc_tl.leiden(adata, resolution=resolution, flavor="igraph", n_iterations=2, directed=False)
    except (ImportError, TypeError):
        sc_tl.louvain(adata, resolution=resolution)

    return adata


def preprocess_file(
    input_path: Path,
    output_path: Path,
    **kwargs,
) -> None:
    """Load one h5ad, run run_preprocess, save to output_path. Spatial info is preserved as-is."""
    adata = ad.read_h5ad(input_path)
    run_preprocess(adata, **kwargs)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    adata.write_h5ad(output_path)


def preprocess_directory(
    input_dir: Path,
    output_dir: Path,
    exclude_name_containing: str = "preprocessed",
    **kwargs,
) -> list[Path]:
    """Preprocess all h5ad in input_dir, write to output_dir. Returns list of output paths."""
    output_dir.mkdir(parents=True, exist_ok=True)
    files = sorted(p for p in input_dir.glob("*.h5ad") if exclude_name_containing not in p.name)
    if not files:
        return []
    out_paths = []
    for p in files:
        out_path = output_dir / f"{p.stem}_preprocessed.h5ad"
        print(f"Loading {p} ...")
        preprocess_file(p, out_path, **kwargs)
        print(f"  Saved {out_path}")
        out_paths.append(out_path)
    return out_paths
