import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { API_BASE, type DatasetItem, type DatasetMeta, type ObsResponse } from "../api";
import {
  CONTINUOUS_PALETTE_IDS,
  CONTINUOUS_PALETTE_LABELS,
  CATEGORICAL_PALETTE_IDS,
  CATEGORICAL_PALETTE_LABELS,
  getCategoricalColors,
  getPaletteGradientCss,
  getCategoricalPaletteGradientCss,
  type CoexpressionPalette,
  MULTIGENE_PALETTE_IDS,
  MULTIGENE_PALETTE_LABELS,
  MULTIGENE_PALETTE_ACCENT,
  ANNOTATION_MAX_CATEGORIES,
  ANNOTATION_MIN_CATEGORIES,
  LABEL_NAN_TOO_MANY,
  LABEL_NAN_TOO_FEW,
} from "../colorScale";

export type MultigeneGeneEntry = { gene: string; paletteId: string };

function formatExpr(v: number): string {
  if (!Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  // Very small but non-zero: keep a few decimals
  if (abs > 0 && abs < 0.001) {
    return v.toExponential(2);
  }
  const sign = v < 0 ? "-" : "";
  const n = abs;
  if (n >= 1_000_000_000) {
    return `${sign}${(n / 1_000_000_000).toFixed(2)}B`;
  }
  if (n >= 1_000_000) {
    return `${sign}${(n / 1_000_000).toFixed(2)}M`;
  }
  if (n >= 1_000) {
    return `${sign}${(n / 1_000).toFixed(2)}K`;
  }
  // Default: up to 4 decimal places, trim trailing zeros
  return Number(v.toFixed(4)).toString();
}

type SidebarProps = {
  datasets: DatasetItem[];
  /** Resolved data directory path from server (for empty-datasets hint). */
  dataDir?: string | null;
  /** One or more selected dataset ids (for single or multi-dataset comparison). */
  selectedDatasetIds: string[];
  onSelectDatasets: (ids: string[]) => void;
  /** Called when user reorders the selected dataset list (drag-and-drop). */
  onReorderDatasets?: (ids: string[]) => void;
  meta: DatasetMeta | null;
  genes: string[];
  obs: ObsResponse | null;
  /** Union of obs columns from all selected datasets (when multi-dataset). When set, used for annotation dropdown instead of obs.columns. */
  obsColumns?: string[] | null;
  /** When set, annotation legend uses these entries (e.g. global counts across samples). */
  annotationLegendEntries?: { label: string; count: number; color: string }[] | null;
  colorMode: "gene" | "annotation" | "coexpression" | "multigene";
  selectedGene: string | null;
  selectedGene1: string | null;
  selectedGene2: string | null;
  selectedObsCol: string | null;
  obsValueType: "categorical" | "numeric";
  onColorByGene: (gene: string | null) => void;
  onColorByAnnotation: (col: string | null) => void;
  onColorByCoexpression: (gene1: string | null, gene2: string | null) => void;
  onColorModeChange: (mode: "gene" | "annotation" | "coexpression" | "multigene") => void;
  coexpressionPalette: CoexpressionPalette;
  onCoexpressionPaletteChange: (palette: CoexpressionPalette) => void;
  coexpressionLogScale: boolean;
  onCoexpressionLogScaleChange: (v: boolean) => void;
  /** Multi-gene mode: list of { gene, paletteId }. Max 6 genes. */
  selectedMultigeneGenes: MultigeneGeneEntry[];
  onMultigeneGenesChange: (entries: MultigeneGeneEntry[]) => void;
  multigeneLogScale: boolean;
  onMultigeneLogScaleChange: (v: boolean) => void;
  /** Multi-gene layout: pie (round spot) or grid (square spot). */
  multigeneLayout: "pie" | "grid";
  onMultigeneLayoutChange: (layout: "pie" | "grid") => void;
  /** Multi-gene color range inputs (e.g. p0, p100) and effective values for display. */
  multigeneRangeMinInput: string;
  multigeneRangeMaxInput: string;
  onMultigeneRangeMinInputChange: (s: string) => void;
  onMultigeneRangeMaxInputChange: (s: string) => void;
  effectiveMultigeneColorMin: number | null;
  effectiveMultigeneColorMax: number | null;
  /** Expression layer: "X" for adata.X, or a key from adata.layers (gene / co-expression / multi-gene mode). */
  selectedLayer: string;
  onLayerChange: (layer: string) => void;
  /** Spot size scale 0.2–3 (default 0.8 = 80% of defined size; max 300% for UMAP) */
  spotSizeScale: number;
  onSpotSizeScaleChange: (value: number) => void;
  /** Spot opacity 0–1 (default 1) */
  spotOpacity: number;
  onSpotOpacityChange: (value: number) => void;
  /** Categorical color palette id (annotation categorical only) */
  categoricalPalette?: string;
  onCategoricalPaletteChange?: (id: string) => void;
  /** Continuous color palette id (gene mode only) */
  continuousPalette: string;
  onContinuousPaletteChange: (id: string) => void;
  /** Reverse palette direction (e.g. vlag -> vlag_r). Gene mode only. */
  continuousPaletteReverse: boolean;
  onContinuousPaletteReverseChange: (v: boolean) => void;
  /** Gene expression values (for color range; gene / numeric annotation) */
  continuousValues: number[] | null;
  /** Min range input: number or "p1"/"p99.5" for percentile */
  rangeMinInput: string;
  rangeMaxInput: string;
  onRangeMinInputChange: (s: string) => void;
  onRangeMaxInputChange: (s: string) => void;
  /** Parsed effective min/max (for display under inputs and colorbar) */
  effectiveColorMin: number | null;
  effectiveColorMax: number | null;
  logScale: boolean;
  onLogScaleChange: (v: boolean) => void;
  /** Background image key from adata (null = None) */
  backgroundImageKey: string | null;
  onBackgroundImageKeyChange: (key: string | null) => void;
  /** Background image opacity 0–1 (only in spatial embedding when image selected). */
  backgroundOpacity: number;
  onBackgroundOpacityChange: (v: number) => void;
  /** Embedding mode for plotting: spatial vs UMAP (when both exist). */
  embeddingMode: "spatial" | "umap" | "pca" | "tsne";
  onEmbeddingModeChange: (mode: "spatial" | "umap" | "pca" | "tsne") => void;
  onObsValueTypeChange: (t: "categorical" | "numeric") => void;
};

export function Sidebar({
  datasets,
  dataDir,
  selectedDatasetIds,
  onSelectDatasets,
  onReorderDatasets,
  meta,
  genes,
  obs,
  obsColumns: obsColumnsProp,
  annotationLegendEntries: annotationLegendEntriesProp,
  colorMode,
  selectedGene,
  selectedGene1,
  selectedGene2,
  selectedObsCol,
  obsValueType,
  onColorByGene,
  onColorByAnnotation,
  onColorByCoexpression,
  onColorModeChange,
  coexpressionPalette,
  onCoexpressionPaletteChange,
  coexpressionLogScale,
  onCoexpressionLogScaleChange,
  selectedMultigeneGenes,
  onMultigeneGenesChange,
  multigeneLogScale,
  onMultigeneLogScaleChange,
  multigeneLayout,
  onMultigeneLayoutChange,
  multigeneRangeMinInput,
  multigeneRangeMaxInput,
  onMultigeneRangeMinInputChange,
  onMultigeneRangeMaxInputChange,
  effectiveMultigeneColorMin,
  effectiveMultigeneColorMax,
  selectedLayer,
  onLayerChange,
  spotSizeScale,
  onSpotSizeScaleChange,
  spotOpacity,
  onSpotOpacityChange,
  categoricalPalette = "default",
  onCategoricalPaletteChange,
  continuousPalette,
  onContinuousPaletteChange,
  continuousPaletteReverse,
  onContinuousPaletteReverseChange,
  continuousValues,
  rangeMinInput,
  rangeMaxInput,
  onRangeMinInputChange,
  onRangeMaxInputChange,
  effectiveColorMin,
  effectiveColorMax,
  logScale,
  onLogScaleChange,
  backgroundImageKey,
  onBackgroundImageKeyChange,
  backgroundOpacity,
  onBackgroundOpacityChange,
  embeddingMode,
  onEmbeddingModeChange,
  onObsValueTypeChange,
}: SidebarProps) {
  const [geneSearch, setGeneSearch] = useState("");
  const [geneSearch1, setGeneSearch1] = useState("");
  const [geneSearch2, setGeneSearch2] = useState("");
  const [geneSearchMultigene, setGeneSearchMultigene] = useState("");
  const filteredGenes = useMemo(() => {
    if (!geneSearch.trim()) return genes.slice(0, 200);
    const q = geneSearch.toLowerCase();
    return genes.filter((g) => g.toLowerCase().includes(q)).slice(0, 200);
  }, [genes, geneSearch]);
  const filteredGenes1 = useMemo(() => {
    if (!geneSearch1.trim()) return genes.slice(0, 200);
    const q = geneSearch1.toLowerCase();
    return genes.filter((g) => g.toLowerCase().includes(q)).slice(0, 200);
  }, [genes, geneSearch1]);
  const filteredGenes2 = useMemo(() => {
    if (!geneSearch2.trim()) return genes.slice(0, 200);
    const q = geneSearch2.toLowerCase();
    return genes.filter((g) => g.toLowerCase().includes(q)).slice(0, 200);
  }, [genes, geneSearch2]);
  const filteredGenesMultigene = useMemo(() => {
    if (!geneSearchMultigene.trim()) return genes.slice(0, 150);
    const q = geneSearchMultigene.toLowerCase();
    return genes.filter((g) => g.toLowerCase().includes(q)).slice(0, 150);
  }, [genes, geneSearchMultigene]);
  const MULTIGENE_MAX_GENES = 6;
  const defaultPaletteForIndex = (idx: number) =>
    MULTIGENE_PALETTE_IDS[idx % MULTIGENE_PALETTE_IDS.length];

  // Prefer known cluster columns (leiden, louvain) at the top; use union from App when multi-dataset
  const obsColumns = useMemo(() => {
    if (obsColumnsProp && obsColumnsProp.length > 0) return obsColumnsProp;
    if (!obs?.columns) return [];
    const CLUSTER_COLS_FIRST = ["leiden", "louvain"];
    const cols = obs.columns.slice();
    const rest = cols.filter((c) => !CLUSTER_COLS_FIRST.includes(c));
    const first = CLUSTER_COLS_FIRST.filter((c) => cols.includes(c));
    return [...first, ...rest];
  }, [obsColumnsProp, obs]);

  const selectedObsStats = useMemo(() => {
    if (!obs || !selectedObsCol) return null;
    const vals = obs.data[selectedObsCol];
    if (!vals) return null;
    const uniq = new Set(vals.map(String)).size;
    const allNumeric = (vals as (number | string)[]).every((v) => typeof v === "number" && Number.isFinite(v));
    return { uniq, allNumeric };
  }, [obs, selectedObsCol]);

  const isNumericPaletteMode = colorMode === "gene" || (colorMode === "annotation" && obsValueType === "numeric");
  const isCategoricalPaletteMode = colorMode === "annotation" && obsValueType === "categorical" && !!selectedObsCol;

  useEffect(() => {
    if (!selectedObsCol || !selectedObsStats) return;
    const { uniq, allNumeric } = selectedObsStats;
    // Auto-infer: many unique numeric values -> numeric; otherwise categorical.
    const inferred: "categorical" | "numeric" = allNumeric && uniq > 50 ? "numeric" : "categorical";
    onObsValueTypeChange(inferred);
  }, [selectedObsCol, selectedObsStats, onObsValueTypeChange]);

  const colorbarStats = useMemo(() => {
    if (!isNumericPaletteMode || !continuousValues || continuousValues.length === 0) return null;
    let dataMin = Infinity;
    let dataMax = -Infinity;
    for (let i = 0; i < continuousValues.length; i++) {
      const v = continuousValues[i];
      if (!Number.isFinite(v)) continue;
      if (v < dataMin) dataMin = v;
      if (v > dataMax) dataMax = v;
    }
    if (dataMin === Infinity || dataMax === -Infinity) {
      dataMin = 0;
      dataMax = 1;
    }
    const lo = effectiveColorMin ?? dataMin;
    const hi = effectiveColorMax ?? dataMax;
    let mid: number;
    if (logScale) {
      const loSafe = Math.max(0, lo);
      const hiSafe = Math.max(0, hi);
      if (hiSafe <= loSafe) {
        mid = loSafe;
      } else {
        mid = Math.expm1((Math.log1p(loSafe) + Math.log1p(hiSafe)) / 2);
      }
    } else {
      mid = (lo + hi) / 2;
    }
    return { lo, mid, hi };
  }, [isNumericPaletteMode, continuousValues, effectiveColorMin, effectiveColorMax, logScale]);

  const annotationLegend = useMemo(() => {
    if (annotationLegendEntriesProp && annotationLegendEntriesProp.length > 0) return annotationLegendEntriesProp;
    if (!obs || !selectedObsCol) return [];
    const valsRaw = obs.data[selectedObsCol];
    if (!valsRaw) return [];
    const vals = valsRaw.map(String);
    const uniq = new Set(vals).size;

    // Too many or too few categories: show single "nan (too many/too few categories)" in legend, no popup
    if (obsValueType === "categorical") {
      if (uniq > ANNOTATION_MAX_CATEGORIES) {
        const colorMap = getCategoricalColors([LABEL_NAN_TOO_MANY], categoricalPalette, continuousPaletteReverse);
        return [{ label: LABEL_NAN_TOO_MANY, count: vals.length, color: colorMap.get(LABEL_NAN_TOO_MANY) ?? "var(--text-muted)" }];
      }
      if (uniq < ANNOTATION_MIN_CATEGORIES) {
        const colorMap = getCategoricalColors([LABEL_NAN_TOO_FEW], categoricalPalette, continuousPaletteReverse);
        return [{ label: LABEL_NAN_TOO_FEW, count: vals.length, color: colorMap.get(LABEL_NAN_TOO_FEW) ?? "var(--text-muted)" }];
      }
    }

    // Count spots per label
    const counts = new Map<string, number>();
    for (const v of vals) {
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }

    const colorMap = getCategoricalColors(vals, categoricalPalette, continuousPaletteReverse);
    const entries = Array.from(counts.entries());
    // Sort by count desc, then label asc for stability
    entries.sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
    });

    return entries.map(([label, count]) => ({
      label,
      count,
      color: colorMap.get(label) ?? "var(--text-muted)",
    }));
  }, [annotationLegendEntriesProp, obs, selectedObsCol, obsValueType, categoricalPalette, continuousPaletteReverse]);

  const [collapsed, setCollapsed] = useState(false);
  const [paletteDropdownOpen, setPaletteDropdownOpen] = useState(false);
  const [multigenePaletteOpenIdx, setMultigenePaletteOpenIdx] = useState<number | null>(null);
  const paletteDropdownRef = useRef<HTMLDivElement>(null);
  const multigenePaletteDropdownRef = useRef<HTMLDivElement | null>(null);
  const closePaletteDropdown = useCallback(() => setPaletteDropdownOpen(false), []);
  useEffect(() => {
    if (!paletteDropdownOpen) return;
    const handle = (e: MouseEvent) => {
      if (paletteDropdownRef.current?.contains(e.target as Node)) return;
      closePaletteDropdown();
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [paletteDropdownOpen, closePaletteDropdown]);
  useEffect(() => {
    if (multigenePaletteOpenIdx === null) return;
    const handle = (e: MouseEvent) => {
      if (multigenePaletteDropdownRef.current?.contains(e.target as Node)) return;
      setMultigenePaletteOpenIdx(null);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [multigenePaletteOpenIdx]);

  const SIDEBAR_WIDTH = 280;
  const SIDEBAR_COLLAPSED_WIDTH = 48;

  return (
    <div
      style={{
        width: collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH,
        minWidth: collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH,
        background: "var(--sidebar-bg)",
        color: "var(--text-primary)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        borderRight: "1px solid var(--sidebar-border)",
        transition: "width 0.2s ease, min-width 0.2s ease",
      }}
    >
      <div
        style={{
          padding: collapsed ? "12px 8px" : "12px 14px",
          borderBottom: "1px solid var(--sidebar-border)",
          fontWeight: 600,
          fontSize: 15,
          display: "flex",
          alignItems: "center",
          justifyContent: collapsed ? "center" : "flex-start",
          gap: 8,
          flexShrink: 0,
        }}
      >
        {collapsed ? (
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            title="Expand sidebar"
            style={{
              padding: 8,
              borderRadius: 6,
              border: "1px solid var(--sidebar-border)",
              background: "var(--bg-main)",
              color: "var(--text-primary)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        ) : (
          <>
            <img
              src={API_BASE === "." ? "./favicon.svg" : `${API_BASE}/favicon.svg`}
              alt="SPATIALxGENE"
              style={{ width: 18, height: 18, borderRadius: 4, flexShrink: 0 }}
            />
            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              SPATIALxGENE
            </span>
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              title="Collapse sidebar"
              style={{
                padding: 6,
                borderRadius: 6,
                border: "1px solid var(--sidebar-border)",
                background: "var(--bg-main)",
                color: "var(--text-primary)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
          </>
        )}
      </div>
      {!collapsed && (
      <div className="sidebar-scroll" style={{ padding: 12, display: "flex", flexDirection: "column", gap: 12, overflow: "auto", flex: 1, minHeight: 0 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Datasets</label>
          <div data-testid="dataset-list" className="sidebar-scroll" style={{ display: "flex", flexDirection: "column", gap: 4, minHeight: 100, maxHeight: 200, overflowY: "auto" }}>
          {datasets.length === 0 ? (
            <div style={{ fontSize: 11, color: "var(--text-muted)", padding: "8px 0" }}>
              No h5ad files found under {dataDir != null && dataDir !== "" ? dataDir : "(data-dir not set)"}.
            </div>
          ) : (
            datasets.map((d) => {
              const checked = selectedDatasetIds.includes(d.id);
              return (
                <label
                  key={d.id}
                  role="button"
                  data-testid="dataset-item"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    cursor: "pointer",
                    fontSize: 12,
                    color: "var(--text-primary)",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      if (checked) {
                        onSelectDatasets(selectedDatasetIds.filter((id) => id !== d.id));
                      } else {
                        onSelectDatasets([...selectedDatasetIds, d.id]);
                      }
                    }}
                  />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={d.path}>
                    {d.path}
                  </span>
                </label>
              );
            })
          )}
          </div>
        </div>

        {selectedDatasetIds.length > 1 && onReorderDatasets && (
          <>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4, flexShrink: 0 }}>Drag to reorder display</div>
            <div className="sidebar-scroll" style={{ display: "flex", flexDirection: "column", gap: 2, minHeight: 60, maxHeight: 140, overflowY: "auto", flexShrink: 0 }}>
              {selectedDatasetIds.map((id, index) => {
                const d = datasets.find((x) => x.id === id);
                const label = d ? d.path : id;
                return (
                  <div
                    key={id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", String(index));
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const fromIndex = parseInt(e.dataTransfer.getData("text/plain"), 10);
                      if (Number.isNaN(fromIndex) || fromIndex === index) return;
                      const next = [...selectedDatasetIds];
                      const [removed] = next.splice(fromIndex, 1);
                      const insertAt = fromIndex < index ? index - 1 : index;
                      next.splice(insertAt, 0, removed);
                      onReorderDatasets(next);
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "4px 6px",
                      borderRadius: 4,
                      background: "var(--sidebar-border)",
                      fontSize: 11,
                      color: "var(--text-primary)",
                      cursor: "grab",
                    }}
                  >
                    <span style={{ color: "var(--text-muted)", flexShrink: 0 }} title="Drag to reorder">
                      ⋮⋮
                    </span>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={label}>
                      {label}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {meta && (
          <>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
              {selectedDatasetIds.length > 1
                ? `${selectedDatasetIds.length} datasets`
                : `${meta.n_obs.toLocaleString()} cells · ${meta.n_vars.toLocaleString()} genes`}
            </div>
            {(meta.has_spatial || meta.has_umap || meta.has_pca || meta.has_tsne) && (
              <>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Embedding</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {meta.has_spatial && (
                    <button
                      type="button"
                      onClick={() => onEmbeddingModeChange("spatial")}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 6,
                        border: "1px solid var(--sidebar-border)",
                        background: embeddingMode === "spatial" ? "var(--accent)" : "var(--bg-main)",
                        color: "var(--text-primary)",
                        fontSize: 12,
                        cursor: "pointer",
                      }}
                    >
                      Spatial
                    </button>
                  )}
                  {meta.has_umap && (
                    <button
                      type="button"
                      onClick={() => onEmbeddingModeChange("umap")}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 6,
                        border: "1px solid var(--sidebar-border)",
                        background: embeddingMode === "umap" ? "var(--accent)" : "var(--bg-main)",
                        color: "var(--text-primary)",
                        fontSize: 12,
                        cursor: "pointer",
                      }}
                    >
                      UMAP
                    </button>
                  )}
                  {meta.has_pca && (
                    <button
                      type="button"
                      onClick={() => onEmbeddingModeChange("pca")}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 6,
                        border: "1px solid var(--sidebar-border)",
                        background: embeddingMode === "pca" ? "var(--accent)" : "var(--bg-main)",
                        color: "var(--text-primary)",
                        fontSize: 12,
                        cursor: "pointer",
                      }}
                    >
                      PCA
                    </button>
                  )}
                  {meta.has_tsne && (
                    <button
                      type="button"
                      onClick={() => onEmbeddingModeChange("tsne")}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 6,
                        border: "1px solid var(--sidebar-border)",
                        background: embeddingMode === "tsne" ? "var(--accent)" : "var(--bg-main)",
                        color: "var(--text-primary)",
                        fontSize: 12,
                        cursor: "pointer",
                      }}
                    >
                      t-SNE
                    </button>
                  )}
                </div>
              </>
            )}

            {embeddingMode === "spatial" && (meta.image_keys?.length ?? 0) > 0 && (
              <>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Background image</label>
                <select
                  value={backgroundImageKey ?? ""}
                  onChange={(e) => onBackgroundImageKeyChange(e.target.value || null)}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 6,
                    border: "1px solid var(--sidebar-border)",
                    background: "var(--bg-main)",
                    color: "var(--text-primary)",
                    fontSize: 13,
                    width: "100%",
                  }}
                >
                  <option value="">None</option>
                  {(meta.image_keys ?? []).map((key) => (
                    <option key={key} value={key}>
                      {key}
                    </option>
                  ))}
                </select>
                {backgroundImageKey && (
                  <>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginTop: 6 }}>
                      Background opacity
                    </label>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={backgroundOpacity}
                        onChange={(e) => onBackgroundOpacityChange(Number(e.target.value))}
                        style={{ flex: 1, accentColor: "var(--accent)" }}
                      />
                      <span style={{ fontSize: 11, color: "var(--text-muted)", minWidth: 36 }}>
                        {Math.round(backgroundOpacity * 100)}%
                      </span>
                    </div>
                  </>
                )}
              </>
            )}

            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Color by</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => onColorModeChange("annotation")}
                style={{
                  padding: "6px 10px",
                  borderRadius: 6,
                  border: "1px solid var(--sidebar-border)",
                  background: colorMode === "annotation" ? "var(--accent)" : "var(--bg-main)",
                  color: "var(--text-primary)",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Annotation
              </button>
              <button
                type="button"
                onClick={() => onColorModeChange("gene")}
                style={{
                  padding: "6px 10px",
                  borderRadius: 6,
                  border: "1px solid var(--sidebar-border)",
                  background: colorMode === "gene" ? "var(--accent)" : "var(--bg-main)",
                  color: "var(--text-primary)",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Gene
              </button>
              <button
                type="button"
                onClick={() => onColorModeChange("coexpression")}
                style={{
                  padding: "6px 10px",
                  borderRadius: 6,
                  border: "1px solid var(--sidebar-border)",
                  background: colorMode === "coexpression" ? "var(--accent)" : "var(--bg-main)",
                  color: "var(--text-primary)",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Co-expression
              </button>
              <button
                type="button"
                onClick={() => onColorModeChange("multigene")}
                style={{
                  padding: "6px 10px",
                  borderRadius: 6,
                  border: "1px solid var(--sidebar-border)",
                  background: colorMode === "multigene" ? "var(--accent)" : "var(--bg-main)",
                  color: "var(--text-primary)",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Multi-gene
              </button>
            </div>

            {(colorMode === "gene" || colorMode === "coexpression" || colorMode === "multigene") && (
              <>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Layer</label>
                <select
                  value={selectedLayer}
                  onChange={(e) => onLayerChange(e.target.value)}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 6,
                    border: "1px solid var(--sidebar-border)",
                    background: "var(--bg-main)",
                    color: "var(--text-primary)",
                    fontSize: 13,
                    width: "100%",
                  }}
                >
                  <option value="X">X</option>
                  {(meta?.layer_keys ?? []).map((key) => (
                    <option key={key} value={key}>
                      {key}
                    </option>
                  ))}
                </select>
              </>
            )}

            {colorMode === "annotation" && (
              <>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Annotation</label>
                <select
                  value={selectedObsCol ?? ""}
                  onChange={(e) => onColorByAnnotation(e.target.value || null)}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 6,
                    border: "1px solid var(--sidebar-border)",
                    background: "var(--bg-main)",
                    color: "var(--text-primary)",
                    fontSize: 13,
                    width: "100%",
                  }}
                >
                  <option value="">Select…</option>
                  {obsColumns.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>

                {selectedObsCol && selectedObsStats && (
                  <>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginTop: 8 }}>
                      Variable type
                    </label>
                    <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
                      <button
                        type="button"
                        onClick={() => onObsValueTypeChange("categorical")}
                        style={{
                          padding: "4px 8px",
                          borderRadius: 6,
                          border: "1px solid var(--sidebar-border)",
                          background: obsValueType === "categorical" ? "var(--accent)" : "var(--bg-main)",
                          color: "var(--text-primary)",
                          fontSize: 11,
                          cursor: "pointer",
                        }}
                      >
                        Categorical
                      </button>
                      <button
                        type="button"
                        onClick={() => onObsValueTypeChange("numeric")}
                        style={{
                          padding: "4px 8px",
                          borderRadius: 6,
                          border: "1px solid var(--sidebar-border)",
                          background: obsValueType === "numeric" ? "var(--accent)" : "var(--bg-main)",
                          color: "var(--text-primary)",
                          fontSize: 11,
                          cursor: "pointer",
                        }}
                      >
                        Numerical
                      </button>
                    </div>
                  </>
                )}

              </>
            )}

            {colorMode === "gene" && (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Gene</label>
                  <span
                    title="Only the first 200 entries are shown; use search to narrow the range."
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 14,
                      height: 14,
                      borderRadius: "50%",
                      background: "var(--text-muted)",
                      color: "var(--sidebar-bg)",
                      fontSize: 10,
                      fontWeight: 700,
                      cursor: "help",
                    }}
                    aria-label="Gene list info"
                  >
                    ?
                  </span>
                </div>
                <input
                  type="text"
                  placeholder="Search gene…"
                  value={geneSearch}
                  onChange={(e) => setGeneSearch(e.target.value)}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 6,
                    border: "1px solid var(--sidebar-border)",
                    background: "var(--bg-main)",
                    color: "var(--text-primary)",
                    fontSize: 13,
                    width: "100%",
                    boxSizing: "border-box",
                  }}
                />
                <div
                  className="sidebar-scroll"
                  style={{
                    minHeight: 120,
                    maxHeight: 240,
                    overflow: "auto",
                    border: "1px solid var(--sidebar-border)",
                    borderRadius: 6,
                    background: "var(--bg-main)",
                  }}
                >
                  {filteredGenes.map((g) => (
                    <div
                      key={g}
                      onClick={() => onColorByGene(g)}
                      style={{
                        padding: "6px 10px",
                        fontSize: 12,
                        cursor: "pointer",
                        background: selectedGene === g ? "var(--accent)" : "transparent",
                      }}
                    >
                      {g}
                    </div>
                  ))}
                </div>
              </>
            )}

            {colorMode === "coexpression" && (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Gene1</label>
                  <span
                    title="Only the first 200 entries are shown; use search to narrow the range."
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 14,
                      height: 14,
                      borderRadius: "50%",
                      background: "var(--text-muted)",
                      color: "var(--sidebar-bg)",
                      fontSize: 10,
                      fontWeight: 700,
                      cursor: "help",
                    }}
                    aria-label="Gene list info"
                  >
                    ?
                  </span>
                </div>
                <input
                  type="text"
                  placeholder="Search gene…"
                  value={geneSearch1}
                  onChange={(e) => setGeneSearch1(e.target.value)}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 6,
                    border: "1px solid var(--sidebar-border)",
                    background: "var(--bg-main)",
                    color: "var(--text-primary)",
                    fontSize: 13,
                    width: "100%",
                    boxSizing: "border-box",
                  }}
                />
                <div
                  className="sidebar-scroll"
                  style={{
                    minHeight: 80,
                    maxHeight: 160,
                    overflow: "auto",
                    border: "1px solid var(--sidebar-border)",
                    borderRadius: 6,
                    background: "var(--bg-main)",
                  }}
                >
                  {filteredGenes1.map((g) => (
                    <div
                      key={g}
                      onClick={() => onColorByCoexpression(g, selectedGene2)}
                      style={{
                        padding: "6px 10px",
                        fontSize: 12,
                        cursor: "pointer",
                        background: selectedGene1 === g ? "var(--accent)" : "transparent",
                      }}
                    >
                      {g}
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Gene2</label>
                  <span
                    title="Only the first 200 entries are shown; use search to narrow the range."
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 14,
                      height: 14,
                      borderRadius: "50%",
                      background: "var(--text-muted)",
                      color: "var(--sidebar-bg)",
                      fontSize: 10,
                      fontWeight: 700,
                      cursor: "help",
                    }}
                    aria-label="Gene list info"
                  >
                    ?
                  </span>
                </div>
                <input
                  type="text"
                  placeholder="Search gene…"
                  value={geneSearch2}
                  onChange={(e) => setGeneSearch2(e.target.value)}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 6,
                    border: "1px solid var(--sidebar-border)",
                    background: "var(--bg-main)",
                    color: "var(--text-primary)",
                    fontSize: 13,
                    width: "100%",
                    boxSizing: "border-box",
                  }}
                />
                <div
                  className="sidebar-scroll"
                  style={{
                    minHeight: 80,
                    maxHeight: 160,
                    overflow: "auto",
                    border: "1px solid var(--sidebar-border)",
                    borderRadius: 6,
                    background: "var(--bg-main)",
                  }}
                >
                  {filteredGenes2.map((g) => (
                    <div
                      key={g}
                      onClick={() => onColorByCoexpression(selectedGene1, g)}
                      style={{
                        padding: "6px 10px",
                        fontSize: 12,
                        cursor: "pointer",
                        background: selectedGene2 === g ? "var(--accent)" : "transparent",
                      }}
                    >
                      {g}
                    </div>
                  ))}
                </div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Color palette</label>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 4,
                    width: "100%",
                    maxWidth: 160,
                  }}
                  title="Four corners: 0 (both low), Gene1, Gene2, Co-expression"
                >
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                    <input
                      type="color"
                      value={coexpressionPalette.c00}
                      onChange={(e) =>
                        onCoexpressionPaletteChange({ ...coexpressionPalette, c00: e.target.value })
                      }
                      style={{ width: 36, height: 28, padding: 0, border: "1px solid var(--sidebar-border)", borderRadius: 4, cursor: "pointer" }}
                      title="Both low (0)"
                    />
                    <span style={{ fontSize: 9, color: "var(--text-muted)" }}>0</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                    <input
                      type="color"
                      value={coexpressionPalette.c10}
                      onChange={(e) =>
                        onCoexpressionPaletteChange({ ...coexpressionPalette, c10: e.target.value })
                      }
                      style={{ width: 36, height: 28, padding: 0, border: "1px solid var(--sidebar-border)", borderRadius: 4, cursor: "pointer" }}
                      title="Gene1 high"
                    />
                    <span style={{ fontSize: 9, color: "var(--text-muted)" }}>Gene1</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                    <input
                      type="color"
                      value={coexpressionPalette.c01}
                      onChange={(e) =>
                        onCoexpressionPaletteChange({ ...coexpressionPalette, c01: e.target.value })
                      }
                      style={{ width: 36, height: 28, padding: 0, border: "1px solid var(--sidebar-border)", borderRadius: 4, cursor: "pointer" }}
                      title="Gene2 high"
                    />
                    <span style={{ fontSize: 9, color: "var(--text-muted)" }}>Gene2</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                    <input
                      type="color"
                      value={coexpressionPalette.c11}
                      onChange={(e) =>
                        onCoexpressionPaletteChange({ ...coexpressionPalette, c11: e.target.value })
                      }
                      style={{ width: 36, height: 28, padding: 0, border: "1px solid var(--sidebar-border)", borderRadius: 4, cursor: "pointer" }}
                      title="Co-expression"
                    />
                    <span style={{ fontSize: 9, color: "var(--text-muted)" }}>Both</span>
                  </div>
                </div>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 12,
                    color: "#ccc",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={coexpressionLogScale}
                    onChange={(e) => onCoexpressionLogScaleChange(e.target.checked)}
                    style={{ cursor: "pointer" }}
                  />
                  Log scale
                </label>
              </>
            )}

            {colorMode === "multigene" && (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
                    Genes (dots per spot by expression)
                  </label>
                  <span
                    title="Only the first 200 entries are shown; use search to narrow the range."
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 14,
                      height: 14,
                      borderRadius: "50%",
                      background: "var(--text-muted)",
                      color: "var(--sidebar-bg)",
                      fontSize: 10,
                      fontWeight: 700,
                      cursor: "help",
                    }}
                    aria-label="Gene list info"
                  >
                    ?
                  </span>
                </div>
                {selectedMultigeneGenes.map((entry, idx) => (
                  <div
                    key={`${entry.gene}-${idx}`}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 130px 24px",
                      alignItems: "center",
                      gap: 6,
                      marginBottom: 6,
                      padding: "6px 8px",
                      background: "var(--sidebar-border)",
                      borderRadius: 6,
                    }}
                  >
                    <span style={{ minWidth: 0, fontSize: 12, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {entry.gene}
                    </span>
                    <div
                      ref={multigenePaletteOpenIdx === idx ? multigenePaletteDropdownRef : undefined}
                      style={{ position: "relative", minWidth: 0 }}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setMultigenePaletteOpenIdx((prev) => (prev === idx ? null : idx))
                        }
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          width: "100%",
                          padding: "4px 6px",
                          borderRadius: 4,
                          border: "1px solid var(--sidebar-border)",
                          background: "var(--bg-main)",
                          color: "var(--text-primary)",
                          fontSize: 11,
                          cursor: "pointer",
                          textAlign: "left",
                        }}
                      >
                        <span
                          style={{
                            width: 16,
                            height: 16,
                            borderRadius: 3,
                            background: MULTIGENE_PALETTE_ACCENT[entry.paletteId] ?? "var(--text-muted)",
                            border: "1px solid #555",
                            flexShrink: 0,
                          }}
                        />
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                          {MULTIGENE_PALETTE_LABELS[entry.paletteId] ?? entry.paletteId}
                        </span>
                      </button>
                      {multigenePaletteOpenIdx === idx && (
                        <div
                          className="sidebar-scroll"
                          style={{
                            position: "absolute",
                            top: "100%",
                            left: 0,
                            right: 0,
                            marginTop: 2,
                            maxHeight: 200,
                            overflow: "auto",
                            borderRadius: 4,
                            border: "1px solid var(--sidebar-border)",
                            background: "var(--bg-main)",
                            zIndex: 100,
                            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                          }}
                        >
                          {MULTIGENE_PALETTE_IDS.map((id) => (
                            <button
                              key={id}
                              type="button"
                              onClick={() => {
                                const next = [...selectedMultigeneGenes];
                                next[idx] = { ...next[idx], paletteId: id };
                                onMultigeneGenesChange(next);
                                setMultigenePaletteOpenIdx(null);
                              }}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                width: "100%",
                                padding: "6px 8px",
                                border: "none",
                                background: entry.paletteId === id ? "var(--sidebar-border)" : "transparent",
                                color: "var(--text-primary)",
                                fontSize: 11,
                                cursor: "pointer",
                                textAlign: "left",
                              }}
                            >
                              <span
                                style={{
                                  width: 16,
                                  height: 16,
                                  borderRadius: 3,
                                  background: MULTIGENE_PALETTE_ACCENT[id] ?? "var(--text-muted)",
                                  border: "1px solid #555",
                                  flexShrink: 0,
                                }}
                              />
                              {MULTIGENE_PALETTE_LABELS[id] ?? id}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onMultigeneGenesChange(selectedMultigeneGenes.filter((_, i) => i !== idx));
                      }}
                      title="Remove"
                      style={{
                        flexShrink: 0,
                        width: 24,
                        height: 24,
                        padding: 0,
                        borderRadius: 4,
                        border: "1px solid #555",
                        background: "#333",
                        color: "#ccc",
                        fontSize: 14,
                        lineHeight: 1,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
                {selectedMultigeneGenes.length < MULTIGENE_MAX_GENES && (
                  <>
                    <input
                      type="text"
                      placeholder="Search gene to add…"
                      value={geneSearchMultigene}
                      onChange={(e) => setGeneSearchMultigene(e.target.value)}
                      style={{
                        padding: "6px 8px",
                        borderRadius: 6,
                        border: "1px solid var(--sidebar-border)",
                        background: "var(--bg-main)",
                        color: "var(--text-primary)",
                        fontSize: 12,
                        width: "100%",
                        boxSizing: "border-box",
                      }}
                    />
                    <div
                      className="sidebar-scroll"
                      style={{
                        minHeight: 80,
                        maxHeight: 160,
                        overflow: "auto",
                        border: "1px solid var(--sidebar-border)",
                        borderRadius: 6,
                        background: "var(--bg-main)",
                      }}
                    >
                      {filteredGenesMultigene.map((g) => (
                        <div
                          key={g}
                          onClick={() => {
                            const already = selectedMultigeneGenes.some((e) => e.gene === g);
                            if (already) return;
                            onMultigeneGenesChange([
                              ...selectedMultigeneGenes,
                              { gene: g, paletteId: defaultPaletteForIndex(selectedMultigeneGenes.length) },
                            ]);
                            setGeneSearchMultigene("");
                          }}
                          style={{
                            padding: "6px 10px",
                            fontSize: 12,
                            cursor: "pointer",
                            background: selectedMultigeneGenes.some((e) => e.gene === g) ? "#333" : "transparent",
                            color: selectedMultigeneGenes.some((e) => e.gene === g) ? "var(--text-muted)" : "var(--text-primary)",
                          }}
                        >
                          {g}
                        </div>
                      ))}
                    </div>
                  </>
                )}
                {selectedMultigeneGenes.length > 0 && (
                  <>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Color range</label>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "nowrap" }}>
                      {(() => {
                        const isPercentile = (s: string) => /^p\d+(\.\d+)?$/i.test(String(s).trim());
                        const showEffectiveNumbers =
                          !isPercentile(multigeneRangeMinInput) || !isPercentile(multigeneRangeMaxInput);
                        return (
                          <>
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
                              <input
                                type="text"
                                placeholder="p0 / number"
                                value={multigeneRangeMinInput}
                                onChange={(e) => onMultigeneRangeMinInputChange(e.target.value)}
                                style={{
                                  width: 64,
                                  padding: "4px 6px",
                                  borderRadius: 4,
                                  border: "1px solid var(--sidebar-border)",
                                  background: "var(--bg-main)",
                                  color: "var(--text-primary)",
                                  fontSize: 12,
                                }}
                              />
                              <span style={{ fontSize: 10, color: "#666" }}>
                                {showEffectiveNumbers
                                  ? effectiveMultigeneColorMin != null
                                    ? formatExpr(effectiveMultigeneColorMin)
                                    : "—"
                                  : ""}
                              </span>
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
                              <input
                                type="text"
                                placeholder="p100 / number"
                                value={multigeneRangeMaxInput}
                                onChange={(e) => onMultigeneRangeMaxInputChange(e.target.value)}
                                style={{
                                  width: 64,
                                  padding: "4px 6px",
                                  borderRadius: 4,
                                  border: "1px solid var(--sidebar-border)",
                                  background: "var(--bg-main)",
                                  color: "var(--text-primary)",
                                  fontSize: 12,
                                }}
                              />
                              <span style={{ fontSize: 10, color: "#666" }}>
                                {showEffectiveNumbers
                                  ? effectiveMultigeneColorMax != null
                                    ? formatExpr(effectiveMultigeneColorMax)
                                    : "—"
                                  : ""}
                              </span>
                            </div>
                          </>
                        );
                      })()}
                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          fontSize: 12,
                          color: "#ccc",
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={multigeneLogScale}
                          onChange={(e) => onMultigeneLogScaleChange(e.target.checked)}
                          style={{ cursor: "pointer" }}
                        />
                        Log scale
                      </label>
                    </div>
                  </>
                )}
              </>
            )}

            {(colorMode === "gene" || (colorMode === "annotation" && selectedObsCol)) && (
              <>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Color palette</label>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div ref={paletteDropdownRef} style={{ position: "relative", flex: 1, minWidth: 0 }}>
                    <button
                      type="button"
                      onClick={() => setPaletteDropdownOpen((o) => !o)}
                      style={{
                        width: "100%",
                        padding: "8px 10px",
                        borderRadius: 6,
                        border: "1px solid var(--sidebar-border)",
                        background: "var(--bg-main)",
                        color: "var(--text-primary)",
                        fontSize: 13,
                        textAlign: "left",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                      }}
                    >
                      <span
                        style={{
                          flex: "0 0 80px",
                          height: 14,
                          borderRadius: 3,
                          background: isCategoricalPaletteMode
                            ? getCategoricalPaletteGradientCss(categoricalPalette, continuousPaletteReverse)
                            : getPaletteGradientCss(continuousPalette, continuousPaletteReverse),
                          border: "1px solid #333",
                        }}
                        title={
                          isCategoricalPaletteMode
                            ? CATEGORICAL_PALETTE_LABELS[categoricalPalette] ?? categoricalPalette
                            : CONTINUOUS_PALETTE_LABELS[continuousPalette] ?? continuousPalette
                        }
                      />
                      <span style={{ flex: 1 }}>
                        {isCategoricalPaletteMode
                          ? CATEGORICAL_PALETTE_LABELS[categoricalPalette] ?? categoricalPalette
                          : CONTINUOUS_PALETTE_LABELS[continuousPalette] ?? continuousPalette}
                      </span>
                    </button>
                    {paletteDropdownOpen && (
                      <div
                        className="sidebar-scroll"
                        style={{
                          position: "absolute",
                          top: "100%",
                          left: 0,
                          right: 0,
                          marginTop: 4,
                          maxHeight: 280,
                          overflow: "auto",
                          borderRadius: 6,
                          border: "1px solid var(--sidebar-border)",
                          background: "var(--bg-main)",
                          zIndex: 100,
                          boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                        }}
                      >
                        {(isCategoricalPaletteMode ? CATEGORICAL_PALETTE_IDS : CONTINUOUS_PALETTE_IDS).map((id) => (
                          <button
                            key={id}
                            type="button"
                            onClick={() => {
                              if (isCategoricalPaletteMode) {
                                onCategoricalPaletteChange?.(id);
                              } else {
                                onContinuousPaletteChange(id);
                              }
                              setPaletteDropdownOpen(false);
                            }}
                            style={{
                              width: "100%",
                              padding: "8px 10px",
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                              border: "none",
                              background:
                                (!isCategoricalPaletteMode && id === continuousPalette) ||
                                (isCategoricalPaletteMode && id === categoricalPalette)
                                  ? "var(--sidebar-border)"
                                  : "transparent",
                              color: "var(--text-primary)",
                              fontSize: 12,
                              cursor: "pointer",
                              textAlign: "left",
                            }}
                          >
                            <span
                              style={{
                                flex: "0 0 80px",
                                height: 12,
                                borderRadius: 2,
                                background: isCategoricalPaletteMode
                                  ? getCategoricalPaletteGradientCss(id)
                                  : getPaletteGradientCss(id),
                                border: "1px solid #333",
                              }}
                            />
                            <span>
                              {isCategoricalPaletteMode
                                ? CATEGORICAL_PALETTE_LABELS[id] ?? id
                                : CONTINUOUS_PALETTE_LABELS[id] ?? id}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 12,
                      color: "#ccc",
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={continuousPaletteReverse}
                      onChange={(e) => onContinuousPaletteReverseChange(e.target.checked)}
                      style={{ cursor: "pointer" }}
                    />
                    Reverse
                  </label>
                </div>

                {isNumericPaletteMode && continuousValues && continuousValues.length > 0 && (
                  <>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Color range</label>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "nowrap" }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
                        <input
                          type="text"
                          placeholder="p0 / number"
                          value={rangeMinInput}
                          onChange={(e) => onRangeMinInputChange(e.target.value)}
                          style={{
                            width: 64,
                            padding: "4px 6px",
                            borderRadius: 4,
                            border: "1px solid var(--sidebar-border)",
                            background: "var(--bg-main)",
                            color: "var(--text-primary)",
                            fontSize: 12,
                          }}
                        />
                        <span style={{ fontSize: 10, color: "#666" }}>
                          {effectiveColorMin != null ? formatExpr(effectiveColorMin) : "—"}
                        </span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
                        <input
                          type="text"
                          placeholder="p100 / number"
                          value={rangeMaxInput}
                          onChange={(e) => onRangeMaxInputChange(e.target.value)}
                          style={{
                            width: 64,
                            padding: "4px 6px",
                            borderRadius: 4,
                            border: "1px solid var(--sidebar-border)",
                            background: "var(--bg-main)",
                            color: "var(--text-primary)",
                            fontSize: 12,
                          }}
                        />
                        <span style={{ fontSize: 10, color: "#666" }}>
                          {effectiveColorMax != null ? formatExpr(effectiveColorMax) : "—"}
                        </span>
                      </div>
                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          fontSize: 12,
                          color: "#ccc",
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={logScale}
                          onChange={(e) => onLogScaleChange(e.target.checked)}
                          style={{ cursor: "pointer" }}
                        />
                        Log scale
                      </label>
                    </div>
                    {colorbarStats && selectedDatasetIds.length <= 1 && (
                      <div style={{ marginTop: 4, width: "100%" }}>
                        <div
                          style={{
                            height: 10,
                            borderRadius: 3,
                            background: getPaletteGradientCss(continuousPalette, continuousPaletteReverse),
                            border: "1px solid #333",
                          }}
                        />
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            fontSize: 10,
                            color: "#666",
                            marginTop: 2,
                          }}
                        >
                          <span>{formatExpr(colorbarStats.lo)}</span>
                          <span>{formatExpr(colorbarStats.mid)}</span>
                          <span>{formatExpr(colorbarStats.hi)}</span>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </>
            )}

            {colorMode === "annotation" && obsValueType === "categorical" && annotationLegend.length > 0 && (
              <>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginTop: 8 }}>
                  Annotation legend
                </label>
                <div
                  className="sidebar-scroll"
                  style={{
                    minHeight: 100,
                    maxHeight: 320,
                    overflow: "auto",
                    borderRadius: 6,
                    border: "1px solid var(--sidebar-border)",
                    background: "var(--bg-main)",
                    padding: "4px 6px",
                    marginTop: 4,
                  }}
                >
                  {annotationLegend.map((item) => (
                    <div
                      key={item.label}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        fontSize: 11,
                        padding: "1px 0",
                      }}
                    >
                      <span
                        style={{
                          width: 12,
                          height: 12,
                          borderRadius: 2,
                          background: item.color,
                          border: "1px solid #333",
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ color: "var(--text-primary)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {item.label}
                      </span>
                      <span style={{ color: "var(--text-muted)", fontSize: 10, flexShrink: 0 }}>
                        {item.count.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {colorMode === "multigene" && (
              <>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Layout</label>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-secondary)", cursor: "pointer" }}>
                    <input
                      type="radio"
                      name="multigeneLayout"
                      checked={multigeneLayout === "pie"}
                      onChange={() => onMultigeneLayoutChange("pie")}
                      style={{ accentColor: "var(--accent)" }}
                    />
                    <span>Pie (round)</span>
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-secondary)", cursor: "pointer" }}>
                    <input
                      type="radio"
                      name="multigeneLayout"
                      checked={multigeneLayout === "grid"}
                      onChange={() => onMultigeneLayoutChange("grid")}
                      style={{ accentColor: "var(--accent)" }}
                    />
                    <span>Grid (square)</span>
                  </label>
                </div>
              </>
            )}
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Spot size</label>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input
                type="range"
                min={0.2}
                max={3}
                step={0.05}
                value={spotSizeScale}
                onChange={(e) => onSpotSizeScaleChange(Number(e.target.value))}
                style={{ flex: 1, accentColor: "var(--accent)" }}
              />
              <span style={{ fontSize: 11, color: "var(--text-muted)", minWidth: 36 }}>
                {Math.round(spotSizeScale * 100)}%
              </span>
            </div>

            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Opacity</label>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={spotOpacity}
                onChange={(e) => onSpotOpacityChange(Number(e.target.value))}
                style={{ flex: 1, accentColor: "var(--accent)" }}
              />
              <span style={{ fontSize: 11, color: "var(--text-muted)", minWidth: 36 }}>
                {Math.round(spotOpacity * 100)}%
              </span>
            </div>
          </>
        )}
      </div>
      )}
    </div>
  );
}
