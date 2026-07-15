import { Menu, type WebContents } from "electron";
import { openStorageInFileManager, type StorageLayout } from "../storage.js";

let storageLayout: StorageLayout | undefined;

export function configureEditSupport(layout: StorageLayout): void {
  storageLayout = layout;
}

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

function isEditContext(params: Electron.ContextMenuParams): boolean {
  return params.isEditable || Boolean(params.selectionText?.trim());
}

function bindEditContextMenu(contents: WebContents): void {
  contents.on("context-menu", (_event, params) => {
    const template: Electron.MenuItemConstructorOptions[] = [];

    if (isEditContext(params)) {
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
    } else {
      template.push({
        label: "刷新",
        click: () => contents.reload(),
      });
      if (storageLayout) {
        const layout = storageLayout;
        template.push({
          label: "打开数据目录",
          click: () => {
            void openStorageInFileManager(layout).catch((err) => {
              console.error("open-data:", err);
            });
          },
        });
      }
      template.push({ type: "separator" });
      template.push({ role: "selectAll", label: "全选" });
    }

    Menu.buildFromTemplate(template).popup();
  });
}
