import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { execFileSync } from "node:child_process";
import { toolManifestSchema } from "./types.js";
import { ensureToolsDir, toolsInstalledDir } from "./paths.js";
import { removeInstalledDir, removeRegistryEntry, upsertRegistryEntry } from "./store.js";
import { clearRuntimePort, setRuntimePort } from "./store.js";
import { assertProdPortAvailableForInstall } from "./ports.js";

function extractZip(zipPath: string, destDir: string): void {
  mkdirSync(destDir, { recursive: true });
  if (process.platform === "win32") {
    execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`,
      ],
      { stdio: "pipe" },
    );
    return;
  }
  execFileSync("unzip", ["-o", "-q", zipPath, "-d", destDir], { stdio: "pipe" });
}

/** If archive has a single top-level folder, return that folder path. */
function unwrapSingleRoot(extractRoot: string): string {
  const entries = readdirSync(extractRoot).filter((n) => n !== "__MACOSX");
  if (entries.length === 1) {
    const only = join(extractRoot, entries[0]!);
    if (statSync(only).isDirectory()) return only;
  }
  return extractRoot;
}

function assertPackageLayout(root: string): void {
  const manifestPath = join(root, "tool.json");
  if (!existsSync(manifestPath)) {
    throw new Error("安装包缺少 tool.json");
  }
  const raw = JSON.parse(readFileSync(manifestPath, "utf-8"));
  const parsed = toolManifestSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`tool.json 无效: ${parsed.error.issues[0]?.message ?? "校验失败"}`);
  }
  const main = parsed.data.main ?? "server/dist/index.js";
  if (!existsSync(join(root, main))) {
    throw new Error(`安装包缺少入口: ${main}`);
  }
  const webRoot = parsed.data.webRoot ?? "web/dist";
  if (!existsSync(join(root, webRoot))) {
    throw new Error(`安装包缺少前端产物: ${webRoot}`);
  }
  if (existsSync(join(root, "node_modules"))) {
    throw new Error("安装包不应包含 node_modules（请使用生产 bundle 包）");
  }
  if (existsSync(join(root, "server", "src")) || existsSync(join(root, "web", "src"))) {
    throw new Error("安装包不应包含源码目录 src");
  }
}

export interface InstallResult {
  id: string;
  version: string;
  name: string;
  path: string;
}

export async function installToolFromZip(toolsDir: string, zipPath: string): Promise<InstallResult> {
  if (!existsSync(zipPath)) {
    throw new Error(`文件不存在: ${zipPath}`);
  }
  const lower = zipPath.toLowerCase();
  if (!lower.endsWith(".zip") && !lower.endsWith(".vettool.zip")) {
    throw new Error("请选择 .vettool.zip 或 .zip 安装包");
  }

  ensureToolsDir(toolsDir);
  const staging = mkdtempSync(join(tmpdir(), "vet-tool-install-"));
  try {
    extractZip(zipPath, staging);
    const packageRoot = unwrapSingleRoot(staging);
    assertPackageLayout(packageRoot);

    const manifest = toolManifestSchema.parse(
      JSON.parse(readFileSync(join(packageRoot, "tool.json"), "utf-8")),
    );

    const prodPort = await assertProdPortAvailableForInstall({
      toolsDir,
      toolId: manifest.id,
      preferred: manifest.ports?.preferredProd,
      prod: manifest.ports?.prod,
    });

    const installedRoot = toolsInstalledDir(toolsDir);
    const target = join(installedRoot, manifest.id);

    if (existsSync(target)) {
      rmSync(target, { recursive: true, force: true });
    }
    mkdirSync(dirname(target), { recursive: true });
    cpSync(packageRoot, target, { recursive: true });

    writeFileSync(
      join(target, "tool.json"),
      `${JSON.stringify(
        {
          ...manifest,
          description: manifest.description ?? "",
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );

    upsertRegistryEntry(toolsDir, {
      id: manifest.id,
      version: manifest.version,
      installedAt: new Date().toISOString(),
      source: "user",
    });
    setRuntimePort(toolsDir, manifest.id, prodPort);

    return {
      id: manifest.id,
      version: manifest.version,
      name: manifest.name,
      path: target,
    };
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

export function uninstallTool(toolsDir: string, toolId: string): void {
  const id = toolId.trim();
  if (!id) throw new Error("toolId 不能为空");
  ensureToolsDir(toolsDir);
  removeInstalledDir(toolsInstalledDir(toolsDir), id);
  removeRegistryEntry(toolsDir, id);
  clearRuntimePort(toolsDir, id);
}

export function suggestZipName(filePath: string): string {
  return basename(filePath);
}
