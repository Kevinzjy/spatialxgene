const API_BASE = "";

/** Parse error body from FastAPI (detail) or fallback to statusText. */
async function throwApiError(r: Response): Promise<never> {
  const body = await r.json().catch(() => ({}));
  const detail = typeof (body as { detail?: unknown }).detail === "string"
    ? (body as { detail: string }).detail
    : (body as { detail?: string[] })?.detail?.join?.(" ") ?? r.statusText;
  throw new Error(detail || r.statusText);
}

export type ConfigResponse = { debug: boolean };

export async function fetchConfig(): Promise<ConfigResponse> {
  const r = await fetch(`${API_BASE}/api/config`);
  if (!r.ok) return { debug: false };
  return r.json();
}

export type DatasetItem = { id: string; name: string; path: string };

export type DatasetMeta = {
  id: string;
  name: string;
  n_obs: number;
  n_vars: number;
  obs_columns: string[];
  var_index: string[];
  x_min: number;
  x_max: number;
  y_min: number;
  y_max: number;
  /** "spatial" or "umap": which coordinates are used for the 2D plot */
  layout?: string;
  /** Keys for background images in adata (e.g. hires, lowres); empty if none */
  image_keys?: string[];
  /** Per-key scale and size: image in data space spans (0,0) to (width/scale_factor, height/scale_factor) */
  image_info?: Record<string, { scale_factor: number; width: number; height: number }>;
};

export type SpatialResponse = { x: number[]; y: number[] };

export type ObsResponse = { columns: string[]; data: Record<string, (string | number)[]> };

export async function fetchDatasets(): Promise<DatasetItem[]> {
  const r = await fetch(`${API_BASE}/api/datasets`);
  if (!r.ok) await throwApiError(r);
  return r.json();
}

export async function fetchDatasetMeta(id: string, signal?: AbortSignal): Promise<DatasetMeta> {
  const r = await fetch(`${API_BASE}/api/datasets/${encodeURIComponent(id)}`, { signal });
  if (!r.ok) await throwApiError(r);
  return r.json();
}

export async function fetchSpatial(id: string, signal?: AbortSignal): Promise<SpatialResponse> {
  const r = await fetch(`${API_BASE}/api/datasets/${encodeURIComponent(id)}/spatial`, { signal });
  if (!r.ok) await throwApiError(r);
  return r.json();
}

export async function fetchObs(id: string, signal?: AbortSignal): Promise<ObsResponse> {
  const r = await fetch(`${API_BASE}/api/datasets/${encodeURIComponent(id)}/obs`, { signal });
  if (!r.ok) await throwApiError(r);
  return r.json();
}

export async function fetchExpression(
  id: string,
  gene: string,
  signal?: AbortSignal
): Promise<number[]> {
  const r = await fetch(
    `${API_BASE}/api/datasets/${encodeURIComponent(id)}/expression/${encodeURIComponent(gene)}`,
    { signal }
  );
  if (!r.ok) await throwApiError(r);
  return r.json();
}

export async function fetchVarIndex(id: string, signal?: AbortSignal): Promise<string[]> {
  const r = await fetch(`${API_BASE}/api/datasets/${encodeURIComponent(id)}/var`, { signal });
  if (!r.ok) await throwApiError(r);
  return r.json();
}

/** URL for dataset background image (PNG). Use when meta.image_keys contains the key. */
export function datasetImageUrl(datasetId: string, imageKey: string): string {
  return `${API_BASE}/api/datasets/${encodeURIComponent(datasetId)}/images/${encodeURIComponent(imageKey)}`;
}
