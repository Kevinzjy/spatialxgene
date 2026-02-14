"""
Preprocessing pipeline following scanpy tutorial: QC, normalize, log, HVG (for dimred only),
PCA, neighbors, UMAP, Leiden. Output h5ad keeps all genes that passed QC; HVG is used only
for dimensionality reduction and clustering. Does not add or modify spatial coordinates.
"""

import logging
import time
import warnings
from pathlib import Path

import anndata as ad

logger = logging.getLogger(__name__)
import scanpy.preprocessing as sc_pp
import scanpy.tools as sc_tl


def _has_spatial(adata: ad.AnnData) -> bool:
    """True if adata has spatial coordinates."""
    if "spatial" in adata.obsm:
        return True
    return "x" in adata.obs.columns and "y" in adata.obs.columns


def _check_spatial_preserved(adata: ad.AnnData, step: str) -> None:
    """Warn if spatial was present but is missing or shape mismatch after a step."""
    if "spatial" not in adata.obsm:
        return
    if adata.obsm["spatial"].shape[0] != adata.n_obs:
        warnings.warn(
            f"preprocess: after {step}, obsm['spatial'] shape {adata.obsm['spatial'].shape[0]} != n_obs {adata.n_obs}",
            UserWarning,
            stacklevel=2,
        )


def run_preprocess(
    adata: ad.AnnData,
    *,
    min_genes: int = 200,
    min_cells: int = 3,
    n_top_genes: int = 2000,
    n_pcs: int = 50,
    n_neighbors: int = 15,
    resolution: float = 1.0,
    save_raw_layer: bool = True,
    run_cluster: bool = True,
) -> ad.AnnData:
    """
    Run scanpy-style preprocessing: QC, normalize, log, HVG (mark only), PCA, neighbors,
    UMAP, Leiden. HVG is used only for dimensionality reduction and clustering; the
    returned adata contains all genes that passed QC (X = normalized log counts).

    Parameters
    ----------
    adata
        Input AnnData (will be modified in place; also return value).
    min_genes
        Minimum number of genes per cell; cells below are filtered out. Skipped when
        ``obs['in_tissue']`` exists (e.g. Visium), so on-tissue spots are not removed.
    min_cells
        Minimum number of cells per gene; genes below are filtered out.
    n_top_genes
        Number of highly variable genes used for PCA/neighbors/UMAP/Leiden.
    n_pcs
        Number of PCA components.
    n_neighbors
        Number of neighbors for the graph.
    resolution
        Leiden resolution.
    save_raw_layer
        If True and 'counts' not in layers, save current X to adata.layers['counts']
        before normalization (so full counts are preserved). Set False to save memory on large datasets.
    run_cluster
        If True, run Leiden (or Louvain) and add obs['leiden']. Set False to skip clustering and avoid
        high memory use from igraph on very large graphs (e.g. >100k cells).

    Returns
    -------
    ad.AnnData
        The same object with QC, normalized X, obsm['X_pca'], obsm['X_umap'], obs['leiden'],
        obsp['neighbors']/'distances', uns['neighbors'], var['highly_variable_genes'].
    """
    if adata.X is None:
        raise ValueError("adata.X is None; cannot run preprocess.")
    if adata.n_obs == 0 or adata.n_vars == 0:
        raise ValueError("adata has no observations or no variables.")

    logger.info(
        "run_preprocess start: n_obs=%s n_vars=%s min_genes=%s min_cells=%s n_top_genes=%s save_raw_layer=%s run_cluster=%s",
        adata.n_obs,
        adata.n_vars,
        min_genes,
        min_cells,
        n_top_genes,
        save_raw_layer,
        run_cluster,
    )
    had_spatial = _has_spatial(adata)

    # QC metrics
    t0 = time.perf_counter()
    sc_pp.calculate_qc_metrics(adata, inplace=True)
    logger.info("calculate_qc_metrics done (%.1fs)", time.perf_counter() - t0)

    # Filter cells by number of genes. Skip for Visium-like data with in_tissue so we do not
    # remove on-tissue spots (would lose many visible spots on the tissue).
    t0 = time.perf_counter()
    has_in_tissue = "in_tissue" in adata.obs.columns
    if has_in_tissue:
        logger.info("skip cell filter (in_tissue present); n_obs=%s", adata.n_obs)
    elif min_genes > 0 and "n_genes_by_counts" in adata.obs.columns:
        adata = adata[adata.obs["n_genes_by_counts"] >= min_genes].copy()
    if had_spatial:
        _check_spatial_preserved(adata, "QC filter (min_genes)")
    logger.info("filter cells done: n_obs=%s (%.1fs)", adata.n_obs, time.perf_counter() - t0)

    # Filter genes by number of cells
    t0 = time.perf_counter()
    if min_cells > 0 and adata.n_vars > 0:
        sc_pp.filter_genes(adata, min_cells=min_cells)
    logger.info("filter genes done: n_vars=%s (%.1fs)", adata.n_vars, time.perf_counter() - t0)

    # Save raw counts before normalization: adata.layers['counts'] = adata.X.copy() so X and counts differ (X will be log-norm next)
    if save_raw_layer and "counts" not in adata.layers:
        adata.layers["counts"] = adata.X.copy()
        logger.info("saved counts layer")

    # Normalize and log (in place on full adata)
    t0 = time.perf_counter()
    sc_pp.normalize_total(adata, target_sum=1e4)
    sc_pp.log1p(adata)
    logger.info("normalize_total + log1p done (%.1fs)", time.perf_counter() - t0)

    # Mark HVG but do not subset; use HVG-only copy for dimred and clustering
    t0 = time.perf_counter()
    with warnings.catch_warnings():
        warnings.filterwarnings(
            "ignore",
            message=".*observed.*",
            category=FutureWarning,
            module="scanpy",
        )
        sc_pp.highly_variable_genes(adata, n_top_genes=n_top_genes, flavor="seurat", subset=False)
    if had_spatial:
        _check_spatial_preserved(adata, "HVG (no subset)")
    n_hvg = int(adata.var["highly_variable"].sum())
    logger.info("highly_variable_genes done: n_hvg=%s (%.1fs)", n_hvg, time.perf_counter() - t0)

    n_obs, n_vars = adata.n_obs, adata.n_vars
    n_pcs_use = min(n_pcs, n_obs - 1, n_vars - 1)
    if n_pcs_use < 1:
        raise ValueError("Not enough cells or genes for PCA after QC.")

    # Run PCA, neighbors, UMAP, Leiden on HVG-only copy
    adata_hvg = adata[:, adata.var["highly_variable"]].copy()
    t0 = time.perf_counter()
    sc_tl.pca(adata_hvg, n_comps=n_pcs_use, svd_solver="arpack")
    logger.info("PCA done n_comps=%s (%.1fs)", n_pcs_use, time.perf_counter() - t0)

    n_pcs_neighbors = min(30, adata_hvg.obsm["X_pca"].shape[1])
    t0 = time.perf_counter()
    sc_pp.neighbors(adata_hvg, n_neighbors=n_neighbors, n_pcs=n_pcs_neighbors)
    logger.info("neighbors done (%.1fs)", time.perf_counter() - t0)

    t0 = time.perf_counter()
    sc_tl.umap(adata_hvg)
    logger.info("UMAP done (%.1fs)", time.perf_counter() - t0)

    if run_cluster:
        t0 = time.perf_counter()
        try:
            # Try igraph first (scanpy future default); older leidenalg does not accept flavor= and raises TypeError
            sc_tl.leiden(
                adata_hvg,
                resolution=resolution,
                flavor="igraph",
                n_iterations=2,
                directed=False,
            )
            logger.info("Leiden (igraph) done (%.1fs)", time.perf_counter() - t0)
        except (ImportError, TypeError) as e:
            logger.warning("Leiden with flavor=igraph failed (%s), trying Leiden without flavor", e)
            try:
                sc_tl.leiden(adata_hvg, resolution=resolution)
                logger.info("Leiden (default) done (%.1fs)", time.perf_counter() - t0)
            except (ImportError, TypeError, BaseException) as e2:
                logger.warning("Leiden without flavor failed (%s), trying Louvain", e2)
                try:
                    sc_tl.louvain(adata_hvg, resolution=resolution)
                    if "louvain" in adata_hvg.obs.columns:
                        adata_hvg.obs["leiden"] = adata_hvg.obs["louvain"]
                    logger.info("Louvain done (%.1fs)", time.perf_counter() - t0)
                except (ImportError, TypeError, BaseException) as e3:
                    logger.warning(
                        "Louvain also failed (%s). Output will have no obs['leiden']. Use --no-cluster to skip.",
                        e3,
                    )
                    warnings.warn(
                        "Leiden and Louvain failed (e.g. API mismatch or out-of-memory). "
                        "Output will have PCA/UMAP/neighbors but no obs['leiden']. "
                        "Use --no-cluster to skip clustering and avoid this warning on large datasets.",
                        UserWarning,
                        stacklevel=2,
                    )

    # Copy dimred and clustering results back to full adata (same cells, same order)
    adata.obsm["X_pca"] = adata_hvg.obsm["X_pca"]
    adata.obsm["X_umap"] = adata_hvg.obsm["X_umap"]
    adata.uns["neighbors"] = adata_hvg.uns["neighbors"]
    adata.obsp["connectivities"] = adata_hvg.obsp["connectivities"]
    adata.obsp["distances"] = adata_hvg.obsp["distances"]
    if run_cluster:
        if "leiden" in adata_hvg.obs.columns:
            adata.obs["leiden"] = adata_hvg.obs["leiden"]
        if "louvain" in adata_hvg.obs.columns:
            adata.obs["louvain"] = adata_hvg.obs["louvain"]
    logger.info("copy dimred/cluster back to full adata done (leiden=%s louvain=%s)", "leiden" in adata.obs.columns, "louvain" in adata.obs.columns)
    return adata


def preprocess_file(
    input_path: Path,
    output_path: Path,
    **kwargs,
) -> Path:
    """Load one h5ad, run run_preprocess, save to output_path. Spatial info preserved as-is. Returns output_path (resolved)."""
    output_path = output_path.resolve()
    logger.info("loading %s", input_path)
    t0 = time.perf_counter()
    adata = ad.read_h5ad(input_path)
    logger.info("read_h5ad done: n_obs=%s n_vars=%s (%.1fs)", adata.n_obs, adata.n_vars, time.perf_counter() - t0)
    adata = run_preprocess(adata, **kwargs)
    logger.info("obs has leiden=%s louvain=%s layers=%s", "leiden" in adata.obs.columns, "louvain" in adata.obs.columns, list(adata.layers.keys()) if getattr(adata, "layers", None) else [])
    logger.info("writing %s", output_path)
    t0 = time.perf_counter()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    # When adata.raw exists: save its X into layers['counts'] when dimensions align, then clear raw
    # (avoids write error when raw.var has reserved '_index'; viewer uses X and layers only)
    raw = getattr(adata, "raw", None)
    if raw is not None and hasattr(raw, "X") and raw.X is not None:
        try:
            if raw.n_obs == adata.n_obs and adata.n_vars > 0:
                if list(raw.var_names) == list(adata.var_names):
                    adata.layers["counts"] = raw.X.copy()
                    logger.info("saved adata.raw.X to layers['counts'] (same var_names)")
                elif adata.var_names.isin(raw.var_names).all():
                    adata.layers["counts"] = raw[:, adata.var_names].X.copy()
                    logger.info("saved adata.raw.X to layers['counts'] (subset by var_names)")
                else:
                    logger.info("raw.var_names does not cover adata.var_names; skip saving raw to layer")
            else:
                logger.info("raw.n_obs=%s != adata.n_obs=%s; skip saving raw to layer", raw.n_obs, adata.n_obs)
        except Exception as e:
            logger.warning("could not save adata.raw to layers['counts']: %s", e)
        adata.raw = None
        logger.info("cleared adata.raw for write")
    adata.write_h5ad(output_path)
    logger.info("write_h5ad done (%.1fs)", time.perf_counter() - t0)
    return output_path


def preprocess_directory(
    input_dir: Path,
    output_dir: Path,
    exclude_name_containing: str = "processed",
    **kwargs,
) -> list[Path]:
    """Preprocess all .h5ad in input_dir, write to output_dir. Returns list of output paths."""
    output_dir.mkdir(parents=True, exist_ok=True)
    files = sorted(
        p for p in input_dir.glob("*.h5ad")
        if exclude_name_containing not in p.name
    )
    if not files:
        return []
    out_paths = []
    for p in files:
        out_path = output_dir / f"{p.stem}_processed.h5ad"
        preprocess_file(p, out_path, **kwargs)
        out_paths.append(out_path)
    return out_paths
