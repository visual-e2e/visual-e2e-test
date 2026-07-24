import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

function assertHttpUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("无效的下载地址");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("仅支持 http/https 下载");
  }
  return parsed;
}

export async function downloadUrlToBuffer(url: string): Promise<{
  buffer: Buffer;
  filename: string;
}> {
  const parsed = assertHttpUrl(url);
  const response = await fetch(parsed.href, {
    redirect: "follow",
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) {
    throw new Error(`下载失败 HTTP ${response.status}`);
  }
  const disposition = response.headers.get("content-disposition") ?? "";
  const matched = /filename\*?=(?:UTF-8''|")?([^\";]+)/i.exec(disposition);
  const fromHeader = matched?.[1] ? decodeURIComponent(matched[1].replace(/"/g, "")) : "";
  const fromPath = pathBasename(parsed.pathname) || `tool-${Date.now()}.vettool.zip`;
  const filename = fromHeader || fromPath;
  const buffer = Buffer.from(await response.arrayBuffer());
  return { buffer, filename };
}

function pathBasename(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

export async function downloadUrlToTempFile(
  url: string,
  filenameHint?: string,
): Promise<{ path: string; filename: string; size: number }> {
  const { buffer, filename: fetchedName } = await downloadUrlToBuffer(url);
  const filename = (filenameHint?.trim() || fetchedName).replace(/[^\w.\-]+/g, "_");
  const dir = join(tmpdir(), "visual-e2e-tool-downloads");
  mkdirSync(dir, { recursive: true });
  const dest = join(dir, `${Date.now()}-${filename}`);
  writeFileSync(dest, buffer);
  return { path: dest, filename, size: buffer.length };
}
