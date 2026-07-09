#!/usr/bin/env node
/**
 * 产品画像 Markdown → 场景 JSON + manifest
 *
 * 目录结构（与 scenarios/ 层级一致，支持子目录）:
 *   projects/{id}/产品画像/{module}/{场景名}.md
 *   projects/{id}/产品画像/{module}/{subdir}/{场景名}.md
 *
 * 用法:
 *   node scripts/profile-to-scenario.mjs --all
 *   node scripts/profile-to-scenario.mjs login
 *   node scripts/profile-to-scenario.mjs login 登录成功
 *   node scripts/profile-to-scenario.mjs login --force
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join, dirname, basename, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import settings from "../config/settings.json" with { type: "json" };

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function resolveProjectId() {
  if (process.env.ACTIVE_PROJECT) return process.env.ACTIVE_PROJECT;
  if (settings.defaultProject) return settings.defaultProject;
  const projectsDir = join(root, "projects");
  if (!existsSync(projectsDir)) {
    throw new Error("未找到 projects/ 目录");
  }
  const ids = readdirSync(projectsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(projectsDir, e.name, "project.json")))
    .map((e) => e.name);
  if (ids.length === 0) {
    throw new Error("未找到任何项目，请在 projects/ 下创建项目或通过工作台新建");
  }
  if (ids.length === 1) return ids[0];
  throw new Error(`存在多个项目 (${ids.join(", ")})，请设置 ACTIVE_PROJECT 或 config/settings.json 的 defaultProject`);
}

const projectId = resolveProjectId();
const projectRoot = join(root, "projects", projectId);
const profilesDir = join(projectRoot, "产品画像");
const scenariosRoot = join(projectRoot, "scenarios");

const DEFAULT_STEP_TIMEOUT = settings.test.defaultStepTimeout;
const DEFAULT_READY_TIMEOUT = settings.test.defaultReadyTimeout;
const DEFAULT_LINK_TIMEOUT = settings.browser.timeout;

const STEP_TYPES = new Set([
  "click",
  "hover",
  "input",
  "link",
  "wait",
  "ready",
  "scroll",
  "verify",
  "screenshot",
  "log",
  "keyboard",
  "macro",
]);

const MATCH_RULES = new Set(["equals", "contains", "regex", "visible", "hidden", "urlContains"]);
const EMPTY = new Set(["—", "-", ""]);

const FRONTMATTER_KEY_ORDER = [
  "id",
  "name",
  "module",
  "requiresLogin",
  "entryRoute",
  "description",
  "goal",
  "enabled",
  "converted",
  "convertedAt",
];

function stripCell(value) {
  if (value == null) return "";
  return String(value).replace(/`/g, "").trim();
}

function isEmpty(value) {
  return EMPTY.has(stripCell(value));
}

function slugify(text) {
  return text
    .replace(/[^\w\u4e00-\u9fa5]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

function parseYamlValue(raw) {
  if (raw === "" || raw === '""' || raw === "''") return "";
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw === "null" || raw === "~") return null;
  if (
    (raw.startsWith('"') && raw.endsWith('"')) ||
    (raw.startsWith("'") && raw.endsWith("'"))
  ) {
    return raw.slice(1, -1);
  }
  return raw;
}

function parseSimpleYaml(yaml) {
  const data = {};
  for (const line of yaml.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const m = trimmed.match(/^([\w]+):\s*(.*)$/);
    if (!m) continue;
    data[m[1]] = parseYamlValue(m[2].trim());
  }
  return data;
}

function formatYamlValue(value) {
  if (value === true) return "true";
  if (value === false) return "false";
  if (value === null || value === undefined) return '""';
  const s = String(value);
  if (s === "") return '""';
  if (/[:#\n"]/.test(s) || s.includes("{")) return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  return s;
}

function serializeFrontmatter(data) {
  const keys = [...new Set([...FRONTMATTER_KEY_ORDER, ...Object.keys(data)])];
  const lines = [];
  for (const key of keys) {
    if (data[key] === undefined) continue;
    lines.push(`${key}: ${formatYamlValue(data[key])}`);
  }
  return `---\n${lines.join("\n")}\n---\n`;
}

function splitFrontmatter(content) {
  if (!content.startsWith("---\n")) {
    return { frontmatter: {}, body: content };
  }
  const end = content.indexOf("\n---", 4);
  if (end === -1) {
    return { frontmatter: {}, body: content };
  }
  const yaml = content.slice(4, end);
  const body = content.slice(end + 4).replace(/^\n/, "");
  return { frontmatter: parseSimpleYaml(yaml), body };
}

function updateFrontmatterInFile(mdPath, patch) {
  const content = readFileSync(mdPath, "utf-8");
  const { frontmatter, body } = splitFrontmatter(content);
  const next = { ...frontmatter, ...patch };
  if (patch.converted === false) {
    delete next.convertedAt;
  }
  writeFileSync(mdPath, serializeFrontmatter(next) + body, "utf-8");
}

function parsePipeRow(line) {
  const parts = line.split("|").map((c) => stripCell(c));
  if (parts.length < 3) return null;
  return parts.slice(1, -1);
}

function parseReadySelectors(text) {
  const raw = stripCell(text);
  if (isEmpty(raw)) return [];
  const cleaned = raw.replace(/^就绪[:：]\s*/, "");
  return cleaned
    .split(/[,，、]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseValueField(text) {
  const raw = stripCell(text);
  if (isEmpty(raw)) return "";
  const valueMatch = raw.match(/^值[:：]\s*(.+)$/);
  return valueMatch ? valueMatch[1].trim() : raw;
}

function parseVerifyField(text) {
  const raw = stripCell(text);
  if (isEmpty(raw)) return null;

  const ruleMatch = raw.match(/[（(](equals|contains|regex|visible|hidden|urlContains)[）)]\s*$/i);
  const matchRule = ruleMatch ? ruleMatch[1].toLowerCase() : "contains";

  const boldMatch = raw.match(/\*\*([^*]+)\*\*/);
  const expectValue = boldMatch ? boldMatch[1].trim() : raw.replace(/[（(][^）)]+[）)]\s*$/, "").trim();

  return { expectValue, matchRule };
}

function mapHeader(cols) {
  const header = cols.map((c) => stripCell(c));
  const index = {};
  header.forEach((name, i) => {
    if (name.startsWith("步骤")) index.step = i;
    else if (name.startsWith("操作类型")) index.type = i;
    else if (name === "操作") index.action = i;
    else if (name.includes("Selector") || name.includes("定位")) index.selector = i;
    else if (name.startsWith("值") || name === "值/URL") index.value = i;
    else if (name.includes("就绪")) index.ready = i;
    else if (name.includes("验证")) index.verify = i;
    else if (name.includes("匹配")) index.matchRule = i;
  });
  return index;
}

function parseStepTable(content) {
  const tableMatch = content.match(
    /\|[^\n]*步骤[^\n]*\|\s*\n\|[\s\-:|]+\|\s*\n([\s\S]*?)(?=\n\n|\n## |\n---|$)/,
  );
  if (!tableMatch) return [];

  const lines = tableMatch[0].split("\n").filter((l) => l.trim().startsWith("|"));
  const headerCols = parsePipeRow(lines[0]);
  if (!headerCols) return [];

  const hasTypeCol = headerCols.some((c) => stripCell(c).startsWith("操作类型"));
  const idx = mapHeader(headerCols);
  const rows = [];

  for (const line of lines.slice(2)) {
    const cols = parsePipeRow(line);
    if (!cols || cols.every((c) => isEmpty(c))) continue;

    if (hasTypeCol) {
      rows.push({
        step: cols[idx.step] ?? "",
        type: stripCell(cols[idx.type] ?? "").toLowerCase(),
        action: cols[idx.action] ?? "",
        selector: cols[idx.selector] ?? "",
        value: cols[idx.value] ?? "",
        ready: cols[idx.ready] ?? "",
        verify: cols[idx.verify] ?? "",
        matchRule: stripCell(cols[idx.matchRule] ?? "").toLowerCase(),
      });
    } else {
      rows.push({
        step: cols[0] ?? "",
        type: "",
        action: cols[1] ?? "",
        selector: cols[idx.selector ?? 2] ?? cols[2] ?? "",
        value: "",
        ready: parseReadySelectors(cols[3] ?? "").length ? cols[3] : "",
        verify: cols[3] ?? "",
        matchRule: "",
      });
    }
  }

  return rows;
}

function parseScenarioFile(body, frontmatter) {
  const titleMatch = body.match(/^#\s+(.+)$/m);
  const rows = parseStepTable(body);
  if (!rows.length) return null;

  return {
    id: frontmatter.id ?? "",
    name: frontmatter.name ?? titleMatch?.[1]?.trim() ?? "",
    module: frontmatter.module ?? "",
    description: frontmatter.description ?? "",
    enabled: frontmatter.enabled !== false,
    requiresLogin: frontmatter.requiresLogin,
    entryRoute: frontmatter.entryRoute,
    converted: frontmatter.converted === true,
    rows,
  };
}

function parseSemicolonParams(text) {
  const raw = stripCell(text);
  if (isEmpty(raw)) return {};
  const params = {};
  for (const part of raw.split(/[,，;]/)) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const val = part.slice(eq + 1).trim();
    if (key) params[key] = val;
  }
  return params;
}

/** 值列中的步骤 params：optional=true, continueOnFail=true, clickAny=sel1;;sel2 */
function parseStepParamsFromValue(valueText) {
  const raw = stripCell(valueText);
  if (isEmpty(raw) || !/=/.test(raw)) return undefined;

  const params = {};
  for (const part of raw.split(/[,，]/)) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const val = part.slice(eq + 1).trim();
    if (key === "optional" || key === "continueOnFail") {
      params[key] = val === "true";
    } else if (key === "clickAny") {
      params.clickAny = val
        .split(";;")
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (key) {
      params[key] = val;
    }
  }
  return Object.keys(params).length ? params : undefined;
}

function buildClickParams(row, selector) {
  const params = parseStepParamsFromValue(row.value) ?? {};
  const sel = stripCell(selector);

  if (params.clickAny?.length) {
    const list = [...params.clickAny];
    if (sel && !list.includes(sel)) list.unshift(sel);
    params.clickAny = list;
  } else if (sel.includes(",")) {
    params.clickAny = sel
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  return Object.keys(params).length ? params : undefined;
}

function mergeStepParams(base, extra) {
  if (!extra) return base;
  return base ? { ...base, ...extra } : extra;
}

function inferKeyboardKey(action) {
  if (/撤销|回撤/i.test(action)) return "undo";
  if (/重做|恢复/i.test(action)) return "redo";
  if (/回车|Enter/i.test(action)) return "Enter";
  if (/Esc|退出/i.test(action)) return "Escape";
  return "";
}

function inferType(row) {
  if (row.type && STEP_TYPES.has(row.type)) return row.type;

  const { action, selector, value } = row;
  if (/截图/.test(action)) return "screenshot";
  if (/验证|断言/.test(action)) return "verify";
  if (/就绪|等待.*就绪|等待.*加载/.test(action)) return "ready";
  if (/填|输入/.test(action)) return "input";
  if (/打开|访问|跳转/.test(action) && (value || /\{login_path\}/.test(selector))) return "link";
  if (/悬停|hover/i.test(action)) return "hover";
  if (/等待\s*\d+\s*ms|固定等待/.test(action)) return "wait";
  if (/滚动/.test(action)) return "scroll";
  if (/日志|log/i.test(action)) return "log";
  if (/撤销|回撤|undo|键盘|快捷键|keyboard/i.test(action)) return "keyboard";
  if (/提交|点击|选择|确定|使用/.test(action)) return "click";
  return "click";
}

function buildReadyParams(row, type) {
  const fromReadyCol = parseReadySelectors(row.ready);
  const fromVerifyCol = parseReadySelectors(row.verify);
  const readySelectors =
    fromReadyCol.length > 0
      ? fromReadyCol
      : type !== "verify" && type !== "ready"
        ? fromVerifyCol
        : [];

  if (!readySelectors.length) return undefined;
  return { readySelectors };
}

function baseStepFields(desc) {
  return { desc, delay: 0 };
}

function isRedundantTimeOut(step) {
  if (step.timeOut === undefined) return true;
  if (step.type === "ready") {
    return step.timeOut === DEFAULT_READY_TIMEOUT || step.timeOut === DEFAULT_STEP_TIMEOUT;
  }
  if (step.type === "link") {
    return step.timeOut === DEFAULT_LINK_TIMEOUT || step.timeOut === DEFAULT_STEP_TIMEOUT;
  }
  return step.timeOut === DEFAULT_STEP_TIMEOUT;
}

function buildVerifyStep(row, stepId, selectorFallback) {
  const parsed = parseVerifyField(row.verify);
  if (!parsed) return null;

  const matchRule =
    row.matchRule && MATCH_RULES.has(row.matchRule) ? row.matchRule : parsed.matchRule;

  const verifyValue = isEmpty(row.selector) ? selectorFallback || "body" : stripCell(row.selector);

  const step = {
    stepId,
    type: "verify",
    verifyValue,
    expectValue: parsed.expectValue,
    matchRule,
    ...baseStepFields(row.action || row.verify),
  };
  const stepParams = parseStepParamsFromValue(row.value);
  if (stepParams) step.params = stepParams;
  return step;
}

function rowToSteps(row, startIndex) {
  const steps = [];
  let i = startIndex;
  const type = inferType(row);
  const selector = stripCell(row.selector);
  const valueRaw = parseValueField(row.value);
  const readyParams = buildReadyParams(row, type);

  const nextId = () => {
    i += 1;
    return `s${i}`;
  };

  if (type === "verify") {
    const parsed = parseVerifyField(row.verify || row.action);
    const stepParams = parseStepParamsFromValue(row.value);
    const step = {
      stepId: nextId(),
      type: "verify",
      verifyValue: isEmpty(selector) ? "body" : selector,
      expectValue: parsed?.expectValue ?? (stepParams ? "" : valueRaw),
      matchRule:
        row.matchRule && MATCH_RULES.has(row.matchRule)
          ? row.matchRule
          : parsed?.matchRule ?? "contains",
      ...baseStepFields(row.action || row.verify),
    };
    if (stepParams) step.params = stepParams;
    steps.push(step);
    return { steps, nextIndex: i };
  }

  if (type === "ready") {
    const selectors = parseReadySelectors(row.ready || row.selector);
    steps.push({
      stepId: nextId(),
      type: "ready",
      params: { readySelectors: selectors.length ? selectors : [selector].filter(Boolean) },
      ...baseStepFields(row.action),
    });
    return { steps, nextIndex: i };
  }

  if (type === "screenshot") {
    const step = {
      stepId: nextId(),
      type: "screenshot",
      value: valueRaw || `${slugify(row.action) || "screenshot"}.png`,
      ...baseStepFields(row.action),
    };
    if (readyParams) step.params = readyParams;
    steps.push(step);
    return { steps, nextIndex: i };
  }

  if (type === "link") {
    const url = valueRaw || selector;
    const step = {
      stepId: nextId(),
      type: "link",
      url,
      ...baseStepFields(row.action),
      params: {},
    };
    if (readyParams) Object.assign(step.params, readyParams);
    if (/networkidle|load|domcontentloaded/.test(row.action)) {
      const loadMatch = row.action.match(/(networkidle|load|domcontentloaded)/);
      if (loadMatch) step.params.loadState = loadMatch[1];
    }
    if (Object.keys(step.params).length === 0) delete step.params;
    steps.push(step);
    return { steps, nextIndex: i };
  }

  if (type === "input") {
    const step = {
      stepId: nextId(),
      type: "input",
      selector,
      value: valueRaw || "{placeholder}",
      params: { clearBeforeInput: true },
      ...baseStepFields(row.action),
    };
    if (readyParams) step.params = { ...step.params, ...readyParams };
    steps.push(step);

    const verifyParsed = parseVerifyField(row.verify);
    if (verifyParsed && !parseReadySelectors(row.verify).length) {
      const verifyStep = buildVerifyStep(row, nextId(), selector);
      if (verifyStep) steps.push(verifyStep);
    }
    return { steps, nextIndex: i };
  }

  if (type === "wait") {
    const msMatch = row.action.match(/(\d+)\s*ms?/);
    steps.push({
      stepId: nextId(),
      type: "wait",
      value: msMatch ? Number(msMatch[1]) : 1000,
      ...baseStepFields(row.action),
    });
    return { steps, nextIndex: i };
  }

  if (type === "log") {
    steps.push({
      stepId: nextId(),
      type: "log",
      value: row.action,
      ...baseStepFields(row.action),
    });
    return { steps, nextIndex: i };
  }

  if (type === "macro") {
    const macroId = stripCell(row.selector) || valueRaw;
    if (!macroId) {
      throw new Error(`macro 步骤缺少宏 id: ${row.action}`);
    }
    steps.push({
      stepId: nextId(),
      type: "macro",
      value: macroId,
      params: parseSemicolonParams(row.value),
      ...baseStepFields(row.action),
    });
    return { steps, nextIndex: i };
  }

  if (type === "keyboard") {
    const key = valueRaw || inferKeyboardKey(row.action);
    if (!key) {
      throw new Error(`keyboard 步骤缺少按键: ${row.action}`);
    }
    const step = {
      stepId: nextId(),
      type: "keyboard",
      value: key,
      selector,
      ...baseStepFields(row.action),
    };
    if (readyParams) step.params = readyParams;
    steps.push(step);
    return { steps, nextIndex: i };
  }

  const step = {
    stepId: nextId(),
    type,
    selector: type === "link" ? "" : selector,
    url: type === "link" ? selector : "",
    ...baseStepFields(row.action),
  };
  if (readyParams) step.params = readyParams;

  if (type === "click") {
    const clickParams = buildClickParams(row, selector);
    if (clickParams) {
      step.params = mergeStepParams(step.params, clickParams);
      if (step.params.clickAny?.length) step.selector = "";
    }
  } else {
    const stepParams = parseStepParamsFromValue(row.value);
    if (stepParams) step.params = mergeStepParams(step.params, stepParams);
  }

  steps.push(step);

  const verifyParsed = parseVerifyField(row.verify);
  const hasReadyInVerify = parseReadySelectors(row.verify).length > 0;
  if (verifyParsed && !hasReadyInVerify) {
    const verifyStep = buildVerifyStep(row, nextId(), selector);
    if (verifyStep) steps.push(verifyStep);
  }

  return { steps, nextIndex: i };
}

function rowsToSteps(rows) {
  const steps = [];
  let index = 0;
  for (const row of rows) {
    const result = rowToSteps(row, index);
    steps.push(...result.steps);
    index = result.nextIndex;
  }
  return steps;
}

function buildScenario(scenario, moduleName) {
  const id = scenario.id || slugify(scenario.name);
  if (!id) {
    throw new Error(`场景缺少 id: ${scenario.name || moduleName}`);
  }

  const module = scenario.module || moduleName;
  const rawEntry = scenario.entryRoute ?? "";
  const entryRoute = isEmpty(rawEntry) ? "" : String(rawEntry);

  return {
    id,
    name: scenario.name,
    module,
    enabled: scenario.enabled,
    setup: {
      requiresLogin: scenario.requiresLogin ?? true,
      entryRoute,
    },
    steps: rowsToSteps(scenario.rows),
  };
}

function buildManifest(moduleName, scenariosMeta, scenarioJsonFiles) {
  const manifest = {
    module: moduleName,
    scenarios: [...scenarioJsonFiles],
  };
  const rootMeta = scenariosMeta.filter((s) => s.isRoot);
  const metaPool = rootMeta.length ? rootMeta : scenariosMeta;
  const description = metaPool.find((s) => s.description)?.description;
  const entryRoute = metaPool.find((s) => s.entryRoute)?.entryRoute;
  if (description) manifest.description = description;
  if (entryRoute && !isEmpty(entryRoute)) manifest.entryRoute = String(entryRoute);
  return manifest;
}

function pruneStep(step) {
  const out = { ...step };
  if (out.delay === 0) delete out.delay;
  if (out.selector === "") delete out.selector;
  if (out.url === "") delete out.url;
  if (out.params && Object.keys(out.params).length === 0) delete out.params;
  if (isRedundantTimeOut(out)) delete out.timeOut;
  return out;
}

function discoverProfileModules() {
  if (!existsSync(profilesDir)) return [];
  return readdirSync(profilesDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => e.name);
}

function sortScenarioMdPaths(paths) {
  return [...paths].sort((a, b) => {
    const aRoot = !a.includes("/");
    const bRoot = !b.includes("/");
    if (aRoot !== bRoot) return aRoot ? -1 : 1;
    return a.localeCompare(b, "zh-CN");
  });
}

function listScenarioMdFilesRecursive(moduleDir) {
  if (!existsSync(moduleDir)) return [];
  const results = [];

  function walk(dir, relPrefix) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const rel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, rel);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        results.push(rel);
      }
    }
  }

  walk(moduleDir, "");
  return sortScenarioMdPaths(results);
}

/** 扫描模块下全部场景 md，生成 manifest 用的 scenarios 列表（根目录在前，子目录在后） */
function collectManifestEntries(moduleDir) {
  const scenarioIds = [];
  const scenariosMeta = [];

  for (const mdFile of listScenarioMdFilesRecursive(moduleDir)) {
    const loaded = loadScenarioFromMd(join(moduleDir, mdFile));
    if (!loaded) continue;

    const { scenario } = loaded;
    if (!scenario.id) continue;

    scenarioIds.push(scenarioJsonRelPath(mdFile, scenario.id));
    scenariosMeta.push({
      description: scenario.description,
      entryRoute: scenario.entryRoute,
      isRoot: !mdFile.includes("/"),
    });
  }

  return { scenarioIds, scenariosMeta };
}

function scenarioJsonRelPath(mdRelPath, scenarioId) {
  const subDir = dirname(mdRelPath);
  const jsonName = `${scenarioId}.json`;
  if (!subDir || subDir === ".") return jsonName;
  return `${subDir}/${jsonName}`;
}

function scenarioOutDir(moduleOutDir, mdRelPath) {
  const subDir = dirname(mdRelPath);
  if (!subDir || subDir === ".") return moduleOutDir;
  return join(moduleOutDir, subDir);
}

function resolveScenarioFiles(moduleDir, scenarioFilter) {
  const all = listScenarioMdFilesRecursive(moduleDir);
  if (!scenarioFilter) return all;

  const match = all.find((f) => {
    const base = basename(f, ".md");
    const withoutExt = f.replace(/\.md$/, "");
    return base === scenarioFilter || withoutExt === scenarioFilter || f === scenarioFilter;
  });
  if (!match) {
    throw new Error(`找不到场景 md: ${scenarioFilter}（模块目录: ${moduleDir}）`);
  }
  return [match];
}

function loadScenarioFromMd(mdPath) {
  const content = readFileSync(mdPath, "utf-8");
  const { frontmatter, body } = splitFrontmatter(content);
  const scenario = parseScenarioFile(body, frontmatter);
  if (!scenario) return null;
  return { scenario, content, frontmatter };
}

function convertModule(moduleName, opts, scenarioFilter) {
  const moduleDir = join(profilesDir, moduleName);
  if (!existsSync(moduleDir)) {
    throw new Error(`找不到模块目录: ${moduleDir}`);
  }

  const mdFiles = resolveScenarioFiles(moduleDir, scenarioFilter);
  if (!mdFiles.length) {
    throw new Error(`模块 ${moduleName} 下没有场景 md`);
  }

  const outDir = join(scenariosRoot, moduleName);
  let convertedCount = 0;
  let skippedCount = 0;

  for (const mdFile of mdFiles) {
    const mdPath = join(moduleDir, mdFile);
    const loaded = loadScenarioFromMd(mdPath);
    if (!loaded) {
      console.warn(`跳过（无步骤表）: ${mdPath}`);
      continue;
    }

    const { scenario } = loaded;
    if (!scenario.id) {
      throw new Error(`${mdFile} 缺少 frontmatter.id`);
    }

    const jsonRel = scenarioJsonRelPath(mdFile, scenario.id);

    if (scenario.converted && !opts.force) {
      console.log(`跳过（已转换）: ${mdFile}`);
      skippedCount += 1;
      continue;
    }

    const built = buildScenario(scenario, moduleName);
    built.steps = built.steps.map(pruneStep);
    const fileOutDir = scenarioOutDir(outDir, mdFile);

    if (opts.dryRun) {
      console.log(`\n--- ${moduleName}/${jsonRel} ← ${mdFile} ---\n${JSON.stringify(built, null, 2)}`);
    } else {
      mkdirSync(fileOutDir, { recursive: true });
      writeFileSync(join(fileOutDir, `${built.id}.json`), `${JSON.stringify(built, null, 2)}\n`, "utf-8");
      updateFrontmatterInFile(mdPath, {
        converted: true,
        convertedAt: new Date().toISOString(),
      });
      console.log(`已生成: ${join(fileOutDir, `${built.id}.json`)} ← ${mdFile}`);
    }
    convertedCount += 1;
  }

  if (!opts.dryRun) {
    const { scenarioIds, scenariosMeta } = collectManifestEntries(moduleDir);
    if (scenarioIds.length) {
      const manifest = buildManifest(moduleName, scenariosMeta, scenarioIds);
      const manifestPath = join(outDir, "manifest.json");
      mkdirSync(outDir, { recursive: true });
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");
      console.log(`已生成: ${manifestPath}`);
    }
  }

  if (skippedCount) {
    console.log(`跳过 ${skippedCount} 个已转换场景（使用 --force 强制重转）`);
  }

  return convertedCount;
}

function parseArgs(argv) {
  const positional = [];
  const opts = { dryRun: false, allModules: false, force: false };
  for (const arg of argv) {
    if (arg === "--dry-run") opts.dryRun = true;
    else if (arg === "--all") opts.allModules = true;
    else if (arg === "--force") opts.force = true;
    else if (!arg.startsWith("-")) positional.push(arg);
  }
  return { module: positional[0], scenario: positional[1], opts };
}

function main() {
  const { module: moduleName, scenario: scenarioFilter, opts } = parseArgs(process.argv.slice(2));

  if (opts.allModules) {
    const modules = discoverProfileModules();
    if (!modules.length) {
      console.error(`未找到模块目录: ${profilesDir}/{module}/`);
      process.exit(1);
    }
    let total = 0;
    for (const mod of modules) {
      console.log(`\n== 模块: ${mod} ==`);
      total += convertModule(mod, opts);
    }
    console.log(`\n完成，共转换 ${total} 个场景`);
    return;
  }

  if (!moduleName) {
    console.error(`用法:
  node scripts/profile-to-scenario.mjs --all
  node scripts/profile-to-scenario.mjs <module>
  node scripts/profile-to-scenario.mjs <module> <场景md文件名>
  node scripts/profile-to-scenario.mjs login 登录成功 --force
  node scripts/profile-to-scenario.mjs project --dry-run`);
    process.exit(1);
  }

  try {
    convertModule(moduleName, opts, scenarioFilter);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

export {
  loadScenarioFromMd,
  buildScenario,
  splitFrontmatter,
  serializeFrontmatter,
  parseScenarioFile,
  rowsToSteps,
  pruneStep,
  convertModule,
  discoverProfileModules,
  profilesDir,
  root,
};

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === resolve(__filename)) {
  main();
}
