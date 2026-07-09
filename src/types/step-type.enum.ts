/**
 * 前端视角的步骤类型：描述「用户在页面上做什么」，而非 Playwright 底层 API。
 */
export enum StepType {
  /** 点击按钮、链接、菜单项等可点击元素 */
  Click = "click",
  /** 鼠标悬停（如下拉菜单、Tooltip） */
  Hover = "hover",
  /** 向输入框、文本域填写内容 */
  Input = "input",
  /** 通过 URL 打开或跳转到页面 */
  Link = "link",
  /** 等待固定时间（value 为毫秒） */
  Wait = "wait",
  /** 等待页面/元素就绪（默认最多 30 秒，适合慢加载） */
  Ready = "ready",
  /** 滚动页面或容器 */
  Scroll = "scroll",
  /** 断言页面状态（文案、URL、可见性等） */
  Verify = "verify",
  /** 截取当前页面截图 */
  Screenshot = "screenshot",
  /** 输出调试日志（不改变页面） */
  Log = "log",
  /** 键盘按键（撤销、Enter 等，value 为按键或别名 undo/redo） */
  Keyboard = "keyboard",
  /** 引用 fixtures/macros 中的可复用步骤组合（宏步骤） */
  Macro = "macro",
}
