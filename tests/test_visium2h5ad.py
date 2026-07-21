"""Tests for visium2h5ad input modes."""

import numpy as np
import pytest

try:
    import anndata as ad
    import pandas as pd
except ImportError:
    ad = None
    pd = None


pytestmark = pytest.mark.skipif(ad is None, reason="anndata not installed")


def test_visium2h5ad_accepts_standalone_10x_h5_with_inferred_spatial(tmp_path, monkeypatch):
    import scanpy as sc
    from spatialxgene.visium2h5ad import visium_to_h5ad

    input_path = tmp_path / "GSM8479159_O3FA_filtered_feature_bc_matrix.h5"
    input_path.write_bytes(b"fake h5")

    def fake_read_10x_h5(path):
        assert path == str(input_path.resolve())
        return ad.AnnData(
            X=np.array([[1, 0], [0, 2]], dtype=np.float32),
            obs=pd.DataFrame(index=["AAACAAGTATCTCCCA-1", "AAACAGAGCGACTCCT-1"]),
            var=pd.DataFrame(index=["GeneA", "GeneB"]),
        )

    monkeypatch.setattr(sc, "read_10x_h5", fake_read_10x_h5)

    written = visium_to_h5ad(input_path, tmp_path / "out.h5ad")
    out = ad.read_h5ad(written)

    assert out.shape == (2, 2)
    assert list(out.obs["array_row"]) == [50, 14]
    assert list(out.obs["array_col"]) == [102, 94]
    assert list(out.obs["in_tissue"]) == [1, 1]
    assert "spatial" in out.obsm
    assert out.obsm["spatial"].shape == (2, 2)
    assert "spatial" not in out.uns
    assert out.uns["spatialxgene_inferred_spatial"]["coordinate_space"] == "regular_array"


def test_visium2h5ad_rejects_count_file_with_standalone_h5(tmp_path):
    from spatialxgene.visium2h5ad import visium_to_h5ad

    input_path = tmp_path / "filtered_feature_bc_matrix.h5"
    input_path.write_bytes(b"fake h5")

    with pytest.raises(ValueError, match="--count-file is only valid"):
        visium_to_h5ad(input_path, tmp_path / "out.h5ad", count_file="other.h5")
