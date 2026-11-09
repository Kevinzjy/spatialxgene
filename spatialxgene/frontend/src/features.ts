/** A selectable numeric value source: either a gene expression vector or a numeric obs metadata column. */
export type FeatureSource = "gene" | "obs";
export type FeatureRef = { source: FeatureSource; key: string };

/** Encode keys so a gene literally named "obs:foo" cannot be mistaken for metadata. */
export function makeFeatureId(source: FeatureSource, key: string): string {
  return `${source}:${encodeURIComponent(key)}`;
}

export function makeGeneFeatureId(key: string): string {
  return makeFeatureId("gene", key);
}

export function makeObsFeatureId(key: string): string {
  return makeFeatureId("obs", key);
}

export function parseFeatureId(featureId: string): FeatureRef {
  const separatorIndex = featureId.indexOf(":");
  if (separatorIndex <= 0) return { source: "gene", key: featureId };
  const source = featureId.slice(0, separatorIndex);
  if (source !== "gene" && source !== "obs") return { source: "gene", key: featureId };
  const encodedKey = featureId.slice(separatorIndex + 1);
  try {
    return { source, key: decodeURIComponent(encodedKey) };
  } catch {
    return { source, key: encodedKey };
  }
}

export function featureLabel(featureId: string): string {
  const feature = parseFeatureId(featureId);
  return feature.source === "obs" ? `${feature.key} (obs)` : feature.key;
}
