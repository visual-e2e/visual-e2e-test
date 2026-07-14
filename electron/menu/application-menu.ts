import { Menu } from "electron";
import type { StorageLayout } from "../storage.js";
import { buildAppMenu } from "./app-menu.js";
import { buildViewMenu } from "./view-menu.js";

export function buildApplicationMenu(layout: StorageLayout): Menu {
  return Menu.buildFromTemplate([buildAppMenu(layout), buildViewMenu()]);
}
