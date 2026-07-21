import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import type { AppConfig } from "./config.js";

const LAUNCH_TIMEOUT_MS = 30_000;

export class BrowserManager {
  private playwrightBrowser: Browser | null = null;
  private context: BrowserContext | null = null;
  private videoDir: string | null = null;

  constructor(private config: AppConfig["browser"]) {}

  /** 启用 Playwright 录屏时传入视频输出目录（每个 Page 关闭后生成 webm） */
  setVideoDir(dir: string | null): void {
    this.videoDir = dir;
  }

  async start(): Promise<void> {
    if (this.playwrightBrowser) return;

    const launchOpts: Parameters<typeof chromium.launch>[0] = {
      headless: this.config.headless,
      slowMo: this.config.slowMo,
      timeout: LAUNCH_TIMEOUT_MS,
      args: ["--disable-dev-shm-usage", "--disable-breakpad"],
    };

    const customExecutable = process.env.CHROMIUM_EXECUTABLE_PATH?.trim();
    if (customExecutable) {
      launchOpts.executablePath = customExecutable;
    } else {
      // Bundle installs full Chromium only (--no-shell). Force that binary for
      // headless too; otherwise Playwright looks for chromium-headless-shell.
      launchOpts.channel = "chromium";
    }

    if (this.config.devtools && !this.config.headless) {
      (launchOpts as Record<string, unknown>).devtools = true;
    }

    try {
      this.playwrightBrowser = await chromium.launch(launchOpts);
    } catch (e) {
      const lastError = e as Error;
      throw new Error(`浏览器启动失败: ${lastError.message}`);
    }

    const contextOpts: Parameters<Browser["newContext"]>[0] = {
      viewport: this.config.viewport,
      locale: "zh-CN",
    };

    if (this.videoDir) {
      contextOpts.recordVideo = {
        dir: this.videoDir,
        size: this.config.viewport,
      };
    }

    this.context = await this.playwrightBrowser.newContext(contextOpts);
    this.context.setDefaultTimeout(this.config.actionTimeout);
    this.context.setDefaultNavigationTimeout(this.config.timeout);
  }

  async stop(): Promise<void> {
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    if (this.playwrightBrowser) {
      await this.playwrightBrowser.close();
      this.playwrightBrowser = null;
    }
  }

  async newPage(): Promise<Page> {
    if (!this.context) await this.start();
    const page = await this.context!.newPage();
    page.setDefaultTimeout(this.config.actionTimeout);
    page.setDefaultNavigationTimeout(this.config.timeout);
    return page;
  }
}
