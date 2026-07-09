import { platform } from "node:os";

/** 常用快捷键别名 → Playwright 按键组合 */
const KEY_ALIASES: Record<string, string | ((isMac: boolean) => string)> = {
  undo: (mac) => (mac ? "Meta+Z" : "Control+Z"),
  redo: (mac) => (mac ? "Meta+Shift+Z" : "Control+Y"),
  backspace: "Backspace",
  delete: "Delete",
  enter: "Enter",
  escape: "Escape",
  tab: "Tab",
};

export function resolveKeyboardKey(raw: string): string {
  const key = raw.trim();
  if (!key) throw new Error("keyboard 步骤缺少 value（按键）");

  const alias = KEY_ALIASES[key.toLowerCase()];
  if (!alias) return key;

  const isMac = platform() === "darwin";
  return typeof alias === "function" ? alias(isMac) : alias;
}
