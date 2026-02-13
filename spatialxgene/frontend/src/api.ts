// Set by backend via index.html when run with --api-base (e.g. nginx location /spatialxgene/); else relative "."
declare global {
  interface Window {
    __API_BASE__?: string;
  }
}
/** Base path for API and static assets when behind a subpath (e.g. /spatialxgene); "" or "." for root. */
export const API_BASE =
  typeof window !== "undefined" && window.__API_BASE__ !== undefined ? window.__API_BASE__ : ".";

const AUTH_TOKEN_KEY = "spatialxgene_token";

function getAuthToken(): string | null {
  try {
    return sessionStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

/** Headers to send for token auth (X-Token); empty if no token stored. */
function authHeaders(): Record<string, string> {
  const t = getAuthToken();
  return t ? { "X-Token": t } : {};
}

/** Parse error body from FastAPI (detail) or fallback to statusText. */
async function throwApiError(r: Response): Promise<never> {
  const body = await r.json().catch(() => ({}));
  const detail = typeof (body as { detail?: unknown }).detail === "string"
    ? (body as { detail: string }).detail
    : (body as { detail?: string[] })?.detail?.join?.(" ") ?? r.statusText;
  throw new Error(detail || r.statusText);
}

export type ConfigResponse = {
  debug: boolean;
  anndata_ok?: boolean;
  anndata_error?: string;
  anndata_hint?: string;
};

export async function fetchConfig(): Promise<ConfigResponse> {
  const r = await fetch(`${API_BASE}/api/config`, { headers: authHeaders() });
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
  /** "spatial" / "umap" / "pca" / "tsne": which coordinates are used for the default 2D plot */
  layout?: string;
  /** True if adata has spatial coordinates (obsm["spatial"]/["X_spatial"] or obs x/y). */
  has_spatial?: boolean;
  /** True if adata has UMAP embedding in obsm["X_umap"]. */
  has_umap?: boolean;
  /** True if adata has PCA embedding in obsm["X_pca"]. */
  has_pca?: boolean;
  /** True if adata has t-SNE embedding in obsm["X_tsne"]. */
  has_tsne?: boolean;
  /** Keys for background images in adata (e.g. hires, lowres); empty if none */
  image_keys?: string[];
  /** Per-key scale and size: image in data space spans (0,0) to (width/scale_factor, height/scale_factor) */
  image_info?: Record<string, { scale_factor: number; width: number; height: number }>;
  /** Keys in adata.layers (e.g. raw_counts, logcounts); use "X" for adata.X */
  layer_keys?: string[];
  /** False when dataset has no spatial/UMAP/PCA/t-SNE; frontend should show message and not load spatial/obs/var */
  viewable?: boolean;
  viewable_reason?: string;
};

export type SpatialResponse = { x: number[]; y: number[] };

export type ObsResponse = { columns: string[]; data: Record<string, (string | number)[]> };

export async function fetchDatasets(): Promise<DatasetItem[]> {
  const r = await fetch(`${API_BASE}/api/datasets`, { headers: authHeaders() });
  if (!r.ok) await throwApiError(r);
  return r.json();
}

export async function fetchDatasetMeta(id: string, signal?: AbortSignal): Promise<DatasetMeta> {
  const r = await fetch(`${API_BASE}/api/datasets/${encodeURIComponent(id)}`, {
    signal,
    headers: authHeaders(),
  });
  if (!r.ok) await throwApiError(r);
  return r.json();
}

export async function fetchSpatial(
  id: string,
  signal?: AbortSignal,
  layout?: "spatial" | "umap" | "pca" | "tsne"
): Promise<SpatialResponse> {
  const qs = layout ? `?layout=${encodeURIComponent(layout)}` : "";
  const r = await fetch(`${API_BASE}/api/datasets/${encodeURIComponent(id)}/spatial${qs}`, {
    signal,
    headers: authHeaders(),
  });
  if (!r.ok) await throwApiError(r);
  return r.json();
}

export async function fetchObs(id: string, signal?: AbortSignal): Promise<ObsResponse> {
  const r = await fetch(`${API_BASE}/api/datasets/${encodeURIComponent(id)}/obs`, {
    signal,
    headers: authHeaders(),
  });
  if (!r.ok) await throwApiError(r);
  return r.json();
}

export async function fetchExpression(
  id: string,
  gene: string,
  signal?: AbortSignal,
  layer?: string
): Promise<number[]> {
  const qs = layer && layer !== "X" ? `?layer=${encodeURIComponent(layer)}` : "";
  const r = await fetch(
    `${API_BASE}/api/datasets/${encodeURIComponent(id)}/expression/${encodeURIComponent(gene)}${qs}`,
    { signal, headers: authHeaders() }
  );
  if (!r.ok) await throwApiError(r);
  return r.json();
}

export async function fetchVarIndex(id: string, signal?: AbortSignal): Promise<string[]> {
  const r = await fetch(`${API_BASE}/api/datasets/${encodeURIComponent(id)}/var`, {
    signal,
    headers: authHeaders(),
  });
  if (!r.ok) await throwApiError(r);
  return r.json();
}

/** URL for dataset background image (PNG). Use when meta.image_keys contains the key. Appends ?token= when token auth is used. */
export function datasetImageUrl(datasetId: string, imageKey: string): string {
  const base = `${API_BASE}/api/datasets/${encodeURIComponent(datasetId)}/images/${encodeURIComponent(imageKey)}`;
  const t = getAuthToken();
  return t ? `${base}?token=${encodeURIComponent(t)}` : base;
}
