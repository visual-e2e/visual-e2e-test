import type { StepType, MatchRule } from "../types/scenario";
import { STEP_TYPES, MATCH_RULES } from "../types/scenario";

export interface FieldMeta {
  label: string;
  tooltip?: string;
  placeholder?: string;
}

export const STEP_TYPE_LABELS: Record<StepType, string> = {
  click: "点击",
  hover: "悬停",
  input: "输入",
  link: "页面跳转",
  wait: "固定等待",
  ready: "等待就绪",
  scroll: "滚动",
  verify: "验证",
  screenshot: "截图",
  log: "日志",
  keyboard: "键盘按键",
  macro: "宏步骤",
};

export const MATCH_RULE_LABELS: Record<MatchRule, string> = {
  equals: "完全相等",
  contains: "包含文本",
  regex: "正则匹配",
  visible: "元素可见",
  hidden: "元素隐藏",
  urlContains: "URL 包含",
};

export const STEP_FIELDS = {
  stepId: {
    label: "步骤 ID",
    tooltip: "本场景内唯一标识，用于「下一个步骤」和分支跳转",
    placeholder: "s1",
  },
  type: {
    label: "操作类型",
    tooltip: "步骤执行的动作类型",
  },
  desc: {
    label: "描述",
    tooltip: "步骤说明，会显示在列表和运行报告中",
  },
  selector: {
    label: "元素选择器",
    tooltip: "Playwright 选择器；有 selector 的步骤会自动等待该元素就绪",
  },
  url: {
    label: "跳转地址",
    tooltip: "link 步骤的目标 URL，支持 {变量} 占位",
    placeholder: "/login 或 {login_path}",
  },
  verifyValue: {
    label: "验证目标",
    tooltip: "选择器或文本；input/textarea 会自动读取 inputValue",
    placeholder: "body 或 .thy-table tbody tr",
  },
  expectValue: {
    label: "期望值",
    tooltip: "与匹配规则一起比较的目标值",
    placeholder: "期望文本或 {变量}",
  },
  matchRule: {
    label: "匹配规则",
    tooltip: "验证通过的判断方式",
  },
  next: {
    label: "下一个步骤",
    tooltip: "本步成功后跳转的目标步骤；不选则按列表顺序执行",
    placeholder: "选择下一个执行步骤",
  },
  delay: {
    label: "执行前延时",
    tooltip: "本步开始前的固定等待，单位毫秒",
  },
  timeOut: {
    label: "超时时间",
    tooltip: "本步最长等待时间，单位毫秒（如 link 导航）",
  },
  readySelectors: {
    label: "就绪选择器",
    tooltip: "执行前额外等待的元素（AND，逗号分隔）；有 selector 时会自动等待自身",
    placeholder: ".app-root-header, button:has-text('新建')",
  },
  clickAny: {
    label: "候选选择器",
    tooltip: "多个选择器 OR 关系，点击第一个可见元素（每行一个或逗号分隔）",
    placeholder: ".add-icon, a:has-text('添加')",
  },
  optional: {
    label: "可选点击",
    tooltip: "无匹配元素时跳过本步，不视为失败",
  },
  continueOnFail: {
    label: "失败继续",
    tooltip: "本步失败后是否继续执行后续步骤",
  },
  instantVerify: {
    label: "即时验证",
    tooltip: "带分支的 verify 不等待 DOM 就绪，立即检查并分支",
  },
  branch: {
    label: "启用分支",
    tooltip: "按验证结果跳转：通过走 yes，未通过走 no（可跳本场景步骤或同模块另一场景）",
  },
  branchYes: {
    label: "通过 (yes)",
    tooltip: "验证通过时的跳转目标",
  },
  branchNo: {
    label: "未通过 (no)",
    tooltip: "验证未通过时的跳转目标",
  },
} satisfies Record<string, FieldMeta>;

export const VALUE_FIELD_BY_TYPE: Partial<Record<StepType, FieldMeta>> = {
  wait: {
    label: "等待时长 (ms)",
    tooltip: "固定等待时间，不检查 DOM 状态",
    placeholder: "2000",
  },
  log: {
    label: "日志内容",
    tooltip: "输出到运行日志的文本",
    placeholder: "开始执行添加流程",
  },
  keyboard: {
    label: "按键",
    tooltip: "如 undo、Enter、Control+Z；可先填 selector 聚焦再按键",
    placeholder: "undo 或 Enter",
  },
  screenshot: {
    label: "截图文件名",
    tooltip: "可选；留空使用默认命名",
    placeholder: "addon_list.png",
  },
  input: {
    label: "输入内容",
    tooltip: "填入目标输入框的文本，支持 {变量}",
    placeholder: "{project_name}",
  },
  macro: {
    label: "宏",
    tooltip: "引用 fixtures/macros/ 下定义的宏步骤组合",
  },
};

export const SCENARIO_FIELDS = {
  file: {
    label: "保存路径",
    tooltip: "场景 JSON 文件名",
    placeholder: "login_success.json",
  },
  id: {
    label: "场景 ID",
    tooltip: "运行与报告中的唯一标识",
    placeholder: "login_success",
  },
  name: {
    label: "场景名称",
    tooltip: "中文展示名称",
    placeholder: "登录成功",
  },
  enabled: {
    label: "启用",
    tooltip: "关闭后批量运行时会跳过",
  },
  requiresLogin: {
    label: "需要登录",
    tooltip: "执行前是否先走登录流程；未写明时默认需要登录",
  },
  entryRoute: {
    label: "入口路由",
    tooltip: "场景开始前导航的路径；留空表示沿用当前页面",
    placeholder: "/login 或留空",
  },
  mode: {
    label: "编辑模式",
    tooltip: "完整步骤：自行编写；继承规则：引用规则模板并传参",
  },
  extends: {
    label: "继承规则",
    tooltip: "引用 fixtures/rules/ 下的规则模板",
  },
  params: {
    label: "规则参数",
    tooltip: "传入规则模板声明的参数具体值（非 JSON 声明）",
    placeholder: '{"addonName": "列表"}',
  },
} satisfies Record<string, FieldMeta>;

export const FIXTURE_FIELDS = {
  id: {
    label: "ID",
    tooltip: "保存为 fixtures/macros|rules/{id}.json",
    placeholder: "addon-add-plus",
  },
  description: {
    label: "描述",
    tooltip: "简短说明，可在步骤中用 {参数名} 引用",
    placeholder: "添加「{addonName}」组件",
  },
  params: {
    label: "参数定义",
    tooltip: "声明调用方需传入的参数；步骤中用 {参数名} 占位",
  },
} satisfies Record<string, FieldMeta>;

export function stepTypeOptions() {
  return STEP_TYPES.map((t) => ({
    value: t,
    label: `${STEP_TYPE_LABELS[t]} (${t})`,
  }));
}

export function matchRuleOptions() {
  return MATCH_RULES.map((r) => ({
    value: r,
    label: `${MATCH_RULE_LABELS[r]} (${r})`,
  }));
}

export function stepTypeLabel(type: StepType): string {
  return `${STEP_TYPE_LABELS[type]} (${type})`;
}

export function stepTypeShortLabel(type: StepType): string {
  return STEP_TYPE_LABELS[type];
}

export function matchRuleLabel(rule: MatchRule): string {
  return `${MATCH_RULE_LABELS[rule]} (${rule})`;
}

export function valueFieldMeta(type: StepType): FieldMeta {
  return VALUE_FIELD_BY_TYPE[type] ?? {
    label: "值",
    tooltip: "步骤附加数据",
  };
}

const DESC_PLACEHOLDER_BY_TYPE: Record<StepType, string> = {
  click: "点击「确定」按钮",
  hover: "悬停在菜单项上",
  input: "输入项目名称",
  link: "打开登录页",
  wait: "等待动画结束",
  ready: "等待列表加载完成",
  scroll: "滚动到页面底部",
  verify: "验证页面包含项目名称",
  screenshot: "截取列表页",
  log: "记录当前进度",
  keyboard: "按下 Enter 确认",
  macro: "执行「添加组件」宏",
};

const SELECTOR_PLACEHOLDER_BY_TYPE: Partial<Record<StepType, string>> = {
  click: 'button:has-text("确定")',
  hover: ".nav-item:has-text(\"设置\")",
  input: 'input[placeholder="请输入"]',
  keyboard: "input, textarea",
  scroll: ".scroll-container",
};

const VERIFY_VALUE_PLACEHOLDER_BY_RULE: Partial<Record<MatchRule, string>> = {
  visible: ".thy-table tbody tr",
  hidden: ".loading-spinner",
  urlContains: "可留空，用期望值匹配 URL",
  contains: "body",
  equals: "body",
  regex: "body",
};

const EXPECT_VALUE_PLACEHOLDER_BY_RULE: Partial<Record<MatchRule, string>> = {
  contains: "期望包含的文本或 {变量}",
  equals: "期望完全相等的文本或 {变量}",
  regex: "正则，如 ^项目.*$",
  urlContains: "/project 或路由片段",
  visible: "visible 规则可不填",
  hidden: "hidden 规则可不填",
};

export function descPlaceholder(type: StepType): string {
  return DESC_PLACEHOLDER_BY_TYPE[type] ?? "步骤说明";
}

export function selectorPlaceholder(type: StepType): string {
  return SELECTOR_PLACEHOLDER_BY_TYPE[type] ?? 'button:has-text("确定")';
}

export function verifyValuePlaceholder(matchRule?: MatchRule): string {
  const rule = matchRule ?? "contains";
  return VERIFY_VALUE_PLACEHOLDER_BY_RULE[rule] ?? STEP_FIELDS.verifyValue.placeholder ?? "body";
}

export function expectValuePlaceholder(matchRule?: MatchRule): string {
  const rule = matchRule ?? "contains";
  return EXPECT_VALUE_PLACEHOLDER_BY_RULE[rule] ?? STEP_FIELDS.expectValue.placeholder ?? "期望文本";
}
