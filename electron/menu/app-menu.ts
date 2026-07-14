import { app, type MenuItemConstructorOptions } from "electron";
import { showAboutDialog } from "./about-dialog.js";
import { openStorageInFileManager, type StorageLayout } from "../storage.js";

export function buildAppMenu(layout: StorageLayout): MenuItemConstructorOptions {
  if (process.platform === "darwin") {
    return {
      label: app.name,
      submenu: [
        {
          label: "关于 Visual E2E Test",
          click: () => showAboutDialog(),
        },
        {
          label: "打开数据目录",
          click: () => {
            void openStorageInFileManager(layout).catch((err) => {
              console.error("open-data:", err);
            });
          },
        },
        { type: "separator" },
        { role: "quit", label: "退出 Visual E2E Test" },
        { type: "separator" },
        { role: "services", label: "服务" },
        { type: "separator" },
        { role: "hide", label: "隐藏 Visual E2E Test" },
        { role: "hideOthers", label: "隐藏其它" },
        { role: "unhide", label: "显示全部" },
      ],
    };
  }

  return {
    label: "Visual E2E Test",
    submenu: [
      {
        label: "关于 Visual E2E Test",
        click: () => showAboutDialog(),
      },
      {
        label: "打开数据目录",
        click: () => {
          void openStorageInFileManager(layout).catch((err) => {
            console.error("open-data:", err);
          });
        },
      },
      { type: "separator" },
      { role: "quit", label: "退出" },
    ],
  };
}
