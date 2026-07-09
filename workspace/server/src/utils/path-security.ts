import { resolve, relative, sep } from "node:path";

export class PathSecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PathSecurityError";
  }
}

/** 将相对路径解析到 baseDir 下，拒绝逃逸出 baseDir */
export function resolveWithin(baseDir: string, relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (normalized.includes("..")) {
    throw new PathSecurityError(`非法路径: ${relativePath}`);
  }

  const abs = resolve(baseDir, normalized);
  const rel = relative(baseDir, abs);
  if (rel.startsWith("..") || rel.split(sep).includes("..")) {
    throw new PathSecurityError(`路径越界: ${relativePath}`);
  }
  return abs;
}
