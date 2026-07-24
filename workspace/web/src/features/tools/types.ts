export interface ToolRegistryEntry {
  id: string;
  name: string;
  version?: string;
  description?: string;
  entry: string;
  icon?: string;
  category?: string;
  source?: "user" | "bundled" | "dev-link";
  uninstallable?: boolean;
  compatible?: boolean;
  incompatibleReason?: string;
  capabilities?: string[];
  devPort: number;
  prodPort: number;
  webDevPort: number;
}

export interface ToolRegistryResponse {
  version: number;
  toolsDir?: string;
  tools: ToolRegistryEntry[];
}

/** @deprecated Prefer rpc/ — kept for tool iframes not yet migrated */
export const TOOL_MSG = {
  CACHE_CLEAR: "vet-tool:cache:clear",
  CACHE_CLEARED: "vet-tool:cache:cleared",
  PICK_FOLDER: "vet-tool:bridge:pick-folder",
  PICK_FOLDER_RESULT: "vet-tool:bridge:pick-folder-result",
  PROJECT_CONTEXT: "vet-tool:project:context",
  PROJECT_CONTEXT_REQUEST: "vet-tool:project:context:request",
  NAVIGATE_SCENARIO: "vet-tool:scenario:navigate",
} as const;

export interface ToolProjectContextMessage {
  type: typeof TOOL_MSG.PROJECT_CONTEXT;
  projectId: string;
  projectName?: string;
  baseUrl: string;
  scenariosRelPath: string;
}

/**
 * Port the Host actually starts for an installed/dev-link tool (single process + SERVE_WEB).
 * Bundled/legacy dual-port tools keep separate api/web ports in DEV.
 */
export function toolServePort(tool: ToolRegistryEntry, isDev: boolean): number {
  if (tool.source === "user" || tool.source === "dev-link") {
    return tool.prodPort || tool.devPort;
  }
  return isDev ? tool.devPort || tool.prodPort : tool.prodPort;
}

export function toolWebOrigin(tool: ToolRegistryEntry, isDev: boolean): string {
  if (tool.source === "user" || tool.source === "dev-link") {
    return `http://127.0.0.1:${toolServePort(tool, isDev)}`;
  }
  const port = isDev ? tool.webDevPort || tool.prodPort : tool.prodPort;
  return `http://127.0.0.1:${port}`;
}

export function toolApiOrigin(tool: ToolRegistryEntry, isDev: boolean): string {
  if (tool.source === "user" || tool.source === "dev-link") {
    return `http://127.0.0.1:${toolServePort(tool, isDev)}`;
  }
  const port = isDev ? tool.devPort || tool.prodPort : tool.prodPort;
  return `http://127.0.0.1:${port}`;
}
