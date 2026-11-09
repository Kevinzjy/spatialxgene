"""
Pytest tests for spatialxgene.preprocess: run_preprocess input validation and core pipeline.
"""
import numpy as np
import pytest

try:
    import anndata as ad
    import pandas as pd
except ImportError:
    ad = None
    pd = None


pytestmark = pytest.mark.skipif(ad is None, reason="anndata not installed")


def test_run_preprocess_rejects_none_x():
    from spatialxgene.preprocess import run_preprocess

    obs = pd.DataFrame(index=["c0", "c1"])
    var = pd.DataFrame(index=["a", "b"])
    adata = ad.AnnData(X=None, obs=obs, var=var)
    adata.obsm["spatial"] = np.array([[0.0, 0.0], [1.0, 1.0]])
    with pytest.raises(ValueError, match="adata.X is None"):
        run_preprocess(adata)


def test_run_preprocess_rejects_zero_obs():
    from spatialxgene.preprocess import run_preprocess

    X = np.zeros((0, 2), dtype=np.float32)
    obs = pd.DataFrame(index=[])
    var = pd.DataFrame(index=["a", "b"])
    adata = ad.AnnData(X=X, obs=obs, var=var)
    with pytest.raises(ValueError, match="no observations or no variables"):
        run_preprocess(adata)


def test_run_preprocess_rejects_zero_vars():
    from spatialxgene.preprocess import run_preprocess

    X = np.zeros((2, 0), dtype=np.float32)
    obs = pd.DataFrame(index=["c0", "c1"])
    var = pd.DataFrame(index=[])
    adata = ad.AnnData(X=X, obs=obs, var=var)
    with pytest.raises(ValueError, match="no observations or no variables"):
        run_preprocess(adata)


def test_run_preprocess_pipeline_small(small_adata_for_preprocess):
    """Run full pipeline on small adata (no CellTypist to avoid network)."""
    from spatialxgene.preprocess import run_preprocess

    adata = small_adata_for_preprocess.copy()
    out = run_preprocess(
        adata,
        min_genes=2,
        min_cells=2,
        n_top_genes=50,
        n_pcs=5,
        n_neighbors=5,
        run_cluster=True,
        run_celltypist=False,
    )
    assert out.n_obs > 0 and out.n_vars > 0
    assert "X_pca" in out.obsm
    assert "X_umap" in out.obsm
    assert out.obsm["X_pca"].shape[1] >= 2
    assert out.obsm["X_umap"].shape[1] >= 2
    assert "leiden" in out.obs.columns or "louvain" in out.obs.columns
    assert "counts" in out.layers or "highly_variable" in out.var.columns
    # Spatial preserved
    assert "spatial" in out.obsm and out.obsm["spatial"].shape[0] == out.n_obs


def test_run_preprocess_no_cluster_skips_leiden(small_adata_for_preprocess):
    """With run_cluster=False, output has PCA/UMAP but may not have leiden."""
    from spatialxgene.preprocess import run_preprocess

    adata = small_adata_for_preprocess.copy()
    out = run_preprocess(
        adata,
        min_genes=2,
        min_cells=2,
        n_top_genes=50,
        n_pcs=5,
        n_neighbors=5,
        run_cluster=False,
        run_celltypist=False,
    )
    assert "X_pca" in out.obsm and "X_umap" in out.obsm
    # leiden/louvain may or may not be present when run_cluster=False
    assert out.obsm["X_umap"].shape[0] == out.n_obs


def _assert_sanitized_pipeline_output(out):
    """Shared assertions: pipeline survives non-finite/negative X and output stays finite/non-negative."""
    from scipy import sparse

    assert out.n_obs > 0 and out.n_vars > 0
    X_out = out.X.toarray() if sparse.issparse(out.X) else out.X
    assert np.isfinite(X_out).all()
    assert (X_out >= 0).all()
    assert "counts" in out.layers
    counts_out = out.layers["counts"].toarray() if sparse.issparse(out.layers["counts"]) else out.layers["counts"]
    assert np.isfinite(counts_out).all()
    assert (counts_out >= 0).all()


def test_run_preprocess_sanitizes_dense_nonfinite_and_negative_x(small_adata_for_preprocess):
    """Dense X with NaN/Inf/negatives must not break normalize/log1p or seurat HVG binning."""
    from spatialxgene.preprocess import run_preprocess

    adata = small_adata_for_preprocess.copy()
    X = adata.X.astype(np.float32).copy()
    X[0, 0] = np.nan
    X[1, 1] = np.inf
    X[2, 2] = -5.0
    adata.X = X
    out = run_preprocess(
        adata,
        min_genes=2,
        min_cells=2,
        n_top_genes=50,
        n_pcs=5,
        n_neighbors=5,
        run_cluster=False,
        run_celltypist=False,
    )
    _assert_sanitized_pipeline_output(out)


def test_run_preprocess_sanitizes_sparse_nonfinite_and_negative_x(small_adata_for_preprocess):
    """Sparse X with NaN/Inf/negatives in stored data must be sanitized before QC."""
    from scipy import sparse

    from spatialxgene.preprocess import run_preprocess

    adata = small_adata_for_preprocess.copy()
    X = sparse.csr_matrix(adata.X.astype(np.float32))
    X[0, 0] = np.nan
    X[1, 1] = -np.inf
    X[2, 2] = -3.0
    adata.X = X
    assert sparse.issparse(adata.X)
    out = run_preprocess(
        adata,
        min_genes=2,
        min_cells=2,
        n_top_genes=50,
        n_pcs=5,
        n_neighbors=5,
        run_cluster=False,
        run_celltypist=False,
    )
    _assert_sanitized_pipeline_output(out)


def test_run_preprocess_small_gene_panel_percent_top(small_adata_for_preprocess):
    """Gene panels with n_vars < 500 must not crash scanpy's percent_top QC metrics."""
    from spatialxgene.preprocess import run_preprocess

    adata = small_adata_for_preprocess[:, :60].copy()
    out = run_preprocess(
        adata,
        min_genes=2,
        min_cells=2,
        n_top_genes=30,
        n_pcs=5,
        n_neighbors=5,
        run_cluster=False,
        run_celltypist=False,
    )
    assert out.n_vars == 60
    assert "total_counts" in out.obs.columns
    # Clamped percent_top columns must exist and not exceed the gene count.
    assert "pct_counts_in_top_50_genes" in out.obs.columns
    assert "pct_counts_in_top_60_genes" in out.obs.columns
