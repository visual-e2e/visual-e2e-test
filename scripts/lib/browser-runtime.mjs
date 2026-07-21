/**
 * Chromium / Playwright browser runtime — shared by server, CLI scripts, and install jobs.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { currentNodePlatform } from "../pack/platform.mjs";

export const BROWSER_RUNTIME_FILENAME = "browser-runtime.json";

/** Bundle key → PLAYWRIGHT_HOST_PLATFORM_OVERRIDE */
export const PLATFORM_OVERRIDES = {
  "darwin-arm64": "mac15-arm64",
  "darwin-x64": "mac15",
  "win32-x64": "win64",
};

export function currentPlatformKey() {
  return currentNodePlatform();
}

export function resolveBrowserRuntimePath(configDir) {
  return join(configDir, BROWSER_RUNTIME_FILENAME);
}

/** Client app data root (parent of Storage/), e.g. .../visual-e2e-test */
export function resolveClientDataRoot(configDir) {
  return dirname(dirname(configDir));
}

/** @deprecated Old layout: Storage/playwright-browsers */
function resolveLegacyManagedBrowsersDir(configDir) {
  return join(dirname(configDir), "playwright-browsers", currentPlatformKey());
}

export function resolveManagedBrowsersDir(configDir, e2eRoot, runtime) {
  if (runtime === "client") {
    return join(resolveClientDataRoot(configDir), "playwright-browsers", currentPlatformKey());
  }
  return join(e2eRoot, "playwright-browsers", currentPlatformKey());
}

/** Prefer new client path; fall back to legacy Storage/playwright-browsers if already installed. */
export function resolveEffectiveManagedBrowsersDir(configDir, e2eRoot, runtime) {
  const platformKey = currentPlatformKey();
  const preferred = resolveManagedBrowsersDir(configDir, e2eRoot, runtime);
  if (chromiumReady(preferred, e2eRoot, platformKey)) return preferred;
  if (runtime === "client") {
    const legacy = resolveLegacyManagedBrowsersDir(configDir);
    if (chromiumReady(legacy, e2eRoot, platformKey)) return legacy;
  }
  return preferred;
}

export function defaultBrowserRuntime(configDir, e2eRoot, runtime) {
  return {
    version: 1,
    mode: "managed",
    managed: {
      browsersPath: resolveManagedBrowsersDir(configDir, e2eRoot, runtime),
    },
    custom: {
      executablePath: "",
    },
    detected: null,
  };
}

export function readBrowserRuntime(configDir, e2eRoot, runtime) {
  const path = resolveBrowserRuntimePath(configDir);
  if (!existsSync(path)) {
    return defaultBrowserRuntime(configDir, e2eRoot, runtime);
  }
  try {
    const raw = JSON.parse(readFileSync(path, "utf-8"));
    const base = defaultBrowserRuntime(configDir, e2eRoot, runtime);
    const merged = {
      ...base,
      ...raw,
      managed: { ...base.managed, ...(raw.managed ?? {}) },
      custom: { ...base.custom, ...(raw.custom ?? {}) },
    };
    if (merged.mode === "managed") {
      merged.managed.browsersPath = resolveManagedBrowsersDir(configDir, e2eRoot, runtime);
    }
    return merged;
  } catch {
    return defaultBrowserRuntime(configDir, e2eRoot, runtime);
  }
}

export function writeBrowserRuntime(configDir, data) {
  mkdirSync(configDir, { recursive: true });
  const path = resolveBrowserRuntimePath(configDir);
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
  return data;
}

function readComponentManifest(e2eRoot, component) {
  if (!e2eRoot) return "";
  const manifestPath = join(e2eRoot, "node_modules", "playwright-core", "browsers.json");
  if (!existsSync(manifestPath)) return "";
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    return manifest.browsers?.find((item) => item.name === component) ?? null;
  } catch {
    return null;
  }
}

function expectedComponentRevision(e2eRoot, component, platformKey) {
  const entry = readComponentManifest(e2eRoot, component);
  if (!entry) return "";
  const hostPlatform = PLATFORM_OVERRIDES[platformKey];
  return entry.revisionOverrides?.[hostPlatform] ?? entry.revision ?? "";
}

export function expectedChromiumVersion(e2eRoot) {
  return readComponentManifest(e2eRoot, "chromium")?.browserVersion ?? "";
}

function componentReady(platformDir, component, e2eRoot, platformKey = currentPlatformKey()) {
  if (!platformDir || !existsSync(platformDir)) return false;
  const revision = expectedComponentRevision(e2eRoot, component, platformKey);
  if (revision) return existsSync(join(platformDir, `${component}-${revision}`));
  return readdirSync(platformDir).some((name) => name.startsWith(`${component}-`));
}

export function chromiumReady(platformDir, e2eRoot, platformKey) {
  return componentReady(platformDir, "chromium", e2eRoot, platformKey);
}

export function ffmpegReady(platformDir, e2eRoot, platformKey) {
  return componentReady(platformDir, "ffmpeg", e2eRoot, platformKey);
}

function resolveEffectiveFfmpegDir(configDir, e2eRoot, runtime) {
  const platformKey = currentPlatformKey();
  const preferred = resolveManagedBrowsersDir(configDir, e2eRoot, runtime);
  if (ffmpegReady(preferred, e2eRoot, platformKey)) return preferred;
  if (runtime === "client") {
    const legacy = resolveLegacyManagedBrowsersDir(configDir);
    if (ffmpegReady(legacy, e2eRoot, platformKey)) return legacy;
  }
  return preferred;
}

export function resolvePlaywrightCli(e2eRoot) {
  const cli = join(e2eRoot, "node_modules", "playwright", "cli.js");
  if (!existsSync(cli)) {
    throw new Error(`Playwright CLI 未找到: ${cli}`);
  }
  return cli;
}

function expandHome(p) {
  if (!p) return p;
  return p.startsWith("~/") ? join(homedir(), p.slice(2)) : p;
}

const KNOWN_MACOS_BROWSER_BINARIES = [
  "Google Chrome",
  "Google Chrome for Testing",
  "Chromium",
];

/** Resolve .../Foo.app → .../Foo.app/Contents/MacOS/<executable> */
function resolveMacAppBundle(appPath) {
  const macOsDir = join(appPath, "Contents", "MacOS");
  if (!existsSync(macOsDir)) return "";

  for (const name of KNOWN_MACOS_BROWSER_BINARIES) {
    const candidate = join(macOsDir, name);
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }

  const plistPath = join(appPath, "Contents", "Info.plist");
  if (existsSync(plistPath)) {
    try {
      const plist = readFileSync(plistPath, "utf-8");
      const match = plist.match(/<key>CFBundleExecutable<\/key>\s*<string>([^<]+)<\/string>/);
      if (match?.[1]) {
        const candidate = join(macOsDir, match[1]);
        if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
      }
    } catch {
      // fall through
    }
  }

  for (const name of readdirSync(macOsDir)) {
    if (name.startsWith(".")) continue;
    const candidate = join(macOsDir, name);
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // skip
    }
  }

  return "";
}

function collectMacBrowserApps(root, maxDepth = 8) {
  const apps = [];
  if (!root || !existsSync(root)) return apps;

  function walk(dir, depth) {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.name.endsWith(".app")) {
        apps.push(full);
        continue;
      }
      if (entry.isDirectory()) walk(full, depth + 1);
    }
  }

  walk(root, 0);
  return apps;
}

function findManagedBrowserExecutable(browsersPath, e2eRoot, platformKey) {
  const revision = expectedComponentRevision(e2eRoot, "chromium", platformKey);
  const chromiumDir = revision ? join(browsersPath, `chromium-${revision}`) : browsersPath;

  if (process.platform === "darwin") {
    const appPath = collectMacBrowserApps(chromiumDir)[0];
    return appPath ? normalizeExecutablePath(appPath) : "";
  }

  const executableNames = process.platform === "win32" ? new Set(["chrome.exe"]) : new Set(["chrome"]);
  let found = "";
  function walk(dir, depth) {
    if (found || depth > 8) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isFile() && executableNames.has(entry.name.toLowerCase())) {
        found = full;
        return;
      }
      if (entry.isDirectory()) walk(full, depth + 1);
      if (found) return;
    }
  }
  walk(chromiumDir, 0);
  return found;
}

export function normalizeExecutablePath(input) {
  const raw = expandHome(input?.trim() ?? "");
  if (!raw) return "";

  if (process.platform === "darwin" && raw.endsWith(".app")) {
    const resolved = resolveMacAppBundle(raw);
    if (resolved) return resolved;
  }

  return raw;
}

export function isExecutableFileSync(path) {
  if (!path || !existsSync(path)) return false;
  try {
    const st = statSync(path);
    if (!st.isFile()) return false;
    if (process.platform === "win32") return /\.(exe|cmd|bat)$/i.test(path);
    if ((st.mode & 0o111) !== 0) return true;
    // macOS: some downloaded browsers may lack +x in stat; allow verify via --version
    return process.platform === "darwin";
  } catch {
    return false;
  }
}

function readVersionSync(execPath) {
  return new Promise((resolve) => {
    const child = spawn(execPath, ["--version"], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout?.on("data", (buf) => { out += buf.toString(); });
    child.stderr?.on("data", (buf) => { out += buf.toString(); });
    child.on("error", () => resolve(""));
    child.on("close", () => resolve(out.trim().split("\n")[0] ?? ""));
    setTimeout(() => {
      try { child.kill(); } catch { /* noop */ }
      resolve(out.trim().split("\n")[0] ?? "");
    }, 5000);
  });
}

export async function verifyExecutablePath(execPath) {
  const normalized = normalizeExecutablePath(execPath);
  if (!normalized || !existsSync(normalized)) {
    return { ok: false, path: normalized, version: "", error: "路径不存在" };
  }
  if (!isExecutableFileSync(normalized)) {
    return { ok: false, path: normalized, version: "", error: "不是可执行文件" };
  }
  const version = await readVersionSync(normalized);
  if (!version) {
    return { ok: false, path: normalized, version: "", error: "无法读取浏览器版本" };
  }
  return { ok: true, path: normalized, version, error: "" };
}

export function detectCandidates(options = {}) {
  const { configDir, e2eRoot, runtime } = options;
  const candidates = [];
  const add = (path, label, source) => {
    const normalized = normalizeExecutablePath(path);
    if (!normalized || !existsSync(normalized)) return;
    if (candidates.some((c) => c.path === normalized)) return;
    candidates.push({ path: normalized, label, source });
  };

  if (process.platform === "darwin") {
    add("/Applications/Google Chrome.app", "Google Chrome", "system");
    add("/Applications/Chromium.app", "Chromium", "system");
    add(join(homedir(), "Applications/Google Chrome.app"), "Google Chrome (用户)", "system");
    add("/opt/homebrew/bin/chromium", "Homebrew Chromium", "homebrew");
    add("/usr/local/bin/chromium", "Chromium (usr/local)", "homebrew");

    const playwrightRoots = new Set();
    const fromEnv = process.env.PLAYWRIGHT_BROWSERS_PATH?.trim();
    if (fromEnv) playwrightRoots.add(fromEnv);
    if (e2eRoot) playwrightRoots.add(join(e2eRoot, "playwright-browsers", currentPlatformKey()));
    if (configDir && runtime === "client") {
      playwrightRoots.add(resolveManagedBrowsersDir(configDir, e2eRoot ?? "", runtime));
      playwrightRoots.add(resolveLegacyManagedBrowsersDir(configDir));
    }

    for (const root of playwrightRoots) {
      for (const appPath of collectMacBrowserApps(root)) {
        const name = appPath.split(/[/\\]/).pop()?.replace(/\.app$/, "") ?? "Browser";
        add(appPath, `${name} (Playwright)`, "playwright");
      }
    }
  } else if (process.platform === "win32") {
    const local = process.env.LOCALAPPDATA ?? "";
    const pf = process.env.ProgramFiles ?? "C:\\Program Files";
    const pf86 = process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";
    add(join(pf, "Google/Chrome/Application/chrome.exe"), "Google Chrome", "system");
    add(join(pf86, "Google/Chrome/Application/chrome.exe"), "Google Chrome (x86)", "system");
    if (local) add(join(local, "Google/Chrome/Application/chrome.exe"), "Google Chrome (用户)", "system");
    add(join(pf, "Chromium/Application/chrome.exe"), "Chromium", "system");
  }

  return candidates;
}

export async function checkBrowserRuntime(configDir, e2eRoot, runtime) {
  const platform = currentPlatformKey();
  const config = readBrowserRuntime(configDir, e2eRoot, runtime);
  const hints = [];

  if (config.mode === "custom") {
    const browsersPath = resolveEffectiveFfmpegDir(configDir, e2eRoot, runtime);
    const execPath = normalizeExecutablePath(config.custom.executablePath);
    if (!execPath) {
      return {
        ok: false,
        status: "missing",
        mode: "custom",
        platform,
        path: "",
        version: "",
        hints: ["请选择本机 Chrome 或 Chromium 可执行文件"],
      };
    }
    const verified = await verifyExecutablePath(execPath);
    if (!verified.ok) {
      return {
        ok: false,
        status: "invalid",
        mode: "custom",
        platform,
        path: verified.path,
        version: verified.version,
        hints: [verified.error || "自定义浏览器路径无效"],
      };
    }
    if (!ffmpegReady(browsersPath, e2eRoot, platform)) {
      return {
        ok: false,
        status: "missing",
        mode: "custom",
        platform,
        path: verified.path,
        version: verified.version,
        hints: ["本机浏览器已就绪，但缺少 Playwright 录屏组件，请点击「安装录屏组件」"],
      };
    }
    return {
      ok: true,
      status: "ready",
      mode: "custom",
      platform,
      path: verified.path,
      version: verified.version,
      hints: [],
    };
  }

  const browsersPath = resolveEffectiveManagedBrowsersDir(configDir, e2eRoot, runtime);

  if (
    !chromiumReady(browsersPath, e2eRoot, platform)
    || !ffmpegReady(browsersPath, e2eRoot, platform)
  ) {
    hints.push("可点击「一键安装」下载测试浏览器，或选择本机已安装的 Chrome/Chromium");
    return {
      ok: false,
      status: "missing",
      mode: "managed",
      platform,
      path: browsersPath,
      version: "",
      hints,
    };
  }

  const executablePath = findManagedBrowserExecutable(browsersPath, e2eRoot, platform);
  const verified = await verifyExecutablePath(executablePath);
  if (!verified.ok) {
    return {
      ok: false,
      status: "invalid",
      mode: "managed",
      platform,
      path: executablePath || browsersPath,
      version: "",
      hints: ["已找到浏览器目录，但浏览器可执行文件无效，请重新安装"],
    };
  }

  return {
    ok: true,
    status: "ready",
    mode: "managed",
    platform,
    path: verified.path,
    version: verified.version,
    hints: [],
  };
}

/** Env vars for test child processes. */
export async function resolveLaunchEnv(configDir, e2eRoot, runtime) {
  const check = await checkBrowserRuntime(configDir, e2eRoot, runtime);
  if (!check.ok) return { ok: false, check, env: {} };

  if (check.mode === "custom") {
    const browsersPath = resolveEffectiveFfmpegDir(configDir, e2eRoot, runtime);
    return {
      ok: true,
      check,
      env: {
        CHROMIUM_EXECUTABLE_PATH: check.path,
        PLAYWRIGHT_BROWSERS_PATH: browsersPath,
      },
    };
  }

  return {
    ok: true,
    check,
    env: {
      PLAYWRIGHT_BROWSERS_PATH: resolveEffectiveManagedBrowsersDir(configDir, e2eRoot, runtime),
    },
  };
}

export function runInstallChromium({
  e2eRoot,
  nodeBin,
  browsersPath,
  platformKey,
  installChromium = true,
  onLog,
}) {
  const cli = resolvePlaywrightCli(e2eRoot);
  const override = PLATFORM_OVERRIDES[platformKey];
  if (!override) {
    return Promise.reject(new Error(`不支持的平台: ${platformKey}`));
  }

  mkdirSync(browsersPath, { recursive: true });

  return new Promise((resolve, reject) => {
    const log = (line) => onLog?.(line);
    log(`${installChromium ? "正在安装测试浏览器" : "正在安装录屏组件"} (${platformKey})…`);

    const child = spawn(
      nodeBin,
      installChromium
        ? [cli, "install", "chromium", "--no-shell", "--no-progress"]
        : [cli, "install", "ffmpeg", "--no-progress"],
      {
        cwd: e2eRoot,
        env: {
          ...process.env,
          PLAYWRIGHT_BROWSERS_PATH: browsersPath,
          PLAYWRIGHT_HOST_PLATFORM_OVERRIDE: override,
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    child.stdout?.on("data", (buf) => {
      for (const line of buf.toString().split("\n")) if (line.trim()) log(line);
    });
    child.stderr?.on("data", (buf) => {
      for (const line of buf.toString().split("\n")) if (line.trim()) log(`[stderr] ${line}`);
    });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (signal) {
        reject(new Error(`安装被中断: ${signal}`));
        return;
      }
      if (code !== 0) {
        reject(new Error(`安装失败 (exit ${code})`));
        return;
      }
      if (
        (installChromium && !chromiumReady(browsersPath, e2eRoot, platformKey))
        || !ffmpegReady(browsersPath, e2eRoot, platformKey)
      ) {
        reject(new Error(`安装完成但未找到${installChromium ? " Chromium 或" : ""} FFmpeg 目录`));
        return;
      }
      log("安装完成");
      resolve({ browsersPath });
    });
  });
}
