import { useMemo, useState } from "react";
import type { DatasetItem, DatasetMeta, ObsResponse } from "../api";

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
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
