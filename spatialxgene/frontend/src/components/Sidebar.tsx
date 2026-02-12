import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DatasetItem, DatasetMeta, ObsResponse } from "../api";
import {
  CONTINUOUS_PALETTE_IDS,
  CONTINUOUS_PALETTE_LABELS,
  getPaletteGradientCss,
} from "../colorScale";
import { percentile } from "../utils/percentile";

function formatExpr(v: number): string {
  if (!Number.isFinite(v)) return "—";
  if (Math.abs(v) >= 1000 || (Math.abs(v) < 0.01 && v !== 0)) return v.toExponential(2);
  return Number(v.toFixed(4)).toString();
}

type SidebarProps = {
  datasets: DatasetItem[];
  selectedDatasetId: string | null;
  onSelectDataset: (id: string | null) => void;
  meta: DatasetMeta | null;
  genes: string[];
  obs: ObsResponse | null;
  colorMode: "gene" | "annotation";
  selectedGene: string | null;
  selectedObsCol: string | null;
  onColorByGene: (gene: string | null) => void;
  onColorByAnnotation: (col: string | null) => void;
  onColorModeChange: (mode: "gene" | "annotation") => void;
  /** Spot size scale 0.2–1.2 (default 0.8 = 80% of defined size) */
  spotSizeScale: number;
  onSpotSizeScaleChange: (value: number) => void;
  /** Spot opacity 0–1 (default 1) */
  spotOpacity: number;
  onSpotOpacityChange: (value: number) => void;
  /** Continuous color palette id (gene mode only) */
  continuousPalette: string;
  onContinuousPaletteChange: (id: string) => void;
  /** Reverse palette direction (e.g. vlag -> vlag_r). Gene mode only. */
  continuousPaletteReverse: boolean;
  onContinuousPaletteReverseChange: (v: boolean) => void;
  /** Gene expression values (for percentile color range; gene mode only) */
  expression: number[] | null;
  percentileMin: number;
  percentileMax: number;
  onPercentileMinChange: (p: number) => void;
  onPercentileMaxChange: (p: number) => void;
  /** Background image key from adata (null = None) */
  backgroundImageKey: string | null;
  onBackgroundImageKeyChange: (key: string | null) => void;
  loading?: boolean;
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
  selectedObsCol,
  onColorByGene,
  onColorByAnnotation,
  onColorModeChange,
  spotSizeScale,
  onSpotSizeScaleChange,
  spotOpacity,
  onSpotOpacityChange,
  continuousPalette,
  onContinuousPaletteChange,
  continuousPaletteReverse,
  onContinuousPaletteReverseChange,
  expression,
  percentileMin,
  percentileMax,
  onPercentileMinChange,
  onPercentileMaxChange,
  backgroundImageKey,
  onBackgroundImageKeyChange,
  loading,
}: SidebarProps) {
  const [geneSearch, setGeneSearch] = useState("");
  const filteredGenes = useMemo(() => {
    if (!geneSearch.trim()) return genes.slice(0, 200);
    const q = geneSearch.toLowerCase();
    return genes.filter((g) => g.toLowerCase().includes(q)).slice(0, 200);
  }, [genes, geneSearch]);

  const categoricalCols = useMemo(() => {
    if (!obs?.columns) return [];
    return obs.columns.filter((c) => {
      const vals = obs.data[c];
      if (!vals) return false;
      const uniq = new Set(vals.map(String));
      return uniq.size <= 50 && uniq.size >= 2;
    });
  }, [obs]);

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
      <div style={{ padding: "12px 14px", borderBottom: "1px solid #0f3460", fontWeight: 600, fontSize: 15 }}>
        Spatialxgene
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
              {(meta?.image_keys ?? []).map((key) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </select>

            <label style={{ fontSize: 12, fontWeight: 600, color: "#a0a0a0" }}>Color by</label>
            <div style={{ display: "flex", gap: 8 }}>
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
            </div>

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
                  {categoricalCols.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
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
                          background: getPaletteGradientCss(continuousPalette, continuousPaletteReverse),
                          border: "1px solid #333",
                        }}
                        title={CONTINUOUS_PALETTE_LABELS[continuousPalette] ?? continuousPalette}
                      />
                      <span style={{ flex: 1 }}>
                        {CONTINUOUS_PALETTE_LABELS[continuousPalette] ?? continuousPalette}
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
                        {CONTINUOUS_PALETTE_IDS.map((id) => (
                          <button
                            key={id}
                            type="button"
                            onClick={() => {
                              onContinuousPaletteChange(id);
                              setPaletteDropdownOpen(false);
                            }}
                            style={{
                              width: "100%",
                              padding: "8px 10px",
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                              border: "none",
                              background: id === continuousPalette ? "#0f3460" : "transparent",
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
                                background: getPaletteGradientCss(id),
                                border: "1px solid #333",
                              }}
                            />
                            <span>{CONTINUOUS_PALETTE_LABELS[id] ?? id}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#ccc", cursor: "pointer", whiteSpace: "nowrap" }}>
                    <input
                      type="checkbox"
                      checked={continuousPaletteReverse}
                      onChange={(e) => onContinuousPaletteReverseChange(e.target.checked)}
                      style={{ cursor: "pointer" }}
                    />
                    Reverse
                  </label>
                </div>

                {expression && expression.length > 0 && (
                  <>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "#a0a0a0" }}>Color range</label>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step={1}
                            value={percentileMin}
                            onChange={(e) => {
                              const v = Number(e.target.value);
                              if (!Number.isFinite(v)) return;
                              onPercentileMinChange(Math.max(0, Math.min(percentileMax - 1, Math.floor(v))));
                            }}
                            style={{
                              width: 48,
                              padding: "4px 6px",
                              borderRadius: 4,
                              border: "1px solid #0f3460",
                              background: "#1a1a2e",
                              color: "#eee",
                              fontSize: 12,
                              textAlign: "center",
                            }}
                          />
                          <span style={{ fontSize: 12, color: "#888" }}>%</span>
                        </div>
                        <span style={{ fontSize: 10, color: "#666" }}>
                          {formatExpr(percentile(expression, percentileMin))}
                        </span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step={1}
                            value={percentileMax}
                            onChange={(e) => {
                              const v = Number(e.target.value);
                              if (!Number.isFinite(v)) return;
                              onPercentileMaxChange(Math.min(100, Math.max(percentileMin + 1, Math.ceil(v))));
                            }}
                            style={{
                              width: 48,
                              padding: "4px 6px",
                              borderRadius: 4,
                              border: "1px solid #0f3460",
                              background: "#1a1a2e",
                              color: "#eee",
                              fontSize: 12,
                              textAlign: "center",
                            }}
                          />
                          <span style={{ fontSize: 12, color: "#888" }}>%</span>
                        </div>
                        <span style={{ fontSize: 10, color: "#666" }}>
                          {formatExpr(percentile(expression, percentileMax))}
                        </span>
                      </div>
                    </div>
                  </>
                )}
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
