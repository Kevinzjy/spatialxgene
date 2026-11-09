"""
Pytest tests for spatialxgene.server: list_datasets, get_dataset_meta, _get_plot_coordinates.
"""
from pathlib import Path

import numpy as np
import pytest
import anndata as ad
import pandas as pd
from fastapi.testclient import TestClient

from spatialxgene.server.main import (
    _check_viewable_h5,
    _has_spatial,
    _get_plot_coordinates,
    app,
    set_data_dir,
)


class TestListDatasets:
    """Tests for GET /api/datasets (list_datasets)."""

    def test_list_datasets_empty_dir(self, tmp_path):
        set_data_dir(tmp_path)
        client = TestClient(app)
        r = client.get("/api/datasets")
        assert r.status_code == 200
        assert r.json() == []

    def test_list_datasets_returns_h5ad_ids(self, tmp_path, minimal_adata_spatial):
        (tmp_path / "sample.h5ad").parent.mkdir(parents=True, exist_ok=True)
        minimal_adata_spatial.write_h5ad(tmp_path / "sample.h5ad")
        set_data_dir(tmp_path)
        client = TestClient(app)
        r = client.get("/api/datasets")
        assert r.status_code == 200
        data = r.json()
        assert len(data) == 1
        assert data[0]["id"] == "sample"
        assert data[0]["name"] == "sample"
        assert data[0]["path"] == "sample.h5ad"

    def test_list_datasets_subdir(self, tmp_path, minimal_adata_spatial):
        sub = tmp_path / "sub"
        sub.mkdir()
        minimal_adata_spatial.write_h5ad(sub / "foo.h5ad")
        set_data_dir(tmp_path)
        client = TestClient(app)
        r = client.get("/api/datasets")
        assert r.status_code == 200
        data = r.json()
        assert len(data) == 1
        assert data[0]["id"] == "sub/foo"
        assert "sub" in data[0]["path"]


class TestGetDatasetMeta:
    """Tests for GET /api/datasets/{id} (get_dataset_meta)."""

    def test_get_dataset_meta_not_found(self, tmp_path):
        set_data_dir(tmp_path)
        client = TestClient(app)
        r = client.get("/api/datasets/nonexistent")
        assert r.status_code == 404

    def test_get_dataset_meta_viewable(self, tmp_path, minimal_adata_spatial):
        minimal_adata_spatial.write_h5ad(tmp_path / "m.h5ad")
        set_data_dir(tmp_path)
        client = TestClient(app)
        r = client.get("/api/datasets/m")
        assert r.status_code == 200
        meta = r.json()
        assert meta["id"] == "m"
        assert meta["n_obs"] == 4
        assert meta["n_vars"] == 3
        assert meta["has_spatial"] is True
        assert meta["viewable"] is True
        assert "x_min" in meta and "x_max" in meta


class TestGetPlotCoordinates:
    """Unit tests for _get_plot_coordinates (server helper)."""

    def test_returns_spatial_from_obsm(self, minimal_adata_spatial):
        x, y, layout = _get_plot_coordinates(minimal_adata_spatial)
        assert layout == "spatial"
        assert len(x) == len(y) == 4
        np.testing.assert_array_almost_equal(x, [0.0, 1.0, 0.0, 1.0])
        np.testing.assert_array_almost_equal(y, [0.0, 0.0, 1.0, 1.0])

    def test_returns_spatial_from_obs_xy(self, minimal_adata_obs_xy):
        x, y, layout = _get_plot_coordinates(minimal_adata_obs_xy)
        assert layout == "spatial"
        assert len(x) == len(y) == 2
        np.testing.assert_array_almost_equal(x, [0.0, 1.0])
        np.testing.assert_array_almost_equal(y, [0.0, 1.0])

    def test_returns_umap_when_no_spatial(self, minimal_adata_umap_only):
        x, y, layout = _get_plot_coordinates(minimal_adata_umap_only)
        assert layout == "umap"
        assert len(x) == len(y) == 2
        np.testing.assert_array_almost_equal(x, [0.0, 1.0])
        np.testing.assert_array_almost_equal(y, [0.0, 1.0])

    def test_raises_when_no_coords(self, minimal_adata_no_coords):
        with pytest.raises(ValueError, match="No spatial coordinates or UMAP"):
            _get_plot_coordinates(minimal_adata_no_coords)

    @pytest.mark.parametrize(
        "x_key,y_key",
        [("x", "y"), ("center_x", "center_y"), ("Cx", "Cy")],
    )
    def test_returns_spatial_from_obs_fallback_pairs(self, x_key, y_key):
        obs = pd.DataFrame(
            {x_key: [2.0, 4.0], y_key: [3.0, 5.0]},
            index=["c0", "c1"],
        )
        adata = ad.AnnData(
            np.ones((2, 1), dtype=np.float32),
            obs=obs,
            var=pd.DataFrame(index=["g1"]),
        )
        assert _has_spatial(adata) is True
        x, y, layout = _get_plot_coordinates(adata)
        assert layout == "spatial"
        np.testing.assert_array_almost_equal(x, [2.0, 4.0])
        np.testing.assert_array_almost_equal(y, [3.0, 5.0])

    def test_viewability_check_supports_cx_cy_fallback(self, tmp_path):
        obs = pd.DataFrame(
            {"Cx": [1.0, 2.0], "Cy": [3.0, 4.0]},
            index=["c0", "c1"],
        )
        adata = ad.AnnData(
            np.ones((2, 1), dtype=np.float32),
            obs=obs,
            var=pd.DataFrame(index=["g1"]),
        )
        path = tmp_path / "morphology.h5ad"
        adata.write_h5ad(path)
        assert _check_viewable_h5(path)[0] is True
