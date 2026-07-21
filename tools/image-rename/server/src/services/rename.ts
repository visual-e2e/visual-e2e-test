const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|svg|ico|tiff?)$/i;

export interface TemplateContext {
  name: string;
  ext: string;
  index: number;
  prefix: string;
}

export function applyTemplate(template: string, ctx: TemplateContext): string {
  return template
    .replace(/\{index:(\d+)\}/g, (_, width: string) =>
      String(ctx.index).padStart(Number(width), "0"),
    )
    .replace(/\{index\}/g, String(ctx.index))
    .replace(/\{name\}/g, ctx.name)
    .replace(/\{ext\}/g, ctx.ext)
    .replace(/\{prefix\}/g, ctx.prefix);
}

export function isImageFile(name: string): boolean {
  return IMAGE_EXT.test(name);
}

export function splitName(filename: string): { name: string; ext: string } {
  const dot = filename.lastIndexOf(".");
  if (dot <= 0) return { name: filename, ext: "" };
  return { name: filename.slice(0, dot), ext: filename.slice(dot) };
}

export type SortMode = "name-asc" | "name-desc" | "mtime-asc" | "mtime-desc";

export interface FileEntry {
  name: string;
  ext: string;
  typeLabel: string;
  size: number;
  mtime: number;
}

export interface RenameRule {
  template: string;
  prefix: string;
  startIndex: number;
}

export interface PreviewItem {
  from: string;
  to: string;
  conflict?: string;
}

export function sortFiles(files: FileEntry[], sort: SortMode): FileEntry[] {
  const copy = [...files];
  copy.sort((a, b) => {
    switch (sort) {
      case "name-asc":
        return a.name.localeCompare(b.name, undefined, { numeric: true });
      case "name-desc":
        return b.name.localeCompare(a.name, undefined, { numeric: true });
      case "mtime-asc":
        return a.mtime - b.mtime;
      case "mtime-desc":
        return b.mtime - a.mtime;
    }
  });
  return copy;
}

export function buildPreview(
  allFiles: FileEntry[],
  selectedNames: string[],
  sort: SortMode,
  rule: RenameRule,
): PreviewItem[] {
  const selectedSet = new Set(selectedNames);
  const selected = sortFiles(
    allFiles.filter((f) => selectedSet.has(f.name)),
    sort,
  );

  const planned = new Map<string, string>();
  const results: PreviewItem[] = [];

  selected.forEach((file, i) => {
    const { name, ext } = splitName(file.name);
    const to = applyTemplate(rule.template, {
      name,
      ext,
      index: rule.startIndex + i,
      prefix: rule.prefix,
    });
    results.push({ from: file.name, to });
    planned.set(to, file.name);
  });

  const unselectedNames = new Set(
    allFiles.filter((f) => !selectedSet.has(f.name)).map((f) => f.name),
  );

  for (const item of results) {
    if (item.from === item.to) continue;
    const dup = results.filter((r) => r.to === item.to);
    if (dup.length > 1) {
      item.conflict = "新文件名重复";
      continue;
    }
    if (unselectedNames.has(item.to)) {
      item.conflict = "与未选文件重名";
      continue;
    }
    if (/[<>:"/\\|?*\x00-\x1f]/.test(item.to)) {
      item.conflict = "含非法字符";
    }
  }

  return results;
}
