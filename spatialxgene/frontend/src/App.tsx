import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchConfig,
  fetchDatasets,
  fetchDatasetMeta,
  fetchSpatial,
  fetchObs,
  fetchExpression,
  fetchVarIndex,
  datasetImageUrl,
} from "./api";
import type { DatasetItem, DatasetMeta, ObsResponse } from "./api";
import { DEFAULT_CONTINUOUS_PALETTE } from "./colorScale";
import { setDebugMode, debugLog } from "./debug";
import { percentile } from "./utils/percentile";
import { Sidebar } from "./components/Sidebar";
import { SpatialPlot, SPOT_SIZE_DEFAULT_SCALE, type ColorMode } from "./components/SpatialPlot";

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
  const [spotSizeScale, setSpotSizeScale] = useState(SPOT_SIZE_DEFAULT_SCALE);
  const [spotOpacity, setSpotOpacity] = useState(1);
  const [continuousPalette, setContinuousPalette] = useState(DEFAULT_CONTINUOUS_PALETTE);
  const [continuousPaletteReverse, setContinuousPaletteReverse] = useState(false);
  const [percentileMin, setPercentileMin] = useState(0);
  const [percentileMax, setPercentileMax] = useState(100);
  const [backgroundImageKey, setBackgroundImageKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [embeddingMode, setEmbeddingMode] = useState<"spatial" | "umap">("spatial");
  const selectedIdRef = useRef<string | null>(null);
  const loadAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    selectedIdRef.current = selectedDatasetId;
  }, [selectedDatasetId]);

  useEffect(() => {
    fetchConfig().then((c) => setDebugMode(c.debug));
  }, []);

  useEffect(() => {
    fetchDatasets()
      .then(setDatasets)
      .catch((e) => setError(e.message));
  }, []);

  const loadDataset = useCallback(async (id: string) => {
    loadAbortRef.current?.abort();
    const ac = new AbortController();
    loadAbortRef.current = ac;
    const signal = ac.signal;
    debugLog("loadDataset start", { id });
    setLoading(true);
    setError(null);
    try {
      const [metaRes, spatialRes, obsRes, varRes] = await Promise.all([
        fetchDatasetMeta(id, signal),
        fetchSpatial(id, signal),
        fetchObs(id, signal),
        fetchVarIndex(id, signal),
      ]);
      if (selectedIdRef.current !== id) {
        debugLog("loadDataset stale, ignore", { id, current: selectedIdRef.current });
        return;
      }
      debugLog("loadDataset success", {
        id,
        metaId: metaRes.id,
        n_obs: metaRes.n_obs,
        n_vars: metaRes.n_vars,
        spatialLen: spatialRes.x.length,
      });
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
      setBackgroundImageKey(null);
      // Default embedding: prefer spatial when available, otherwise UMAP.
      const hasSpatial = metaRes.has_spatial ?? metaRes.layout === "spatial";
      const hasUmap = metaRes.has_umap ?? metaRes.layout === "umap";
      if (hasSpatial) {
        setEmbeddingMode("spatial");
      } else if (hasUmap) {
        setEmbeddingMode("umap");
      } else if (metaRes.layout === "umap") {
        setEmbeddingMode("umap");
      } else {
        setEmbeddingMode("spatial");
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        debugLog("loadDataset aborted", { id });
        return;
      }
      if (selectedIdRef.current !== id) {
        debugLog("loadDataset stale (error), ignore", { id, current: selectedIdRef.current });
        return;
      }
      const msg = e instanceof Error ? e.message : String(e);
      debugLog("loadDataset error", { id, error: msg });
      setError(msg);
    } finally {
      if (selectedIdRef.current === id) {
        setLoading(false);
      }
      debugLog("loadDataset done", { id, loading: selectedIdRef.current === id ? false : "(unchanged)" });
    }
  }, []);

  // Clear state when no dataset selected; load is triggered only by dropdown selection
  useEffect(() => {
    if (!selectedDatasetId) {
      debugLog("selectedDatasetId cleared, clearing state");
      setLoading(false);
      setMeta(null);
      setSpatial(null);
      setObs(null);
      setGenes([]);
      setExpression(null);
      setSelectedObsCol(null);
      setSelectedGene(null);
      setBackgroundImageKey(null);
      setEmbeddingMode("spatial");
    }
  }, [selectedDatasetId]);

  useEffect(() => {
    if (!selectedDatasetId || !selectedGene) {
      setExpression(null);
      return;
    }
    const ac = new AbortController();
    debugLog("fetchExpression", { datasetId: selectedDatasetId, gene: selectedGene });
    fetchExpression(selectedDatasetId, selectedGene, ac.signal)
      .then((arr) => {
        debugLog("fetchExpression done", { gene: selectedGene, len: arr.length });
        setExpression(arr);
      })
      .catch((e) => {
        if (e?.name === "AbortError") return;
        debugLog("fetchExpression error", { gene: selectedGene, error: String(e) });
        setExpression(null);
      });
    return () => ac.abort();
  }, [selectedDatasetId, selectedGene]);

  const colorByValues = React.useMemo(() => {
    if (!spatial) return [];
    const n = spatial.x.length;
    if (colorMode === "annotation" && selectedObsCol && obs?.data[selectedObsCol]) {
      return obs.data[selectedObsCol].slice(0, n);
    }
    if (colorMode === "gene" && expression) {
      return expression.slice(0, n);
    }
    // No annotation/gene selected: still show all points (color decided by plotColorMode).
    return new Array(n).fill(0);
  }, [obs, spatial, colorMode, selectedObsCol, expression]);

  const plotColorMode: ColorMode = React.useMemo(() => {
    if (!spatial) return "none";
    if (colorMode === "annotation" && selectedObsCol && obs?.data[selectedObsCol]) {
      return "categorical";
    }
    if (colorMode === "gene" && expression && expression.length === spatial.x.length) {
      return "continuous";
    }
    return "none";
  }, [spatial, colorMode, selectedObsCol, obs, expression]);
  const bounds = useMemo(() => {
    if (spatial && spatial.x.length > 0 && spatial.y.length === spatial.x.length) {
      let xMin = spatial.x[0];
      let xMax = spatial.x[0];
      let yMin = spatial.y[0];
      let yMax = spatial.y[0];
      for (let i = 1; i < spatial.x.length; i++) {
        const x = spatial.x[i];
        const y = spatial.y[i];
        if (x < xMin) xMin = x;
        if (x > xMax) xMax = x;
        if (y < yMin) yMin = y;
        if (y > yMax) yMax = y;
      }
      return { xMin, xMax, yMin, yMax };
    }
    if (meta) {
      return { xMin: meta.x_min, xMax: meta.x_max, yMin: meta.y_min, yMax: meta.y_max };
    }
    return { xMin: 0, xMax: 1, yMin: 0, yMax: 1 };
  }, [spatial, meta]);

  // Use a single reference extent (from hires) for all background images so that
  // lowres aligns with spots; lowres scalefactors may be relative to fullres.
  const backgroundImageBounds = React.useMemo(() => {
    if (!meta?.image_info || !backgroundImageKey) return null;
    const keys = meta.image_keys ?? [];
    const referenceKey = keys.includes("hires") ? "hires" : keys[0];
    if (!referenceKey) return null;
    const info = meta.image_info[referenceKey];
    if (!info || info.scale_factor <= 0) return null;
    return {
      xMin: 0,
      yMin: 0,
      xMax: info.width / info.scale_factor,
      yMax: info.height / info.scale_factor,
    };
  }, [meta?.image_info, meta?.image_keys, backgroundImageKey]);

  const expressionColorRange = React.useMemo(() => {
    if (!expression || expression.length === 0) return null;
    const pMin = Math.max(0, Math.min(100, percentileMin));
    const pMax = Math.max(0, Math.min(100, percentileMax));
    const lo = Math.min(pMin, pMax);
    const hi = Math.max(pMin, pMax);
    return {
      colorMin: percentile(expression, lo),
      colorMax: percentile(expression, hi),
      percentileMin: lo,
      percentileMax: hi,
    };
  }, [expression, percentileMin, percentileMax]);

  const handleEmbeddingModeChange = useCallback(
    async (mode: "spatial" | "umap") => {
      if (!selectedDatasetId || !meta) return;
      if (mode === embeddingMode) return;
      if (mode === "spatial" && !(meta.has_spatial ?? meta.layout === "spatial")) return;
      if (mode === "umap" && !(meta.has_umap ?? false)) return;
      setEmbeddingMode(mode);
      // When switching to UMAP, background image is not applicable.
      if (mode === "umap") {
        setBackgroundImageKey(null);
      }
      try {
        const ac = new AbortController();
        const signal = ac.signal;
        debugLog("switchEmbedding", { datasetId: selectedDatasetId, mode });
        const coords = await fetchSpatial(selectedDatasetId, signal, mode);
        if (selectedIdRef.current !== selectedDatasetId) {
          return;
        }
        setSpatial(coords);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        debugLog("switchEmbedding error", { datasetId: selectedDatasetId, mode, error: msg });
        setError(msg);
      }
    },
    [selectedDatasetId, meta, embeddingMode]
  );

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      <Sidebar
        datasets={datasets}
        selectedDatasetId={selectedDatasetId}
        onSelectDataset={(id) => {
          const next = id ?? null;
          debugLog("onSelectDataset", { id, next, previous: selectedDatasetId });
          setSelectedDatasetId(next);
          if (next) {
            // When switching datasets, clear current spatial/annotation/gene state so
            // the old image does not remain visible while the new dataset is loading.
            setSpatial(null);
            setObs(null);
            setGenes([]);
            setExpression(null);
            setSelectedObsCol(null);
            setSelectedGene(null);
            setBackgroundImageKey(null);
            setSelectedGene(null);
            setExpression(null);
            loadDataset(next);
          }
        }}
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
        spotSizeScale={spotSizeScale}
        onSpotSizeScaleChange={setSpotSizeScale}
        spotOpacity={spotOpacity}
        onSpotOpacityChange={setSpotOpacity}
        continuousPalette={continuousPalette}
        onContinuousPaletteChange={setContinuousPalette}
        continuousPaletteReverse={continuousPaletteReverse}
        onContinuousPaletteReverseChange={setContinuousPaletteReverse}
        expression={expression}
        percentileMin={percentileMin}
        percentileMax={percentileMax}
        onPercentileMinChange={setPercentileMin}
        onPercentileMaxChange={setPercentileMax}
        backgroundImageKey={backgroundImageKey}
        onBackgroundImageKeyChange={setBackgroundImageKey}
        embeddingMode={embeddingMode}
        onEmbeddingModeChange={handleEmbeddingModeChange}
        loading={loading}
      />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {error && (
          <div style={{ padding: 12, background: "#4a0a0a", color: "#ff8888", fontSize: 13 }}>
            {error}
          </div>
        )}
        {loading ? (
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
            Loading dataset…
          </div>
        ) : spatial ? (
          <SpatialPlot
            x={spatial.x}
            y={spatial.y}
            colorBy={colorByValues}
            colorMode={plotColorMode}
            bounds={bounds}
            spotSizeScale={spotSizeScale}
            spotOpacity={spotOpacity}
            continuousPalette={continuousPalette}
            continuousPaletteReverse={continuousPaletteReverse}
            colorMin={colorMode === "gene" ? expressionColorRange?.colorMin : undefined}
            colorMax={colorMode === "gene" ? expressionColorRange?.colorMax : undefined}
            backgroundImageUrl={
              selectedDatasetId && backgroundImageKey
                ? datasetImageUrl(selectedDatasetId, backgroundImageKey)
                : null
            }
            backgroundImageBounds={backgroundImageBounds}
            title={
              selectedDatasetId
                ? `${selectedDatasetId}${
                    meta
                      ? embeddingMode === "umap"
                        ? " (UMAP)"
                        : " (Spatial)"
                      : ""
                  }`
                : undefined
            }
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
                : "Select an annotation or gene to color the plot"}
          </div>
        )}
      </div>
    </div>
  );
}
