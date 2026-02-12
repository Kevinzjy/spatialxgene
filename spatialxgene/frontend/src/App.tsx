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

/** Parse color range input: "p1" / "p99.5" → percentile value; "0.5" / "100" → raw number. */
function parseRangeInput(str: string, values: number[] | null): number | null {
  if (!values || values.length === 0) return null;
  const s = str.trim().toLowerCase();
  if (s === "") return null;
  if (s.startsWith("p")) {
    const num = parseFloat(s.slice(1));
    if (!Number.isFinite(num) || num < 0 || num > 100) return null;
    return percentile(values, num);
  }
  const num = parseFloat(str.trim());
  if (!Number.isFinite(num)) return null;
  return num;
}
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
  const [obsValueType, setObsValueType] = useState<"categorical" | "numeric">("categorical");
  const [spotSizeScale, setSpotSizeScale] = useState(SPOT_SIZE_DEFAULT_SCALE);
  const [spotOpacity, setSpotOpacity] = useState(1);
  const [continuousPalette, setContinuousPalette] = useState(DEFAULT_CONTINUOUS_PALETTE);
  const [categoricalPalette, setCategoricalPalette] = useState<string>("default");
  const [continuousPaletteReverse, setContinuousPaletteReverse] = useState(false);
  const [logScale, setLogScale] = useState(false);
  const [rangeMinInput, setRangeMinInput] = useState("p0");
  const [rangeMaxInput, setRangeMaxInput] = useState("p100");
  const [backgroundImageKey, setBackgroundImageKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [embeddingMode, setEmbeddingMode] = useState<"spatial" | "umap" | "pca" | "tsne">("spatial");
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
      setObsValueType("categorical");
      setRangeMinInput("p0");
      setRangeMaxInput("p100");
      setBackgroundImageKey(null);
      // Default embedding: prefer spatial, then UMAP, then PCA, then t-SNE.
      const hasSpatial = metaRes.has_spatial ?? metaRes.layout === "spatial";
      const hasUmap = metaRes.has_umap ?? metaRes.layout === "umap";
      const hasPca = metaRes.has_pca ?? metaRes.layout === "pca";
      const hasTsne = metaRes.has_tsne ?? metaRes.layout === "tsne";
      if (hasSpatial) {
        setEmbeddingMode("spatial");
      } else if (hasUmap) {
        setEmbeddingMode("umap");
      } else if (hasPca) {
        setEmbeddingMode("pca");
      } else if (hasTsne) {
        setEmbeddingMode("tsne");
      } else if (metaRes.layout === "umap") {
        setEmbeddingMode("umap");
      } else if (metaRes.layout === "pca") {
        setEmbeddingMode("pca");
      } else if (metaRes.layout === "tsne") {
        setEmbeddingMode("tsne");
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
      setObsValueType("categorical");
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
      return obsValueType === "numeric" ? "continuous" : "categorical";
    }
    if (colorMode === "gene" && expression && expression.length === spatial.x.length) {
      return "continuous";
    }
    return "none";
  }, [spatial, colorMode, selectedObsCol, obs, expression, obsValueType]);
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

  const continuousValues: number[] | null = React.useMemo(() => {
    if (colorMode === "gene") {
      return expression;
    }
    if (colorMode === "annotation" && obsValueType === "numeric" && selectedObsCol && obs?.data[selectedObsCol]) {
      const vals = obs.data[selectedObsCol] as (number | string)[];
      const nums = vals
        .map((v) => (typeof v === "number" ? v : Number(v)))
        .filter((v) => Number.isFinite(v)) as number[];
      return nums.length === vals.length ? (nums as number[]) : null;
    }
    return null;
  }, [colorMode, obsValueType, selectedObsCol, obs, expression]);

  const continuousColorRange = React.useMemo(() => {
    if (!continuousValues || continuousValues.length === 0) return null;
    const lo = parseRangeInput(rangeMinInput, continuousValues);
    const hi = parseRangeInput(rangeMaxInput, continuousValues);
    const dataMin = Math.min(...continuousValues.filter((v) => Number.isFinite(v)));
    const dataMax = Math.max(...continuousValues.filter((v) => Number.isFinite(v)));
    const colorMin = lo ?? dataMin;
    const colorMax = hi ?? dataMax;
    return {
      colorMin: Math.min(colorMin, colorMax),
      colorMax: Math.max(colorMin, colorMax),
    };
  }, [continuousValues, rangeMinInput, rangeMaxInput]);

  const handleEmbeddingModeChange = useCallback(
    async (mode: "spatial" | "umap" | "pca" | "tsne") => {
      if (!selectedDatasetId || !meta) return;
      if (mode === embeddingMode) return;
      if (mode === "spatial" && !(meta.has_spatial ?? meta.layout === "spatial")) return;
      if (mode === "umap" && !(meta.has_umap ?? false)) return;
      if (mode === "pca" && !(meta.has_pca ?? false)) return;
      if (mode === "tsne" && !(meta.has_tsne ?? false)) return;
      setEmbeddingMode(mode);
      // When switching to UMAP, background image is not applicable.
      if (mode !== "spatial") {
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
    <div style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>
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
        obsValueType={obsValueType}
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
        categoricalPalette={categoricalPalette}
        onCategoricalPaletteChange={setCategoricalPalette}
        continuousPalette={continuousPalette}
        onContinuousPaletteChange={setContinuousPalette}
        continuousPaletteReverse={continuousPaletteReverse}
        onContinuousPaletteReverseChange={setContinuousPaletteReverse}
        continuousValues={continuousValues}
        rangeMinInput={rangeMinInput}
        rangeMaxInput={rangeMaxInput}
        onRangeMinInputChange={setRangeMinInput}
        onRangeMaxInputChange={setRangeMaxInput}
        effectiveColorMin={continuousColorRange?.colorMin ?? null}
        effectiveColorMax={continuousColorRange?.colorMax ?? null}
        logScale={logScale}
        onLogScaleChange={setLogScale}
        backgroundImageKey={backgroundImageKey}
        onBackgroundImageKeyChange={setBackgroundImageKey}
        embeddingMode={embeddingMode}
        onEmbeddingModeChange={handleEmbeddingModeChange}
        loading={loading}
        onObsValueTypeChange={setObsValueType}
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
            categoricalPalette={categoricalPalette}
            categoricalPaletteReverse={continuousPaletteReverse}
            continuousPalette={continuousPalette}
            continuousPaletteReverse={continuousPaletteReverse}
            logScale={logScale}
            colorMin={plotColorMode === "continuous" ? continuousColorRange?.colorMin : undefined}
            colorMax={plotColorMode === "continuous" ? continuousColorRange?.colorMax : undefined}
            backgroundImageUrl={
              selectedDatasetId && backgroundImageKey
                ? datasetImageUrl(selectedDatasetId, backgroundImageKey)
                : null
            }
            backgroundImageBounds={backgroundImageBounds}
            hoverAnnotationName={colorMode === "annotation" && obsValueType === "categorical" ? selectedObsCol : null}
            hoverAnnotationValues={
              colorMode === "annotation" &&
              obsValueType === "categorical" &&
              selectedObsCol &&
              obs?.data[selectedObsCol]
                ? obs.data[selectedObsCol]
                : null
            }
            hoverGeneName={
              plotColorMode === "continuous"
                ? colorMode === "gene"
                  ? selectedGene
                  : selectedObsCol
                : null
            }
            hoverGeneValues={
              plotColorMode === "continuous"
                ? colorMode === "gene"
                  ? expression
                  : selectedObsCol && obs?.data[selectedObsCol]
                    ? (obs.data[selectedObsCol] as number[])
                    : null
                : null
            }
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
