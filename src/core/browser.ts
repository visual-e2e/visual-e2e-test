import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import type { AppConfig } from "./config.js";

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
      args: ["--disable-dev-shm-usage", "--disable-breakpad"],
    };

    if (this.config.channel) {
      launchOpts.channel = this.config.channel as "chrome";
    }
    if (this.config.devtools && !this.config.headless) {
      (launchOpts as Record<string, unknown>).devtools = true;
    }

    const attempts: (string | undefined)[] = this.config.channel
      ? [this.config.channel, undefined]
      : [undefined];

    let lastError: Error | null = null;
    for (const channel of attempts) {
      try {
        const opts = { ...launchOpts };
        if (channel) opts.channel = channel as "chrome";
        else delete opts.channel;
        this.playwrightBrowser = await chromium.launch(opts);
        break;
      } catch (e) {
        lastError = e as Error;
      }
    }

    if (!this.playwrightBrowser) {
      throw new Error(`浏览器启动失败: ${lastError?.message}`);
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
