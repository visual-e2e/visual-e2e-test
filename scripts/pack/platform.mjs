import { execSync } from "node:child_process";
import { cpus } from "node:os";

/** Node sidecar / Electron bundle platform keys. */
export const NODE_PLATFORMS = {
  "darwin-arm64": "macos-arm64",
  "darwin-x64": "macos-x64",
  "win32-x64": "windows",
};

export const MAC_ARCH_TO_NODE = {
  arm64: "darwin-arm64",
  x64: "darwin-x64",
};

/** Prefer hardware arch on Apple Silicon even when Node runs under Rosetta. */
function darwinHardwareArch() {
  try {
    const translated = execSync("sysctl -in sysctl.proc_translated", {
      encoding: "utf8",
    }).trim();
    if (translated === "1") return "arm64";
  } catch {
    // unavailable in some sandboxes
  }
  try {
    const brand = execSync("sysctl -n machdep.cpu.brand_string", {
      encoding: "utf8",
    }).trim();
    if (/Apple/i.test(brand)) return "arm64";
  } catch {
    // fall through
  }
  if (cpus().some((cpu) => /Apple/i.test(cpu.model))) return "arm64";
  return process.arch === "arm64" ? "arm64" : "x64";
}

export function currentNodePlatform() {
  if (process.platform === "darwin") {
    return darwinHardwareArch() === "arm64" ? "darwin-arm64" : "darwin-x64";
  }
  if (process.platform === "win32") {
    return "win32-x64";
  }
  throw new Error(`Unsupported build host: ${process.platform}/${process.arch}`);
}

export function buildOutputSubdir(nodePlatform = currentNodePlatform()) {
  const sub = NODE_PLATFORMS[nodePlatform];
  if (!sub) throw new Error(`Unknown node platform: ${nodePlatform}`);
  return sub;
}

export function nodePlatformForMacArch(arch) {
  const key = MAC_ARCH_TO_NODE[arch];
  if (!key) throw new Error(`Unknown mac arch: ${arch}`);
  return key;
}
