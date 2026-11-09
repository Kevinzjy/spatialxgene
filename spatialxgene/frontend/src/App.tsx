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
  DEFAULT_DUAL_FEATURE_PALETTE,
  dualFeatureToHex,
  continuousToRgb,
  rgbToHex,
  multiFeatureValueToHex,
  type DualFeaturePalette,
  ANNOTATION_MAX_CATEGORIES,
  ANNOTATION_MIN_CATEGORIES,
  LABEL_NAN_TOO_MANY,
  LABEL_NAN_TOO_FEW,
  getCategoricalColors,
} from "./colorScale";
import type {
  MultiFeatureSegment,
  MultiFeatureVectorExportOptions,
  VectorExportLegendEntry,
  VectorExportOptions,
} from "./exportPlotVector";
import type { jsPDF } from "jspdf";
import { setDebugMode, debugLog } from "./debug";
import { percentile } from "./utils/percentile";
import {
  featureLabel,
  parseFeatureId,
  type FeatureRef,
} from "./features";
import { Sidebar, type MultiFeatureEntry } from "./components/Sidebar";

type SaveFilePickerWritable = {
  write(data: Blob): Promise<void>;
  close(): Promise<void>;
};

type SaveFilePickerHandle = {
  createWritable(): Promise<SaveFilePickerWritable>;
};

type ShowSaveFilePicker = (options: {
  suggestedName: string;
  types: Array<{ description: string; accept: Record<string, string[]> }>;
}) => Promise<SaveFilePickerHandle>;

type PdfSaveTarget =
  | { type: "file-system"; handle: SaveFilePickerHandle; filename: string }
  | { type: "download"; filename: string };

function buildPdfExportFilename(now = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  const stamp = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    "-",
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join("");
  return `spatialxgene-${stamp}.pdf`;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

async function choosePdfSaveTarget(filename: string): Promise<PdfSaveTarget | null> {
  const showSaveFilePicker = (window as Window & { showSaveFilePicker?: ShowSaveFilePicker })
    .showSaveFilePicker;
  if (typeof showSaveFilePicker !== "function") return { type: "download", filename };

  try {
    const handle = await showSaveFilePicker({
      suggestedName: filename,
      types: [{ description: "PDF file", accept: { "application/pdf": [".pdf"] } }],
    });
    return { type: "file-system", handle, filename };
  } catch (error) {
    if (isAbortError(error)) return null;
    console.warn("[Export PDF] Save dialog unavailable, falling back to browser download:", error);
    return { type: "download", filename };
  }
}

async function savePdfToTarget(pdf: jsPDF, target: PdfSaveTarget): Promise<void> {
  if (target.type === "download") {
    pdf.save(target.filename);
    return;
  }

  const writable = await target.handle.createWritable();
  await writable.write(pdf.output("blob") as Blob);
  await writable.close();
}

/** Convert an obs value array to numeric values; non-finite entries become NaN. */
function obsValuesToNumbers(values: Array<string | number> | undefined, length?: number): number[] {
  const out = (values ?? []).map((value) => {
    const num = typeof value === "number" ? value : Number(value);
    return Number.isFinite(num) ? num : NaN;
  });
  if (length != null && out.length < length) {
    while (out.length < length) out.push(NaN);
  }
  return out;
}

/** A panel split remembers the selected obs key and the virtual child ids rendered from one parent dataset. */
type SplitDefinition = {
  key: string;
  values: string[];
  childrenIds: string[];
};
const SPLIT_ID_SEPARATOR = "@@split:";

function makeSplitChildId(parentId: string, key: string, value: string): string {
  return `${parentId}${SPLIT_ID_SEPARATOR}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

function parseSplitChildId(childId: string): { parentId: string; key: string; value: string } | null {
  const separatorIndex = childId.indexOf(SPLIT_ID_SEPARATOR);
  if (separatorIndex < 0) return null;
  const parentId = childId.slice(0, separatorIndex);
  const packed = childId.slice(separatorIndex + SPLIT_ID_SEPARATOR.length);
  const equalsIndex = packed.indexOf("=");
  if (equalsIndex < 0) return null;
  try {
    return {
      parentId,
      key: decodeURIComponent(packed.slice(0, equalsIndex)),
      value: decodeURIComponent(packed.slice(equalsIndex + 1)),
    };
  } catch {
    return null;
  }
}

/** Map a parent-array index set onto one virtual split child. */
function sliceValuesForSplitChild(
  parent: LoadedDataset,
  childId: string,
  values: number[] | null | undefined
): number[] | null {
  if (!values) return null;
  const parsed = parseSplitChildId(childId);
  if (!parsed || parsed.parentId !== parent.meta.id) return null;
  const parentValues = parent.obs.data[parsed.key];
  if (!parentValues) return null;
  const indices: number[] = [];
  for (let i = 0; i < parentValues.length; i++) {
    if (String(parentValues[i] ?? "nan") === parsed.value) indices.push(i);
  }
  return indices.map((i) => (i < values.length ? values[i] : NaN));
}

/** Only offer obs keys with a practical number of groups for a panel split. */
function getSplitCandidates(parent: LoadedDataset): Array<{ key: string; count: number }> {
  return parent.obs.columns
    .map((key) => {
      const values = parent.obs.data[key] ?? [];
      return { key, count: new Set(values.map(String)).size };
    })
    .filter((candidate) => candidate.count >= 2 && candidate.count <= 200)
    .sort((a, b) => {
      const preferred = ["sample", "sample_id", "library_id", "orig.ident", "batch", "dataset", "slice"];
      const ai = preferred.indexOf(a.key);
      const bi = preferred.indexOf(b.key);
      if (ai >= 0 || bi >= 0) return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
      if (a.count !== b.count) return a.count - b.count;
      return a.key.localeCompare(b.key);
    });
}

function createSplitDefinition(parent: LoadedDataset, key: string): SplitDefinition | null {
  const values = parent.obs.data[key];
  if (!values?.length) return null;
  const unique = Array.from(new Set(values.map((value) => String(value ?? "nan")))).sort((a, b) => {
    const na = Number(a);
    const nb = Number(b);
    if (Number.isFinite(na) && Number.isFinite(nb) && String(na) === a && String(nb) === b) return na - nb;
    return a.localeCompare(b, undefined, { numeric: true });
  });
  if (unique.length < 2 || unique.length > 200) return null;
  return {
    key,
    values: unique,
    childrenIds: unique.map((value) => makeSplitChildId(parent.meta.id, key, value)),
  };
}

function buildSplitDatasets(parent: LoadedDataset, split: SplitDefinition): Record<string, LoadedDataset> {
  const values = parent.obs.data[split.key] ?? [];
  const valueSet = new Map<string, number[]>();
  split.values.forEach((value) => valueSet.set(value, []));
  for (let i = 0; i < values.length; i++) {
    const value = String(values[i] ?? "nan");
    valueSet.get(value)?.push(i);
  }

  const next: Record<string, LoadedDataset> = {};
  for (const value of split.values) {
    const indices = valueSet.get(value) ?? [];
    const childId = makeSplitChildId(parent.meta.id, split.key, value);
    const spatial = {
      x: indices.map((i) => parent.spatial.x[i]),
      y: indices.map((i) => parent.spatial.y[i]),
    };
    let xMin = spatial.x[0] ?? 0;
    let xMax = spatial.x[0] ?? 1;
    let yMin = spatial.y[0] ?? 0;
    let yMax = spatial.y[0] ?? 1;
    for (let i = 1; i < spatial.x.length; i++) {
      if (spatial.x[i] < xMin) xMin = spatial.x[i];
      if (spatial.x[i] > xMax) xMax = spatial.x[i];
      if (spatial.y[i] < yMin) yMin = spatial.y[i];
      if (spatial.y[i] > yMax) yMax = spatial.y[i];
    }
    const obsData: ObsResponse["data"] = {};
    for (const column of parent.obs.columns) {
      obsData[column] = indices.map((i) => parent.obs.data[column]?.[i] ?? "nan");
    }
    next[childId] = {
      meta: {
        ...parent.meta,
        id: childId,
        name: `${parent.meta.name} / ${value}`,
        n_obs: indices.length,
        x_min: xMin,
        x_max: xMax,
        y_min: yMin,
        y_max: yMax,
      },
      spatial,
      obs: { columns: parent.obs.columns, data: obsData },
      genes: parent.genes,
    };
  }
  return next;
}

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

/** Parse multi-feature range input: "p1"/"p99.5" → percentile; "0.5" → raw. Returns null if invalid. */
function parseMultiFeatureRange(
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
  if (mode === "dualFeature") {
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
import { estimateSpotSpacingData } from "./utils/spotSizing";

type RasterizedPdfDpi = 300 | 600 | 1200;
type PdfExportRequest =
  | { mode: "raw" }
  | { mode: "rasterized"; dpi: RasterizedPdfDpi };

type PlotTask =
  | { type: "scatter"; options: VectorExportOptions }
  | { type: "multiFeature"; options: MultiFeatureVectorExportOptions };

export default function App() {
  const [datasets, setDatasets] = useState<DatasetItem[]>([]);
  /** One or more dataset ids for comparison; empty = none selected. */
  const [selectedDatasetIds, setSelectedDatasetIds] = useState<string[]>([]);
  /** Cache of loaded dataset data (meta, spatial, obs, genes) keyed by dataset id. */
  const [datasetCache, setDatasetCache] = useState<Record<string, LoadedDataset>>({});
  /** Per-parent panel split. Virtual child datasets are generated locally from the already loaded parent. */
  const [splitByDataset, setSplitByDataset] = useState<Record<string, SplitDefinition>>({});
  /** IDs actually shown in panels: normally selectedDatasetIds, or split children after a panel split. */
  const activeDatasetIds = useMemo(
    () => selectedDatasetIds.flatMap((id) => splitByDataset[id]?.childrenIds ?? [id]),
    [selectedDatasetIds, splitByDataset]
  );
  /** Virtual child id -> original selected dataset id (used for background image requests and Merge). */
  const splitParentByChildId = useMemo(() => {
    const map = new Map<string, string>();
    for (const [parentId, split] of Object.entries(splitByDataset)) {
      split.childrenIds.forEach((childId) => map.set(childId, parentId));
    }
    return map;
  }, [splitByDataset]);
  /** Primary slot: first displayed id. Used for sidebar meta display and embedding/layer. */
  const primaryId = activeDatasetIds[0] ?? null;
  const meta = primaryId ? datasetCache[primaryId]?.meta ?? null : null;
  const spatial = primaryId ? datasetCache[primaryId]?.spatial ?? null : null;
  const obs = primaryId ? datasetCache[primaryId]?.obs ?? null : null;
  /** Union of all genes from all selected datasets (for multi-dataset: user can pick any gene; missing in a sample → NaN). */
  const genes = useMemo(() => {
    const set = new Set<string>();
    if (activeDatasetIds.length === 0) return [];
    for (const id of activeDatasetIds) {
      const gs = datasetCache[id]?.genes ?? [];
      gs.forEach((g) => set.add(g));
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [activeDatasetIds, datasetCache]);

  /** Union of all obs columns from all selected datasets (for multi-dataset: same annotation key across samples). */
  const obsColumns = useMemo(() => {
    if (activeDatasetIds.length === 0) return [];
    const set = new Set<string>();
    for (const id of activeDatasetIds) {
      const cols = datasetCache[id]?.obs?.columns ?? [];
      cols.forEach((c) => set.add(c));
    }
    const clusterFirst = ["leiden", "louvain"];
    const rest = Array.from(set).filter((c) => !clusterFirst.includes(c));
    const first = clusterFirst.filter((c) => set.has(c));
    return [...first, ...rest.sort((a, b) => a.localeCompare(b))];
  }, [activeDatasetIds, datasetCache]);
  /** Obs columns that are usable as numeric overlays in dual/multi-feature modes. */
  const numericObsColumns = useMemo(() => {
    if (activeDatasetIds.length === 0) return [];
    const candidates = new Set<string>();
    for (const id of activeDatasetIds) {
      (datasetCache[id]?.obs?.columns ?? []).forEach((column) => {
        if (obsColumns.includes(column)) candidates.add(column);
      });
    }
    return Array.from(candidates)
      .filter((column) =>
        activeDatasetIds.every((id) => {
          const values = datasetCache[id]?.obs?.data[column];
          return values?.length > 0 && values.every((value) => {
            const num = typeof value === "number" ? value : Number(value);
            return Number.isFinite(num);
          });
        })
      )
      .sort((a, b) => a.localeCompare(b));
  }, [activeDatasetIds, datasetCache, obsColumns]);
  /** Expression per dataset (gene mode). Key = dataset id. */
  const [expressionByDataset, setExpressionByDataset] = useState<Record<string, number[]>>({});
  /** Backward compat: single-dataset expression for code paths that still expect one array. */
  const expression = primaryId && activeDatasetIds.length === 1 ? expressionByDataset[primaryId] ?? null : null;
  const [colorMode, setColorMode] = useState<"gene" | "annotation" | "dualFeature" | "multiFeature">("annotation");
  const [selectedGene, setSelectedGene] = useState<string | null>(null);
  const [selectedFeature1, setSelectedFeature1] = useState<string | null>(null);
  const [selectedFeature2, setSelectedFeature2] = useState<string | null>(null);
  const [expression1, setExpression1] = useState<number[] | null>(null);
  const [expression2, setExpression2] = useState<number[] | null>(null);
  /** Dual Feature first feature values per dataset (for multi-sample view). */
  const [expression1ByDataset, setExpression1ByDataset] = useState<Record<string, number[]>>({});
  /** Dual Feature second feature values per dataset (for multi-sample view). */
  const [expression2ByDataset, setExpression2ByDataset] = useState<Record<string, number[]>>({});
  const [dualFeaturePalette, setDualFeaturePalette] = useState<DualFeaturePalette>(DEFAULT_DUAL_FEATURE_PALETTE);
  const [dualFeatureLogScale, setDualFeatureLogScale] = useState(false);
  const [selectedMultiFeatures, setSelectedMultiFeatures] = useState<MultiFeatureEntry[]>([]);
  const [multiFeatureLogScale, setMultiFeatureLogScale] = useState(false);
  const [multiFeatureLayout, setMultiFeatureLayout] = useState<"pie" | "grid">("pie");
  const [multiFeatureRangeMinInput, setMultiFeatureRangeMinInput] = useState("p0");
  const [multiFeatureRangeMaxInput, setMultiFeatureRangeMaxInput] = useState("p100");
  const [multiFeatureValuesByFeature, setMultiFeatureValuesByFeature] = useState<Record<string, number[]>>({});
  /** Multi-gene expression per dataset and per gene (for multi-sample view). dataset id -> gene -> values */
  const [multiFeatureValuesByDataset, setMultiFeatureValuesByDataset] = useState<Record<string, Record<string, number[]>>>({});
  const [multiFeatureLoading, setMultiFeatureLoading] = useState(false);
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
  /** True while fetching expression for dual feature mode. */
  const [dualFeatureLoading, setDualFeatureLoading] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [anndataError, setAnndataError] = useState<string | null>(null);
  const [dataDir, setDataDir] = useState<string | null>(null);
  const [embeddingMode, setEmbeddingMode] = useState<"spatial" | "umap" | "pca" | "tsne">("spatial");
  const selectedIdsRef = useRef<string[]>([]);
  const loadAbortRef = useRef<AbortController | null>(null);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);
  /** IDs whose metadata or initial data request failed; prevents the load effect from retrying them forever. */
  const failedLoadIdsRef = useRef<Set<string>>(new Set());
  const [splitModalParentId, setSplitModalParentId] = useState<string | null>(null);
  const [splitSearch, setSplitSearch] = useState("");

  useEffect(() => {
    selectedIdsRef.current = selectedDatasetIds;
  }, [selectedDatasetIds]);

  useEffect(() => {
    fetchConfig().then((c) => {
      setDebugMode(c.debug);
      setDataDir(c.data_dir ?? null);
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

  useEffect(() => {
    if (!exportMenuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      const menu = exportMenuRef.current;
      if (menu && event.target instanceof Node && !menu.contains(event.target)) {
        setExportMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExportMenuOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [exportMenuOpen]);

  /** Put one already loaded panel into per-obs-value virtual panels. */
  const applySplit = useCallback((parentId: string, key: string) => {
    const parent = datasetCache[parentId];
    if (!parent?.spatial || !parent.obs) return;
    const split = createSplitDefinition(parent, key);
    if (!split) {
      setError(`Cannot split by "${key}": it does not contain 2–200 unique values.`);
      return;
    }
    const children = buildSplitDatasets(parent, split);
    setDatasetCache((prev) => ({ ...prev, ...children }));
    setSplitByDataset((prev) => ({ ...prev, [parentId]: split }));
    setSplitModalParentId(null);
    setSplitSearch("");
  }, [datasetCache]);

  /** Remove virtual children and return the parent to one merged panel. */
  const removeSplit = useCallback((parentId: string) => {
    const childIds = splitByDataset[parentId]?.childrenIds ?? [];
    setSplitByDataset((prev) => {
      if (!(parentId in prev)) return prev;
      const next = { ...prev };
      delete next[parentId];
      return next;
    });
    setDatasetCache((prev) => {
      if (childIds.length === 0) return prev;
      const next = { ...prev };
      childIds.forEach((id) => delete next[id]);
      return next;
    });
    const clearByDataset = <T,>(state: Record<string, T>): Record<string, T> => {
      const next = { ...state };
      childIds.forEach((id) => delete next[id]);
      return next;
    };
    setExpressionByDataset(clearByDataset);
    setExpression1ByDataset(clearByDataset);
    setExpression2ByDataset(clearByDataset);
    setMultiFeatureValuesByDataset(clearByDataset);
  }, [splitByDataset]);

  /** When a selected parent disappears, discard its split and virtual children. */
  const pruneSplitsForSelection = useCallback((ids: string[]) => {
    const selected = new Set(ids);
    const removedChildren = Object.entries(splitByDataset)
      .filter(([parentId]) => !selected.has(parentId))
      .flatMap(([, split]) => split.childrenIds);
    if (removedChildren.length === 0) return;
    setSplitByDataset((prev) => {
      const next = { ...prev };
      Object.keys(prev).forEach((parentId) => {
        if (!selected.has(parentId)) delete next[parentId];
      });
      return next;
    });
    setDatasetCache((cache) => {
      const next = { ...cache };
      removedChildren.forEach((id) => delete next[id]);
      return next;
    });
  }, [splitByDataset]);

  const splitModalParent = splitModalParentId ? datasetCache[splitModalParentId] : null;
  const splitModalCandidates = useMemo(
    () => (splitModalParent?.spatial ? getSplitCandidates(splitModalParent) : []),
    [splitModalParent]
  );
  const filteredSplitCandidates = useMemo(() => {
    const query = splitSearch.trim().toLowerCase();
    if (!query) return splitModalCandidates;
    return splitModalCandidates.filter((candidate) => candidate.key.toLowerCase().includes(query));
  }, [splitModalCandidates, splitSearch]);

  useEffect(() => {
    if (splitModalParentId) setSplitSearch("");
  }, [splitModalParentId]);

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
    async (
      ids: string[],
      currentEmbeddingMode: "spatial" | "umap" | "pca" | "tsne",
      options?: { allSelectedIds: string[] }
    ) => {
      if (ids.length === 0) return;
      const isIncremental = Boolean(options?.allSelectedIds && ids.length < options.allSelectedIds.length);
      loadAbortRef.current?.abort();
      const ac = new AbortController();
      loadAbortRef.current = ac;
      const signal = ac.signal;
      debugLog("loadDatasets start", { ids, isIncremental });
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
            failedLoadIdsRef.current.add(id);
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
            failedLoadIdsRef.current.add(id);
            setError(e instanceof Error ? e.message : String(e));
          }
        }
        if (selectedIdsRef.current.length === 0) return;
        setDatasetCache((prev) => ({ ...prev, ...nextCache }));
        if (!isIncremental) {
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
          setSelectedFeature1(null);
          setSelectedFeature2(null);
          setRangeMinInput("p0");
          setRangeMaxInput("p100");
          setBackgroundImageKey(null);
          setSelectedLayer("X");
          setBackgroundOpacity(1);
        }
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
      setSplitByDataset({});
      failedLoadIdsRef.current.clear();
      setExpressionByDataset({});
      setSelectedObsCol(null);
      setObsValueType("categorical");
      setSelectedGene(null);
      setSelectedFeature1(null);
      setSelectedFeature2(null);
      setSelectedMultiFeatures([]);
      setMultiFeatureValuesByFeature({});
      setMultiFeatureValuesByDataset({});
      setExpression1ByDataset({});
      setExpression2ByDataset({});
      setExpression1(null);
      setExpression2(null);
      setSelectedLayer("X");
      setBackgroundImageKey(null);
      setEmbeddingMode("spatial");
    }
  }, [selectedDatasetIds]);

  // Load datasets when selection changes: only fetch ids not already in cache (incremental load)
  useEffect(() => {
    if (selectedDatasetIds.length === 0) return;
    const idsToLoad = selectedDatasetIds.filter(
      (id) => !datasetCache[id]?.spatial && !failedLoadIdsRef.current.has(id)
    );
    if (idsToLoad.length === 0) return;
    loadDatasets(idsToLoad, embeddingMode, { allSelectedIds: selectedDatasetIds });
  }, [selectedDatasetIds, datasetCache, embeddingMode, loadDatasets]);

  useEffect(() => {
    if (activeDatasetIds.length === 0 || !selectedGene) {
      setExpressionByDataset({});
      setExpressionLoading(false);
      return;
    }
    const ac = new AbortController();
    const signal = ac.signal;
    setExpressionLoading(true);
    const slotLengths: Record<string, number> = {};
    activeDatasetIds.forEach((id) => {
      slotLengths[id] = datasetCache[id]?.spatial?.x?.length ?? 0;
    });
    const parentBySlot = new Map(activeDatasetIds.map((id) => [id, splitParentByChildId.get(id) ?? id]));
    const parentIds = Array.from(new Set(parentBySlot.values()));
    debugLog("fetchExpression", { datasetIds: activeDatasetIds, gene: selectedGene, layer: selectedLayer });
    Promise.all(
      parentIds.map((id) =>
        fetchExpression(id, selectedGene, signal, selectedLayer).catch((e) => {
          if (e?.name === "AbortError") throw e;
          return null;
        })
      )
    )
      .then((arrays) => {
        const expressionByParent = new Map(parentIds.map((id, i) => [id, arrays[i]] as const));
        const next: Record<string, number[]> = {};
        activeDatasetIds.forEach((id) => {
          const n = slotLengths[id] ?? 0;
          const parentId = parentBySlot.get(id) ?? id;
          const parentValues = expressionByParent.get(parentId) ?? null;
          const values = parentId === id
            ? parentValues
            : sliceValuesForSplitChild(datasetCache[parentId], id, parentValues);
          next[id] = values ?? new Array(n).fill(NaN);
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
  }, [activeDatasetIds, selectedGene, selectedLayer, datasetCache, splitParentByChildId]);

  // Load both numeric features (genes or obs columns) for dual-feature mode and all selected datasets.
  useEffect(() => {
    if (activeDatasetIds.length === 0 || !selectedFeature1 || !selectedFeature2) {
      setExpression1ByDataset({});
      setExpression2ByDataset({});
      setExpression1(null);
      setExpression2(null);
      setDualFeatureLoading(false);
      return;
    }
    const ac = new AbortController();
    const signal = ac.signal;
    setDualFeatureLoading(true);
    const ids = [...activeDatasetIds];
    const feature1 = parseFeatureId(selectedFeature1);
    const feature2 = parseFeatureId(selectedFeature2);
    const slotLength = (id: string) => datasetCache[id]?.spatial?.x?.length ?? 0;
    const parentFeatureRequests = new Map<string, Promise<number[] | null>>();
    const loadFeatureForParent = (parentId: string, feature: FeatureRef): Promise<number[] | null> => {
      const requestKey = `${parentId}\0${feature.key}\0${selectedLayer}`;
      let request = parentFeatureRequests.get(requestKey);
      if (!request) {
        request = fetchExpression(parentId, feature.key, signal, selectedLayer).catch((e) => (
          e?.name === "AbortError" ? Promise.reject(e) : null
        ));
        parentFeatureRequests.set(requestKey, request);
      }
      return request;
    };
    const loadFeature = async (id: string, feature: FeatureRef): Promise<number[] | null> => {
      if (feature.source === "obs") {
        const values = obsValuesToNumbers(datasetCache[id]?.obs?.data[feature.key], slotLength(id));
        return values.length > 0 ? values : null;
      }
      const parentId = splitParentByChildId.get(id) ?? id;
      const parentValues = await loadFeatureForParent(parentId, feature);
      return parentId === id
        ? parentValues
        : sliceValuesForSplitChild(datasetCache[parentId], id, parentValues);
    };
    debugLog("fetchDualFeature", { datasetIds: ids, feature1: selectedFeature1, feature2: selectedFeature2, layer: selectedLayer });
    Promise.all(
      ids.flatMap((id) => [
        loadFeature(id, feature1),
        loadFeature(id, feature2),
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
        debugLog("fetchDualFeature done", { ids, len1: prim1?.length, len2: prim2?.length });
      })
      .catch((e) => {
        if (e?.name === "AbortError") return;
        debugLog("fetchDualFeature error", { error: String(e) });
        setExpression1ByDataset({});
        setExpression2ByDataset({});
        setExpression1(null);
        setExpression2(null);
      })
      .finally(() => setDualFeatureLoading(false));
    return () => {
      ac.abort();
      setDualFeatureLoading(false);
    };
  }, [activeDatasetIds, primaryId, selectedFeature1, selectedFeature2, selectedLayer, datasetCache, splitParentByChildId]);

  // Load each selected feature (gene or numeric obs column) for multi-feature mode and all selected datasets.
  useEffect(() => {
    if (activeDatasetIds.length === 0 || selectedMultiFeatures.length === 0) {
      setMultiFeatureValuesByFeature({});
      setMultiFeatureValuesByDataset({});
      setMultiFeatureLoading(false);
      return;
    }
    const ac = new AbortController();
    const signal = ac.signal;
    setMultiFeatureLoading(true);
    const ids = [...activeDatasetIds];
    const features = selectedMultiFeatures.map((e) => e.featureId);
    const slotLength = (id: string) => datasetCache[id]?.spatial?.x?.length ?? 0;
    const parentFeatureRequests = new Map<string, Promise<number[] | null>>();
    const loadFeatureForParent = (parentId: string, feature: FeatureRef): Promise<number[] | null> => {
      const requestKey = `${parentId}\0${feature.key}\0${selectedLayer}`;
      let request = parentFeatureRequests.get(requestKey);
      if (!request) {
        request = fetchExpression(parentId, feature.key, signal, selectedLayer).catch((e) => (
          e?.name === "AbortError" ? Promise.reject(e) : null
        ));
        parentFeatureRequests.set(requestKey, request);
      }
      return request;
    };
    const loadFeature = async (id: string, featureId: string): Promise<{ id: string; featureId: string; arr: number[] | null }> => {
      const feature = parseFeatureId(featureId);
      if (feature.source === "obs") {
        const values = obsValuesToNumbers(datasetCache[id]?.obs?.data[feature.key], slotLength(id));
        return { id, featureId, arr: values.length > 0 ? values : null };
      }
      const parentId = splitParentByChildId.get(id) ?? id;
      const parentValues = await loadFeatureForParent(parentId, feature);
      const values = parentId === id
        ? parentValues
        : sliceValuesForSplitChild(datasetCache[parentId], id, parentValues);
      return { id, featureId, arr: values };
    };
    Promise.all(
      ids.flatMap((id) =>
        features.map((featureId) =>
          loadFeature(id, featureId)
        )
      )
    )
      .then((results) => {
        const byDataset: Record<string, Record<string, number[]>> = {};
        ids.forEach((id) => {
          byDataset[id] = {};
        });
        results.forEach(({ id, featureId, arr }) => {
          if (arr) byDataset[id]![featureId] = arr;
        });
        setMultiFeatureValuesByDataset(byDataset);
        setMultiFeatureValuesByFeature(primaryId ? (byDataset[primaryId] ?? {}) : {});
      })
      .catch((e) => {
        if (e?.name === "AbortError") return;
        setMultiFeatureValuesByDataset({});
        setMultiFeatureValuesByFeature({});
      })
      .finally(() => setMultiFeatureLoading(false));
    return () => {
      ac.abort();
      setMultiFeatureLoading(false);
    };
  }, [activeDatasetIds, primaryId, selectedLayer, selectedMultiFeatures, datasetCache, splitParentByChildId]);

  const colorByValues = React.useMemo(() => {
    if (!spatial) return [];
    const n = spatial.x.length;
    if (colorMode === "annotation" && selectedObsCol) {
      const raw = obs?.data[selectedObsCol];
      if (!raw) return new Array(n).fill("nan") as (string | number)[];
      const sliced = raw.slice(0, n);
      if (obsValueType === "categorical" && activeDatasetIds.length === 1) {
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
    if (colorMode === "dualFeature" && expression1 && expression2 && expression1.length >= n && expression2.length >= n) {
      const mapRaw = (arr: number[]) => (dualFeatureLogScale ? arr.map((x) => Math.log1p(Math.max(0, x))) : arr);
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
        out.push(dualFeatureToHex(v1, v2, dualFeaturePalette));
      }
      return out;
    }
    // No annotation/gene selected: still show all points (color decided by plotColorMode).
    return new Array(n).fill(0);
  }, [obs, spatial, colorMode, selectedObsCol, obsValueType, expression, expression1, expression2, dualFeaturePalette, dualFeatureLogScale]);

  const plotColorMode: ColorMode = React.useMemo(() => {
    if (!spatial) return "none";
    if (colorMode === "annotation" && selectedObsCol && obs?.data[selectedObsCol]) {
      return obsValueType === "numeric" ? "continuous" : "categorical";
    }
    if (colorMode === "gene" && expression && expression.length === spatial.x.length) {
      return "continuous";
    }
    if (
      colorMode === "dualFeature" &&
      expression1 &&
      expression2 &&
      expression1.length === spatial.x.length &&
      expression2.length === spatial.x.length
    ) {
      return "dualFeature";
    }
    if (colorMode === "multiFeature" && selectedMultiFeatures.length > 0 && spatial.x.length > 0) {
      const n = spatial.x.length;
      const hasAnyWithData = selectedMultiFeatures.some((e) => {
        const vals = multiFeatureValuesByFeature[e.featureId];
        return (vals?.length ?? 0) >= n && (vals?.some((v) => Number.isFinite(v)) ?? false);
      });
      if (hasAnyWithData) return "multiFeature";
    }
    return "none";
  }, [spatial, colorMode, selectedObsCol, obs, expression, expression1, expression2, selectedMultiFeatures, multiFeatureValuesByFeature, obsValueType]);
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
      const arrays = activeDatasetIds
        .map((id) => expressionByDataset[id])
        .filter((arr): arr is number[] => !!arr && arr.some((v) => Number.isFinite(v))) as number[][];
      if (arrays.length === 0) return null;
      if (arrays.length === 1) return arrays[0];
      return arrays.flat();
    }
    if (colorMode === "annotation" && obsValueType === "numeric" && selectedObsCol) {
      if (activeDatasetIds.length > 1) {
        const arrays = activeDatasetIds
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
  }, [colorMode, obsValueType, selectedObsCol, obs, activeDatasetIds, expressionByDataset, datasetCache]);

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
    if (activeDatasetIds.length <= 1) return null;
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
      for (const id of activeDatasetIds) {
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
      for (const id of activeDatasetIds) {
        out[id] = { colorMin: lo, colorMax: hi, colorBarStats: bar };
      }
    }
    return Object.keys(out).length > 0 ? out : null;
  }, [
    activeDatasetIds,
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

  const multiFeatureLayers = React.useMemo(() => {
    if (!spatial || selectedMultiFeatures.length === 0) return undefined;
    const n = spatial.x.length;
    const layers = selectedMultiFeatures
      .map((entry) => {
        const values = multiFeatureValuesByFeature[entry.featureId];
        if (!values || values.length < n) return null;
        const slice = values.slice(0, n);
        const hasFinite = slice.some((v) => Number.isFinite(v));
        if (!hasFinite) return null;
        return { name: featureLabel(entry.featureId), values: slice, paletteId: entry.paletteId };
      })
      .filter((l): l is { name: string; values: number[]; paletteId: string } => l !== null);
    return layers.length > 0 ? layers : undefined;
  }, [spatial, selectedMultiFeatures, multiFeatureValuesByFeature]);

  const effectiveMultiFeatureColorRange = React.useMemo(() => {
    if (!multiFeatureLayers || multiFeatureLayers.length === 0) return null;
    const firstValues = multiFeatureLayers[0].values;
    const lo = parseRangeInput(multiFeatureRangeMinInput, firstValues);
    const hi = parseRangeInput(multiFeatureRangeMaxInput, firstValues);
    if (lo == null && hi == null) return null;
    const { min: dataMin, max: dataMax } = finiteMinMax(firstValues);
    const colorMin = lo ?? dataMin;
    const colorMax = hi ?? dataMax;
    return {
      colorMin: Math.min(colorMin, colorMax),
      colorMax: Math.max(colorMin, colorMax),
    };
  }, [multiFeatureLayers, multiFeatureRangeMinInput, multiFeatureRangeMaxInput]);

  /** Global unique labels for selected annotation column across all samples (for unified categorical color map). */
  const globalCategoricalLabels = useMemo(() => {
    if (colorMode !== "annotation" || !selectedObsCol || obsValueType !== "categorical") return [];
    const set = new Set<string>();
    let anyMissing = false;
    for (const id of activeDatasetIds) {
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
  }, [colorMode, selectedObsCol, obsValueType, activeDatasetIds, datasetCache]);

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
      for (const id of activeDatasetIds) {
        const vals = datasetCache[id]?.obs?.data[selectedObsCol];
        if (vals) total += vals.length;
      }
      return [{ label: LABEL_NAN_TOO_MANY, count: total, color: globalCatMap.get(LABEL_NAN_TOO_MANY) ?? "#888888" }];
    }
    if (uniq < ANNOTATION_MIN_CATEGORIES) {
      let total = 0;
      for (const id of activeDatasetIds) {
        const vals = datasetCache[id]?.obs?.data[selectedObsCol];
        if (vals) total += vals.length;
      }
      return [{ label: LABEL_NAN_TOO_FEW, count: total, color: globalCatMap.get(LABEL_NAN_TOO_FEW) ?? "#888888" }];
    }
    const counts = new Map<string, number>();
    for (const id of activeDatasetIds) {
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
  }, [colorMode, selectedObsCol, obsValueType, globalCatMap, globalCategoricalLabels, activeDatasetIds, datasetCache]);

  /** For in-plot categorical legend: label, color, and spot count (no scroll; compact wrap in corner). */
  const categoricalLegendForPlot = useMemo(
    () => annotationLegendEntries?.map(({ label, color, count }) => ({ label, color, count })) ?? null,
    [annotationLegendEntries]
  );

  const handleEmbeddingModeChange = useCallback(
    async (mode: "spatial" | "umap" | "pca" | "tsne") => {
      if (activeDatasetIds.length === 0 || !meta) return;
      if (mode === embeddingMode) return;
      if (mode === "spatial" && !(meta.has_spatial ?? meta.layout === "spatial")) return;
      if (mode === "umap" && !(meta.has_umap ?? false)) return;
      if (mode === "pca" && !(meta.has_pca ?? false)) return;
      if (mode === "tsne" && !(meta.has_tsne ?? false)) return;
      setEmbeddingMode(mode);
      if (mode !== "spatial") {
        setBackgroundImageKey(null);
      }
      // Fetch parent datasets only; split children are regenerated from their refreshed parent coordinates.
      const ids = Array.from(new Set(activeDatasetIds.map((id) => splitParentByChildId.get(id) ?? id)));
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
          for (const [parentId, split] of Object.entries(splitByDataset)) {
            const parent = next[parentId];
            if (parent?.spatial) Object.assign(next, buildSplitDatasets(parent, split));
          }
          return next;
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        debugLog("switchEmbedding error", { datasetIds: ids, mode, error: msg });
        setError(msg);
      }
    },
    [activeDatasetIds, splitParentByChildId, splitByDataset, meta, embeddingMode]
  );

  const buildPdfPlotTasks = (): { plotTasks: PlotTask[]; plotIds: string[] } => {
    const hasLoaded = activeDatasetIds.length > 0 && activeDatasetIds.some((id) => datasetCache[id]?.spatial);
    const multiPlot =
      activeDatasetIds.length > 1 &&
      (colorMode === "gene" || colorMode === "annotation" || colorMode === "dualFeature" || colorMode === "multiFeature");
    const showSinglePlot = hasLoaded && activeDatasetIds.length === 1 && spatial != null;

    const getSlotBounds = (s: { x: number[]; y: number[] }) => {
      if (s.x.length === 0 || s.y.length === 0) return { xMin: 0, xMax: 1, yMin: 0, yMax: 1 };
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
      if (colorMode === "dualFeature") {
        const e1 = expression1ByDataset[id];
        const e2 = expression2ByDataset[id];
        const n = d.spatial.x.length;
        if (e1 && e2 && e1.length >= n && e2.length >= n) return "dualFeature";
      }
      if (colorMode === "multiFeature" && selectedMultiFeatures.length > 0) {
        const byFeature = multiFeatureValuesByDataset[id];
        if (byFeature && selectedMultiFeatures.some((entry) => (byFeature[entry.featureId]?.length ?? 0) >= d.spatial.x.length)) {
          return "multiFeature";
        }
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
      if (colorMode === "dualFeature") {
        const e1 = expression1ByDataset[id];
        const e2 = expression2ByDataset[id];
        if (!e1 || !e2 || e1.length < n || e2.length < n) return new Array(n).fill(0);
        const mapRaw = (arr: number[]) => (dualFeatureLogScale ? arr.map((x) => Math.log1p(Math.max(0, x))) : arr);
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
          out.push(dualFeatureToHex(v1, v2, dualFeaturePalette));
        }
        return out;
      }
      return new Array(n).fill(0);
    };
    const getSlotLegend = (id: string): VectorExportLegendEntry[] => {
      if (colorMode !== "annotation" || !selectedObsCol || obsValueType !== "categorical" || !globalCatMap) return [];
      const vals = datasetCache[id]?.obs?.data[selectedObsCol];
      if (!vals) return [];
      const uniq = new Set(vals.map((v) => String(v))).size;
      if (uniq > ANNOTATION_MAX_CATEGORIES) {
        return [{ label: LABEL_NAN_TOO_MANY, color: globalCatMap.get(LABEL_NAN_TOO_MANY) ?? "#888888", count: vals.length }];
      }
      if (uniq < ANNOTATION_MIN_CATEGORIES) {
        return [{ label: LABEL_NAN_TOO_FEW, color: globalCatMap.get(LABEL_NAN_TOO_FEW) ?? "#888888", count: vals.length }];
      }
      const counts = new Map<string, number>();
      for (let i = 0; i < vals.length; i++) {
        const s = String(vals[i]);
        counts.set(s, (counts.get(s) ?? 0) + 1);
      }
      return Array.from(counts.entries())
        .map(([label, count]) => ({ label, color: globalCatMap.get(label) ?? "#888888", count }))
        .sort((a, b) => (b.count !== a.count ? b.count - a.count : a.label.localeCompare(b.label)));
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

    const plotTasks: PlotTask[] = [];
    const plotIds: string[] = [];

    if (showSinglePlot && spatial) {
      const singleTitle =
        primaryId && meta
          ? `${meta.name}${embeddingMode === "umap" ? " (UMAP)" : " (Spatial)"}`
          : primaryId ?? undefined;

      if (plotColorMode === "multiFeature" && selectedMultiFeatures.length > 0) {
        const n = spatial.x.length;
        const byFeature = multiFeatureValuesByDataset[primaryId ?? ""];
        const layers =
          byFeature && selectedMultiFeatures.length > 0
            ? selectedMultiFeatures
                .map((entry) => {
                  const values = byFeature[entry.featureId];
                  if (!values || values.length < n) return null;
                  const slice = values.slice(0, n);
                  if (!slice.some((value) => Number.isFinite(value))) return null;
                  return { name: featureLabel(entry.featureId), values: slice, paletteId: entry.paletteId };
                })
                .filter((layer): layer is { name: string; values: number[]; paletteId: string } => layer !== null)
            : [];
        const layerCount = layers.length;
        if (layerCount > 0) {
          const vminByLayer: number[] = [];
          const vmaxByLayer: number[] = [];
          const minParsed = parseMultiFeatureRange(multiFeatureRangeMinInput);
          const maxParsed = parseMultiFeatureRange(multiFeatureRangeMaxInput);
          for (let g = 0; g < layerCount; g++) {
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

          const spots: Array<{ x: number; y: number; segments: MultiFeatureSegment[] }> = [];
          for (let i = 0; i < n; i++) {
            let sum = 0;
            const expr: number[] = [];
            for (let g = 0; g < layerCount; g++) {
              const raw = layers[g].values[i];
              const v = Number.isFinite(raw) ? Math.max(0, raw) : 0;
              const e = multiFeatureLogScale ? Math.log1p(v) : v;
              expr.push(e);
              sum += e;
            }
            if (!Number.isFinite(sum) || sum <= 0) continue;
            const segments: MultiFeatureSegment[] = [];
            for (let g = 0; g < layerCount; g++) {
              segments.push({
                proportion: expr[g] / sum,
                color: multiFeatureValueToHex(
                  layers[g].values[i] ?? 0,
                  vminByLayer[g],
                  vmaxByLayer[g],
                  layers[g].paletteId,
                  multiFeatureLogScale
                ),
              });
            }
            segments.sort((a, b) => b.proportion - a.proportion);
            spots.push({ x: spatial.x[i], y: spatial.y[i], segments });
          }

          plotTasks.push({
            type: "multiFeature",
            options: {
              spots,
              bounds,
              spotSizeScale,
              layout: multiFeatureLayout,
              title: singleTitle,
              legendLayers: layers.map((layer, g) => ({
                name: layer.name,
                paletteId: layer.paletteId,
                vmin: vminByLayer[g] ?? 0,
                vmax: vmaxByLayer[g] ?? 1,
              })),
              backgroundImageDataUrl: undefined,
              backgroundImageBounds: backgroundImageBounds ?? null,
              backgroundOpacity,
              spotOpacity,
            },
          });
          plotIds.push(primaryId ? splitParentByChildId.get(primaryId) ?? primaryId : "");
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
        const legend =
          plotColorMode === "categorical" && categoricalLegendForPlot
            ? categoricalLegendForPlot.map((entry) => ({
                label: entry.label,
                color: entry.color,
                count: entry.count,
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
        plotIds.push(primaryId ? splitParentByChildId.get(primaryId) ?? primaryId : "");
      }
    } else if (multiPlot) {
      for (const id of activeDatasetIds) {
        const d = datasetCache[id];
        if (!d?.spatial) continue;
        const mode = getSlotMode(id);
        if (mode === "multiFeature") {
          const n = d.spatial.x.length;
          const byFeature = multiFeatureValuesByDataset[id];
          const layers = selectedMultiFeatures
            .map((entry) => {
              const values = byFeature?.[entry.featureId];
              if (!values || values.length < n) return null;
              const slice = values.slice(0, n);
              if (!slice.some((value) => Number.isFinite(value))) return null;
              return { name: featureLabel(entry.featureId), values: slice, paletteId: entry.paletteId };
            })
            .filter((layer): layer is { name: string; values: number[]; paletteId: string } => layer !== null);
          const layerCount = layers.length;
          const vminByLayer: number[] = [];
          const vmaxByLayer: number[] = [];
          const minParsed = parseMultiFeatureRange(multiFeatureRangeMinInput);
          const maxParsed = parseMultiFeatureRange(multiFeatureRangeMaxInput);
          for (let g = 0; g < layerCount; g++) {
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
          const spots: Array<{ x: number; y: number; segments: MultiFeatureSegment[] }> = [];
          for (let i = 0; i < n; i++) {
            let sum = 0;
            const expr: number[] = [];
            for (let g = 0; g < layerCount; g++) {
              const raw = layers[g].values[i];
              const v = Number.isFinite(raw) ? Math.max(0, raw) : 0;
              const e = multiFeatureLogScale ? Math.log1p(v) : v;
              expr.push(e);
              sum += e;
            }
            if (!Number.isFinite(sum) || sum <= 0) continue;
            const segments: MultiFeatureSegment[] = [];
            for (let g = 0; g < layerCount; g++) {
              segments.push({
                proportion: expr[g] / sum,
                color: multiFeatureValueToHex(
                  layers[g].values[i] ?? 0,
                  vminByLayer[g],
                  vmaxByLayer[g],
                  layers[g].paletteId,
                  multiFeatureLogScale
                ),
              });
            }
            segments.sort((a, b) => b.proportion - a.proportion);
            spots.push({ x: d.spatial.x[i], y: d.spatial.y[i], segments });
          }
          plotTasks.push({
            type: "multiFeature",
            options: {
              spots,
              bounds: getSlotBounds(d.spatial),
              spotSizeScale,
              layout: multiFeatureLayout,
              title: `${d.meta.name}${embeddingMode === "umap" ? " (UMAP)" : " (Spatial)"}`,
              legendLayers: layers.map((layer, g) => ({
                name: layer.name,
                paletteId: layer.paletteId,
                vmin: vminByLayer[g] ?? 0,
                vmax: vmaxByLayer[g] ?? 1,
              })),
              backgroundImageDataUrl: undefined,
              backgroundImageBounds: getBgBounds(d.meta, backgroundImageKey),
              backgroundOpacity,
              spotOpacity,
            },
          });
          plotIds.push(splitParentByChildId.get(id) ?? id);
        } else {
          const slotRange = mode === "continuous" && slotContinuousRange ? slotContinuousRange[id] : null;
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
          plotTasks.push({
            type: "scatter",
            options: {
              x: d.spatial.x,
              y: d.spatial.y,
              colorByHex,
              bounds: getSlotBounds(d.spatial),
              spotSizeScale,
              title: `${d.meta.name}${embeddingMode === "umap" ? " (UMAP)" : " (Spatial)"}`,
              legend: getSlotLegend(id),
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
            plotIds.push(splitParentByChildId.get(id) ?? id);
        }
      }
    }

    return { plotTasks, plotIds };
  };

  const handleExportPdf = async (request: PdfExportRequest) => {
    setExportMenuOpen(false);
    const pdfSaveTarget = await choosePdfSaveTarget(buildPdfExportFilename());
    if (pdfSaveTarget == null) {
      console.log("[Export PDF] Save canceled");
      return;
    }

    setExportingPdf(true);
    setExportProgress(0);
    console.log("[Export PDF] Start", request);
    try {
      console.log("[Export PDF] Loading jspdf and export modules...");
      const [{ jsPDF, GState: GStateClass }] = await Promise.all([import("jspdf")]);
      let drawScatterPlotToPdf: (
        pdf: jsPDF,
        options: VectorExportOptions,
        pageRect: { x: number; y: number; w: number; h: number },
        gStateClass?: typeof GStateClass,
        pageHeightMm?: number
      ) => void;
      let drawMultiFeaturePlotToPdf: (
        pdf: jsPDF,
        options: MultiFeatureVectorExportOptions,
        pageRect: { x: number; y: number; w: number; h: number },
        gStateClass?: typeof GStateClass,
        pageHeightMm?: number
      ) => void;
      if (request.mode === "raw") {
        const { drawPlotToPdfVector, drawMultiFeaturePlotToPdfVector } = await import("./exportPlotVector");
        drawScatterPlotToPdf = drawPlotToPdfVector;
        drawMultiFeaturePlotToPdf = drawMultiFeaturePlotToPdfVector;
      } else {
        const { drawPlotToPdfRasterized, drawMultiFeaturePlotToPdfRasterized } = await import("./exportPlotRaster");
        drawScatterPlotToPdf = (pdf, options, pageRect, gStateClass, pageHeightMm) =>
          drawPlotToPdfRasterized(pdf, options, pageRect, gStateClass, request.dpi, pageHeightMm);
        drawMultiFeaturePlotToPdf = (pdf, options, pageRect, gStateClass, pageHeightMm) =>
          drawMultiFeaturePlotToPdfRasterized(pdf, options, pageRect, gStateClass, request.dpi, pageHeightMm);
      }
      setExportProgress(5);
      console.log("[Export PDF] Modules loaded, building plot tasks...");

      const { plotTasks, plotIds } = buildPdfPlotTasks();

      console.log("[Export PDF] Plot tasks count:", plotTasks.length);
      if (plotTasks.length === 0) {
        console.warn("[Export PDF] No plots to export, aborting");
        debugLog("exportPdf: no plots to export");
        setExportingPdf(false);
        setExportProgress(0);
        return;
      }

      const plotCount = plotTasks.length;
      const PAGE_W_MM = 180;
      const PAGE_H_MM = 210;
      const marginX = 10;
      const marginY = 10;
      const titleHeightMm = 5;
      const cols = plotCount <= 2 ? 2 : plotCount <= 4 ? 2 : 3;
      const rows = Math.ceil(plotCount / cols);
      const usableW = Math.max(10, PAGE_W_MM - 2 * marginX);
      const usableH = Math.max(10, PAGE_H_MM - 2 * marginY);
      const cellW = usableW / cols;
      const cellH = usableH / rows;
      const cellSize = Math.min(cellW, cellH);
      const contentW = cellSize;
      const contentH = Math.max(5, cellSize - titleHeightMm);

      const spacingDataPerTask = plotTasks.map((task) => {
        const taskBounds = task.options.bounds;
        if (task.type === "scatter") {
          return estimateSpotSpacingData(task.options.x, task.options.y, taskBounds, embeddingMode);
        }
        const xs = task.options.spots.map((spot) => spot.x);
        const ys = task.options.spots.map((spot) => spot.y);
        return estimateSpotSpacingData(xs, ys, taskBounds, embeddingMode);
      });

      const getEffectiveExtent = (task: PlotTask) => {
        const taskBounds = task.options.bounds;
        const imageBounds = task.options.backgroundImageBounds;
        const eMinX = Math.min(taskBounds.xMin, imageBounds?.xMin ?? taskBounds.xMin);
        const eMaxX = Math.max(taskBounds.xMax, imageBounds?.xMax ?? taskBounds.xMax);
        const eMinY = Math.min(taskBounds.yMin, imageBounds?.yMin ?? taskBounds.yMin);
        const eMaxY = Math.max(taskBounds.yMax, imageBounds?.yMax ?? taskBounds.yMax);
        return {
          dataW: eMaxX - eMinX || 1,
          dataH: eMaxY - eMinY || 1,
        };
      };

      const maxTargetMm = Math.min(
        ...plotTasks.map((task, i) => {
          const { dataW, dataH } = getEffectiveExtent(task);
          const spacing = Number.isFinite(spacingDataPerTask[i]) && spacingDataPerTask[i] > 0 ? spacingDataPerTask[i] : 1;
          return Math.min((contentW * spacing) / dataW, (contentH * spacing) / dataH);
        })
      );
      const targetNeighborMm = Math.max(0.2, 0.82 * maxTargetMm);

      console.log("[Export PDF] Creating PDF page:", PAGE_W_MM, "x", PAGE_H_MM, "mm (targetNeighborMm:", targetNeighborMm, "mm)");
      const pdf = new jsPDF({ unit: "mm", format: [PAGE_W_MM, PAGE_H_MM] });
      pdf.setFillColor(26, 26, 46);
      pdf.rect(0, 0, PAGE_W_MM, PAGE_H_MM, "F");

      for (let i = 0; i < plotCount; i++) {
        console.log("[Export PDF] Drawing plot", i + 1, "/", plotCount);
        setExportProgress(5 + Math.round((95 * i) / plotCount));
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
        const bgBounds = plotTasks[i].options.backgroundImageBounds;
        const bgW = bgBounds ? bgBounds.xMax - bgBounds.xMin : null;
        const bgH = bgBounds ? bgBounds.yMax - bgBounds.yMin : null;
        const taskBounds = plotTasks[i].options.bounds;
        const spotsW = taskBounds.xMax - taskBounds.xMin || 1;
        const spotsH = taskBounds.yMax - taskBounds.yMin || 1;
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
          dataOverBgW: bgW && bgW !== 0 ? spotsW / bgW : null,
          dataOverBgH: bgH && bgH !== 0 ? spotsH / bgH : null,
        });

        const task = plotTasks[i];
        const idForBg = plotIds[i];
        if (idForBg && backgroundImageKey) {
          const bgDataUrl = await loadImageAsDataUrl(datasetImageUrl(idForBg, backgroundImageKey));
          if (bgDataUrl != null) task.options.backgroundImageDataUrl = bgDataUrl;
        }
        task.options.spotSpacingData = spacingData;
        task.options.panelRect = panelRectForLegend;
        task.options.legendFormKey = `LegendForm_${i}`;
        if (request.mode === "raw") {
          task.options.plotFormKey = `PlotForm_${i}`;
        }

        const plotTitle = task.options.title;
        if (plotTitle) {
          pdf.setFontSize(7);
          pdf.setTextColor(238, 238, 238);
          pdf.text(plotTitle, cellLeft + cellSize / 2, cellTop + 3.5, { align: "center" });
        }

        setExportProgress(5 + Math.round((95 * (i + 0.5)) / plotCount));
        if (task.type === "scatter") {
          drawScatterPlotToPdf(pdf, task.options, contentRect, GStateClass, PAGE_H_MM);
        } else {
          drawMultiFeaturePlotToPdf(pdf, task.options, contentRect, GStateClass, PAGE_H_MM);
        }
        setExportProgress(5 + Math.round((95 * (i + 1)) / plotCount));
      }

      setExportProgress(100);
      console.log("[Export PDF] Saving file:", pdfSaveTarget.filename, "via", pdfSaveTarget.type);
      await savePdfToTarget(pdf, pdfSaveTarget);
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
  };

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
              background: "var(--sidebar-border)",
              borderRadius: 3,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${exportProgress}%`,
                height: "100%",
                background: "var(--accent)",
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
      {splitModalParent && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Split panel"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0, 0, 0, 0.65)",
            padding: 24,
          }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSplitModalParentId(null);
          }}
        >
          <div
            style={{
              width: "min(520px, 100%)",
              maxHeight: "min(680px, 90vh)",
              display: "flex",
              flexDirection: "column",
              borderRadius: 10,
              border: "1px solid var(--sidebar-border)",
              background: "var(--sidebar-bg)",
              boxShadow: "0 18px 45px rgba(0,0,0,0.45)",
              overflow: "hidden",
            }}
          >
            <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid var(--sidebar-border)" }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>Split panel by obs key</div>
              <div
                style={{
                  marginTop: 4,
                  fontSize: 12,
                  color: "var(--text-muted)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={splitModalParent.meta.name}
              >
                {splitModalParent.meta.name}
              </div>
            </div>
            <div style={{ padding: "12px 16px 0" }}>
              <input
                type="text"
                value={splitSearch}
                onChange={(event) => setSplitSearch(event.target.value)}
                placeholder="Search obs key…"
                autoFocus
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 6,
                  border: "1px solid var(--sidebar-border)",
                  background: "var(--bg-main)",
                  color: "var(--text-primary)",
                  fontSize: 13,
                  boxSizing: "border-box",
                }}
              />
            </div>
            <div
              className="sidebar-scroll"
              style={{ flex: 1, minHeight: 180, overflow: "auto", margin: "12px 8px 8px", padding: "0 8px" }}
            >
              {filteredSplitCandidates.length === 0 ? (
                <div style={{ padding: 16, fontSize: 12, color: "var(--text-muted)" }}>
                  No obs key has 2–200 unique values.
                </div>
              ) : (
                filteredSplitCandidates.map((candidate) => (
                  <button
                    key={candidate.key}
                    type="button"
                    onClick={() => applySplit(splitModalParent.meta.id, candidate.key)}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                      padding: "10px 10px",
                      marginBottom: 6,
                      borderRadius: 6,
                      border: "1px solid var(--sidebar-border)",
                      background: "var(--bg-main)",
                      color: "var(--text-primary)",
                      fontSize: 13,
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {candidate.key}
                    </span>
                    <span style={{ flexShrink: 0, fontSize: 11, color: "var(--text-muted)" }}>
                      {candidate.count} groups
                    </span>
                  </button>
                ))
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "10px 16px 14px" }}>
              <button
                type="button"
                onClick={() => setSplitModalParentId(null)}
                style={{
                  padding: "7px 12px",
                  borderRadius: 6,
                  border: "1px solid var(--sidebar-border)",
                  background: "var(--bg-main)",
                  color: "var(--text-primary)",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      <div style={{ display: "flex", flex: 1, minHeight: 0, minWidth: 0, overflow: "hidden" }}>
      <Sidebar
        datasets={datasets}
        dataDir={dataDir}
        selectedDatasetIds={selectedDatasetIds}
        onSelectDatasets={(ids) => {
          debugLog("onSelectDatasets", { ids });
          setSelectedDatasetIds(ids);
          failedLoadIdsRef.current.clear();
          pruneSplitsForSelection(ids);
          if (ids.length > 0) {
            setExpressionByDataset({});
            setSelectedGene(null);
            setExpression1(null);
            setExpression2(null);
            setSelectedFeature1(null);
            setSelectedFeature2(null);
            setSelectedMultiFeatures([]);
            setMultiFeatureValuesByFeature({});
            setBackgroundImageKey(null);
          }
        }}
        onReorderDatasets={(ids) => setSelectedDatasetIds(ids)}
        meta={meta}
        genes={genes}
        obs={obs}
        obsColumns={obsColumns}
        numericObsColumns={numericObsColumns}
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
        onColorByDualFeature={(g1, g2) => {
          setSelectedFeature1(g1);
          setSelectedFeature2(g2);
          setColorMode("dualFeature");
        }}
        onColorModeChange={setColorMode}
        selectedFeature1={selectedFeature1}
        selectedFeature2={selectedFeature2}
        dualFeaturePalette={dualFeaturePalette}
        onDualFeaturePaletteChange={setDualFeaturePalette}
        dualFeatureLogScale={dualFeatureLogScale}
        onDualFeatureLogScaleChange={setDualFeatureLogScale}
        selectedMultiFeatures={selectedMultiFeatures}
        onMultiFeaturesChange={setSelectedMultiFeatures}
        multiFeatureLogScale={multiFeatureLogScale}
        onMultiFeatureLogScaleChange={setMultiFeatureLogScale}
        multiFeatureLayout={multiFeatureLayout}
        onMultiFeatureLayoutChange={setMultiFeatureLayout}
        multiFeatureRangeMinInput={multiFeatureRangeMinInput}
        multiFeatureRangeMaxInput={multiFeatureRangeMaxInput}
        onMultiFeatureRangeMinInputChange={setMultiFeatureRangeMinInput}
        onMultiFeatureRangeMaxInputChange={setMultiFeatureRangeMaxInput}
        effectiveMultiFeatureColorMin={effectiveMultiFeatureColorRange?.colorMin ?? null}
        effectiveMultiFeatureColorMax={effectiveMultiFeatureColorRange?.colorMax ?? null}
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
        effectiveColorMin={activeDatasetIds.length > 1 && isRangePercentile ? null : (continuousColorRange?.colorMin ?? null)}
        effectiveColorMax={activeDatasetIds.length > 1 && isRangePercentile ? null : (continuousColorRange?.colorMax ?? null)}
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
        {activeDatasetIds.length > 0 && activeDatasetIds.some((id) => datasetCache[id]?.spatial) && (
          <div
            style={{
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 12px",
              background: "var(--sidebar-bg)",
              borderBottom: "1px solid var(--sidebar-border)",
            }}
          >
            <div ref={exportMenuRef} style={{ position: "relative" }}>
              <button
                type="button"
                onClick={() => setExportMenuOpen((open) => !open)}
                disabled={exportingPdf}
                aria-haspopup="menu"
                aria-expanded={exportMenuOpen}
                style={{
                  padding: "6px 12px",
                  borderRadius: 6,
                  border: "1px solid var(--sidebar-border)",
                  background: exportingPdf ? "var(--sidebar-border)" : "var(--bg-main)",
                  color: "#eee",
                  fontSize: 13,
                  cursor: exportingPdf ? "wait" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span>{exportingPdf ? "Exporting…" : "Export PDF"}</span>
                <span style={{ fontSize: 10, opacity: 0.8 }}>▼</span>
              </button>
              {exportMenuOpen && !exportingPdf && (
                <div
                  role="menu"
                  style={{
                    position: "absolute",
                    top: "calc(100% + 6px)",
                    left: 0,
                    minWidth: 180,
                    borderRadius: 8,
                    border: "1px solid var(--sidebar-border)",
                    background: "var(--sidebar-bg)",
                    boxShadow: "0 8px 18px rgba(0,0,0,0.35)",
                    overflow: "hidden",
                    zIndex: 20,
                  }}
                >
                  {[
                    {
                      request: { mode: "raw" } as const,
                      key: "raw",
                      label: "Raw PDF",
                      description: "Vector spots and legends",
                    },
                    {
                      request: { mode: "rasterized", dpi: 300 } as const,
                      key: "rasterized-300",
                      label: "Rasterized PDF (300dpi)",
                      description: "Raster plot marks, separate background",
                    },
                    {
                      request: { mode: "rasterized", dpi: 600 } as const,
                      key: "rasterized-600",
                      label: "Rasterized PDF (600dpi)",
                      description: "Higher-resolution raster plot marks",
                    },
                    {
                      request: { mode: "rasterized", dpi: 1200 } as const,
                      key: "rasterized-1200",
                      label: "Rasterized PDF (1200dpi)",
                      description: "Ultra-high-resolution raster plot marks",
                    },
                  ].map((entry, index, arr) => (
                    <button
                      key={entry.key}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        void handleExportPdf(entry.request);
                      }}
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        border: "none",
                        borderBottom: index < arr.length - 1 ? "1px solid var(--sidebar-border)" : "none",
                        background: "transparent",
                        color: "#eee",
                        textAlign: "left",
                        cursor: "pointer",
                        display: "flex",
                        flexDirection: "column",
                        gap: 2,
                      }}
                    >
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{entry.label}</span>
                      <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{entry.description}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
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
              background: "var(--bg-main)",
              color: "#666",
              fontSize: 14,
            }}
          >
            <span>Loading dataset{activeDatasetIds.length > 1 ? "s" : ""}… {loadProgress}%</span>
            <div
              style={{
                width: 280,
                height: 6,
                background: "var(--sidebar-border)",
                borderRadius: 3,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${loadProgress}%`,
                  height: "100%",
                  background: "var(--accent)",
                  borderRadius: 3,
                  transition: "width 0.2s ease-out",
                }}
              />
            </div>
          </div>
        ) : (() => {
          const hasLoaded = activeDatasetIds.length > 0 && activeDatasetIds.some((id) => datasetCache[id]?.spatial);
          const multiPlot = activeDatasetIds.length > 1 && (colorMode === "gene" || colorMode === "annotation" || colorMode === "dualFeature" || colorMode === "multiFeature");
          const showSinglePlot = hasLoaded && activeDatasetIds.length === 1;
          if (showSinglePlot && spatial) {
            const singleParentId = primaryId ? splitParentByChildId.get(primaryId) ?? primaryId : null;
            const singleSplit = singleParentId ? splitByDataset[singleParentId] : undefined;
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
            embeddingMode={embeddingMode}
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
              singleParentId && backgroundImageKey
                ? datasetImageUrl(singleParentId, backgroundImageKey)
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
            hoverFeature1Name={plotColorMode === "dualFeature" && selectedFeature1 ? featureLabel(selectedFeature1) : null}
            hoverFeature1Values={plotColorMode === "dualFeature" ? expression1 : null}
            hoverFeature2Name={plotColorMode === "dualFeature" && selectedFeature2 ? featureLabel(selectedFeature2) : null}
            hoverFeature2Values={plotColorMode === "dualFeature" ? expression2 : null}
            multiFeatureLayers={multiFeatureLayers}
            multiFeatureLogScale={multiFeatureLogScale}
            multiFeatureLayout={multiFeatureLayout}
            multiFeatureRangeMinInput={multiFeatureRangeMinInput}
            multiFeatureRangeMaxInput={multiFeatureRangeMaxInput}
            hoverMultiFeatureNames={
              plotColorMode === "multiFeature"
                ? selectedMultiFeatures.map((e) => featureLabel(e.featureId))
                : null
            }
            hoverMultiFeatureValues={
              plotColorMode === "multiFeature"
                ? selectedMultiFeatures.map((e) => multiFeatureValuesByFeature[e.featureId] ?? [])
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
                ? `${meta?.name ?? primaryId}${
                    meta
                      ? embeddingMode === "umap"
                        ? " (UMAP)"
                        : " (Spatial)"
                      : ""
                  }`
                : undefined
            }
            onSplitClick={!singleSplit ? () => setSplitModalParentId(singleParentId) : undefined}
            onMergeClick={singleSplit && singleParentId ? () => removeSplit(singleParentId) : undefined}
            />
            {(expressionLoading || dualFeatureLoading || multiFeatureLoading) && (
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
                    : dualFeatureLoading && selectedFeature1 && selectedFeature2
                      ? `Loading features for ${featureLabel(selectedFeature1)}, ${featureLabel(selectedFeature2)}…`
                      : multiFeatureLoading && selectedMultiFeatures.length > 0
                        ? `Loading features for ${selectedMultiFeatures.map((e) => featureLabel(e.featureId)).join(", ")}…`
                        : "Loading expression…"}
                </span>
                <div
                  style={{
                    width: 240,
                    height: 6,
                    background: "var(--sidebar-border)",
                    borderRadius: 3,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: "40%",
                      height: "100%",
                      background: "var(--accent)",
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
              if (colorMode === "dualFeature") {
                const e1 = expression1ByDataset[id];
                const e2 = expression2ByDataset[id];
                if (!e1 || !e2 || e1.length < n || e2.length < n) return new Array(n).fill(0);
                const mapRaw = (arr: number[]) => (dualFeatureLogScale ? arr.map((x) => Math.log1p(Math.max(0, x))) : arr);
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
                  out.push(dualFeatureToHex(v1, v2, dualFeaturePalette));
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
              if (colorMode === "dualFeature") {
                const e1 = expression1ByDataset[id];
                const e2 = expression2ByDataset[id];
                const n = d.spatial.x.length;
                if (e1 && e2 && e1.length >= n && e2.length >= n) return "dualFeature";
              }
              if (colorMode === "multiFeature" && selectedMultiFeatures.length > 0) {
                const byFeature = multiFeatureValuesByDataset[id];
                if (byFeature) {
                  const n = d.spatial.x.length;
                  // Show multiFeature when at least one gene has data in this sample (missing genes are skipped)
                  const hasAnyLoaded = selectedMultiFeatures.some((e) => (byFeature[e.featureId]?.length ?? 0) >= n);
                  if (hasAnyLoaded) return "multiFeature";
                }
              }
              return "none";
            };
            // Build multiFeature layers for this slot: only genes with valid (finite) data in this dataset
            const slotMultiFeatureLayers = (id: string) => {
              const d = datasetCache[id]?.spatial;
              const byFeature = multiFeatureValuesByDataset[id];
              if (!d || !byFeature || selectedMultiFeatures.length === 0) return undefined;
              const n = d.x.length;
              const layers = selectedMultiFeatures
                .map((entry) => {
                  const values = byFeature[entry.featureId];
                  if (!values || values.length < n) return null;
                  const slice = values.slice(0, n);
                  const hasFinite = slice.some((v) => Number.isFinite(v));
                  if (!hasFinite) return null;
                  return { name: featureLabel(entry.featureId), values: slice, paletteId: entry.paletteId };
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
            const cols = activeDatasetIds.length <= 2 ? 2 : activeDatasetIds.length <= 4 ? 2 : 3;
            const rows = Math.ceil(activeDatasetIds.length / cols);
            const gridMinWidth = cols * MULTIPLOT_MIN_CELL_WIDTH_PX + (cols - 1) * MULTIPLOT_GAP_PX + 2 * MULTIPLOT_PADDING_PX;
            const gridMinHeight = rows * MULTIPLOT_MIN_CELL_HEIGHT_PX + (rows - 1) * MULTIPLOT_GAP_PX + 2 * MULTIPLOT_PADDING_PX;
            const gridLoading = (colorMode === "dualFeature" && dualFeatureLoading) || (colorMode === "multiFeature" && multiFeatureLoading);
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
                {activeDatasetIds.map((id) => {
                  const d = datasetCache[id];
                  if (!d?.spatial) return null;
                  const mode = slotPlotMode(id);
                  const slotRange = mode === "continuous" && slotContinuousRange ? slotContinuousRange[id] : null;
                  const slotMultiFeature = slotMultiFeatureLayers(id);
                  const parentId = splitParentByChildId.get(id) ?? id;
                  const childSplit = splitByDataset[parentId];
                  const isSplitChild = parentId !== id;
                  return (
                    <div key={id} data-export-plot style={{ position: "relative", minHeight: 0, minWidth: 0, display: "flex", flexDirection: "column" }}>
                      <SpatialPlot
                        x={d.spatial.x}
                        y={d.spatial.y}
                        colorBy={slotColorBy(id)}
                        colorMode={mode}
                        bounds={slotBounds(d.spatial)}
                        embeddingMode={embeddingMode}
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
                        backgroundImageUrl={backgroundImageKey ? datasetImageUrl(parentId, backgroundImageKey) : null}
                        backgroundOpacity={backgroundOpacity}
                        backgroundImageBounds={slotBgBounds(d.meta, backgroundImageKey)}
                        hoverAnnotationName={colorMode === "annotation" && obsValueType === "categorical" ? selectedObsCol : null}
                        hoverAnnotationValues={colorMode === "annotation" && selectedObsCol && d.obs?.data[selectedObsCol] ? d.obs.data[selectedObsCol] : null}
                        hoverGeneName={mode === "continuous" ? (colorMode === "gene" ? selectedGene : selectedObsCol) : null}
                        hoverGeneValues={mode === "continuous" && selectedObsCol && d.obs?.data[selectedObsCol] ? (d.obs.data[selectedObsCol] as number[]) : mode === "continuous" && colorMode === "gene" ? expressionByDataset[id] ?? null : null}
                        hoverFeature1Name={mode === "dualFeature" && selectedFeature1 ? featureLabel(selectedFeature1) : null}
                        hoverFeature1Values={mode === "dualFeature" ? (expression1ByDataset[id] ?? null) : null}
                        hoverFeature2Name={mode === "dualFeature" && selectedFeature2 ? featureLabel(selectedFeature2) : null}
                        hoverFeature2Values={mode === "dualFeature" ? (expression2ByDataset[id] ?? null) : null}
                        multiFeatureLayers={mode === "multiFeature" ? slotMultiFeature : undefined}
                        multiFeatureLogScale={multiFeatureLogScale}
                        multiFeatureLayout={multiFeatureLayout}
                        multiFeatureRangeMinInput={multiFeatureRangeMinInput}
                        multiFeatureRangeMaxInput={multiFeatureRangeMaxInput}
                        hoverMultiFeatureNames={mode === "multiFeature" ? selectedMultiFeatures.map((e) => featureLabel(e.featureId)) : null}
                        hoverMultiFeatureValues={mode === "multiFeature" ? selectedMultiFeatures.map((e) => multiFeatureValuesByDataset[id]?.[e.featureId] ?? []) : null}
                        title={`${d.meta.name}${embeddingMode === "umap" ? " (UMAP)" : " (Spatial)"}`}
                        onSplitClick={!isSplitChild ? () => setSplitModalParentId(id) : undefined}
                        onMergeClick={isSplitChild && childSplit ? () => removeSplit(parentId) : undefined}
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
                      {colorMode === "dualFeature" && selectedFeature1 && selectedFeature2
                        ? `Loading dual features for ${featureLabel(selectedFeature1)}, ${featureLabel(selectedFeature2)}…`
                        : colorMode === "multiFeature" && selectedMultiFeatures.length > 0
                          ? `Loading multi-features for ${selectedMultiFeatures.map((e) => featureLabel(e.featureId)).join(", ")}…`
                          : "Loading…"}
                    </span>
                    <div style={{ width: 240, height: 6, background: "var(--sidebar-border)", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ width: "40%", height: "100%", background: "var(--accent)", borderRadius: 3, animation: "expression-loading-shimmer 1.2s ease-in-out infinite" }} />
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
              background: "var(--bg-main)",
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
