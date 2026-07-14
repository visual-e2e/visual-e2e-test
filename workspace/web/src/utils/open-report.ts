import { isElectron } from "./runtime";

/** 报告/日志共用窗口名（浏览器 named window；与 html-report 内链接 target 一致） */
export const REPORT_VIEW_TARGET = "visual-e2e-report";

function resolveReportHref(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return new URL(path, window.location.origin).href;
}

/** workspace：系统浏览器；Electron client：应用内报告窗口 */
export async function openReport(path: string): Promise<void> {
  const href = resolveReportHref(path);

  if (isElectron() && window.electronAPI) {
    await window.electronAPI.openReport(href);
    return;
  }

  const popup = window.open(href, REPORT_VIEW_TARGET);
  if (!popup) {
    throw new Error("无法打开报告，请检查浏览器是否拦截弹窗");
  }
  popup.focus();
}
