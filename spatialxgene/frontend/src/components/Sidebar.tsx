import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DatasetItem, DatasetMeta, ObsResponse } from "../api";
import {
  CONTINUOUS_PALETTE_IDS,
  CONTINUOUS_PALETTE_LABELS,
  CATEGORICAL_PALETTE_IDS,
  CATEGORICAL_PALETTE_LABELS,
  getCategoricalColors,
  getPaletteGradientCss,
  getCategoricalPaletteGradientCss,
  type CoexpressionPalette,
} from "../colorScale";

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
  selectedDatasetId: string | null;
  onSelectDataset: (id: string | null) => void;
  meta: DatasetMeta | null;
  genes: string[];
  obs: ObsResponse | null;
  colorMode: "gene" | "annotation" | "coexpression";
  selectedGene: string | null;
  selectedGene1: string | null;
  selectedGene2: string | null;
  selectedObsCol: string | null;
  obsValueType: "categorical" | "numeric";
  onColorByGene: (gene: string | null) => void;
  onColorByAnnotation: (col: string | null) => void;
  onColorByCoexpression: (gene1: string | null, gene2: string | null) => void;
  onColorModeChange: (mode: "gene" | "annotation" | "coexpression") => void;
  coexpressionPalette: CoexpressionPalette;
  onCoexpressionPaletteChange: (palette: CoexpressionPalette) => void;
  coexpressionLogScale: boolean;
  onCoexpressionLogScaleChange: (v: boolean) => void;
  /** Expression layer: "X" for adata.X, or a key from adata.layers (gene / co-expression mode). */
  selectedLayer: string;
  onLayerChange: (layer: string) => void;
  /** Spot size scale 0.2–1.2 (default 0.8 = 80% of defined size) */
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
  loading?: boolean;
  onObsValueTypeChange: (t: "categorical" | "numeric") => void;
};

export function Sidebar({
  datasets,
  selectedDatasetId,
  onSelectDataset,
  meta,
  genes,
  obs,
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
  loading,
  onObsValueTypeChange,
}: SidebarProps) {
  const [geneSearch, setGeneSearch] = useState("");
  const [geneSearch1, setGeneSearch1] = useState("");
  const [geneSearch2, setGeneSearch2] = useState("");
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

  const obsColumns = useMemo(() => {
    if (!obs?.columns) return [];
    return obs.columns.slice();
  }, [obs]);

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
    if (!obs || !selectedObsCol) return [];
    const valsRaw = obs.data[selectedObsCol];
    if (!valsRaw) return [];
    const vals = valsRaw.map(String);

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
      color: colorMap.get(label) ?? "#888888",
    }));
  }, [obs, selectedObsCol, categoricalPalette, continuousPaletteReverse]);

  const [paletteDropdownOpen, setPaletteDropdownOpen] = useState(false);
  const paletteDropdownRef = useRef<HTMLDivElement>(null);
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

  return (
    <div
      style={{
        width: 280,
        minWidth: 280,
        background: "#16213e",
        color: "#eee",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        borderRight: "1px solid #0f3460",
      }}
    >
      <div
        style={{
          padding: "12px 14px",
          borderBottom: "1px solid #0f3460",
          fontWeight: 600,
          fontSize: 15,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <img
          src="/favicon.svg"
          alt="SPATIALxGENE"
          style={{ width: 18, height: 18, borderRadius: 4, flexShrink: 0 }}
        />
        <span>SPATIALxGENE</span>
      </div>
      {loading && (
        <div style={{ padding: 12, fontSize: 13, color: "#888" }}>
          Loading…
        </div>
      )}
      <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 12, overflow: "auto" }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: "#a0a0a0" }}>Dataset</label>
        <select
          value={selectedDatasetId ?? ""}
          onChange={(e) => onSelectDataset(e.target.value || null)}
          style={{
            padding: "8px 10px",
            borderRadius: 6,
            border: "1px solid #0f3460",
            background: "#1a1a2e",
            color: "#eee",
            fontSize: 13,
          }}
        >
          <option value="">Select…</option>
          {datasets.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>

        {meta && (
          <>
            <div style={{ fontSize: 11, color: "#888" }}>
              {meta.n_obs.toLocaleString()} cells · {meta.n_vars.toLocaleString()} genes
            </div>
            {(meta.has_spatial || meta.has_umap || meta.has_pca || meta.has_tsne) && (
              <>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#a0a0a0" }}>Embedding</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {meta.has_spatial && (
                    <button
                      type="button"
                      onClick={() => onEmbeddingModeChange("spatial")}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 6,
                        border: "1px solid #0f3460",
                        background: embeddingMode === "spatial" ? "#e94560" : "#1a1a2e",
                        color: "#eee",
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
                        border: "1px solid #0f3460",
                        background: embeddingMode === "umap" ? "#e94560" : "#1a1a2e",
                        color: "#eee",
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
                        border: "1px solid #0f3460",
                        background: embeddingMode === "pca" ? "#e94560" : "#1a1a2e",
                        color: "#eee",
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
                        border: "1px solid #0f3460",
                        background: embeddingMode === "tsne" ? "#e94560" : "#1a1a2e",
                        color: "#eee",
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
                <label style={{ fontSize: 12, fontWeight: 600, color: "#a0a0a0" }}>Background image</label>
                <select
                  value={backgroundImageKey ?? ""}
                  onChange={(e) => onBackgroundImageKeyChange(e.target.value || null)}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 6,
                    border: "1px solid #0f3460",
                    background: "#1a1a2e",
                    color: "#eee",
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
                    <label style={{ fontSize: 12, fontWeight: 600, color: "#a0a0a0", marginTop: 6 }}>
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
                        style={{ flex: 1, accentColor: "#e94560" }}
                      />
                      <span style={{ fontSize: 11, color: "#888", minWidth: 36 }}>
                        {Math.round(backgroundOpacity * 100)}%
                      </span>
                    </div>
                  </>
                )}
              </>
            )}

            <label style={{ fontSize: 12, fontWeight: 600, color: "#a0a0a0" }}>Color by</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => onColorModeChange("annotation")}
                style={{
                  padding: "6px 10px",
                  borderRadius: 6,
                  border: "1px solid #0f3460",
                  background: colorMode === "annotation" ? "#e94560" : "#1a1a2e",
                  color: "#eee",
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
                  border: "1px solid #0f3460",
                  background: colorMode === "gene" ? "#e94560" : "#1a1a2e",
                  color: "#eee",
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
                  border: "1px solid #0f3460",
                  background: colorMode === "coexpression" ? "#e94560" : "#1a1a2e",
                  color: "#eee",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Co-expression
              </button>
            </div>

            {(colorMode === "gene" || colorMode === "coexpression") && (
              <>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#a0a0a0" }}>Layer</label>
                <select
                  value={selectedLayer}
                  onChange={(e) => onLayerChange(e.target.value)}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 6,
                    border: "1px solid #0f3460",
                    background: "#1a1a2e",
                    color: "#eee",
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
                <label style={{ fontSize: 12, fontWeight: 600, color: "#a0a0a0" }}>Annotation</label>
                <select
                  value={selectedObsCol ?? ""}
                  onChange={(e) => onColorByAnnotation(e.target.value || null)}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 6,
                    border: "1px solid #0f3460",
                    background: "#1a1a2e",
                    color: "#eee",
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
                    <label style={{ fontSize: 12, fontWeight: 600, color: "#a0a0a0", marginTop: 8 }}>
                      Variable type
                    </label>
                    <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
                      <button
                        type="button"
                        onClick={() => {
                          const { uniq } = selectedObsStats;
                          if (uniq > 50) {
                            window.alert(
                              "Too many distinct values to use as categorical (more than 50). Please use numeric mode instead."
                            );
                            return;
                          }
                          onObsValueTypeChange("categorical");
                        }}
                        style={{
                          padding: "4px 8px",
                          borderRadius: 6,
                          border: "1px solid #0f3460",
                          background: obsValueType === "categorical" ? "#e94560" : "#1a1a2e",
                          color: "#eee",
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
                          border: "1px solid #0f3460",
                          background: obsValueType === "numeric" ? "#e94560" : "#1a1a2e",
                          color: "#eee",
                          fontSize: 11,
                          cursor: "pointer",
                        }}
                      >
                        Numeric
                      </button>
                    </div>
                  </>
                )}

              </>
            )}

            {colorMode === "gene" && (
              <>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#a0a0a0" }}>Gene</label>
                <input
                  type="text"
                  placeholder="Search gene…"
                  value={geneSearch}
                  onChange={(e) => setGeneSearch(e.target.value)}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 6,
                    border: "1px solid #0f3460",
                    background: "#1a1a2e",
                    color: "#eee",
                    fontSize: 13,
                    width: "100%",
                    boxSizing: "border-box",
                  }}
                />
                <div
                  style={{
                    maxHeight: 200,
                    overflow: "auto",
                    border: "1px solid #0f3460",
                    borderRadius: 6,
                    background: "#1a1a2e",
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
                        background: selectedGene === g ? "#e94560" : "transparent",
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
                <label style={{ fontSize: 12, fontWeight: 600, color: "#a0a0a0" }}>Gene1</label>
                <input
                  type="text"
                  placeholder="Search gene…"
                  value={geneSearch1}
                  onChange={(e) => setGeneSearch1(e.target.value)}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 6,
                    border: "1px solid #0f3460",
                    background: "#1a1a2e",
                    color: "#eee",
                    fontSize: 13,
                    width: "100%",
                    boxSizing: "border-box",
                  }}
                />
                <div
                  style={{
                    maxHeight: 120,
                    overflow: "auto",
                    border: "1px solid #0f3460",
                    borderRadius: 6,
                    background: "#1a1a2e",
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
                        background: selectedGene1 === g ? "#e94560" : "transparent",
                      }}
                    >
                      {g}
                    </div>
                  ))}
                </div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#a0a0a0" }}>Gene2</label>
                <input
                  type="text"
                  placeholder="Search gene…"
                  value={geneSearch2}
                  onChange={(e) => setGeneSearch2(e.target.value)}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 6,
                    border: "1px solid #0f3460",
                    background: "#1a1a2e",
                    color: "#eee",
                    fontSize: 13,
                    width: "100%",
                    boxSizing: "border-box",
                  }}
                />
                <div
                  style={{
                    maxHeight: 120,
                    overflow: "auto",
                    border: "1px solid #0f3460",
                    borderRadius: 6,
                    background: "#1a1a2e",
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
                        background: selectedGene2 === g ? "#e94560" : "transparent",
                      }}
                    >
                      {g}
                    </div>
                  ))}
                </div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#a0a0a0" }}>Color palette</label>
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
                      style={{ width: 36, height: 28, padding: 0, border: "1px solid #0f3460", borderRadius: 4, cursor: "pointer" }}
                      title="Both low (0)"
                    />
                    <span style={{ fontSize: 9, color: "#888" }}>0</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                    <input
                      type="color"
                      value={coexpressionPalette.c10}
                      onChange={(e) =>
                        onCoexpressionPaletteChange({ ...coexpressionPalette, c10: e.target.value })
                      }
                      style={{ width: 36, height: 28, padding: 0, border: "1px solid #0f3460", borderRadius: 4, cursor: "pointer" }}
                      title="Gene1 high"
                    />
                    <span style={{ fontSize: 9, color: "#888" }}>Gene1</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                    <input
                      type="color"
                      value={coexpressionPalette.c01}
                      onChange={(e) =>
                        onCoexpressionPaletteChange({ ...coexpressionPalette, c01: e.target.value })
                      }
                      style={{ width: 36, height: 28, padding: 0, border: "1px solid #0f3460", borderRadius: 4, cursor: "pointer" }}
                      title="Gene2 high"
                    />
                    <span style={{ fontSize: 9, color: "#888" }}>Gene2</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                    <input
                      type="color"
                      value={coexpressionPalette.c11}
                      onChange={(e) =>
                        onCoexpressionPaletteChange({ ...coexpressionPalette, c11: e.target.value })
                      }
                      style={{ width: 36, height: 28, padding: 0, border: "1px solid #0f3460", borderRadius: 4, cursor: "pointer" }}
                      title="Co-expression"
                    />
                    <span style={{ fontSize: 9, color: "#888" }}>Both</span>
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

            {(colorMode === "gene" || (colorMode === "annotation" && selectedObsCol)) && (
              <>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#a0a0a0" }}>Color palette</label>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div ref={paletteDropdownRef} style={{ position: "relative", flex: 1, minWidth: 0 }}>
                    <button
                      type="button"
                      onClick={() => setPaletteDropdownOpen((o) => !o)}
                      style={{
                        width: "100%",
                        padding: "8px 10px",
                        borderRadius: 6,
                        border: "1px solid #0f3460",
                        background: "#1a1a2e",
                        color: "#eee",
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
                        style={{
                          position: "absolute",
                          top: "100%",
                          left: 0,
                          right: 0,
                          marginTop: 4,
                          maxHeight: 280,
                          overflow: "auto",
                          borderRadius: 6,
                          border: "1px solid #0f3460",
                          background: "#1a1a2e",
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
                                  ? "#0f3460"
                                  : "transparent",
                              color: "#eee",
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
                    <label style={{ fontSize: 12, fontWeight: 600, color: "#a0a0a0" }}>Color range</label>
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
                            border: "1px solid #0f3460",
                            background: "#1a1a2e",
                            color: "#eee",
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
                            border: "1px solid #0f3460",
                            background: "#1a1a2e",
                            color: "#eee",
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
                    {colorbarStats && (
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
                <label style={{ fontSize: 12, fontWeight: 600, color: "#a0a0a0", marginTop: 8 }}>
                  Annotation legend
                </label>
                <div
                  style={{
                    maxHeight: 320,
                    overflow: "auto",
                    borderRadius: 6,
                    border: "1px solid #0f3460",
                    background: "#1a1a2e",
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
                      <span style={{ color: "#eee", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {item.label}
                      </span>
                      <span style={{ color: "#888", fontSize: 10, flexShrink: 0 }}>
                        {item.count.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}

            <label style={{ fontSize: 12, fontWeight: 600, color: "#a0a0a0" }}>Spot size</label>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input
                type="range"
                min={0.2}
                max={1.2}
                step={0.05}
                value={spotSizeScale}
                onChange={(e) => onSpotSizeScaleChange(Number(e.target.value))}
                style={{ flex: 1, accentColor: "#e94560" }}
              />
              <span style={{ fontSize: 11, color: "#888", minWidth: 36 }}>
                {Math.round(spotSizeScale * 100)}%
              </span>
            </div>

            <label style={{ fontSize: 12, fontWeight: 600, color: "#a0a0a0" }}>Opacity</label>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={spotOpacity}
                onChange={(e) => onSpotOpacityChange(Number(e.target.value))}
                style={{ flex: 1, accentColor: "#e94560" }}
              />
              <span style={{ fontSize: 11, color: "#888", minWidth: 36 }}>
                {Math.round(spotOpacity * 100)}%
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
