import { useQuery } from "@tanstack/react-query";
import {
  DEFAULT_TOOLS_CATALOG_URL,
  type ToolsCatalog,
} from "./catalog";

function catalogUrl(): string {
  const fromEnv = import.meta.env.VITE_TOOLS_CATALOG_URL?.trim();
  return fromEnv || DEFAULT_TOOLS_CATALOG_URL;
}

async function fetchToolsCatalog(): Promise<ToolsCatalog> {
  const res = await fetch(catalogUrl(), { signal: AbortSignal.timeout(12_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as ToolsCatalog;
  if (!data || !Array.isArray(data.tools)) {
    throw new Error("Invalid tools catalog");
  }
  return data;
}

export function useToolsCatalog() {
  return useQuery({
    queryKey: ["tools-catalog", catalogUrl()],
    queryFn: fetchToolsCatalog,
    staleTime: 5 * 60_000,
    retry: 1,
  });
}
