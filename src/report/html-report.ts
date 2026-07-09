import { writeFileSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { join, basename, relative } from "node:path";
import type { ScenarioResult, ScenarioScreenshot } from "../types/scenario.types.js";
import { resolveRunVideoPath } from "../core/video.js";

const PHOTOSWIPE_VERSION = "5.4.4";
const PHOTOSWIPE_CDN = `https://cdn.jsdelivr.net/npm/photoswipe@${PHOTOSWIPE_VERSION}/dist`;

export interface ReportArtifacts {
  runId: string;
  logPath: string;
  runVideoPath?: string;
}

export function generateHtmlReport(
  runDir: string,
  results: ScenarioResult[],
  artifacts: ReportArtifacts,
): string {
  const total = results.length;
  const passed = results.filter((r) => r.status === "PASSED").length;
  const failed = results.filter((r) => r.status === "FAILED").length;
  const errors = results.filter((r) => r.status === "ERROR").length;
  const now = new Date().toISOString().replace("T", " ").slice(0, 19);
  const modules = [...new Set(results.map((r) => r.module))].sort();

  const moduleOptions = modules
    .map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`)
    .join("");

  const runVideoHtml = buildRunVideoSection(runDir, artifacts);
  const runMetaHtml = buildRunMetaSection(runDir, artifacts);

  const rows = results
    .map((r) => {
      const statusClass = `status-${r.status.toLowerCase()}`;
      const screenshotHtml = buildScreenshotGallery(runDir, r);
      const failedStep = r.failedStep
        ? `<br><small>失败步骤: ${r.failedStep.loopIndex ? `[loop ${r.failedStep.loopIndex}] ` : ""}${r.failedStep.stepId} (${r.failedStep.type})</small>`
        : "";
      const loopInfo = r.loopSummary
        ? `<br><small>循环: ${r.loopSummary.passed}/${r.loopSummary.total} 通过</small>`
        : "";
      const logHtml = buildScenarioLogLink(runDir, r);
      return `<tr data-module="${escapeHtml(r.module)}" data-status="${escapeHtml(r.status)}">
        <td><code>${escapeHtml(r.module)}</code></td>
        <td>${escapeHtml(r.scenarioName)}</td>
        <td><code>${escapeHtml(r.scenarioId)}</code></td>
        <td class="${statusClass}">${r.status}</td>
        <td>${r.elapsedMs}ms</td>
        <td>${logHtml}</td>
        <td>${screenshotHtml}</td>
        <td>${escapeHtml(r.message)}${failedStep}${loopInfo}</td>
      </tr>`;
    })
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>E2E 测试报告</title>
<link rel="stylesheet" href="${PHOTOSWIPE_CDN}/photoswipe.css">
<style>
body{font-family:Arial,sans-serif;margin:20px;background:#f5f5f5}
.container{max-width:1400px;margin:0 auto;background:#fff;padding:20px;border-radius:8px}
h1{border-bottom:3px solid #4CAF50;padding-bottom:10px}
.summary{display:flex;gap:16px;margin:20px 0;flex-wrap:wrap}
.stat-card{flex:1;min-width:100px;padding:12px;border-radius:5px;text-align:center}
.total{background:#e3f2fd}.passed{background:#e8f5e9}.failed{background:#ffebee}.error{background:#fff3e0}
.stat-number{font-size:28px;font-weight:bold}
table{width:100%;border-collapse:collapse;margin-top:16px}
th,td{padding:10px;text-align:left;border-bottom:1px solid #ddd;vertical-align:top}
th{background:#4CAF50;color:#fff}
.status-passed{color:#4CAF50;font-weight:bold}
.status-failed{color:#f44336;font-weight:bold}
.status-error{color:#ff9800;font-weight:bold}
.screenshot-gallery{display:flex;flex-wrap:wrap;gap:10px;max-width:520px}
.screenshot-item{text-align:center}
.screenshot-item a{display:block;text-decoration:none;color:inherit}
.screenshot-item img{max-width:160px;max-height:120px;border:1px solid #ddd;border-radius:4px;cursor:zoom-in;display:block;object-fit:cover}
.screenshot-item a:hover img{box-shadow:0 2px 8px rgba(0,0,0,.15)}
.screenshot-item.fail img{border-color:#f44336}
.screenshot-item small{display:block;font-size:11px;color:#666;margin-top:4px;max-width:160px;word-break:break-all}
.screenshot-item .tag{font-size:10px;padding:1px 4px;border-radius:3px;margin-right:4px}
.tag-pass{background:#e8f5e9;color:#2e7d32}
.tag-fail{background:#ffebee;color:#c62828}
.run-video-section{margin:20px 0;padding:16px;background:#f9f9f9;border-radius:6px;border:1px solid #e0e0e0}
.run-video-section h2{font-size:16px;margin:0 0 12px;color:#333}
.run-video{width:100%;max-width:960px;border-radius:4px;border:1px solid #ddd;background:#000;display:block}
.video-meta{font-size:12px;color:#666;margin-top:8px}
.run-meta{margin:16px 0 0;padding:12px 16px;background:#fafafa;border:1px solid #e8e8e8;border-radius:6px;font-size:14px;line-height:1.9}
.run-meta code{background:#eee;padding:2px 6px;border-radius:3px;font-size:13px}
.run-meta a{color:#1976d2;text-decoration:none;word-break:break-all}
.run-meta a:hover{text-decoration:underline}
.scenario-log a{color:#1976d2;text-decoration:none;word-break:break-all;font-size:13px}
.scenario-log a:hover{text-decoration:underline}
.filters{display:flex;flex-wrap:wrap;align-items:center;gap:12px 20px;margin:16px 0;padding:12px 16px;background:#f9f9f9;border-radius:6px;border:1px solid #e0e0e0}
.filters label{font-size:14px;color:#333;display:flex;align-items:center;gap:8px}
.filters select{padding:6px 10px;border:1px solid #ccc;border-radius:4px;font-size:14px;min-width:120px;background:#fff}
.filter-meta{font-size:13px;color:#666;margin-left:auto}
.filter-reset{padding:6px 12px;border:1px solid #ccc;border-radius:4px;background:#fff;cursor:pointer;font-size:13px}
.filter-reset:hover{background:#f0f0f0}
tr.row-hidden{display:none}
</style>
</head>
<body>
<div class="container">
<h1>Visual E2E Test 测试报告</h1>
<p>生成时间: ${now}</p>
<p class="preview-hint">点击截图可全屏预览；下方为本次运行完整录屏（WebM 格式）</p>
${runVideoHtml}
<div class="summary">
  <div class="stat-card total"><div>总计</div><div class="stat-number">${total}</div></div>
  <div class="stat-card passed"><div>通过</div><div class="stat-number">${passed}</div></div>
  <div class="stat-card failed"><div>失败</div><div class="stat-number">${failed}</div></div>
  <div class="stat-card error"><div>错误</div><div class="stat-number">${errors}</div></div>
</div>
${runMetaHtml}
<div class="filters">
  <label>模块
    <select id="filter-module">
      <option value="">全部</option>
      ${moduleOptions}
    </select>
  </label>
  <label>状态
    <select id="filter-status">
      <option value="">全部</option>
      <option value="PASSED">PASSED</option>
      <option value="FAILED">FAILED</option>
      <option value="ERROR">ERROR</option>
    </select>
  </label>
  <button type="button" class="filter-reset" id="filter-reset">重置</button>
  <span class="filter-meta" id="filter-meta">显示 ${total} / ${total} 条</span>
</div>
<table id="results-table">
<thead><tr><th>模块</th><th>场景</th><th>ID</th><th>状态</th><th>耗时</th><th>日志</th><th>截图</th><th>消息</th></tr></thead>
<tbody>${rows}</tbody>
</table>
</div>
<script>
(function () {
  const moduleEl = document.getElementById('filter-module');
  const statusEl = document.getElementById('filter-status');
  const resetEl = document.getElementById('filter-reset');
  const metaEl = document.getElementById('filter-meta');
  const rows = Array.from(document.querySelectorAll('#results-table tbody tr'));
  const total = rows.length;

  function applyFilters() {
    const mod = moduleEl.value;
    const status = statusEl.value;
    let visible = 0;
    rows.forEach((row) => {
      const matchModule = !mod || row.dataset.module === mod;
      const matchStatus = !status || row.dataset.status === status;
      const show = matchModule && matchStatus;
      row.classList.toggle('row-hidden', !show);
      if (show) visible++;
    });
    metaEl.textContent = '显示 ' + visible + ' / ' + total + ' 条';
  }

  moduleEl.addEventListener('change', applyFilters);
  statusEl.addEventListener('change', applyFilters);
  resetEl.addEventListener('click', () => {
    moduleEl.value = '';
    statusEl.value = '';
    applyFilters();
  });
})();
</script>
<script type="module">
import PhotoSwipeLightbox from '${PHOTOSWIPE_CDN}/photoswipe-lightbox.esm.min.js';

document.querySelectorAll('.pswp-gallery').forEach((galleryEl) => {
  const lightbox = new PhotoSwipeLightbox({
    gallery: galleryEl,
    children: 'a',
    pswpModule: () => import('${PHOTOSWIPE_CDN}/photoswipe.esm.min.js'),
  });
  lightbox.on('uiRegister', () => {
    lightbox.pswp?.ui?.registerElement({
      name: 'custom-caption',
      order: 9,
      isButton: false,
      appendTo: 'wrapper',
      html: '',
      onInit: (el, pswp) => {
        pswp.on('change', () => {
          const curr = pswp.currSlide?.data?.element;
          el.innerHTML = curr?.dataset?.pswpCaption ?? '';
        });
      },
    });
  });
  lightbox.init();
});
</script>
</body>
</html>`;

  const reportPath = join(runDir, "report.html");
  writeFileSync(reportPath, html, "utf-8");
  return reportPath;
}

function toReportRelPath(runDir: string, filePath: string): string {
  return relative(runDir, filePath).split("\\").join("/");
}

function artifactLink(href: string, label: string): string {
  return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
}

function buildScenarioLogLink(runDir: string, result: ScenarioResult): string {
  const logPath = resolveScenarioLogPath(runDir, result);
  if (!logPath) return "—";
  const logRel = toReportRelPath(runDir, logPath);
  return `<span class="scenario-log">${artifactLink(logRel, logRel)}</span>`;
}

function resolveScenarioLogPath(runDir: string, result: ScenarioResult): string | undefined {
  const logPath = join(runDir, "logs", `${result.module}_${result.scenarioId}.log`);
  return existsSync(logPath) ? logPath : undefined;
}

function buildRunMetaSection(runDir: string, artifacts: ReportArtifacts): string {
  const logPath = existsSync(artifacts.logPath)
    ? artifacts.logPath
    : join(runDir, "logs", "run.log");
  const logRel = toReportRelPath(runDir, logPath);
  const videoPath = resolveRunVideoPath(runDir, artifacts.runId, artifacts.runVideoPath);
  const videoRel = videoPath ? toReportRelPath(runDir, videoPath) : undefined;

  const videoLine = videoRel ? artifactLink(videoRel, videoRel) : "—";

  return `<div class="run-meta">
  <div><strong>运行 ID：</strong><code>${escapeHtml(artifacts.runId)}</code></div>
  <div><strong>日志：</strong>${artifactLink(logRel, logRel)}</div>
  <div><strong>录屏：</strong>${videoLine}</div>
</div>`;
}

function buildRunVideoSection(runDir: string, artifacts: ReportArtifacts): string {
  const runVideoPath = resolveRunVideoPath(runDir, artifacts.runId, artifacts.runVideoPath);
  if (!runVideoPath) return "";

  const relPath = toReportRelPath(runDir, runVideoPath);
  const label = basename(runVideoPath);

  return `<div class="run-video-section">
  <h2>运行录屏</h2>
  <video class="run-video" controls preload="metadata" playsinline title="本次测试运行录屏">
    <source src="${escapeHtml(relPath)}" type="video/webm">
  </video>
  <div class="video-meta">${escapeHtml(label)}</div>
</div>`;
}

function buildScreenshotGallery(runDir: string, result: ScenarioResult): string {
  const items = resolveScenarioScreenshots(runDir, result);
  if (items.length === 0) return "";

  const galleryId = `gallery-${sanitizeDomId(result.scenarioId)}`;

  return `<div class="screenshot-gallery pswp-gallery" id="${galleryId}">${items
    .map((item) => {
      const filePath = existsSync(item.path) ? item.path : join(runDir, "screenshots", basename(item.path));
      if (!existsSync(filePath)) return "";
      const b64 = readFileSync(filePath).toString("base64");
      const dataUrl = `data:image/png;base64,${b64}`;
      const label = formatScreenshotLabel(item);
      const caption = `[${item.status}] ${label}`;
      const { width, height } = readPngDimensions(filePath);
      const cls = item.status === "FAIL" ? "screenshot-item fail" : "screenshot-item";
      const tagCls = item.status === "FAIL" ? "tag tag-fail" : "tag tag-pass";
      return `<div class="${cls}">
        <a href="${dataUrl}"
           data-pswp-src="${dataUrl}"
           data-pswp-width="${width}"
           data-pswp-height="${height}"
           data-pswp-caption="${escapeHtml(caption)}"
           target="_blank">
          <img src="${dataUrl}" alt="${escapeHtml(label)}" title="点击预览">
        </a>
        <small><span class="${tagCls}">${item.status}</span>${escapeHtml(label)}</small>
      </div>`;
    })
    .filter(Boolean)
    .join("")}</div>`;
}

function readPngDimensions(filePath: string): { width: number; height: number } {
  try {
    const buf = readFileSync(filePath);
    if (buf.length >= 24 && buf[0] === 0x89 && buf[1] === 0x50) {
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    }
  } catch {
    /* ignore */
  }
  return { width: 1280, height: 720 };
}

function sanitizeDomId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function formatScreenshotLabel(item: ScenarioScreenshot): string {
  const loop = item.loopIndex ? `[${item.loopIndex}] ` : "";
  const desc = item.desc ? ` ${item.desc}` : "";
  return `${loop}${item.stepId} ${item.stepType}${desc}`;
}

function resolveScenarioScreenshots(runDir: string, result: ScenarioResult): ScenarioScreenshot[] {
  if (result.screenshots.length > 0) {
    return result.screenshots;
  }

  const fromSteps = result.steps
    .filter((s) => s.screenshot)
    .map((s) => ({
      stepId: s.stepId,
      stepType: s.type,
      desc: s.desc,
      path: s.screenshot!,
      status: s.status === "FAILED" ? ("FAIL" as const) : ("PASS" as const),
      loopIndex: s.loopIndex,
    }));
  if (fromSteps.length > 0) return fromSteps;

  const screenshotDir = join(runDir, "screenshots");
  if (!existsSync(screenshotDir)) return [];

  const prefix = `${result.scenarioId}_`;
  return readdirSync(screenshotDir)
    .filter((f) => f.startsWith(prefix) && (f.endsWith("_PASS.png") || f.endsWith("_FAIL.png")))
    .sort()
    .map((f) => {
      const status = f.endsWith("_FAIL.png") ? ("FAIL" as const) : ("PASS" as const);
      const stepId = f.slice(prefix.length).replace(/_loop\d+/, "").replace(/_(PASS|FAIL)\.png$/, "");
      return {
        stepId,
        stepType: "",
        desc: basename(f, ".png"),
        path: join(screenshotDir, f),
        status,
      };
    });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
