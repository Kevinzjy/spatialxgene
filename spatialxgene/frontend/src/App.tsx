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

/** Per-dataset loaded data (meta, spatial, obs, genes). Used for single or multi-dataset view. */
export type LoadedDataset = {
  meta: DatasetMeta;
  spatial: { x: number[]; y: number[] };
  obs: ObsResponse;
  genes: string[];
};
import {
  DEFAULT_CONTINUOUS_PALETTE,
  DEFAULT_COEXPRESSION_PALETTE,
  coexpressionToHex,
  continuousToRgb,
  rgbToHex,
  multigeneValueToHex,
  type CoexpressionPalette,
  ANNOTATION_MAX_CATEGORIES,
  ANNOTATION_MIN_CATEGORIES,
  LABEL_NAN_TOO_MANY,
  LABEL_NAN_TOO_FEW,
  getCategoricalColors,
} from "./colorScale";
import type { VectorExportLegendEntry, MultigeneSegment } from "./exportPlotVector";
import { setDebugMode, debugLog } from "./debug";
import { percentile } from "./utils/percentile";
import { Sidebar, type MultigeneGeneEntry } from "./components/Sidebar";

const PDF_EXPORT_FILENAME = "spatialxgene-plots.pdf";

/** Multi-sample grid: minimum width/height per cell so each sample gets at least this much space. */
const MULTIPLOT_MIN_CELL_WIDTH_PX = 220;
const MULTIPLOT_MIN_CELL_HEIGHT_PX = 200;
const MULTIPLOT_GAP_PX = 8;
const MULTIPLOT_PADDING_PX = 8;

/** Load image from URL and return as data URL for embedding in PDF (raster layer). Returns null on failure/CORS. */
function loadImageAsDataUrl(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** Parse multi-gene range input: "p1"/"p99.5" → percentile; "0.5" → raw. Returns null if invalid. */
function parseMultigeneRange(
  str: string
): { type: "percentile"; p: number } | { type: "raw"; value: number } | null {
  const s = str.trim().toLowerCase();
  if (s === "") return null;
  if (s.startsWith("p")) {
    const num = parseFloat(s.slice(1));
    if (!Number.isFinite(num) || num < 0 || num > 100) return null;
    return { type: "percentile", p: num };
  }
  const num = parseFloat(str.trim());
  if (!Number.isFinite(num)) return null;
  return { type: "raw", value: num };
}

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

function finiteMinMax(arr: number[]): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (!Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (min === Infinity || max === -Infinity) {
    return { min: 0, max: 1 };
  }
  return { min, max };
}

/** Convert colorBy array to hex[] for vector export. */
function colorByToHex(
  colorBy: (string | number)[],
  mode: ColorMode,
  options: {
    catMap?: Map<string, string>;
    colorMin?: number;
    colorMax?: number;
    logScale?: boolean;
    palette?: string;
    reverse?: boolean;
  }
): string[] {
  const n = colorBy.length;
  if (mode === "categorical" && options.catMap) {
    return colorBy.map((l) => options.catMap!.get(String(l)) ?? "#888888");
  }
  if (mode === "coexpression") {
    return colorBy as string[];
  }
  if (mode === "continuous" && options.colorMin != null && options.colorMax != null) {
    const { colorMin, colorMax, logScale, palette = DEFAULT_CONTINUOUS_PALETTE, reverse = false } = options;
    const vmin = logScale ? Math.log1p(Math.max(0, colorMin)) : colorMin;
    const vmax = logScale ? Math.log1p(Math.max(0, colorMax)) : colorMax;
    return colorBy.map((v) => {
      const num = Number(v);
      const val = logScale ? Math.log1p(Math.max(0, num)) : num;
      const [r, g, b] = continuousToRgb(val, vmin, vmax, palette, reverse);
      return rgbToHex(r, g, b);
    });
  }
  return new Array(n).fill("#888888");
}

import { SpatialPlot, SPOT_SIZE_DEFAULT_SCALE, type ColorMode } from "./components/SpatialPlot";

export default function App() {
  const [datasets, setDatasets] = useState<DatasetItem[]>([]);
  /** One or more dataset ids for comparison; empty = none selected. */
  const [selectedDatasetIds, setSelectedDatasetIds] = useState<string[]>([]);
  /** Cache of loaded dataset data (meta, spatial, obs, genes) keyed by dataset id. */
  const [datasetCache, setDatasetCache] = useState<Record<string, LoadedDataset>>({});
  /** Primary slot: first selected id. Used for sidebar meta display and embedding/layer. */
  const primaryId = selectedDatasetIds[0] ?? null;
  const meta = primaryId ? datasetCache[primaryId]?.meta ?? null : null;
  const spatial = primaryId ? datasetCache[primaryId]?.spatial ?? null : null;
  const obs = primaryId ? datasetCache[primaryId]?.obs ?? null : null;
  /** Union of all genes from all selected datasets (for multi-dataset: user can pick any gene; missing in a sample → NaN). */
  const genes = useMemo(() => {
    if (selectedDatasetIds.length === 0) return [];
    const set = new Set<string>();
    for (const id of selectedDatasetIds) {
      const gs = datasetCache[id]?.genes ?? [];
      gs.forEach((g) => set.add(g));
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [selectedDatasetIds, datasetCache]);

  /** Union of all obs columns from all selected datasets (for multi-dataset: same annotation key across samples). */
  const obsColumns = useMemo(() => {
    if (selectedDatasetIds.length === 0) return [];
    const set = new Set<string>();
    for (const id of selectedDatasetIds) {
      const cols = datasetCache[id]?.obs?.columns ?? [];
      cols.forEach((c) => set.add(c));
    }
    const clusterFirst = ["leiden", "louvain"];
    const rest = Array.from(set).filter((c) => !clusterFirst.includes(c));
    const first = clusterFirst.filter((c) => set.has(c));
    return [...first, ...rest.sort((a, b) => a.localeCompare(b))];
  }, [selectedDatasetIds, datasetCache]);
  /** Expression per dataset (gene mode). Key = dataset id. */
  const [expressionByDataset, setExpressionByDataset] = useState<Record<string, number[]>>({});
  /** Backward compat: single-dataset expression for code paths that still expect one array. */
  const expression = primaryId && selectedDatasetIds.length === 1 ? expressionByDataset[primaryId] ?? null : null;
  const [colorMode, setColorMode] = useState<"gene" | "annotation" | "coexpression" | "multigene">("annotation");
  const [selectedGene, setSelectedGene] = useState<string | null>(null);
  const [selectedGene1, setSelectedGene1] = useState<string | null>(null);
  const [selectedGene2, setSelectedGene2] = useState<string | null>(null);
  const [expression1, setExpression1] = useState<number[] | null>(null);
  const [expression2, setExpression2] = useState<number[] | null>(null);
  /** Co-expression gene1 expression per dataset (for multi-sample view). */
  const [expression1ByDataset, setExpression1ByDataset] = useState<Record<string, number[]>>({});
  /** Co-expression gene2 expression per dataset (for multi-sample view). */
  const [expression2ByDataset, setExpression2ByDataset] = useState<Record<string, number[]>>({});
  const [coexpressionPalette, setCoexpressionPalette] = useState<CoexpressionPalette>(DEFAULT_COEXPRESSION_PALETTE);
  const [coexpressionLogScale, setCoexpressionLogScale] = useState(false);
  const [selectedMultigeneGenes, setSelectedMultigeneGenes] = useState<MultigeneGeneEntry[]>([]);
  const [multigeneLogScale, setMultigeneLogScale] = useState(false);
  const [multigeneLayout, setMultigeneLayout] = useState<"pie" | "grid">("pie");
  const [multigeneRangeMinInput, setMultigeneRangeMinInput] = useState("p0");
  const [multigeneRangeMaxInput, setMultigeneRangeMaxInput] = useState("p100");
  const [multigeneExpressionByGene, setMultigeneExpressionByGene] = useState<Record<string, number[]>>({});
  /** Multi-gene expression per dataset and per gene (for multi-sample view). dataset id -> gene -> values */
  const [multigeneExpressionByDataset, setMultigeneExpressionByDataset] = useState<Record<string, Record<string, number[]>>>({});
  const [multigeneLoading, setMultigeneLoading] = useState(false);
  const [selectedLayer, setSelectedLayer] = useState<string>("X");
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
  const [backgroundOpacity, setBackgroundOpacity] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  /** True while fetching expression for the selected gene (single-gene mode). */
  const [expressionLoading, setExpressionLoading] = useState(false);
  /** True while fetching expression for co-expression mode. */
  const [coexpressionLoading, setCoexpressionLoading] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [anndataError, setAnndataError] = useState<string | null>(null);
  const [embeddingMode, setEmbeddingMode] = useState<"spatial" | "umap" | "pca" | "tsne">("spatial");
  const selectedIdsRef = useRef<string[]>([]);
  const loadAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    selectedIdsRef.current = selectedDatasetIds;
  }, [selectedDatasetIds]);

  useEffect(() => {
    fetchConfig().then((c) => {
      setDebugMode(c.debug);
      if (c.anndata_ok === false) {
        setAnndataError(c.anndata_hint || c.anndata_error || "anndata not installed");
      } else {
        setAnndataError(null);
      }
    });
  }, []);

  useEffect(() => {
    fetchDatasets()
      .then(setDatasets)
      .catch((e) => setError(e.message));
  }, []);

  const resolveEmbeddingMode = useCallback((m: DatasetMeta): "spatial" | "umap" | "pca" | "tsne" => {
    const hasSpatial = m.has_spatial ?? m.layout === "spatial";
    const hasUmap = m.has_umap ?? m.layout === "umap";
    const hasPca = m.has_pca ?? m.layout === "pca";
    const hasTsne = m.has_tsne ?? m.layout === "tsne";
    if (hasSpatial) return "spatial";
    if (hasUmap) return "umap";
    if (hasPca) return "pca";
    if (hasTsne) return "tsne";
    return (m.layout as "spatial" | "umap" | "pca" | "tsne") ?? "spatial";
  }, []);

  const loadDatasets = useCallback(
    async (ids: string[], currentEmbeddingMode: "spatial" | "umap" | "pca" | "tsne") => {
      if (ids.length === 0) return;
      loadAbortRef.current?.abort();
      const ac = new AbortController();
      loadAbortRef.current = ac;
      const signal = ac.signal;
      debugLog("loadDatasets start", { ids });
      setLoading(true);
      setLoadProgress(0);
      setError(null);
      const totalSteps = ids.length * 4;
      let completed = 0;
      const onStep = () => {
        completed += 1;
        setLoadProgress(Math.min(Math.round((completed / totalSteps) * 100), 100));
      };
      try {
        const metas: (DatasetMeta | null)[] = [];
        for (const id of ids) {
          const metaRes = await fetchDatasetMeta(id, signal);
          onStep();
          if (selectedIdsRef.current.length === 0) return;
          if (metaRes.viewable === false) {
            setError(`Dataset "${id}" has no spatial/UMAP.`);
            metas.push(null);
            continue;
          }
          metas.push(metaRes);
        }
        if (selectedIdsRef.current.length === 0) return;
        const firstMeta = metas[0];
        const mode = ids.length === 1 && firstMeta ? resolveEmbeddingMode(firstMeta) : currentEmbeddingMode;
        if (ids.length === 1 && firstMeta) setEmbeddingMode(mode);
        const nextCache: Record<string, LoadedDataset> = {};
        for (let i = 0; i < ids.length; i++) {
          const id = ids[i];
          const metaRes = metas[i];
          if (!metaRes) continue;
          try {
            const [spatialRes, obsRes, varRes] = await Promise.all([
              fetchSpatial(id, signal, mode).then((r) => {
                onStep();
                return r;
              }),
              fetchObs(id, signal).then((r) => {
                onStep();
                return r;
              }),
              fetchVarIndex(id, signal).then((r) => {
                onStep();
                return r;
              }),
            ]);
            nextCache[id] = { meta: metaRes, spatial: spatialRes, obs: obsRes, genes: varRes };
          } catch (e) {
            if (e instanceof Error && e.name === "AbortError") throw e;
            setError(e instanceof Error ? e.message : String(e));
          }
        }
        if (selectedIdsRef.current.length === 0) return;
        setDatasetCache((prev) => ({ ...prev, ...nextCache }));
        if (ids.length === 1 && nextCache[ids[0]]) {
          const obsRes = nextCache[ids[0]].obs;
          const catCols = obsRes.columns.filter((c) => {
            const vals = obsRes.data[c];
            const uniq = new Set(vals?.map(String) ?? []);
            return uniq.size <= 50 && uniq.size >= 2;
          });
          setSelectedObsCol(catCols.includes("leiden") ? "leiden" : catCols[0] ?? null);
          setObsValueType("categorical");
        }
        setExpressionByDataset({});
        setSelectedGene(null);
        setExpression1(null);
        setExpression2(null);
        setSelectedGene1(null);
        setSelectedGene2(null);
        setRangeMinInput("p0");
        setRangeMaxInput("p100");
        setBackgroundImageKey(null);
        setSelectedLayer("X");
        setBackgroundOpacity(1);
        setLoadProgress(100);
        await new Promise<void>((resolve) => setTimeout(resolve, 400));
        if (selectedIdsRef.current.length === 0) return;
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") {
          debugLog("loadDatasets aborted", { ids });
          return;
        }
        const msg = e instanceof Error ? e.message : String(e);
        debugLog("loadDatasets error", { ids, error: msg });
        setError(msg);
        setLoadProgress(0);
      } finally {
        if (selectedIdsRef.current.length > 0) {
          setLoading(false);
          setLoadProgress(0);
        }
      }
    },
    [resolveEmbeddingMode]
  );

  // Clear state when no dataset selected
  useEffect(() => {
    if (selectedDatasetIds.length === 0) {
      debugLog("selectedDatasetIds cleared, clearing state");
      setLoading(false);
      setDatasetCache({});
      setExpressionByDataset({});
      setSelectedObsCol(null);
      setObsValueType("categorical");
      setSelectedGene(null);
      setSelectedGene1(null);
      setSelectedGene2(null);
      setSelectedMultigeneGenes([]);
      setMultigeneExpressionByGene({});
      setMultigeneExpressionByDataset({});
      setExpression1ByDataset({});
      setExpression2ByDataset({});
      setExpression1(null);
      setExpression2(null);
      setSelectedLayer("X");
      setBackgroundImageKey(null);
      setEmbeddingMode("spatial");
    }
  }, [selectedDatasetIds]);

  // Load datasets when selection changes (user picked one or more from sidebar)
  useEffect(() => {
    if (selectedDatasetIds.length > 0) {
      loadDatasets(selectedDatasetIds, embeddingMode);
    }
  }, [selectedDatasetIds]); // eslint-disable-line react-hooks/exhaustive-deps -- loadDatasets and embeddingMode read at run time

  useEffect(() => {
    if (selectedDatasetIds.length === 0 || !selectedGene) {
      setExpressionByDataset({});
      setExpressionLoading(false);
      return;
    }
    const ac = new AbortController();
    const signal = ac.signal;
    setExpressionLoading(true);
    const slotLengths: Record<string, number> = {};
    selectedDatasetIds.forEach((id) => {
      slotLengths[id] = datasetCache[id]?.spatial?.x?.length ?? 0;
    });
    debugLog("fetchExpression", { datasetIds: selectedDatasetIds, gene: selectedGene, layer: selectedLayer });
    Promise.all(
      selectedDatasetIds.map((id) =>
        fetchExpression(id, selectedGene, signal, selectedLayer).catch((e) => {
          if (e?.name === "AbortError") throw e;
          return null;
        })
      )
    )
      .then((arrays) => {
        const next: Record<string, number[]> = {};
        selectedDatasetIds.forEach((id, i) => {
          const n = slotLengths[id] ?? 0;
          if (arrays[i]) next[id] = arrays[i];
          else next[id] = new Array(n).fill(NaN);
        });
        setExpressionByDataset(next);
      })
      .catch((e) => {
        if (e?.name === "AbortError") return;
        setExpressionByDataset({});
      })
      .finally(() => setExpressionLoading(false));
    return () => {
      ac.abort();
      setExpressionLoading(false);
    };
  }, [selectedDatasetIds, selectedGene, selectedLayer]);

  // Fetch both genes for co-expression mode for all selected datasets (multi-sample view)
  useEffect(() => {
    if (selectedDatasetIds.length === 0 || !selectedGene1 || !selectedGene2) {
      setExpression1ByDataset({});
      setExpression2ByDataset({});
      setExpression1(null);
      setExpression2(null);
      setCoexpressionLoading(false);
      return;
    }
    const ac = new AbortController();
    const signal = ac.signal;
    setCoexpressionLoading(true);
    const ids = [...selectedDatasetIds];
    debugLog("fetchCoexpression", { datasetIds: ids, gene1: selectedGene1, gene2: selectedGene2, layer: selectedLayer });
    Promise.all(
      ids.flatMap((id) => [
        fetchExpression(id, selectedGene1, signal, selectedLayer).catch((e) => (e?.name === "AbortError" ? Promise.reject(e) : null)),
        fetchExpression(id, selectedGene2, signal, selectedLayer).catch((e) => (e?.name === "AbortError" ? Promise.reject(e) : null)),
      ])
    )
      .then((arrays) => {
        const next1: Record<string, number[]> = {};
        const next2: Record<string, number[]> = {};
        ids.forEach((id, i) => {
          const a1 = arrays[i * 2];
          const a2 = arrays[i * 2 + 1];
          if (a1) next1[id] = a1;
          if (a2) next2[id] = a2;
        });
        setExpression1ByDataset(next1);
        setExpression2ByDataset(next2);
        const prim1 = primaryId ? next1[primaryId] : null;
        const prim2 = primaryId ? next2[primaryId] : null;
        setExpression1(prim1 ?? null);
        setExpression2(prim2 ?? null);
        debugLog("fetchCoexpression done", { ids, len1: prim1?.length, len2: prim2?.length });
      })
      .catch((e) => {
        if (e?.name === "AbortError") return;
        debugLog("fetchCoexpression error", { error: String(e) });
        setExpression1ByDataset({});
        setExpression2ByDataset({});
        setExpression1(null);
        setExpression2(null);
      })
      .finally(() => setCoexpressionLoading(false));
    return () => {
      ac.abort();
      setCoexpressionLoading(false);
    };
  }, [selectedDatasetIds, primaryId, selectedGene1, selectedGene2, selectedLayer]);

  // Fetch expression for each gene in multi-gene mode for all selected datasets (multi-sample view)
  useEffect(() => {
    if (selectedDatasetIds.length === 0 || selectedMultigeneGenes.length === 0) {
      setMultigeneExpressionByGene({});
      setMultigeneExpressionByDataset({});
      setMultigeneLoading(false);
      return;
    }
    const ac = new AbortController();
    const signal = ac.signal;
    setMultigeneLoading(true);
    const ids = [...selectedDatasetIds];
    const genesToFetch = selectedMultigeneGenes.map((e) => e.gene);
    Promise.all(
      ids.flatMap((id) =>
        genesToFetch.map((gene) =>
          fetchExpression(id, gene, signal, selectedLayer).then((arr) => ({ id, gene, arr })).catch((e) => {
            if (e?.name === "AbortError") throw e;
            return { id, gene, arr: null as number[] | null };
          })
        )
      )
    )
      .then((results) => {
        const byDataset: Record<string, Record<string, number[]>> = {};
        ids.forEach((id) => {
          byDataset[id] = {};
        });
        results.forEach(({ id, gene, arr }) => {
          if (arr) byDataset[id]![gene] = arr;
        });
        setMultigeneExpressionByDataset(byDataset);
        setMultigeneExpressionByGene(primaryId ? (byDataset[primaryId] ?? {}) : {});
      })
      .catch((e) => {
        if (e?.name === "AbortError") return;
        setMultigeneExpressionByDataset({});
        setMultigeneExpressionByGene({});
      })
      .finally(() => setMultigeneLoading(false));
    return () => {
      ac.abort();
      setMultigeneLoading(false);
    };
  }, [selectedDatasetIds, primaryId, selectedLayer, selectedMultigeneGenes]);

  const colorByValues = React.useMemo(() => {
    if (!spatial) return [];
    const n = spatial.x.length;
    if (colorMode === "annotation" && selectedObsCol) {
      const raw = obs?.data[selectedObsCol];
      if (!raw) return new Array(n).fill("nan") as (string | number)[];
      const sliced = raw.slice(0, n);
      if (obsValueType === "categorical" && selectedDatasetIds.length === 1) {
        const uniq = new Set(sliced.map(String)).size;
        if (uniq > ANNOTATION_MAX_CATEGORIES) {
          return new Array(n).fill(LABEL_NAN_TOO_MANY) as (string | number)[];
        }
        if (uniq < ANNOTATION_MIN_CATEGORIES) {
          return new Array(n).fill(LABEL_NAN_TOO_FEW) as (string | number)[];
        }
      }
      return sliced;
    }
    if (colorMode === "gene" && expression) {
      return expression.slice(0, n);
    }
    if (colorMode === "coexpression" && expression1 && expression2 && expression1.length >= n && expression2.length >= n) {
      const mapRaw = (arr: number[]) => (coexpressionLogScale ? arr.map((x) => Math.log1p(Math.max(0, x))) : arr);
      const log1 = mapRaw(expression1.slice(0, n) as number[]);
      const log2 = mapRaw(expression2.slice(0, n) as number[]);
      const { min: min1, max: max1 } = finiteMinMax(log1);
      const { min: min2, max: max2 } = finiteMinMax(log2);
      const range1 = max1 - min1 || 1;
      const range2 = max2 - min2 || 1;
      const out: string[] = [];
      for (let i = 0; i < n; i++) {
        const v1 = (log1[i] - min1) / range1;
        const v2 = (log2[i] - min2) / range2;
        out.push(coexpressionToHex(v1, v2, coexpressionPalette));
      }
      return out;
    }
    // No annotation/gene selected: still show all points (color decided by plotColorMode).
    return new Array(n).fill(0);
  }, [obs, spatial, colorMode, selectedObsCol, obsValueType, expression, expression1, expression2, coexpressionPalette, coexpressionLogScale]);

  const plotColorMode: ColorMode = React.useMemo(() => {
    if (!spatial) return "none";
    if (colorMode === "annotation" && selectedObsCol && obs?.data[selectedObsCol]) {
      return obsValueType === "numeric" ? "continuous" : "categorical";
    }
    if (colorMode === "gene" && expression && expression.length === spatial.x.length) {
      return "continuous";
    }
    if (
      colorMode === "coexpression" &&
      expression1 &&
      expression2 &&
      expression1.length === spatial.x.length &&
      expression2.length === spatial.x.length
    ) {
      return "coexpression";
    }
    if (colorMode === "multigene" && selectedMultigeneGenes.length > 0 && spatial.x.length > 0) {
      const n = spatial.x.length;
      const hasAnyWithData = selectedMultigeneGenes.some((e) => {
        const vals = multigeneExpressionByGene[e.gene];
        return (vals?.length ?? 0) >= n && (vals?.some((v) => Number.isFinite(v)) ?? false);
      });
      if (hasAnyWithData) return "multigene";
    }
    return "none";
  }, [spatial, colorMode, selectedObsCol, obs, expression, expression1, expression2, selectedMultigeneGenes, multigeneExpressionByGene, obsValueType]);
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

  /** All continuous values for color scale: gene mode = merged across selected datasets (unified scale); annotation numeric = primary. */
  const continuousValues: number[] | null = React.useMemo(() => {
    if (colorMode === "gene") {
      const arrays = selectedDatasetIds
        .map((id) => expressionByDataset[id])
        .filter((arr): arr is number[] => !!arr && arr.some((v) => Number.isFinite(v))) as number[][];
      if (arrays.length === 0) return null;
      if (arrays.length === 1) return arrays[0];
      return arrays.flat();
    }
    if (colorMode === "annotation" && obsValueType === "numeric" && selectedObsCol) {
      if (selectedDatasetIds.length > 1) {
        const arrays = selectedDatasetIds
          .map((id) => datasetCache[id]?.obs?.data[selectedObsCol])
          .filter(Boolean) as (number | string)[][];
        if (arrays.length === 0) return null;
        const nums = arrays.flat().map((v) => (typeof v === "number" ? v : Number(v))).filter((v) => Number.isFinite(v)) as number[];
        return nums.length > 0 ? nums : null;
      }
      if (obs?.data[selectedObsCol]) {
        const vals = obs.data[selectedObsCol] as (number | string)[];
        const nums = vals
          .map((v) => (typeof v === "number" ? v : Number(v)))
          .filter((v) => Number.isFinite(v)) as number[];
        return nums.length === vals.length ? (nums as number[]) : null;
      }
    }
    return null;
  }, [colorMode, obsValueType, selectedObsCol, obs, selectedDatasetIds, expressionByDataset, datasetCache]);

  /** True when both range inputs are percentiles (e.g. p1, p99) → per-sample scale in multi-dataset. */
  const isRangePercentile = useMemo(() => {
    const a = rangeMinInput.trim().toLowerCase();
    const b = rangeMaxInput.trim().toLowerCase();
    return a.startsWith("p") && b.startsWith("p");
  }, [rangeMinInput, rangeMaxInput]);

  const continuousColorRange = React.useMemo(() => {
    if (!continuousValues || continuousValues.length === 0) return null;
    const lo = parseRangeInput(rangeMinInput, continuousValues);
    const hi = parseRangeInput(rangeMaxInput, continuousValues);
    const { min: dataMin, max: dataMax } = finiteMinMax(continuousValues);
    const colorMin = lo ?? dataMin;
    const colorMax = hi ?? dataMax;
    return {
      colorMin: Math.min(colorMin, colorMax),
      colorMax: Math.max(colorMin, colorMax),
    };
  }, [continuousValues, rangeMinInput, rangeMaxInput]);

  /** Mid value for color bar (log or linear). */
  const continuousColorBarMid = useMemo(() => {
    const r = continuousColorRange;
    if (!r) return 0.5;
    const { colorMin: lo, colorMax: hi } = r;
    if (logScale) {
      const loS = Math.max(0, lo);
      const hiS = Math.max(0, hi);
      return hiS <= loS ? loS : Math.expm1((Math.log1p(loS) + Math.log1p(hiS)) / 2);
    }
    return (lo + hi) / 2;
  }, [continuousColorRange, logScale]);

  /** Per-slot color range and bar stats for multi-dataset continuous. When percentile: each sample scaled separately; when raw: same range for all. */
  const slotContinuousRange = useMemo((): Record<string, { colorMin: number; colorMax: number; colorBarStats: { lo: number; mid: number; hi: number } }> | null => {
    if (selectedDatasetIds.length <= 1) return null;
    const isNumeric = colorMode === "gene" || (colorMode === "annotation" && obsValueType === "numeric" && selectedObsCol);
    if (!isNumeric) return null;
    const out: Record<string, { colorMin: number; colorMax: number; colorBarStats: { lo: number; mid: number; hi: number } }> = {};
    const midFrom = (lo: number, hi: number) => {
      if (logScale) {
        const loS = Math.max(0, lo);
        const hiS = Math.max(0, hi);
        return hiS <= loS ? loS : Math.expm1((Math.log1p(loS) + Math.log1p(hiS)) / 2);
      }
      return (lo + hi) / 2;
    };
    if (isRangePercentile) {
      for (const id of selectedDatasetIds) {
        let values: number[] = [];
        if (colorMode === "gene") {
          const arr = expressionByDataset[id];
          if (arr) values = arr.filter((v) => Number.isFinite(v)) as number[];
        } else if (selectedObsCol) {
          const raw = datasetCache[id]?.obs?.data[selectedObsCol];
          if (raw) values = (raw as (number | string)[]).map((v) => (typeof v === "number" ? v : Number(v))).filter((v) => Number.isFinite(v)) as number[];
        }
        const { min: dataMin, max: dataMax } = values.length > 0 ? finiteMinMax(values) : { min: 0, max: 1 };
        const lo = parseRangeInput(rangeMinInput, values) ?? dataMin;
        const hi = parseRangeInput(rangeMaxInput, values) ?? dataMax;
        const colorMin = Math.min(lo, hi);
        const colorMax = Math.max(lo, hi);
        out[id] = { colorMin, colorMax, colorBarStats: { lo: colorMin, mid: midFrom(colorMin, colorMax), hi: colorMax } };
      }
    } else {
      const r = continuousColorRange;
      const lo = r?.colorMin ?? 0;
      const hi = r?.colorMax ?? 1;
      const bar = { lo, mid: continuousColorBarMid, hi };
      for (const id of selectedDatasetIds) {
        out[id] = { colorMin: lo, colorMax: hi, colorBarStats: bar };
      }
    }
    return Object.keys(out).length > 0 ? out : null;
  }, [
    selectedDatasetIds,
    colorMode,
    obsValueType,
    selectedObsCol,
    isRangePercentile,
    rangeMinInput,
    rangeMaxInput,
    logScale,
    datasetCache,
    expressionByDataset,
    continuousColorRange,
    continuousColorBarMid,
  ]);

  const multigeneLayers = React.useMemo(() => {
    if (!spatial || selectedMultigeneGenes.length === 0) return undefined;
    const n = spatial.x.length;
    const layers = selectedMultigeneGenes
      .map((entry) => {
        const values = multigeneExpressionByGene[entry.gene];
        if (!values || values.length < n) return null;
        const slice = values.slice(0, n);
        const hasFinite = slice.some((v) => Number.isFinite(v));
        if (!hasFinite) return null;
        return { name: entry.gene, values: slice, paletteId: entry.paletteId };
      })
      .filter((l): l is { name: string; values: number[]; paletteId: string } => l !== null);
    return layers.length > 0 ? layers : undefined;
  }, [spatial, selectedMultigeneGenes, multigeneExpressionByGene]);

  const effectiveMultigeneColorRange = React.useMemo(() => {
    if (!multigeneLayers || multigeneLayers.length === 0) return null;
    const firstValues = multigeneLayers[0].values;
    const lo = parseRangeInput(multigeneRangeMinInput, firstValues);
    const hi = parseRangeInput(multigeneRangeMaxInput, firstValues);
    if (lo == null && hi == null) return null;
    const { min: dataMin, max: dataMax } = finiteMinMax(firstValues);
    const colorMin = lo ?? dataMin;
    const colorMax = hi ?? dataMax;
    return {
      colorMin: Math.min(colorMin, colorMax),
      colorMax: Math.max(colorMin, colorMax),
    };
  }, [multigeneLayers, multigeneRangeMinInput, multigeneRangeMaxInput]);

  /** Global unique labels for selected annotation column across all samples (for unified categorical color map). */
  const globalCategoricalLabels = useMemo(() => {
    if (colorMode !== "annotation" || !selectedObsCol || obsValueType !== "categorical") return [];
    const set = new Set<string>();
    let anyMissing = false;
    for (const id of selectedDatasetIds) {
      const vals = datasetCache[id]?.obs?.data[selectedObsCol];
      if (!vals) {
        anyMissing = true;
        continue;
      }
      vals.forEach((v) => set.add(String(v)));
    }
    const list = Array.from(set).sort((a, b) => a.localeCompare(b));
    if (anyMissing && !list.includes("nan")) list.push("nan");
    return list;
  }, [colorMode, selectedObsCol, obsValueType, selectedDatasetIds, datasetCache]);

  /** Unified category → color map (same across all samples). */
  const globalCatMap = useMemo(() => {
    if (globalCategoricalLabels.length === 0) return null;
    const uniq = globalCategoricalLabels.length;
    if (uniq > ANNOTATION_MAX_CATEGORIES) {
      return getCategoricalColors([LABEL_NAN_TOO_MANY], categoricalPalette, continuousPaletteReverse);
    }
    if (uniq < ANNOTATION_MIN_CATEGORIES) {
      return getCategoricalColors([LABEL_NAN_TOO_FEW], categoricalPalette, continuousPaletteReverse);
    }
    return getCategoricalColors(globalCategoricalLabels, categoricalPalette, continuousPaletteReverse);
  }, [globalCategoricalLabels, categoricalPalette, continuousPaletteReverse]);

  /** Annotation legend entries with counts = sum across all samples (for Color by annotation categorical). */
  const annotationLegendEntries = useMemo((): { label: string; count: number; color: string }[] => {
    if (colorMode !== "annotation" || !selectedObsCol || obsValueType !== "categorical" || !globalCatMap) return [];
    const uniq = globalCategoricalLabels.length;
    if (uniq > ANNOTATION_MAX_CATEGORIES) {
      let total = 0;
      for (const id of selectedDatasetIds) {
        const vals = datasetCache[id]?.obs?.data[selectedObsCol];
        if (vals) total += vals.length;
      }
      return [{ label: LABEL_NAN_TOO_MANY, count: total, color: globalCatMap.get(LABEL_NAN_TOO_MANY) ?? "#888888" }];
    }
    if (uniq < ANNOTATION_MIN_CATEGORIES) {
      let total = 0;
      for (const id of selectedDatasetIds) {
        const vals = datasetCache[id]?.obs?.data[selectedObsCol];
        if (vals) total += vals.length;
      }
      return [{ label: LABEL_NAN_TOO_FEW, count: total, color: globalCatMap.get(LABEL_NAN_TOO_FEW) ?? "#888888" }];
    }
    const counts = new Map<string, number>();
    for (const id of selectedDatasetIds) {
      const vals = datasetCache[id]?.obs?.data[selectedObsCol];
      if (!vals) continue;
      for (const v of vals) {
        const s = String(v);
        counts.set(s, (counts.get(s) ?? 0) + 1);
      }
    }
    const entries = Array.from(counts.entries())
      .map(([label, count]) => ({ label, count, color: globalCatMap.get(label) ?? "#888888" }))
      .sort((a, b) => (b.count !== a.count ? b.count - a.count : (a.label < b.label ? -1 : a.label > b.label ? 1 : 0)));
    return entries;
  }, [colorMode, selectedObsCol, obsValueType, globalCatMap, globalCategoricalLabels, selectedDatasetIds, datasetCache]);

  /** For in-plot categorical legend: label, color, and spot count (no scroll; compact wrap in corner). */
  const categoricalLegendForPlot = useMemo(
    () => annotationLegendEntries?.map(({ label, color, count }) => ({ label, color, count })) ?? null,
    [annotationLegendEntries]
  );

  const handleEmbeddingModeChange = useCallback(
    async (mode: "spatial" | "umap" | "pca" | "tsne") => {
      if (selectedDatasetIds.length === 0 || !meta) return;
      if (mode === embeddingMode) return;
      if (mode === "spatial" && !(meta.has_spatial ?? meta.layout === "spatial")) return;
      if (mode === "umap" && !(meta.has_umap ?? false)) return;
      if (mode === "pca" && !(meta.has_pca ?? false)) return;
      if (mode === "tsne" && !(meta.has_tsne ?? false)) return;
      setEmbeddingMode(mode);
      if (mode !== "spatial") {
        setBackgroundImageKey(null);
      }
      const ids = selectedDatasetIds;
      try {
        const ac = new AbortController();
        const signal = ac.signal;
        debugLog("switchEmbedding", { datasetIds: ids, mode });
        const results = await Promise.all(
          ids.map((id) =>
            fetchSpatial(id, signal, mode).then((coords) => ({ id, coords })).catch((e) => ({ id, error: e }))
          )
        );
        if (selectedIdsRef.current.length === 0) return;
        setDatasetCache((prev) => {
          const next = { ...prev };
          for (const r of results) {
            if ("coords" in r && next[r.id]) {
              next[r.id] = { ...next[r.id], spatial: r.coords };
            }
          }
          return next;
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        debugLog("switchEmbedding error", { datasetIds: ids, mode, error: msg });
        setError(msg);
      }
    },
    [selectedDatasetIds, meta, embeddingMode]
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, minWidth: 0, overflow: "hidden" }}>
      {exportingPdf && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(10, 15, 35, 0.92)",
            color: "#ccc",
            fontSize: 14,
            gap: 16,
          }}
          aria-busy="true"
          aria-label="Exporting PDF"
        >
          <span>Exporting PDF… {exportProgress}%</span>
          <div
            style={{
              width: 280,
              height: 6,
              background: "#0f3460",
              borderRadius: 3,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${exportProgress}%`,
                height: "100%",
                background: "#e94560",
                borderRadius: 3,
                transition: "width 0.2s ease-out",
              }}
            />
          </div>
        </div>
      )}
      {anndataError && (
        <div
          style={{
            padding: "8px 12px",
            background: "#c0392b",
            color: "#fff",
            fontSize: "13px",
            flexShrink: 0,
          }}
        >
          Backend: {anndataError}
        </div>
      )}
      <div style={{ display: "flex", flex: 1, minHeight: 0, minWidth: 0, overflow: "hidden" }}>
      <Sidebar
        datasets={datasets}
        selectedDatasetIds={selectedDatasetIds}
        onSelectDatasets={(ids) => {
          debugLog("onSelectDatasets", { ids });
          setSelectedDatasetIds(ids);
          if (ids.length > 0) {
            setExpressionByDataset({});
            setSelectedGene(null);
            setExpression1(null);
            setExpression2(null);
            setSelectedGene1(null);
            setSelectedGene2(null);
            setSelectedMultigeneGenes([]);
            setMultigeneExpressionByGene({});
            setBackgroundImageKey(null);
          }
        }}
        onReorderDatasets={(ids) => setSelectedDatasetIds(ids)}
        meta={meta}
        genes={genes}
        obs={obs}
        obsColumns={obsColumns}
        annotationLegendEntries={annotationLegendEntries}
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
        onColorByCoexpression={(g1, g2) => {
          setSelectedGene1(g1);
          setSelectedGene2(g2);
          setColorMode("coexpression");
        }}
        onColorModeChange={setColorMode}
        selectedGene1={selectedGene1}
        selectedGene2={selectedGene2}
        coexpressionPalette={coexpressionPalette}
        onCoexpressionPaletteChange={setCoexpressionPalette}
        coexpressionLogScale={coexpressionLogScale}
        onCoexpressionLogScaleChange={setCoexpressionLogScale}
        selectedMultigeneGenes={selectedMultigeneGenes}
        onMultigeneGenesChange={setSelectedMultigeneGenes}
        multigeneLogScale={multigeneLogScale}
        onMultigeneLogScaleChange={setMultigeneLogScale}
        multigeneLayout={multigeneLayout}
        onMultigeneLayoutChange={setMultigeneLayout}
        multigeneRangeMinInput={multigeneRangeMinInput}
        multigeneRangeMaxInput={multigeneRangeMaxInput}
        onMultigeneRangeMinInputChange={setMultigeneRangeMinInput}
        onMultigeneRangeMaxInputChange={setMultigeneRangeMaxInput}
        effectiveMultigeneColorMin={effectiveMultigeneColorRange?.colorMin ?? null}
        effectiveMultigeneColorMax={effectiveMultigeneColorRange?.colorMax ?? null}
        selectedLayer={selectedLayer}
        onLayerChange={setSelectedLayer}
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
        effectiveColorMin={selectedDatasetIds.length > 1 && isRangePercentile ? null : (continuousColorRange?.colorMin ?? null)}
        effectiveColorMax={selectedDatasetIds.length > 1 && isRangePercentile ? null : (continuousColorRange?.colorMax ?? null)}
        logScale={logScale}
        onLogScaleChange={setLogScale}
        backgroundImageKey={backgroundImageKey}
        onBackgroundImageKeyChange={(key) => {
          setBackgroundImageKey(key);
          if (!key) {
            setBackgroundOpacity(1);
          }
        }}
        backgroundOpacity={backgroundOpacity}
        onBackgroundOpacityChange={setBackgroundOpacity}
        embeddingMode={embeddingMode}
        onEmbeddingModeChange={handleEmbeddingModeChange}
        onObsValueTypeChange={setObsValueType}
      />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* Toolbar: shown when at least one dataset has loaded spatial; Export captures nodes with data-export-plot */}
        {selectedDatasetIds.length > 0 && selectedDatasetIds.some((id) => datasetCache[id]?.spatial) && (
          <div
            style={{
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 12px",
              background: "#16213e",
              borderBottom: "1px solid #0f3460",
            }}
          >
            <button
              type="button"
              onClick={async () => {
                const hasLoaded = selectedDatasetIds.length > 0 && selectedDatasetIds.some((id) => datasetCache[id]?.spatial);
                const multiPlot =
                  selectedDatasetIds.length > 1 &&
                  (colorMode === "gene" || colorMode === "annotation" || colorMode === "coexpression" || colorMode === "multigene");
                const showSinglePlot = hasLoaded && selectedDatasetIds.length === 1 && spatial != null;

                setExportingPdf(true);
                setExportProgress(0);
                console.log("[Export PDF] Start");
                try {
                  console.log("[Export PDF] Loading jspdf and exportPlotVector...");
                  const [
                    { jsPDF, GState: GStateClass },
                    { drawPlotToPdfVector, drawMultigenePlotToPdfVector },
                  ] = await Promise.all([import("jspdf"), import("./exportPlotVector")]);
                  setExportProgress(5);
                  console.log("[Export PDF] Modules loaded, building plot tasks...");

                  const getSlotBounds = (s: { x: number[]; y: number[] }) => {
                    let xMin = s.x[0], xMax = s.x[0], yMin = s.y[0], yMax = s.y[0];
                    for (let i = 1; i < s.x.length; i++) {
                      if (s.x[i] < xMin) xMin = s.x[i];
                      if (s.x[i] > xMax) xMax = s.x[i];
                      if (s.y[i] < yMin) yMin = s.y[i];
                      if (s.y[i] > yMax) yMax = s.y[i];
                    }
                    return { xMin, xMax, yMin, yMax };
                  };
                  const getSlotMode = (id: string): ColorMode => {
                    const d = datasetCache[id];
                    if (!d?.spatial) return "none";
                    if (colorMode === "annotation" && selectedObsCol && d.obs?.data[selectedObsCol])
                      return obsValueType === "numeric" ? "continuous" : "categorical";
                    if (colorMode === "gene" && expressionByDataset[id]?.length === d.spatial.x.length) return "continuous";
                    if (colorMode === "coexpression") {
                      const e1 = expression1ByDataset[id];
                      const e2 = expression2ByDataset[id];
                      const n = d.spatial.x.length;
                      if (e1 && e2 && e1.length >= n && e2.length >= n) return "coexpression";
                    }
                    if (colorMode === "multigene" && selectedMultigeneGenes.length > 0) {
                      const byGene = multigeneExpressionByDataset[id];
                      if (byGene && selectedMultigeneGenes.some((e) => (byGene[e.gene]?.length ?? 0) >= d.spatial.x.length))
                        return "multigene";
                    }
                    return "none";
                  };
                  const getSlotColorBy = (id: string): (string | number)[] => {
                    const d = datasetCache[id];
                    if (!d?.spatial) return [];
                    const n = d.spatial.x.length;
                    if (colorMode === "annotation" && selectedObsCol) {
                      const raw = d.obs?.data[selectedObsCol];
                      if (!raw) return new Array(n).fill("nan") as (string | number)[];
                      return raw.slice(0, n);
                    }
                    if (colorMode === "gene") {
                      const expr = expressionByDataset[id];
                      return expr ? expr.slice(0, n) : (new Array(n).fill(NaN) as (string | number)[]);
                    }
                    if (colorMode === "coexpression") {
                      const e1 = expression1ByDataset[id];
                      const e2 = expression2ByDataset[id];
                      if (!e1 || !e2 || e1.length < n || e2.length < n) return new Array(n).fill(0);
                      const mapRaw = (arr: number[]) =>
                        coexpressionLogScale ? arr.map((x) => Math.log1p(Math.max(0, x))) : arr;
                      const log1 = mapRaw(e1.slice(0, n));
                      const log2 = mapRaw(e2.slice(0, n));
                      const { min: min1, max: max1 } = finiteMinMax(log1);
                      const { min: min2, max: max2 } = finiteMinMax(log2);
                      const range1 = max1 - min1 || 1;
                      const range2 = max2 - min2 || 1;
                      const out: string[] = [];
                      for (let i = 0; i < n; i++) {
                        const v1 = (log1[i] - min1) / range1;
                        const v2 = (log2[i] - min2) / range2;
                        out.push(coexpressionToHex(v1, v2, coexpressionPalette));
                      }
                      return out;
                    }
                    return new Array(n).fill(0);
                  };
                  const getSlotLegend = (id: string): VectorExportLegendEntry[] => {
                    if (
                      colorMode !== "annotation" ||
                      !selectedObsCol ||
                      obsValueType !== "categorical" ||
                      !globalCatMap
                    )
                      return [];
                    const vals = datasetCache[id]?.obs?.data[selectedObsCol];
                    if (!vals) return [];
                    const uniq = new Set(vals.map((v) => String(v))).size;
                    if (uniq > ANNOTATION_MAX_CATEGORIES)
                      return [{ label: LABEL_NAN_TOO_MANY, color: globalCatMap.get(LABEL_NAN_TOO_MANY) ?? "#888888", count: vals.length }];
                    if (uniq < ANNOTATION_MIN_CATEGORIES)
                      return [{ label: LABEL_NAN_TOO_FEW, color: globalCatMap.get(LABEL_NAN_TOO_FEW) ?? "#888888", count: vals.length }];
                    const counts = new Map<string, number>();
                    for (let i = 0; i < vals.length; i++) {
                      const s = String(vals[i]);
                      counts.set(s, (counts.get(s) ?? 0) + 1);
                    }
                    return Array.from(counts.entries())
                      .map(([label, count]) => ({ label, color: globalCatMap.get(label) ?? "#888888", count }))
                      .sort((a, b) => (b.count !== a.count ? b.count - a.count : (a.label < b.label ? -1 : a.label > b.label ? 1 : 0)));
                  };
                  const getBgBounds = (m: DatasetMeta | undefined, key: string | null) => {
                    if (!m?.image_info || !key) return null;
                    const keys = m.image_keys ?? [];
                    const refKey = keys.includes("hires") ? "hires" : keys[0];
                    if (!refKey) return null;
                    const info = m.image_info[refKey];
                    if (!info || info.scale_factor <= 0) return null;
                    return { xMin: 0, yMin: 0, xMax: info.width / info.scale_factor, yMax: info.height / info.scale_factor };
                  };

                  type PlotTask =
                    | { type: "scatter"; options: Parameters<typeof drawPlotToPdfVector>[1] }
                    | { type: "multigene"; options: Parameters<typeof drawMultigenePlotToPdfVector>[1] };
                  const plotTasks: PlotTask[] = [];
                  const plotIds: string[] = [];

                  if (showSinglePlot && spatial) {
                    const singleTitle =
                      primaryId && meta
                        ? `${primaryId}${embeddingMode === "umap" ? " (UMAP)" : " (Spatial)"}`
                        : primaryId ?? undefined;

                    if (plotColorMode === "multigene" && selectedMultigeneGenes.length > 0) {
                      // Single-sample multigene export: build multigene spots and per-gene vmin/vmax, same as multiPlot.
                      const n = spatial.x.length;
                      const byGene = multigeneExpressionByDataset[primaryId ?? ""];
                      const layers =
                        byGene && selectedMultigeneGenes.length > 0
                          ? selectedMultigeneGenes
                              .map((entry) => {
                                const values = byGene[entry.gene];
                                if (!values || values.length < n) return null;
                                const slice = values.slice(0, n);
                                const hasFinite = slice.some((v) => Number.isFinite(v));
                                if (!hasFinite) return null;
                                return { name: entry.gene, values: slice, paletteId: entry.paletteId };
                              })
                              .filter(
                                (l): l is { name: string; values: number[]; paletteId: string } => l !== null
                              )
                          : [];
                      const K = layers.length;
                      if (K > 0) {
                        const vminByLayer: number[] = [];
                        const vmaxByLayer: number[] = [];
                        const minParsed = parseMultigeneRange(multigeneRangeMinInput);
                        const maxParsed = parseMultigeneRange(multigeneRangeMaxInput);
                        for (let g = 0; g < K; g++) {
                          const vals = layers[g].values;
                          let vmin: number, vmax: number;
                          if (minParsed?.type === "percentile" && maxParsed?.type === "percentile") {
                            vmin = percentile(vals, minParsed.p);
                            vmax = percentile(vals, maxParsed.p);
                          } else if (minParsed?.type === "raw" && maxParsed?.type === "raw") {
                            vmin = minParsed.value;
                            vmax = maxParsed.value;
                          } else {
                            const { min: dataMin, max: dataMax } = finiteMinMax(vals);
                            vmin = dataMin;
                            vmax = dataMax <= vmin ? vmin + 1 : dataMax;
                          }
                          if (!Number.isFinite(vmin)) vmin = 0;
                          if (!Number.isFinite(vmax) || vmax <= vmin) vmax = vmin + 1;
                          vminByLayer.push(vmin);
                          vmaxByLayer.push(vmax);
                        }

                        const spots: Array<{ x: number; y: number; segments: MultigeneSegment[] }> = [];
                        for (let i = 0; i < n; i++) {
                          let sum = 0;
                          const expr: number[] = [];
                          for (let g = 0; g < K; g++) {
                            const raw = layers[g].values[i];
                            const v = Number.isFinite(raw) ? Math.max(0, raw) : 0;
                            const e = multigeneLogScale ? Math.log1p(v) : v;
                            expr.push(e);
                            sum += e;
                          }
                          if (!Number.isFinite(sum) || sum <= 0) continue;
                          const segments: MultigeneSegment[] = [];
                          for (let g = 0; g < K; g++) {
                            const proportion = expr[g] / sum;
                            segments.push({
                              proportion,
                              color: multigeneValueToHex(
                                layers[g].values[i] ?? 0,
                                vminByLayer[g],
                                vmaxByLayer[g],
                                layers[g].paletteId,
                                multigeneLogScale
                              ),
                            });
                          }
                          segments.sort((a, b) => b.proportion - a.proportion);
                          spots.push({ x: spatial.x[i], y: spatial.y[i], segments });
                        }

                        plotTasks.push({
                          type: "multigene",
                          options: {
                            spots,
                            bounds,
                            spotSizeScale,
                            layout: multigeneLayout,
                            title: singleTitle,
                            legendLayers: layers.map((l, g) => ({
                              name: l.name,
                              paletteId: l.paletteId,
                              vmin: vminByLayer[g] ?? 0,
                              vmax: vmaxByLayer[g] ?? 1,
                            })),
                            backgroundImageDataUrl: undefined,
                            backgroundImageBounds: backgroundImageBounds ?? null,
                            backgroundOpacity,
                            spotOpacity,
                          },
                        });
                        plotIds.push(primaryId ?? "");
                      }
                    } else {
                      const colorByHex = colorByToHex(colorByValues, plotColorMode, {
                        catMap: globalCatMap ?? undefined,
                        colorMin: continuousColorRange?.colorMin,
                        colorMax: continuousColorRange?.colorMax,
                        logScale,
                        palette: continuousPalette,
                        reverse: continuousPaletteReverse,
                      });
                      const legend: VectorExportLegendEntry[] =
                        plotColorMode === "categorical" && categoricalLegendForPlot
                          ? categoricalLegendForPlot.map((e) => ({
                              label: e.label,
                              color: e.color,
                              count: e.count,
                            }))
                          : [];
                      const colorBarStatsSingle =
                        plotColorMode === "continuous" && continuousColorRange
                          ? {
                              lo: continuousColorRange.colorMin,
                              mid: continuousColorBarMid,
                              hi: continuousColorRange.colorMax,
                            }
                          : undefined;
                      plotTasks.push({
                        type: "scatter",
                        options: {
                          x: spatial.x,
                          y: spatial.y,
                          colorByHex,
                          bounds,
                          spotSizeScale,
                          title: singleTitle,
                          legend,
                          colorBarStats: colorBarStatsSingle,
                          colorBarTitle:
                            plotColorMode === "continuous"
                              ? colorMode === "gene"
                                ? selectedGene ?? undefined
                                : selectedObsCol ?? undefined
                              : undefined,
                          continuousPalette,
                          continuousPaletteReverse,
                          backgroundImageDataUrl: undefined,
                          backgroundImageBounds: backgroundImageBounds ?? null,
                          backgroundOpacity,
                          spotOpacity,
                        },
                      });
                      plotIds.push(primaryId ?? "");
                    }
                  } else if (multiPlot) {
                    for (const id of selectedDatasetIds) {
                      const d = datasetCache[id];
                      if (!d?.spatial) continue;
                      const mode = getSlotMode(id);
                      if (mode === "multigene") {
                        const n = d.spatial.x.length;
                        const byGene = multigeneExpressionByDataset[id];
                        const layers = selectedMultigeneGenes
                          .map((entry) => {
                            const values = byGene?.[entry.gene];
                            if (!values || values.length < n) return null;
                            const slice = values.slice(0, n);
                            const hasFinite = slice.some((v) => Number.isFinite(v));
                            if (!hasFinite) return null;
                            return { name: entry.gene, values: slice, paletteId: entry.paletteId };
                          })
                          .filter(
                            (l): l is { name: string; values: number[]; paletteId: string } => l !== null
                          );
                        const K = layers.length;
                        const vminByLayer: number[] = [];
                        const vmaxByLayer: number[] = [];
                        const minParsed = parseMultigeneRange(multigeneRangeMinInput);
                        const maxParsed = parseMultigeneRange(multigeneRangeMaxInput);
                        for (let g = 0; g < K; g++) {
                          const vals = layers[g].values;
                          let vmin: number, vmax: number;
                          if (minParsed?.type === "percentile" && maxParsed?.type === "percentile") {
                            vmin = percentile(vals, minParsed.p);
                            vmax = percentile(vals, maxParsed.p);
                          } else if (minParsed?.type === "raw" && maxParsed?.type === "raw") {
                            vmin = minParsed.value;
                            vmax = maxParsed.value;
                          } else {
                            const { min: dataMin, max: dataMax } = finiteMinMax(vals);
                            vmin = dataMin;
                            vmax = dataMax <= vmin ? vmin + 1 : dataMax;
                          }
                          if (!Number.isFinite(vmin)) vmin = 0;
                          if (!Number.isFinite(vmax) || vmax <= vmin) vmax = vmin + 1;
                          vminByLayer.push(vmin);
                          vmaxByLayer.push(vmax);
                        }
                        const spots: Array<{ x: number; y: number; segments: MultigeneSegment[] }> = [];
                        for (let i = 0; i < n; i++) {
                          let sum = 0;
                          const expr: number[] = [];
                          for (let g = 0; g < K; g++) {
                            const raw = layers[g].values[i];
                            const v = Number.isFinite(raw) ? Math.max(0, raw) : 0;
                            const e = multigeneLogScale ? Math.log1p(v) : v;
                            expr.push(e);
                            sum += e;
                          }
                          if (!Number.isFinite(sum) || sum <= 0) continue;
                          const segments: MultigeneSegment[] = [];
                          for (let g = 0; g < K; g++) {
                            const proportion = expr[g] / sum;
                            segments.push({
                              proportion,
                              color: multigeneValueToHex(
                                layers[g].values[i] ?? 0,
                                vminByLayer[g],
                                vmaxByLayer[g],
                                layers[g].paletteId,
                                multigeneLogScale
                              ),
                            });
                          }
                          segments.sort((a, b) => b.proportion - a.proportion);
                          spots.push({ x: d.spatial.x[i], y: d.spatial.y[i], segments });
                        }
                        plotTasks.push({
                          type: "multigene",
                          options: {
                            spots,
                            bounds: getSlotBounds(d.spatial),
                            spotSizeScale,
                            layout: multigeneLayout,
                            title: `${id}${embeddingMode === "umap" ? " (UMAP)" : " (Spatial)"}`,
                            legendLayers: layers.map((l, g) => ({
                              name: l.name,
                              paletteId: l.paletteId,
                              vmin: vminByLayer[g] ?? 0,
                              vmax: vmaxByLayer[g] ?? 1,
                            })),
                            backgroundImageDataUrl: undefined,
                            backgroundImageBounds: getBgBounds(d.meta, backgroundImageKey),
                            backgroundOpacity,
                            spotOpacity,
                          },
                        });
                        plotIds.push(id);
                      } else {
                        const slotRange =
                          mode === "continuous" && slotContinuousRange ? slotContinuousRange[id] : null;
                        const colorByHex = colorByToHex(getSlotColorBy(id), mode, {
                          catMap: globalCatMap ?? undefined,
                          colorMin: slotRange?.colorMin ?? continuousColorRange?.colorMin,
                          colorMax: slotRange?.colorMax ?? continuousColorRange?.colorMax,
                          logScale,
                          palette: continuousPalette,
                          reverse: continuousPaletteReverse,
                        });
                        const slotColorBar =
                          mode === "continuous" && slotRange?.colorBarStats ? slotRange.colorBarStats : undefined;
                        const slotLegend = getSlotLegend(id);
                        plotTasks.push({
                          type: "scatter",
                          options: {
                            x: d.spatial.x,
                            y: d.spatial.y,
                            colorByHex,
                            bounds: getSlotBounds(d.spatial),
                            spotSizeScale,
                            title: `${id}${embeddingMode === "umap" ? " (UMAP)" : " (Spatial)"}`,
                            legend: slotLegend,
                            colorBarStats: slotColorBar,
                            colorBarTitle:
                              mode === "continuous"
                                ? colorMode === "gene"
                                  ? selectedGene ?? undefined
                                  : selectedObsCol ?? undefined
                                : undefined,
                            continuousPalette,
                            continuousPaletteReverse,
                            backgroundImageDataUrl: undefined,
                            backgroundImageBounds: getBgBounds(d.meta, backgroundImageKey),
                            backgroundOpacity,
                            spotOpacity,
                          },
                        });
                        plotIds.push(id);
                      }
                    }
                  }

                  console.log("[Export PDF] Plot tasks count:", plotTasks.length);
                  if (plotTasks.length === 0) {
                    console.warn("[Export PDF] No plots to export, aborting");
                    debugLog("exportPdf: no plots to export");
                    setExportingPdf(false);
                    setExportProgress(0);
                    return;
                  }

                  const N = plotTasks.length;
                  // Fixed PDF page size: 180 x 210 mm (portrait).
                  const PAGE_W_MM = 180;
                  const PAGE_H_MM = 210;
                  const marginX = 10;
                  const marginY = 10;
                  const titleHeightMm = 5;

                  // Choose columns/rows first (layout pattern similar to before),
                  // then derive cell size from the fixed page size.
                  const cols = N <= 2 ? 2 : N <= 4 ? 2 : 3;
                  const rows = Math.ceil(N / cols);

                  const usableW = Math.max(10, PAGE_W_MM - 2 * marginX);
                  const usableH = Math.max(10, PAGE_H_MM - 2 * marginY);
                  const cellW = usableW / cols;
                  const cellH = usableH / rows;
                  const cellSize = Math.min(cellW, cellH);
                  const contentW = cellSize;
                  const contentH = Math.max(5, cellSize - titleHeightMm);

                  // Scale normalization by typical nearest-neighbor spot distance.
                  // Goal: after scaling, adjacent spot centers have the same distance in mm across samples.
                  // This implies a consistent physical scale, independent of raw coordinate magnitudes.
                  const median = (arr: number[]) => {
                    const a = arr.filter((v) => Number.isFinite(v) && v > 0).sort((x, y) => x - y);
                    if (a.length === 0) return NaN;
                    const mid = Math.floor(a.length / 2);
                    return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
                  };
                  const estimateNearestNeighborSpacing = (
                    xs: number[],
                    ys: number[],
                    b: { xMin: number; xMax: number; yMin: number; yMax: number }
                  ): number => {
                    const n0 = Math.min(xs.length, ys.length);
                    const dataW0 = b.xMax - b.xMin || 1;
                    const dataH0 = b.yMax - b.yMin || 1;
                    const area = dataW0 * dataH0;
                    const guess = n0 > 0 ? Math.sqrt(area / Math.max(1, n0)) : Math.sqrt(Math.max(1, area));
                    if (n0 < 2) return guess;

                    // Subsample for performance (deterministic stride).
                    const maxSample = 5000;
                    const step = n0 > maxSample ? Math.ceil(n0 / maxSample) : 1;
                    const idx: number[] = [];
                    for (let i = 0; i < n0; i += step) idx.push(i);

                    const cellSizeData = Math.max(1e-6, guess * 1.5);
                    const keyOf = (cx: number, cy: number) => `${cx},${cy}`;
                    const grid = new Map<string, number[]>();
                    for (const i of idx) {
                      const x = xs[i], y = ys[i];
                      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
                      const cx = Math.floor((x - b.xMin) / cellSizeData);
                      const cy = Math.floor((y - b.yMin) / cellSizeData);
                      const key = keyOf(cx, cy);
                      const list = grid.get(key);
                      if (list) list.push(i);
                      else grid.set(key, [i]);
                    }

                    const dists: number[] = [];
                    for (const i of idx) {
                      const x0 = xs[i], y0 = ys[i];
                      if (!Number.isFinite(x0) || !Number.isFinite(y0)) continue;
                      const cx0 = Math.floor((x0 - b.xMin) / cellSizeData);
                      const cy0 = Math.floor((y0 - b.yMin) / cellSizeData);
                      let best = Infinity;
                      for (let dx = -1; dx <= 1; dx++) {
                        for (let dy = -1; dy <= 1; dy++) {
                          const key = keyOf(cx0 + dx, cy0 + dy);
                          const cand = grid.get(key);
                          if (!cand) continue;
                          for (const j of cand) {
                            if (j === i) continue;
                            const x1 = xs[j], y1 = ys[j];
                            const ddx = x1 - x0;
                            const ddy = y1 - y0;
                            const d2 = ddx * ddx + ddy * ddy;
                            if (d2 > 0 && d2 < best) best = d2;
                          }
                        }
                      }
                      if (best < Infinity) dists.push(Math.sqrt(best));
                    }
                    const m = median(dists);
                    return Number.isFinite(m) && m > 0 ? m : guess;
                  };

                  const spacingDataPerTask = plotTasks.map((t) => {
                    const b = t.options.bounds;
                    if (t.type === "scatter") return estimateNearestNeighborSpacing(t.options.x, t.options.y, b);
                    const xs = t.options.spots.map((s) => s.x);
                    const ys = t.options.spots.map((s) => s.y);
                    return estimateNearestNeighborSpacing(xs, ys, b);
                  });

                  // Panel extent = union of spots bounds and background image bounds (so image is not clipped and alignment is consistent).
                  const getEffectiveExtent = (t: (typeof plotTasks)[0]) => {
                    const b = t.options.bounds;
                    const ib = t.options.backgroundImageBounds;
                    const eMinX = Math.min(b.xMin, ib?.xMin ?? b.xMin);
                    const eMaxX = Math.max(b.xMax, ib?.xMax ?? b.xMax);
                    const eMinY = Math.min(b.yMin, ib?.yMin ?? b.yMin);
                    const eMaxY = Math.max(b.yMax, ib?.yMax ?? b.yMax);
                    return {
                      dataW: eMaxX - eMinX || 1,
                      dataH: eMaxY - eMinY || 1,
                    };
                  };

                  // Choose global target so that the largest effective panel fits in the content box.
                  const maxTargetMm = Math.min(
                    ...plotTasks.map((t, i) => {
                      const { dataW, dataH } = getEffectiveExtent(t);
                      const spacing = Number.isFinite(spacingDataPerTask[i]) && spacingDataPerTask[i] > 0 ? spacingDataPerTask[i] : 1;
                      return Math.min((contentW * spacing) / dataW, (contentH * spacing) / dataH);
                    })
                  );
                  // Shrink so panels do not overlap (leave clear margin between cells)
                  const targetNeighborMm = Math.max(0.2, 0.82 * maxTargetMm);

                  const pageW = PAGE_W_MM;
                  const pageH = PAGE_H_MM;

                  console.log("[Export PDF] Creating PDF page:", pageW, "x", pageH, "mm (targetNeighborMm:", targetNeighborMm, "mm)");
                  const pdf = new jsPDF({ unit: "mm", format: [pageW, pageH] });
                  pdf.setFillColor(26, 26, 46);
                  pdf.rect(0, 0, pageW, pageH, "F");

                  for (let i = 0; i < N; i++) {
                    console.log("[Export PDF] Drawing plot", i + 1, "/", N);
                    setExportProgress(5 + Math.round((95 * i) / N));
                    const col = i % cols;
                    const row = Math.floor(i / cols);
                    const { dataW: effectiveDataW, dataH: effectiveDataH } = getEffectiveExtent(plotTasks[i]);
                    const spacingData = Number.isFinite(spacingDataPerTask[i]) && spacingDataPerTask[i] > 0 ? spacingDataPerTask[i] : 1;
                    const scaleMmPerData = targetNeighborMm / spacingData;
                    const plotW = effectiveDataW * scaleMmPerData;
                    const plotH = effectiveDataH * scaleMmPerData;
                    const cellLeft = marginX + col * cellSize;
                    const cellTop = marginY + row * cellSize;
                    const contentRect = {
                      x: cellLeft + (contentW - plotW) / 2,
                      y: cellTop + titleHeightMm + (contentH - plotH) / 2,
                      w: plotW,
                      h: plotH,
                    };
                    const panelRectForLegend = {
                      x: cellLeft,
                      y: cellTop + titleHeightMm,
                      w: contentW,
                      h: contentH,
                    };
                    const idForLog = plotIds[i] ?? `plot_${i + 1}`;
                    const bgB = plotTasks[i].options.backgroundImageBounds;
                    const bgW = bgB ? bgB.xMax - bgB.xMin : null;
                    const bgH = bgB ? bgB.yMax - bgB.yMin : null;
                    const b = plotTasks[i].options.bounds;
                    const spotsW = b.xMax - b.xMin || 1;
                    const spotsH = b.yMax - b.yMin || 1;
                    const ratioX = bgW && bgW !== 0 ? spotsW / bgW : null;
                    const ratioY = bgH && bgH !== 0 ? spotsH / bgH : null;
                    console.log("[Export PDF] Plot metrics", {
                      id: idForLog,
                      embeddingMode,
                      effectiveDataW,
                      effectiveDataH,
                      spacingData,
                      scaleMmPerData,
                      plotW_mm: plotW,
                      plotH_mm: plotH,
                      bgW,
                      bgH,
                      dataOverBgW: ratioX,
                      dataOverBgH: ratioY,
                    });

                    const task = plotTasks[i];
                    let bgDataUrl: string | null = null;
                    const idForBg = plotIds[i];
                    if (idForBg && backgroundImageKey)
                      bgDataUrl = await loadImageAsDataUrl(datasetImageUrl(idForBg, backgroundImageKey));
                    if (bgDataUrl != null) {
                      if (task.type === "scatter") task.options.backgroundImageDataUrl = bgDataUrl;
                      else task.options.backgroundImageDataUrl = bgDataUrl;
                    }
                    task.options.spotSpacingData = spacingData;
                    task.options.panelRect = panelRectForLegend;

                    const plotTitle = task.options.title;
                    if (plotTitle) {
                      pdf.setFontSize(7);
                      pdf.setTextColor(238, 238, 238);
                      pdf.text(plotTitle, cellLeft + cellSize / 2, cellTop + 3.5, { align: "center" });
                    }

                    setExportProgress(5 + Math.round(95 * (i + 0.5) / N));
                    if (task.type === "scatter") {
                      drawPlotToPdfVector(pdf, task.options, contentRect, GStateClass);
                    } else {
                      drawMultigenePlotToPdfVector(pdf, task.options, contentRect, GStateClass);
                    }
                    setExportProgress(5 + Math.round(95 * (i + 1) / N));
                  }

                  setExportProgress(100);
                  console.log("[Export PDF] Saving file:", PDF_EXPORT_FILENAME);
                  pdf.save(PDF_EXPORT_FILENAME);
                  console.log("[Export PDF] Done");
                } catch (e) {
                  console.error("[Export PDF] Error:", e);
                  console.error("[Export PDF] Error message:", e instanceof Error ? e.message : String(e));
                  console.error("[Export PDF] Error stack:", e instanceof Error ? e.stack : "no stack");
                  debugLog("exportPdf error", e);
                } finally {
                  setExportingPdf(false);
                  setExportProgress(0);
                }
              }}
              disabled={exportingPdf}
              style={{
                padding: "6px 12px",
                borderRadius: 6,
                border: "1px solid #0f3460",
                background: exportingPdf ? "#0f3460" : "#1a1a2e",
                color: "#eee",
                fontSize: 13,
                cursor: exportingPdf ? "wait" : "pointer",
              }}
            >
              {exportingPdf ? "Exporting…" : "Export PDF"}
            </button>
          </div>
        )}
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
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 16,
              background: "#1a1a2e",
              color: "#666",
              fontSize: 14,
            }}
          >
            <span>Loading dataset{selectedDatasetIds.length > 1 ? "s" : ""}… {loadProgress}%</span>
            <div
              style={{
                width: 280,
                height: 6,
                background: "#0f3460",
                borderRadius: 3,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${loadProgress}%`,
                  height: "100%",
                  background: "#e94560",
                  borderRadius: 3,
                  transition: "width 0.2s ease-out",
                }}
              />
            </div>
          </div>
        ) : (() => {
          const hasLoaded = selectedDatasetIds.length > 0 && selectedDatasetIds.some((id) => datasetCache[id]?.spatial);
          const multiPlot = selectedDatasetIds.length > 1 && (colorMode === "gene" || colorMode === "annotation" || colorMode === "coexpression" || colorMode === "multigene");
          const showSinglePlot = hasLoaded && selectedDatasetIds.length === 1;
          if (showSinglePlot && spatial) {
            return (
          <div
            data-export-plot
            style={{
              position: "relative",
              flex: 1,
              display: "flex",
              flexDirection: "column",
              minWidth: 0,
              minHeight: 0,
            }}
          >
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
            categoricalMap={plotColorMode === "categorical" ? globalCatMap : undefined}
            categoricalLegend={plotColorMode === "categorical" ? categoricalLegendForPlot : null}
            continuousPalette={continuousPalette}
            continuousPaletteReverse={continuousPaletteReverse}
            logScale={logScale}
            colorMin={plotColorMode === "continuous" ? continuousColorRange?.colorMin : undefined}
            colorMax={plotColorMode === "continuous" ? continuousColorRange?.colorMax : undefined}
            backgroundImageUrl={
              primaryId && backgroundImageKey
                ? datasetImageUrl(primaryId, backgroundImageKey)
                : null
            }
            backgroundOpacity={backgroundOpacity}
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
            hoverGene1Name={plotColorMode === "coexpression" ? selectedGene1 : null}
            hoverGene1Values={plotColorMode === "coexpression" ? expression1 : null}
            hoverGene2Name={plotColorMode === "coexpression" ? selectedGene2 : null}
            hoverGene2Values={plotColorMode === "coexpression" ? expression2 : null}
            multigeneLayers={multigeneLayers}
            multigeneLogScale={multigeneLogScale}
            multigeneLayout={multigeneLayout}
            multigeneRangeMinInput={multigeneRangeMinInput}
            multigeneRangeMaxInput={multigeneRangeMaxInput}
            hoverMultigeneNames={
              plotColorMode === "multigene"
                ? selectedMultigeneGenes.map((e) => e.gene)
                : null
            }
            hoverMultigeneValues={
              plotColorMode === "multigene"
                ? selectedMultigeneGenes.map((e) => multigeneExpressionByGene[e.gene] ?? [])
                : null
            }
            colorBarTitle={
              plotColorMode === "continuous"
                ? colorMode === "gene"
                  ? selectedGene
                  : selectedObsCol
                : null
            }
            title={
              primaryId
                ? `${primaryId}${
                    meta
                      ? embeddingMode === "umap"
                        ? " (UMAP)"
                        : " (Spatial)"
                      : ""
                  }`
                : undefined
            }
            />
            {(expressionLoading || coexpressionLoading || multigeneLoading) && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "rgba(26, 26, 46, 0.85)",
                  color: "#ccc",
                  fontSize: 14,
                  gap: 12,
                }}
              >
                <span>
                  {expressionLoading && selectedGene
                    ? `Loading expression for ${selectedGene}…`
                    : coexpressionLoading && selectedGene1 && selectedGene2
                      ? `Loading expression for ${selectedGene1}, ${selectedGene2}…`
                      : multigeneLoading && selectedMultigeneGenes.length > 0
                        ? `Loading expression for ${selectedMultigeneGenes.map((e) => e.gene).join(", ")}…`
                        : "Loading expression…"}
                </span>
                <div
                  style={{
                    width: 240,
                    height: 6,
                    background: "#0f3460",
                    borderRadius: 3,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: "40%",
                      height: "100%",
                      background: "#e94560",
                      borderRadius: 3,
                      animation: "expression-loading-shimmer 1.2s ease-in-out infinite",
                    }}
                  />
                </div>
              </div>
            )}
          </div>
            );
          }
          if (multiPlot && hasLoaded) {
            const slotBounds = (s: { x: number[]; y: number[] }) => {
              if (s.x.length === 0) return { xMin: 0, xMax: 1, yMin: 0, yMax: 1 };
              let xMin = s.x[0], xMax = s.x[0], yMin = s.y[0], yMax = s.y[0];
              for (let i = 1; i < s.x.length; i++) {
                if (s.x[i] < xMin) xMin = s.x[i]; if (s.x[i] > xMax) xMax = s.x[i];
                if (s.y[i] < yMin) yMin = s.y[i]; if (s.y[i] > yMax) yMax = s.y[i];
              }
              return { xMin, xMax, yMin, yMax };
            };
            const slotColorBy = (id: string): (string | number)[] => {
              const d = datasetCache[id];
              if (!d?.spatial) return [];
              const n = d.spatial.x.length;
              if (colorMode === "annotation" && selectedObsCol) {
                const raw = d.obs?.data[selectedObsCol];
                if (!raw) return new Array(n).fill("nan") as (string | number)[];
                return raw.slice(0, n);
              }
              if (colorMode === "gene") {
                const expr = expressionByDataset[id];
                return expr ? expr.slice(0, n) : (new Array(n).fill(NaN) as (string | number)[]);
              }
              if (colorMode === "coexpression") {
                const e1 = expression1ByDataset[id];
                const e2 = expression2ByDataset[id];
                if (!e1 || !e2 || e1.length < n || e2.length < n) return new Array(n).fill(0);
                const mapRaw = (arr: number[]) => (coexpressionLogScale ? arr.map((x) => Math.log1p(Math.max(0, x))) : arr);
                const log1 = mapRaw(e1.slice(0, n));
                const log2 = mapRaw(e2.slice(0, n));
                const { min: min1, max: max1 } = finiteMinMax(log1);
                const { min: min2, max: max2 } = finiteMinMax(log2);
                const range1 = max1 - min1 || 1;
                const range2 = max2 - min2 || 1;
                const out: string[] = [];
                for (let i = 0; i < n; i++) {
                  const v1 = (log1[i] - min1) / range1;
                  const v2 = (log2[i] - min2) / range2;
                  out.push(coexpressionToHex(v1, v2, coexpressionPalette));
                }
                return out;
              }
              return new Array(n).fill(0);
            };
            const slotPlotMode = (id: string): ColorMode => {
              const d = datasetCache[id];
              if (!d?.spatial) return "none";
              if (colorMode === "annotation" && selectedObsCol && d.obs?.data[selectedObsCol])
                return obsValueType === "numeric" ? "continuous" : "categorical";
              if (colorMode === "gene" && expressionByDataset[id]?.length === d.spatial.x.length) return "continuous";
              if (colorMode === "coexpression") {
                const e1 = expression1ByDataset[id];
                const e2 = expression2ByDataset[id];
                const n = d.spatial.x.length;
                if (e1 && e2 && e1.length >= n && e2.length >= n) return "coexpression";
              }
              if (colorMode === "multigene" && selectedMultigeneGenes.length > 0) {
                const byGene = multigeneExpressionByDataset[id];
                if (byGene) {
                  const n = d.spatial.x.length;
                  // Show multigene when at least one gene has data in this sample (missing genes are skipped)
                  const hasAnyLoaded = selectedMultigeneGenes.some((e) => (byGene[e.gene]?.length ?? 0) >= n);
                  if (hasAnyLoaded) return "multigene";
                }
              }
              return "none";
            };
            // Build multigene layers for this slot: only genes with valid (finite) data in this dataset
            const slotMultigeneLayers = (id: string) => {
              const d = datasetCache[id]?.spatial;
              const byGene = multigeneExpressionByDataset[id];
              if (!d || !byGene || selectedMultigeneGenes.length === 0) return undefined;
              const n = d.x.length;
              const layers = selectedMultigeneGenes
                .map((entry) => {
                  const values = byGene[entry.gene];
                  if (!values || values.length < n) return null;
                  const slice = values.slice(0, n);
                  const hasFinite = slice.some((v) => Number.isFinite(v));
                  if (!hasFinite) return null;
                  return { name: entry.gene, values: slice, paletteId: entry.paletteId };
                })
                .filter((l): l is { name: string; values: number[]; paletteId: string } => l !== null);
              return layers.length > 0 ? layers : undefined;
            };
            const slotBgBounds = (m: DatasetMeta | undefined, key: string | null) => {
              if (!m?.image_info || !key) return null;
              const keys = m.image_keys ?? [];
              const refKey = keys.includes("hires") ? "hires" : keys[0];
              if (!refKey) return null;
              const info = m.image_info[refKey];
              if (!info || info.scale_factor <= 0) return null;
              return { xMin: 0, yMin: 0, xMax: info.width / info.scale_factor, yMax: info.height / info.scale_factor };
            };
            // Per-sample categorical legend: counts only for this sample (not summed across samples)
            const slotCategoricalLegend = (slotId: string): { label: string; color: string; count?: number }[] | null => {
              if (colorMode !== "annotation" || !selectedObsCol || obsValueType !== "categorical" || !globalCatMap) return null;
              const vals = datasetCache[slotId]?.obs?.data[selectedObsCol];
              if (!vals) return null;
              const n = vals.length;
              const uniq = new Set(vals.map((v) => String(v))).size;
              if (uniq > ANNOTATION_MAX_CATEGORIES) {
                return [{ label: LABEL_NAN_TOO_MANY, color: globalCatMap.get(LABEL_NAN_TOO_MANY) ?? "#888888", count: n }];
              }
              if (uniq < ANNOTATION_MIN_CATEGORIES) {
                return [{ label: LABEL_NAN_TOO_FEW, color: globalCatMap.get(LABEL_NAN_TOO_FEW) ?? "#888888", count: n }];
              }
              const counts = new Map<string, number>();
              for (let i = 0; i < n; i++) {
                const s = String(vals[i]);
                counts.set(s, (counts.get(s) ?? 0) + 1);
              }
              return Array.from(counts.entries())
                .map(([label, count]) => ({ label, count, color: globalCatMap.get(label) ?? "#888888" }))
                .sort((a, b) => (b.count !== a.count ? b.count - a.count : (a.label < b.label ? -1 : a.label > b.label ? 1 : 0)));
            };
            const cols = selectedDatasetIds.length <= 2 ? 2 : selectedDatasetIds.length <= 4 ? 2 : 3;
            const rows = Math.ceil(selectedDatasetIds.length / cols);
            const gridMinWidth = cols * MULTIPLOT_MIN_CELL_WIDTH_PX + (cols - 1) * MULTIPLOT_GAP_PX + 2 * MULTIPLOT_PADDING_PX;
            const gridMinHeight = rows * MULTIPLOT_MIN_CELL_HEIGHT_PX + (rows - 1) * MULTIPLOT_GAP_PX + 2 * MULTIPLOT_PADDING_PX;
            const gridLoading = (colorMode === "coexpression" && coexpressionLoading) || (colorMode === "multigene" && multigeneLoading);
            return (
              <div
                style={{
                  flex: 1,
                  position: "relative",
                  minHeight: 0,
                  minWidth: 0,
                  overflow: "auto",
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: `repeat(${cols}, minmax(${MULTIPLOT_MIN_CELL_WIDTH_PX}px, 1fr))`,
                    gridTemplateRows: `repeat(${rows}, minmax(${MULTIPLOT_MIN_CELL_HEIGHT_PX}px, 1fr))`,
                    gap: MULTIPLOT_GAP_PX,
                    padding: MULTIPLOT_PADDING_PX,
                    minWidth: gridMinWidth,
                    minHeight: gridMinHeight,
                    width: "100%",
                    height: "100%",
                    boxSizing: "border-box",
                  }}
                >
                {selectedDatasetIds.map((id) => {
                  const d = datasetCache[id];
                  if (!d?.spatial) return null;
                  const mode = slotPlotMode(id);
                  const slotRange = mode === "continuous" && slotContinuousRange ? slotContinuousRange[id] : null;
                  const slotMultigene = slotMultigeneLayers(id);
                  return (
                    <div key={id} data-export-plot style={{ position: "relative", minHeight: 0, minWidth: 0, display: "flex", flexDirection: "column" }}>
                      <SpatialPlot
                        x={d.spatial.x}
                        y={d.spatial.y}
                        colorBy={slotColorBy(id)}
                        colorMode={mode}
                        bounds={slotBounds(d.spatial)}
                        spotSizeScale={spotSizeScale}
                        spotOpacity={spotOpacity}
                        categoricalPalette={categoricalPalette}
                        categoricalPaletteReverse={continuousPaletteReverse}
                        categoricalMap={mode === "categorical" ? globalCatMap : undefined}
                        categoricalLegend={mode === "categorical" ? slotCategoricalLegend(id) : null}
                        continuousPalette={continuousPalette}
                        continuousPaletteReverse={continuousPaletteReverse}
                        logScale={logScale}
                        colorMin={slotRange ? slotRange.colorMin : (mode === "continuous" ? continuousColorRange?.colorMin : undefined)}
                        colorMax={slotRange ? slotRange.colorMax : (mode === "continuous" ? continuousColorRange?.colorMax : undefined)}
                        colorBarStats={slotRange?.colorBarStats ?? undefined}
                        colorBarTitle={
                          mode === "continuous"
                            ? colorMode === "gene"
                              ? selectedGene
                              : selectedObsCol
                            : null
                        }
                        backgroundImageUrl={backgroundImageKey ? datasetImageUrl(id, backgroundImageKey) : null}
                        backgroundOpacity={backgroundOpacity}
                        backgroundImageBounds={slotBgBounds(d.meta, backgroundImageKey)}
                        hoverAnnotationName={colorMode === "annotation" && obsValueType === "categorical" ? selectedObsCol : null}
                        hoverAnnotationValues={colorMode === "annotation" && selectedObsCol && d.obs?.data[selectedObsCol] ? d.obs.data[selectedObsCol] : null}
                        hoverGeneName={mode === "continuous" ? (colorMode === "gene" ? selectedGene : selectedObsCol) : null}
                        hoverGeneValues={mode === "continuous" && selectedObsCol && d.obs?.data[selectedObsCol] ? (d.obs.data[selectedObsCol] as number[]) : mode === "continuous" && colorMode === "gene" ? expressionByDataset[id] ?? null : null}
                        hoverGene1Name={mode === "coexpression" ? selectedGene1 : null}
                        hoverGene1Values={mode === "coexpression" ? (expression1ByDataset[id] ?? null) : null}
                        hoverGene2Name={mode === "coexpression" ? selectedGene2 : null}
                        hoverGene2Values={mode === "coexpression" ? (expression2ByDataset[id] ?? null) : null}
                        multigeneLayers={mode === "multigene" ? slotMultigene : undefined}
                        multigeneLogScale={multigeneLogScale}
                        multigeneLayout={multigeneLayout}
                        multigeneRangeMinInput={multigeneRangeMinInput}
                        multigeneRangeMaxInput={multigeneRangeMaxInput}
                        hoverMultigeneNames={mode === "multigene" ? selectedMultigeneGenes.map((e) => e.gene) : null}
                        hoverMultigeneValues={mode === "multigene" ? selectedMultigeneGenes.map((e) => multigeneExpressionByDataset[id]?.[e.gene] ?? []) : null}
                        title={`${id}${embeddingMode === "umap" ? " (UMAP)" : " (Spatial)"}`}
                      />
                    </div>
                  );
                })}
                {gridLoading && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "rgba(26, 26, 46, 0.85)",
                      color: "#ccc",
                      fontSize: 14,
                      gap: 12,
                    }}
                  >
                    <span>
                      {colorMode === "coexpression" && selectedGene1 && selectedGene2
                        ? `Loading co-expression for ${selectedGene1}, ${selectedGene2}…`
                        : colorMode === "multigene" && selectedMultigeneGenes.length > 0
                          ? `Loading multi-gene for ${selectedMultigeneGenes.map((e) => e.gene).join(", ")}…`
                          : "Loading…"}
                    </span>
                    <div style={{ width: 240, height: 6, background: "#0f3460", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ width: "40%", height: "100%", background: "#e94560", borderRadius: 3, animation: "expression-loading-shimmer 1.2s ease-in-out infinite" }} />
                    </div>
                  </div>
                )}
                </div>
              </div>
            );
          }
          return (
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
            {selectedDatasetIds.length === 0
              ? "Select one or more datasets from the sidebar"
              : !hasLoaded
                ? "Loading…"
                : "Select an annotation or gene to color the plot"}
          </div>
          );
        })()}
      </div>
      </div>
    </div>
  );
}
