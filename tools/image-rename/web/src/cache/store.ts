export const TOOL_ID = "image-rename";
export const CACHE_VERSION = 1;
export const CACHE_KEY = `vet-tool:${TOOL_ID}:v${CACHE_VERSION}`;

export type SortMode = "name-asc" | "name-desc" | "mtime-asc" | "mtime-desc";

export interface ImageRenameCache {
  recentDirs: string[];
  lastDir: string;
  naming: {
    template: string;
    prefix: string;
    startIndex: number;
  };
  sort: SortMode;
  imagesOnly: boolean;
  updatedAt: number;
}

const DEFAULT: ImageRenameCache = {
  recentDirs: [],
  lastDir: "",
  naming: {
    template: "{prefix}_{index:3}{ext}",
    prefix: "image",
    startIndex: 1,
  },
  sort: "name-asc",
  imagesOnly: true,
  updatedAt: 0,
};

export function loadCache(): ImageRenameCache {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return { ...DEFAULT };
    const cached = JSON.parse(raw);
    if (cached.sort === "none") cached.sort = DEFAULT.sort;
    return { ...DEFAULT, ...cached };
  } catch {
    return { ...DEFAULT };
  }
}

export function saveCache(patch: Partial<ImageRenameCache>): ImageRenameCache {
  const next = { ...loadCache(), ...patch, updatedAt: Date.now() };
  localStorage.setItem(CACHE_KEY, JSON.stringify(next));
  return next;
}

export function clearCache(): void {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key?.startsWith(`vet-tool:${TOOL_ID}:`)) {
      localStorage.removeItem(key);
    }
  }
}

export function rememberDir(dir: string): ImageRenameCache {
  const trimmed = dir.trim();
  if (!trimmed) return loadCache();
  const cache = loadCache();
  const recentDirs = [trimmed, ...cache.recentDirs.filter((d) => d !== trimmed)].slice(0, 10);
  return saveCache({ lastDir: trimmed, recentDirs });
}
