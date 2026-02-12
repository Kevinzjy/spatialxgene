const API_BASE = "";

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
};

export type SpatialResponse = { x: number[]; y: number[] };

export type ObsResponse = { columns: string[]; data: Record<string, (string | number)[]> };

export async function fetchDatasets(): Promise<DatasetItem[]> {
  const r = await fetch(`${API_BASE}/api/datasets`);
  if (!r.ok) throw new Error(r.statusText);
  return r.json();
}

export async function fetchDatasetMeta(id: string): Promise<DatasetMeta> {
  const r = await fetch(`${API_BASE}/api/datasets/${encodeURIComponent(id)}`);
  if (!r.ok) throw new Error(r.statusText);
  return r.json();
}

export async function fetchSpatial(id: string): Promise<SpatialResponse> {
  const r = await fetch(`${API_BASE}/api/datasets/${encodeURIComponent(id)}/spatial`);
  if (!r.ok) throw new Error(r.statusText);
  return r.json();
}

export async function fetchObs(id: string): Promise<ObsResponse> {
  const r = await fetch(`${API_BASE}/api/datasets/${encodeURIComponent(id)}/obs`);
  if (!r.ok) throw new Error(r.statusText);
  return r.json();
}

export async function fetchExpression(id: string, gene: string): Promise<number[]> {
  const r = await fetch(
    `${API_BASE}/api/datasets/${encodeURIComponent(id)}/expression/${encodeURIComponent(gene)}`
  );
  if (!r.ok) throw new Error(r.statusText);
  return r.json();
}

export async function fetchVarIndex(id: string): Promise<string[]> {
  const r = await fetch(`${API_BASE}/api/datasets/${encodeURIComponent(id)}/var`);
  if (!r.ok) throw new Error(r.statusText);
  return r.json();
}
