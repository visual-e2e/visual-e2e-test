export type ToolCatalogPackage = {
  filename: string;
  url: string;
  size: number;
  sha256?: string;
};

export type ToolCatalogEntry = {
  id: string;
  name: string;
  description: string;
  icon?: string;
  category?: string;
  repo: string;
  version: string | null;
  releasedAt: string | null;
  releaseUrl: string;
  package: ToolCatalogPackage | null;
  ports?: { preferredProd?: number };
  engines?: { host?: string };
};

export type ToolsCatalog = {
  version: number;
  updatedAt: string;
  catalogUrl?: string;
  tools: ToolCatalogEntry[];
};

export const DEFAULT_TOOLS_CATALOG_URL = "https://visual-e2e.github.io/tools.json";

export function normalizeToolVersion(version: string | null | undefined): string {
  return (version ?? "").trim().replace(/^v/i, "");
}

/** >0 remote newer, 0 equal, <0 local newer/invalid remote */
export function compareToolVersions(remote: string | null | undefined, local: string | null | undefined): number {
  const a = normalizeToolVersion(remote);
  const b = normalizeToolVersion(local);
  if (!a) return -1;
  if (!b) return 1;
  const aParts = a.split("-", 1)[0].split(".").map((n) => Number(n) || 0);
  const bParts = b.split("-", 1)[0].split(".").map((n) => Number(n) || 0);
  const len = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < len; i += 1) {
    const diff = (aParts[i] ?? 0) - (bParts[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
