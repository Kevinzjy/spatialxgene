import React, { useCallback, useEffect, useState } from "react";
import {
  fetchDatasets,
  fetchDatasetMeta,
  fetchSpatial,
  fetchObs,
  fetchExpression,
  fetchVarIndex,
} from "./api";
import type { DatasetItem, DatasetMeta, ObsResponse } from "./api";
import { Sidebar } from "./components/Sidebar";
import { SpatialPlot, type ColorMode } from "./components/SpatialPlot";

export default function App() {
  const [datasets, setDatasets] = useState<DatasetItem[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(null);
  const [meta, setMeta] = useState<DatasetMeta | null>(null);
  const [spatial, setSpatial] = useState<{ x: number[]; y: number[] } | null>(null);
  const [obs, setObs] = useState<ObsResponse | null>(null);
  const [genes, setGenes] = useState<string[]>([]);
  const [expression, setExpression] = useState<number[] | null>(null);
  const [colorMode, setColorMode] = useState<"gene" | "annotation">("annotation");
  const [selectedGene, setSelectedGene] = useState<string | null>(null);
  const [selectedObsCol, setSelectedObsCol] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDatasets()
      .then(setDatasets)
      .catch((e) => setError(e.message));
  }, []);

  const loadDataset = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const [metaRes, spatialRes, obsRes, varRes] = await Promise.all([
        fetchDatasetMeta(id),
        fetchSpatial(id),
        fetchObs(id),
        fetchVarIndex(id),
      ]);
      setMeta(metaRes);
      setSpatial(spatialRes);
      setObs(obsRes);
      setGenes(varRes);
      setExpression(null);
      setSelectedGene(null);
      const catCols = obsRes.columns.filter((c) => {
        const vals = obsRes.data[c];
        const uniq = new Set(vals?.map(String) ?? []);
        return uniq.size <= 50 && uniq.size >= 2;
      });
      setSelectedObsCol(catCols.includes("leiden") ? "leiden" : catCols[0] ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedDatasetId) loadDataset(selectedDatasetId);
    else {
      setMeta(null);
      setSpatial(null);
      setObs(null);
      setGenes([]);
      setExpression(null);
      setSelectedObsCol(null);
      setSelectedGene(null);
    }
  }, [selectedDatasetId, loadDataset]);

  useEffect(() => {
    if (!selectedDatasetId || !selectedGene) {
      setExpression(null);
      return;
    }
    fetchExpression(selectedDatasetId, selectedGene)
      .then(setExpression)
      .catch(() => setExpression(null));
  }, [selectedDatasetId, selectedGene]);

  const colorByValues = React.useMemo(() => {
    if (!obs || !spatial) return [];
    const n = spatial.x.length;
    if (colorMode === "annotation" && selectedObsCol && obs.data[selectedObsCol]) {
      return obs.data[selectedObsCol].slice(0, n);
    }
    if (colorMode === "gene" && expression) {
      return expression.slice(0, n);
    }
    return [];
  }, [obs, spatial, colorMode, selectedObsCol, expression]);

  const plotColorMode: ColorMode = colorMode === "annotation" ? "categorical" : "continuous";
  const bounds = meta
    ? { xMin: meta.x_min, xMax: meta.x_max, yMin: meta.y_min, yMax: meta.y_max }
    : { xMin: 0, xMax: 1, yMin: 0, yMax: 1 };

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      <Sidebar
        datasets={datasets}
        selectedDatasetId={selectedDatasetId}
        onSelectDataset={(id) => setSelectedDatasetId(id ?? null)}
        meta={meta}
        genes={genes}
        obs={obs}
        colorMode={colorMode}
        selectedGene={selectedGene}
        selectedObsCol={selectedObsCol}
        onColorByGene={(g) => {
          setSelectedGene(g);
          setColorMode("gene");
        }}
        onColorByAnnotation={(c) => {
          setSelectedObsCol(c);
          setColorMode("annotation");
        }}
        onColorModeChange={setColorMode}
        loading={loading}
      />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {error && (
          <div style={{ padding: 12, background: "#4a0a0a", color: "#ff8888", fontSize: 13 }}>
            {error}
          </div>
        )}
        {spatial && colorByValues.length === spatial.x.length ? (
          <SpatialPlot
            x={spatial.x}
            y={spatial.y}
            colorBy={colorByValues}
            colorMode={plotColorMode}
            bounds={bounds}
            title={selectedDatasetId ?? undefined}
          />
        ) : (
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "#1a1a2e",
              color: "#666",
              fontSize: 14,
            }}
          >
            {!selectedDatasetId
              ? "Select a dataset from the sidebar"
              : loading
                ? "Loading…"
                : "Select an annotation or gene to color the spatial plot"}
          </div>
        )}
      </div>
    </div>
  );
}
