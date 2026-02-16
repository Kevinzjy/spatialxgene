"""
CellTypist-based automatic spot/cell type annotation for preprocess pipeline.

- Infers tissue context from a quick first-pass annotation (immune-enriched vs other).
- Routes to appropriate model(s); supports hierarchical immune annotation.
- Runs annotation with majority_voting=True; writes result to obs['auto_cell_type'].
"""

from __future__ import annotations

import logging
from typing import Any

import anndata as ad
import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

# Keywords in predicted labels that indicate immune cell types (case-insensitive).
IMMUNE_LABEL_KEYWORDS = frozenset({
    "t cell", "t-cell", "tcell", "b cell", "b-cell", "bcell",
    "nk", "natural killer", "macrophage", "monocyte", "dendritic", "dc ",
    "neutrophil", "mast cell", "plasma cell", "ilc", "cd8", "cd4", "treg",
    "granulocyte", "eosinophil", "basophil", "lymphocyte", "myeloid",
    "t helper", "cytotoxic", "nk cell", "dcs", "cdc", "th1", "th2", "th17",
})

# Default broad model (pan-immune, 98 subtypes); works as first pass and for immune-heavy samples.
MODEL_DEFAULT = "Immune_All_Low.pkl"
# Coarser immune model (32 types) for optional hierarchical coarse labels.
MODEL_IMMUNE_COARSE = "Immune_All_High.pkl"

# Label keyword -> tissue model (filename). Split by species for model routing.
HUMAN_LABEL_KEYWORD_TO_MODEL: dict[str, str] = {
    "hepatocyte": "Healthy_Human_Liver.pkl",
    "liver": "Healthy_Human_Liver.pkl",
    "lung": "Human_Lung_Atlas.pkl",
    "alveolar": "Human_Lung_Atlas.pkl",
    "airway": "Cells_Lung_Airway.pkl",
    "brain": "Adult_Human_MTG.pkl",
    "neuron": "Adult_Human_MTG.pkl",
    "skin": "Adult_Human_Skin.pkl",
    "breast": "Cells_Adult_Breast.pkl",
    "intestine": "Cells_Intestinal_Tract.pkl",
    "gut": "Cells_Intestinal_Tract.pkl",
    "heart": "Healthy_Adult_Heart.pkl",
    "vascular": "Adult_Human_Vascular.pkl",
    "pancreas": "Adult_Human_PancreaticIslet.pkl",
    "islet": "Adult_Human_PancreaticIslet.pkl",
}
MOUSE_LABEL_KEYWORD_TO_MODEL: dict[str, str] = {
    "hepatocyte": "Healthy_Mouse_Liver.pkl",
    "liver": "Healthy_Mouse_Liver.pkl",
    "lung": "Human_Lung_Atlas.pkl",  # no dedicated mouse lung in list; keep human as fallback
    "alveolar": "Human_Lung_Atlas.pkl",
    "airway": "Cells_Lung_Airway.pkl",
    "brain": "Mouse_Whole_Brain.pkl",
    "neuron": "Mouse_Whole_Brain.pkl",
    "skin": "Adult_Human_Skin.pkl",
    "breast": "Cells_Adult_Breast.pkl",
    "intestine": "Adult_Mouse_Gut.pkl",
    "gut": "Adult_Mouse_Gut.pkl",
    "heart": "Healthy_Adult_Heart.pkl",
    "vascular": "Adult_Human_Vascular.pkl",
    "pancreas": "Adult_Human_PancreaticIslet.pkl",
    "islet": "Adult_Human_PancreaticIslet.pkl",
}


def _infer_species(adata: ad.AnnData, max_genes: int = 2000) -> str:
    """
    Infer species from gene symbols in adata.var_names.
    Human: symbols are typically all-uppercase (e.g. CD4, CD8A).
    Mouse: symbols are typically title-case, first letter upper rest lower (e.g. Cd4, Cd8a).
    Returns 'human', 'mouse', or 'unknown'.
    """
    genes = adata.var_names.astype(str)
    if len(genes) == 0:
        return "unknown"
    if len(genes) > max_genes:
        rng = np.random.default_rng(42)
        genes = rng.choice(genes, size=max_genes, replace=False)
    n_upper = 0
    n_title = 0
    for g in genes:
        g = g.strip()
        if len(g) < 2:
            continue
        letters = [c for c in g if c.isalpha()]
        if not letters:
            continue
        # Human: all alphabetic characters uppercase (e.g. CD3D, CD8A, CD4)
        if all(c.isupper() for c in letters):
            n_upper += 1
        # Mouse: first letter upper and at least one lowercase letter (e.g. Cd3d, Cd8a)
        elif g[0].isupper() and any(c.islower() for c in g[1:] if c.isalpha()):
            n_title += 1
    total = n_upper + n_title
    if total == 0:
        return "unknown"
    if n_upper > n_title * 1.2:
        return "human"
    if n_title > n_upper * 1.2:
        return "mouse"
    return "unknown"


def _is_immune_label(label: str) -> bool:
    """Return True if the predicted label looks immune-related."""
    if not label or (isinstance(label, float) and np.isnan(label)):
        return False
    lower = str(label).strip().lower()
    return any(kw in lower for kw in IMMUNE_LABEL_KEYWORDS)


def _immune_fraction(labels: pd.Series) -> float:
    """Fraction of non-empty labels that are immune-related."""
    clean = labels.astype(str).str.strip()
    non_empty = clean.ne("") & clean.ne("nan")
    if non_empty.sum() == 0:
        return 0.0
    immune = clean[non_empty].apply(_is_immune_label)
    return float(immune.sum() / non_empty.sum())


def _top_labels(labels: pd.Series, top_n: int = 5) -> list[str]:
    """Most frequent non-empty labels (order preserved by frequency)."""
    clean = labels.astype(str).str.strip()
    non_empty = clean[clean.ne("") & clean.ne("nan")]
    if len(non_empty) == 0:
        return []
    counts = non_empty.value_counts()
    return list(counts.index[:top_n])


def _infer_tissue_context(labels: pd.Series, species: str) -> dict[str, Any]:
    """
    Infer tissue context from first-pass predicted labels.
    species: 'human' | 'mouse' | 'unknown'; used to pick species-appropriate tissue models.
    Returns dict with keys: immune_frac, tissue_context, top_labels, suggested_model.
    """
    immune_frac = _immune_fraction(labels)
    top = _top_labels(labels, top_n=5)
    keyword_to_model = HUMAN_LABEL_KEYWORD_TO_MODEL if species == "human" else MOUSE_LABEL_KEYWORD_TO_MODEL
    suggested_model = MODEL_DEFAULT
    for lab in top:
        lower = lab.lower()
        for kw, model in keyword_to_model.items():
            if kw in lower:
                suggested_model = model
                break
        else:
            continue
        break
    if immune_frac >= 0.25:
        tissue_context = "immune_enriched"
        suggested_model = MODEL_DEFAULT
    elif suggested_model != MODEL_DEFAULT:
        tissue_context = "tissue_specific"
    else:
        tissue_context = "unknown"
    return {
        "immune_frac": immune_frac,
        "tissue_context": tissue_context,
        "top_labels": top,
        "suggested_model": suggested_model,
    }


def _run_annotation(
    adata: ad.AnnData,
    model_name: str | None = None,
    *,
    model_obj: Any = None,
    majority_voting: bool = True,
    over_clustering: str | None = "leiden",
    **kwargs: Any,
) -> pd.Series:
    """Run CellTypist annotate and return predicted labels series (index = adata.obs_names).
    Either model_name (filename to load) or model_obj (pre-loaded/converted Model) must be provided.
    """
    import celltypist
    from celltypist.models import Model

    if over_clustering and over_clustering not in adata.obs.columns:
        logger.warning(
            "celltypist: over_clustering column %s not found; running without majority voting over clusters",
            over_clustering,
        )
        over_clustering = None

    if model_obj is not None:
        pass
    elif model_name:
        model_obj = Model.load(model_name)
    else:
        raise ValueError("_run_annotation requires model_name or model_obj")
    result = celltypist.annotate(
        adata,
        model=model_obj,
        majority_voting=majority_voting,
        over_clustering=over_clustering,
        **kwargs,
    )
    # result.predicted_labels may be Series, 1D/2D array, or DataFrame (e.g. after majority voting)
    raw = result.predicted_labels
    if isinstance(raw, pd.DataFrame):
        raw = raw.iloc[:, 0]
    if isinstance(raw, np.ndarray):
        if raw.ndim == 2:
            raw = raw[:, 0]
        return pd.Series(np.asarray(raw).ravel(), index=adata.obs_names)
    if isinstance(raw, pd.Series):
        return raw.reindex(adata.obs_names)
    return pd.Series(np.asarray(raw).ravel(), index=adata.obs_names)


def run_celltypist_annotation(
    adata: ad.AnnData,
    *,
    majority_voting: bool = True,
    over_clustering: str | None = "leiden",
    immune_hierarchical: bool = True,
    min_prop: float = 0.0,
    force_model: str | None = None,
) -> ad.AnnData:
    """
    Run CellTypist automatic annotation and write result to adata.obs['auto_cell_type'].

    (1) Infers tissue context from a quick first-pass (default model, no majority voting).
    (2) Routes model: immune-enriched -> Immune_All_Low; optionally uses tissue-specific model
        when suggested by top labels; for immune-heavy samples can add hierarchical coarse labels.
    (3) Runs final annotation with majority_voting=True and over_clustering (e.g. 'leiden'),
        then writes to obs['auto_cell_type'].

    Parameters
    ----------
    adata
        AnnData with adata.X in log-normalized form (e.g. after normalize_total + log1p).
        Should have obs[over_clustering] if majority_voting is True (e.g. from Leiden).
    majority_voting
        Use majority voting over over_clustering to refine labels.
    over_clustering
        obs column name for over-clustering (e.g. 'leiden'). Ignored if column missing.
    immune_hierarchical
        If True and sample is immune-enriched, also run Immune_All_High and store coarse
        labels in obs['auto_cell_type_coarse'].
    min_prop
        min_prop passed to celltypist.annotate when majority_voting is True.
    force_model
        If set, use this model name for the final run and skip tissue inference / routing.

    Returns
    -------
    ad.AnnData
        Same object with obs['auto_cell_type'] (and optionally obs['auto_cell_type_coarse']) set.
        uns['celltypist_inferred'] stores inference summary.
    """
    import celltypist
    from celltypist.models import Model

    if adata.X is None or adata.n_obs == 0:
        logger.warning("celltypist: skip (no data)")
        return adata

    # Optional: ensure default model is available (download if needed)
    try:
        celltypist.models.download_if_required()
    except Exception as e:
        logger.warning("celltypist download_if_required: %s", e)

    # Infer species from gene symbols (human: all-caps; mouse: title-case)
    species = _infer_species(adata)
    logger.info("celltypist: inferred species=%s", species)

    try:
        available = celltypist.models.get_all_models()
    except Exception:
        available = []

    if force_model:
        final_model = force_model
        inferred = {"species": species, "tissue_context": "forced", "suggested_model": force_model}
    else:
        # First pass: quick annotation to infer tissue (use species-appropriate model)
        try:
            if species == "mouse":
                first_model_obj = _load_model_for_species(MODEL_DEFAULT, species, available)
                first_labels = _run_annotation(
                    adata,
                    model_obj=first_model_obj,
                    majority_voting=False,
                    over_clustering=None,
                )
            else:
                first_labels = _run_annotation(
                    adata,
                    MODEL_DEFAULT,
                    majority_voting=False,
                    over_clustering=None,
                )
        except Exception as e:
            logger.warning("celltypist first-pass failed (%s); using default model with majority_voting", e)
            first_labels = None
            inferred = {"species": species, "tissue_context": "unknown", "suggested_model": MODEL_DEFAULT}
        if first_labels is not None:
            inferred = _infer_tissue_context(first_labels, species)
            inferred["species"] = species
            final_model = inferred["suggested_model"]
            logger.info(
                "celltypist inferred: species=%s immune_frac=%.2f context=%s model=%s",
                species,
                inferred["immune_frac"],
                inferred["tissue_context"],
                final_model,
            )
        else:
            final_model = MODEL_DEFAULT
            inferred = {"species": species, "tissue_context": "unknown", "suggested_model": final_model}
    if final_model not in available:
        try:
            celltypist.models.download_models(model=final_model)
            available = celltypist.models.get_all_models()
        except Exception as e:
            logger.warning("celltypist could not use model %s (%s); falling back to %s", final_model, e, MODEL_DEFAULT)
            final_model = MODEL_DEFAULT

    # Final annotation with majority voting (use converted model for mouse when immune model)
    over_clust = over_clustering if (over_clustering and over_clustering in adata.obs.columns) else None
    try:
        if species == "mouse" and final_model in (MODEL_DEFAULT, MODEL_IMMUNE_COARSE):
            final_model_obj = _load_model_for_species(final_model, species, available)
            final_labels = _run_annotation(
                adata,
                model_obj=final_model_obj,
                majority_voting=majority_voting,
                over_clustering=over_clust,
                min_prop=min_prop,
            )
        else:
            final_labels = _run_annotation(
                adata,
                final_model,
                majority_voting=majority_voting,
                over_clustering=over_clust,
                min_prop=min_prop,
            )
    except Exception as e:
        logger.exception("celltypist final annotation failed: %s", e)
        return adata

    adata.obs["auto_cell_type"] = final_labels.astype(str).values

    # Optional hierarchical: for immune-enriched, add coarse labels from Immune_All_High
    if immune_hierarchical and (force_model or inferred.get("tissue_context") == "immune_enriched"):
        if MODEL_IMMUNE_COARSE != final_model and MODEL_IMMUNE_COARSE in (available or celltypist.models.get_all_models()):
            try:
                if species == "mouse":
                    coarse_obj = _load_model_for_species(MODEL_IMMUNE_COARSE, species, available)
                    coarse_labels = _run_annotation(
                        adata,
                        model_obj=coarse_obj,
                        majority_voting=majority_voting,
                        over_clustering=over_clust,
                        min_prop=min_prop,
                    )
                else:
                    coarse_labels = _run_annotation(
                        adata,
                        MODEL_IMMUNE_COARSE,
                        majority_voting=majority_voting,
                        over_clustering=over_clust,
                        min_prop=min_prop,
                    )
                adata.obs["auto_cell_type_coarse"] = coarse_labels.astype(str).values
                logger.info("celltypist: added obs['auto_cell_type_coarse'] from %s", MODEL_IMMUNE_COARSE)
            except Exception as e:
                logger.warning("celltypist coarse (Immune_All_High) failed: %s", e)

    adata.uns["celltypist_inferred"] = inferred
    logger.info("celltypist: wrote obs['auto_cell_type'] (model=%s)", final_model)
    return adata


def _load_model_for_species(model_name: str, species: str, available: list[str] | None = None):
    """Load model and convert to mouse if species is 'mouse' and model is human immune (Immune_All_*)."""
    from celltypist.models import Model

    obj = Model.load(model_name)
    if species == "mouse" and model_name in (MODEL_DEFAULT, MODEL_IMMUNE_COARSE):
        try:
            obj.convert()  # default: human->mouse ortholog mapping
            logger.info("celltypist: converted %s to mouse", model_name)
        except Exception as e:
            logger.warning("celltypist: could not convert %s to mouse (%s); using as-is", model_name, e)
    return obj
