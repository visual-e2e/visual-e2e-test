import { dialog } from "electron";
import { getAppVersion } from "../version.js";

export function showAboutDialog(): void {
  void dialog.showMessageBox({
    type: "info",
    title: "关于 Visual E2E Test",
    message: "Visual E2E Test",
    detail: `版本 ${getAppVersion()}\nJSON 驱动的 E2E 自动化测试工作台`,
  });
}
