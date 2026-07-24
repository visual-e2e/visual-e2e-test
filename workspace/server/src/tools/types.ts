import { z } from "zod";

export const toolManifestSchema = z.object({
  id: z
    .string()
    .min(1)
    .regex(/^[a-z][a-z0-9-]*$/, "id 须为 kebab-case"),
  version: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional().default(""),
  icon: z.string().optional(),
  category: z.string().optional(),
  rpc: z
    .object({
      protocolVersion: z.number().int().positive().default(1),
    })
    .optional()
    .default({ protocolVersion: 1 }),
  capabilities: z.array(z.string()).optional().default([]),
  ports: z
    .object({
      preferredProd: z.number().int().positive().optional(),
      dev: z.number().int().positive().optional(),
      webDev: z.number().int().positive().optional(),
      prod: z.number().int().positive().optional(),
    })
    .optional()
    .default({}),
  main: z.string().optional().default("server/dist/index.js"),
  webRoot: z.string().optional().default("web/dist"),
  engines: z
    .object({
      host: z.string().optional(),
    })
    .optional(),
  sandbox: z
    .object({
      allow: z.array(z.string()).optional(),
      bridge: z.array(z.string()).optional(),
    })
    .optional(),
});

export type ToolManifest = z.infer<typeof toolManifestSchema>;

export type ToolSource = "user" | "bundled" | "dev-link";

export interface ToolDescriptor {
  id: string;
  version: string;
  name: string;
  description: string;
  icon?: string;
  category?: string;
  source: ToolSource;
  path: string;
  main: string;
  webRoot: string;
  capabilities: string[];
  rpcProtocolVersion: number;
  ports: {
    preferredProd?: number;
    dev?: number;
    webDev?: number;
    prod?: number;
  };
  /** Effective ports after allocation (filled by list API). */
  resolvedPorts?: {
    prod: number;
    dev?: number;
    webDev?: number;
  };
  compatible: boolean;
  incompatibleReason?: string;
}

export interface ToolsRegistryFile {
  version: 1;
  tools: Array<{
    id: string;
    version: string;
    installedAt: string;
    source: "user";
  }>;
}

export interface ToolsRuntimeFile {
  version: 1;
  ports: Record<string, { prod: number; updatedAt: string }>;
}

/** Host protocol version this build supports. */
export const HOST_RPC_PROTOCOL_VERSION = 1;
