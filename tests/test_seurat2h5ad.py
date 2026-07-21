"""Tests for seurat2h5ad input and runtime validation."""

import pytest


def test_seurat2h5ad_rejects_non_rds_input_before_rscript_lookup(tmp_path):
    from spatialxgene.seurat2h5ad import seurat_to_h5ad

    input_path = tmp_path / "filtered_feature_bc_matrix.h5"
    input_path.write_bytes(b"not an rds")

    with pytest.raises(ValueError, match="expects a Seurat RDS file") as exc:
        seurat_to_h5ad(input_path, tmp_path / "out.h5ad")

    message = str(exc.value)
    assert "spatialxgene visium2h5ad" in message
    assert "--count-file filtered_feature_bc_matrix.h5" in message


def test_seurat2h5ad_rejects_prefixed_10x_h5_with_count_file_hint(tmp_path):
    from spatialxgene.seurat2h5ad import seurat_to_h5ad

    input_path = tmp_path / "GSM7440144_M1FA_filtered_feature_bc_matrix.h5"
    input_path.write_bytes(b"not an rds")

    with pytest.raises(ValueError) as exc:
        seurat_to_h5ad(input_path, tmp_path / "out.h5ad")

    message = str(exc.value)
    assert "spatialxgene visium2h5ad" in message
    assert "--count-file GSM7440144_M1FA_filtered_feature_bc_matrix.h5" in message


def test_seurat2h5ad_missing_rscript_has_actionable_message(tmp_path, monkeypatch):
    from spatialxgene.seurat2h5ad import seurat_to_h5ad

    input_path = tmp_path / "sample.rds"
    input_path.write_bytes(b"not a real rds")
    monkeypatch.setenv("RSCRIPT", "spatialxgene-missing-Rscript")

    with pytest.raises(FileNotFoundError) as exc:
        seurat_to_h5ad(input_path, tmp_path / "out.h5ad")

    message = str(exc.value)
    assert "Rscript executable not found" in message
    assert "pixi run spatialxgene seurat2h5ad sample.rds.gz" in message
    assert "--rscript /path/to/Rscript" in message
