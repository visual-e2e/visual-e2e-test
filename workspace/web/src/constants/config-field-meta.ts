export interface FieldMeta {
  label: string;
  tooltip?: string;
  placeholder?: string;
}

export const SETTINGS_FIELDS = {
  browser: { label: "浏览器", tooltip: "Playwright 浏览器启动与操作相关配置" },
  headless: { label: "无头模式", tooltip: "开启后不显示浏览器窗口；运行中心发起运行时可临时覆盖 HEADLESS" },
  slowMo: { label: "慢动作 (ms)", tooltip: "每个操作之间的延迟，便于调试观察" },
  devtools: { label: "开发者工具", tooltip: "启动时自动打开 Chromium DevTools" },
  channel: { label: "浏览器渠道", tooltip: "如 chrome、msedge；留空使用默认 Chromium" },
  timeout: { label: "浏览器超时 (ms)", tooltip: "浏览器级默认超时" },
  actionTimeout: { label: "操作超时 (ms)", tooltip: "单次 click/input 等操作的默认超时" },
  navigationWaitUntil: {
    label: "导航等待策略",
    tooltip: "link 步骤导航完成判定：load / domcontentloaded / networkidle / commit",
  },
  viewportWidth: { label: "视口宽度", tooltip: "浏览器窗口宽度（像素）" },
  viewportHeight: { label: "视口高度", tooltip: "浏览器窗口高度（像素）" },

  test: { label: "测试执行", tooltip: "场景与步骤运行的默认时序与失败策略" },
  defaultStepDelay: { label: "默认步骤延时 (ms)", tooltip: "每步执行前的固定等待时间" },
  defaultStepTimeout: { label: "默认步骤超时 (ms)", tooltip: "单步未单独指定 timeOut 时的默认值" },
  defaultReadyTimeout: { label: "就绪等待上限 (ms)", tooltip: "ready 步骤及就绪选择器最长等待时间" },
  intervalBetweenScenariosMs: { label: "场景间隔 (ms)", tooltip: "同一次运行中，两个场景之间的等待" },
  continueOnScenarioFailure: {
    label: "场景失败继续",
    tooltip: "关闭后，任一场景失败将终止整次运行；开启则继续后续场景",
  },

  output: { label: "输出", tooltip: "测试报告、日志、录屏的存放位置与开关" },
  baseDir: { label: "运行目录名", tooltip: "相对 projects/{id}/，运行结果写入 projects/{id}/runs/{runId}/" },
  logsDir: { label: "日志子目录", tooltip: "相对单次运行目录的日志文件夹名" },
  videosDir: { label: "录屏子目录", tooltip: "相对单次运行目录的视频文件夹名" },
  recordVideo: { label: "录制视频", tooltip: "整次运行生成 webm，在 HTML 报告顶部可播放" },

  logging: { label: "日志", tooltip: "运行过程中的日志级别与输出目标" },
  level: { label: "日志级别", tooltip: "trace / debug / info / warn / error / silent，级别越低输出越详细" },
  consoleOutput: { label: "控制台输出", tooltip: "是否在终端打印运行日志" },
} satisfies Record<string, FieldMeta>;

export const VARIABLES_USAGE = [
  "在步骤的 selector、url、desc、verifyValue 等字段中用 {变量名} 引用，运行时自动替换。",
  "global 段中的变量对所有模块场景可用；login、project 等模块段仅该模块场景可用。",
  "账号、密码（{username}、{password}）请在「运行中心」的 .env 中配置 USERNAME、PASSWORD。",
];
