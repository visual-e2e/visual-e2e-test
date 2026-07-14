import { Menu, type WebContents } from "electron";

export function attachEditSupport(contents: WebContents): void {
  bindEditShortcuts(contents);
  bindEditContextMenu(contents);
}

function bindEditShortcuts(contents: WebContents): void {
  contents.on("before-input-event", (_event, input) => {
    if (input.type !== "keyDown" || !input.meta) return;
    const key = input.key.toLowerCase();
    if (key === "c") contents.copy();
    else if (key === "v") contents.paste();
    else if (key === "x") contents.cut();
    else if (key === "a") contents.selectAll();
  });
}

function bindEditContextMenu(contents: WebContents): void {
  contents.on("context-menu", (_event, params) => {
    const template: Electron.MenuItemConstructorOptions[] = [];
    if (params.editFlags.canCopy) {
      template.push({ role: "copy", label: "复制" });
    }
    if (params.editFlags.canCut) {
      template.push({ role: "cut", label: "剪切" });
    }
    if (params.editFlags.canPaste) {
      template.push({ role: "paste", label: "粘贴" });
    }
    if (template.length > 0) {
      template.push({ type: "separator" });
    }
    template.push({ role: "selectAll", label: "全选" });
    Menu.buildFromTemplate(template).popup();
  });
}
