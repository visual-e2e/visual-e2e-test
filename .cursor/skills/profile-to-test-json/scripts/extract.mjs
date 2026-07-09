#!/usr/bin/env node
/**
 * 产品画像 Markdown → 自动化测试 JSON
 * Usage: node extract.mjs <module> [--input path] [--output path] [--base-url-env VAR]
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../../..");

const ACTION_MAP = [
  { match: /^双击$/, type: "dblclick" },
  { match: /^路由跳转$/, type: "navigate" },
  { match: /^表单提交$/, type: "submit" },
  { match: /^下拉菜单点击$/, type: "menu_click" },
  { match: /^侧栏菜单点击$/, type: "sidebar_click" },
  { match: /^行\/项点击$/, type: "row_click" },
  { match: /keydown\.enter|clear/i, type: "keyboard" },
  { match: /ngModelChange|thyChange|updateModel|selectConfirm/i, type: "input_change" },
  { match: /^事件/, type: "event" },
  { match: /^点击$/, type: "click" },
];

function parseArgs(argv) {
  const positional = [];
  const opts = { baseUrlEnv: "BASE_URL" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--input") opts.input = argv[++i];
    else if (a === "--output") opts.output = argv[++i];
    else if (a === "--base-url-env") opts.baseUrlEnv = argv[++i];
    else if (!a.startsWith("-")) positional.push(a);
  }
  if (!positional[0]) {
    console.error("Usage: node extract.mjs <module> [--input path] [--output path]");
    process.exit(1);
  }
  opts.module = positional[0];
  opts.input = opts.input ?? path.join(REPO_ROOT, "产品画像", `${opts.module}.md`);
  opts.output =
    opts.output ?? path.join(REPO_ROOT, "tests/fixtures/profiles", `${opts.module}.json`);
  return opts;
}

function routeToId(route) {
  return route
    .replace(/^\//, "")
    .replace(/[/:]/g, "_")
    .replace(/^_+/, "") || "root";
}

function mapActionType(opWay) {
  for (const { match, type } of ACTION_MAP) {
    if (match.test(opWay.trim())) return type;
  }
  return "click";
}

function stripCell(value) {
  if (!value) return value;
  return value.replace(/`/g, "").trim();
}

function parseMetaTable(lines) {
  const meta = {};
  for (const line of lines) {
    const m = line.match(/^\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|$/);
    if (!m || m[1].includes("---") || m[1] === "项") continue;
    meta[stripCell(m[1])] = stripCell(m[2]);
  }
  return meta;
}

function parsePipeRow(line) {
  const parts = line.split("|").map((s) => stripCell(s));
  if (parts.length < 3) return null;
  return parts.slice(1, -1);
}

function isPlaceholderRow(cols) {
  return cols.every((c) => c === "-" || c === "");
}

function parseRouteParamsSection(content) {
  const section = content.match(/### 路由参数说明（测试填写）\s*\n([\s\S]*?)(?=\n### |\n## |$)/);
  if (!section) return {};
  const params = {};
  for (const line of section[1].split("\n")) {
    const cols = parsePipeRow(line);
    if (!cols || cols[0] === "参数名" || cols[0].includes("---")) continue;
    const name = cols[0].replace(/`/g, "").trim();
    const routes = cols[1];
    const note = cols[2];
    if (!name || name === "-") continue;
    params[name] = {
      routes: routes.split(",").map((s) => s.trim()).filter(Boolean),
      placeholder: `:${name}`,
      example: null,
      note: note || "",
    };
  }
  return params;
}

function parseSectionTables(body) {
  const lines = body.split("\n");
  const metaLines = [];
  const opLines = [];
  let table = null;

  for (const line of lines) {
    if (!line.trim().startsWith("|")) {
      if (table === "meta" && metaLines.length > 0) table = null;
      continue;
    }
    if (line.includes("行号") && line.includes("所属组件")) {
      table = "ops";
      opLines.length = 0;
      opLines.push(line);
      continue;
    }
    if (line.includes("项") && line.includes("内容") && !line.includes("行号")) {
      table = "meta";
      metaLines.length = 0;
      metaLines.push(line);
      continue;
    }
    if (table === "ops") opLines.push(line);
    else if (table === "meta") metaLines.push(line);
  }

  return { metaLines, opLines };
}

function extractParamsFromRoute(route) {
  const params = {};
  const re = /:(\w+)/g;
  let m;
  while ((m = re.exec(route)) !== null) {
    params[m[1]] = `:${m[1]}`;
  }
  return params;
}

function buildUrlTemplate(baseUrl, route) {
  return `${baseUrl}${route}`;
}

function assessTestability(op) {
  if (!op.cssSelector && !op.playwright) {
    return { testable: false, skipReason: "missing_selector" };
  }
  const noLabel = !op.label || op.label === "-";
  const unstableLabel = op.label && (op.label.includes("*ngIf") || op.label.length > 80);
  if (noLabel && !op.cssSelector.includes("[")) {
    return { testable: false, skipReason: "missing_label" };
  }
  if (unstableLabel && noLabel) {
    return { testable: false, skipReason: "unstable_label" };
  }
  const needsManualStep =
    op.actionType === "event" ||
    op.actionType === "input_change" ||
    op.component.includes("filter-condition") ||
    op.element.includes("table") ||
    op.element.includes("custom-select");
  return { testable: true, skipReason: null, needsManualStep };
}

function parseProfileMarkdown(content, module, baseUrl) {
  const routeParams = parseRouteParamsSection(content);
  const pages = [];

  const pageSections = content.split("\n### `");
  for (let i = 1; i < pageSections.length; i++) {
    const chunk = pageSections[i];
    const routeEnd = chunk.indexOf("`");
    if (routeEnd === -1) continue;
    const routeRaw = chunk.slice(0, routeEnd);
    const route = routeRaw.startsWith("/") ? routeRaw : `/${routeRaw}`;
    const body = chunk.slice(routeEnd + 1);

    const { metaLines, opLines } = parseSectionTables(body);

    const meta = parseMetaTable(metaLines);
    const pageId = routeToId(route);
    const params = extractParamsFromRoute(route);

    const operations = [];
    let opIndex = 0;
    for (const line of opLines) {
      const cols = parsePipeRow(line);
      if (!cols || cols[0] === "行号" || cols[0].includes("---")) continue;
      if (isPlaceholderRow(cols)) continue;

      const [sourceLineStr, component, element, opWay, label, cssSelector, playwright, eventBinding] =
        cols;
      const sourceLine = sourceLineStr === "-" ? null : parseInt(sourceLineStr, 10);
      opIndex += 1;
      const opId = sourceLine != null ? `${pageId}-${sourceLine}` : `${pageId}-op${opIndex}`;

      const actionType = mapActionType(opWay || "");
      const op = {
        id: opId,
        sourceLine: Number.isNaN(sourceLine) ? null : sourceLine,
        component: component || "",
        element: element || "",
        actionType,
        label: label === "-" ? null : label,
        cssSelector: cssSelector || "",
        playwright: playwright || "",
        eventBinding: eventBinding || "",
        assertions: [],
      };
      Object.assign(op, assessTestability(op));
      operations.push(op);
    }

    let childRoutes = [];
    const childRoutesKey = Object.keys(meta).find((k) => k.startsWith("含子路由"));
    const childRoutesRaw = childRoutesKey ? meta[childRoutesKey] : null;
    if (childRoutesRaw && childRoutesRaw !== "-") {
      childRoutes = childRoutesRaw
        .split(/[、,]/)
        .map((s) => s.trim())
        .filter(Boolean);
    }

    const opsCountKey = Object.keys(meta).find((k) => k.startsWith("本入口操作数"));
    const declaredOps = opsCountKey ? parseInt(meta[opsCountKey], 10) : NaN;

    pages.push({
      id: pageId,
      route,
      urlTemplate: buildUrlTemplate(baseUrl, route),
      params,
      layoutComponent: meta["布局/壳组件"] === "-" ? null : meta["布局/壳组件"] || null,
      childRoutes,
      operations,
      stats: {
        operationsInPage: Number.isNaN(declaredOps) ? operations.length : declaredOps,
      },
    });
  }

  return { routeParams, pages };
}

function buildManualReview(pages, routeParams) {
  const items = [];
  for (const [name, p] of Object.entries(routeParams)) {
    if (p.example == null) items.push(`routeParams.${name}.example 需填真实测试 id`);
  }
  for (const page of pages) {
    for (const op of page.operations) {
      if (op.needsManualStep) {
        items.push(`${page.route} → ${op.id} (${op.component}) 需补充手动步骤或断言`);
      }
      if (!op.testable) {
        items.push(`${page.route} → ${op.id} 跳过原因: ${op.skipReason}`);
      }
    }
    if (page.operations.length === 0) {
      items.push(`页面 ${page.route} 无操作点，确认是否跳过或补充画像`);
    }
  }
  return [...new Set(items)];
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(opts.input)) {
    console.error(`Input not found: ${opts.input}`);
    process.exit(1);
  }

  const content = fs.readFileSync(opts.input, "utf-8");
  const baseUrl = `\${${opts.baseUrlEnv}}`;
  const { routeParams, pages } = parseProfileMarkdown(content, opts.module, baseUrl);

  let totalOps = 0;
  let testable = 0;
  let skipped = 0;
  for (const page of pages) {
    for (const op of page.operations) {
      totalOps++;
      if (op.testable) testable++;
      else skipped++;
    }
  }

  const result = {
    module: opts.module,
    source: path.relative(REPO_ROOT, opts.input).replace(/\\/g, "/"),
    generatedAt: new Date().toISOString(),
    baseUrl,
    routeParams,
    pages,
    stats: {
      pages: pages.length,
      operations: totalOps,
      testable,
      skipped,
    },
    manualReview: buildManualReview(pages, routeParams),
  };

  fs.mkdirSync(path.dirname(opts.output), { recursive: true });
  fs.writeFileSync(opts.output, JSON.stringify(result, null, 2) + "\n", "utf-8");

  console.log(`✓ ${opts.module}: ${pages.length} pages, ${totalOps} ops (${testable} testable, ${skipped} skipped)`);
  console.log(`  → ${opts.output}`);
}

main();
