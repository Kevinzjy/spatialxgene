"""
Shared pytest fixtures for spatialxgene tests.
"""
import numpy as np
import pytest

try:
    import anndata as ad
    import pandas as pd
    HAS_ANNDATA = True
except ImportError:
    HAS_ANNDATA = False
    pd = None


@pytest.fixture
def minimal_adata_spatial():
    """Minimal AnnData with spatial coords in obsm['spatial'] (n_obs=4, n_vars=3)."""
    if not HAS_ANNDATA:
        pytest.skip("anndata not installed")
    X = np.array([[1, 0, 2], [0, 1, 1], [2, 2, 0], [1, 1, 1]], dtype=np.float32)
    obs = pd.DataFrame(index=[f"cell_{i}" for i in range(4)])
    var = pd.DataFrame(index=["g1", "g2", "g3"])
    adata = ad.AnnData(X=X, obs=obs, var=var)
    adata.obsm["spatial"] = np.array([[0.0, 0.0], [1.0, 0.0], [0.0, 1.0], [1.0, 1.0]], dtype=np.float64)
    return adata


@pytest.fixture
def minimal_adata_obs_xy():
    """Minimal AnnData with spatial coords in obs['x'] and obs['y']."""
    if not HAS_ANNDATA:
        pytest.skip("anndata not installed")
    X = np.array([[1, 0], [0, 1]], dtype=np.float32)
    obs = pd.DataFrame(
        {"x": [0.0, 1.0], "y": [0.0, 1.0]},
        index=["c0", "c1"],
    )
    var = pd.DataFrame(index=["a", "b"])
    return ad.AnnData(X=X, obs=obs, var=var)


@pytest.fixture
def minimal_adata_umap_only():
    """Minimal AnnData with only UMAP (no spatial)."""
    if not HAS_ANNDATA:
        pytest.skip("anndata not installed")
    X = np.array([[1, 0], [0, 1]], dtype=np.float32)
    obs = pd.DataFrame(index=["c0", "c1"])
    var = pd.DataFrame(index=["a", "b"])
    adata = ad.AnnData(X=X, obs=obs, var=var)
    adata.obsm["X_umap"] = np.array([[0.0, 0.0], [1.0, 1.0]], dtype=np.float64)
    return adata


@pytest.fixture
def minimal_adata_no_coords():
    """Minimal AnnData with no spatial and no UMAP (for ValueError test)."""
    if not HAS_ANNDATA:
        pytest.skip("anndata not installed")
    X = np.array([[1, 0], [0, 1]], dtype=np.float32)
    obs = pd.DataFrame(index=["c0", "c1"])
    var = pd.DataFrame(index=["a", "b"])
    return ad.AnnData(X=X, obs=obs, var=var)


@pytest.fixture
def small_adata_for_preprocess():
    """Small AnnData for run_preprocess (enough for PCA/UMAP/Leiden; skip CellTypist).
    n_vars >= 500 so scanpy calculate_qc_metrics percent_top [50,100,200,500] stays in range."""
    if not HAS_ANNDATA:
        pytest.skip("anndata not installed")
    np.random.seed(42)
    n_obs, n_vars = 50, 600
    X = np.random.negative_binomial(5, 0.3, (n_obs, n_vars)).astype(np.float32)
    obs = pd.DataFrame(index=[f"cell_{i}" for i in range(n_obs)])
    var = pd.DataFrame(index=[f"gene_{i}" for i in range(n_vars)])
    adata = ad.AnnData(X=X, obs=obs, var=var)
    adata.obsm["spatial"] = np.random.randn(n_obs, 2).astype(np.float64)
    return adata
