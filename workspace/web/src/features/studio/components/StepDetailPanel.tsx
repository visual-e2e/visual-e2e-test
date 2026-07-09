import { Descriptions, Form, Input, InputNumber, Select, Switch, Table, Tag, Typography } from "antd";
import type { StepDraft } from "../../../types/scenario";
import {
  STEP_FIELDS, stepTypeOptions, matchRuleOptions, valueFieldMeta,
  stepTypeLabel, matchRuleLabel,
} from "../../../constants/field-meta";

interface MacroRef {
  id: string;
  description?: string;
  steps: StepDraft[];
}

interface RuleRef {
  id: string;
  description?: string;
}

interface StepDetailPanelProps {
  step: StepDraft | null;
  steps: StepDraft[];
  macroIds: string[];
  onChange: (patch: Partial<StepDraft>) => void;
  readOnly?: boolean;
  macroRef?: MacroRef;
  ruleRef?: RuleRef;
  fixtureParamNames?: string[];
}

const READY_SELECTOR_TYPES = new Set(["ready", "link", "click", "input", "keyboard", "hover"]);

function nextStepOptions(steps: StepDraft[], currentStepId: string, currentNext?: string) {
  const options = steps
    .filter((s) => s.stepId && s.stepId !== currentStepId)
    .map((s) => ({
      value: s.stepId,
      label: s.desc ? `${s.stepId} — ${s.desc}` : s.stepId,
    }));
  if (currentNext && !options.some((o) => o.value === currentNext)) {
    options.unshift({ value: currentNext, label: `${currentNext}（不在当前列表）` });
  }
  return options;
}

function paramBool(step: StepDraft, key: string): boolean {
  return step.params?.[key] === true;
}

export function StepDetailPanel({
  step, steps, macroIds, onChange, readOnly, macroRef, ruleRef, fixtureParamNames,
}: StepDetailPanelProps) {
  if (!step) {
    return <div style={{ padding: 16, color: "#999" }}>选择步骤以查看详情</div>;
  }

  const patchParams = (patch: Record<string, unknown>) =>
    onChange({ params: { ...step.params, ...patch } });

  if (readOnly) {
    return (
      <div style={{ padding: 16, overflow: "auto", height: "100%" }}>
        {ruleRef && (
          <div style={{ marginBottom: 12, padding: 8, background: "#f6f8fa", borderRadius: 6 }}>
            <Typography.Text type="secondary">继承规则：</Typography.Text>
            <Tag color="blue">{ruleRef.id}</Tag>
            {ruleRef.description && (
              <Typography.Text type="secondary" style={{ display: "block", marginTop: 4, fontSize: 12 }}>
                {ruleRef.description}
              </Typography.Text>
            )}
          </div>
        )}
        <Descriptions column={1} size="small" bordered>
          <Descriptions.Item label={STEP_FIELDS.stepId.label}>{step.stepId}</Descriptions.Item>
          <Descriptions.Item label={STEP_FIELDS.type.label}>
            <Tag color="purple">{stepTypeLabel(step.type)}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label={STEP_FIELDS.desc.label}>{step.desc || "—"}</Descriptions.Item>
          {step.selector && (
            <Descriptions.Item label={STEP_FIELDS.selector.label}>{step.selector}</Descriptions.Item>
          )}
          {step.url && <Descriptions.Item label={STEP_FIELDS.url.label}>{step.url}</Descriptions.Item>}
          {step.value != null && (
            <Descriptions.Item label={valueFieldMeta(step.type).label}>{String(step.value)}</Descriptions.Item>
          )}
          {step.verifyValue && (
            <Descriptions.Item label={STEP_FIELDS.verifyValue.label}>{step.verifyValue}</Descriptions.Item>
          )}
          {step.expectValue && (
            <Descriptions.Item label={STEP_FIELDS.expectValue.label}>{step.expectValue}</Descriptions.Item>
          )}
          {step.matchRule && (
            <Descriptions.Item label={STEP_FIELDS.matchRule.label}>{matchRuleLabel(step.matchRule)}</Descriptions.Item>
          )}
          {step.next && <Descriptions.Item label={STEP_FIELDS.next.label}>{step.next}</Descriptions.Item>}
          {step.delay != null && step.delay > 0 && (
            <Descriptions.Item label={STEP_FIELDS.delay.label}>{step.delay} ms</Descriptions.Item>
          )}
          {step.timeOut != null && (
            <Descriptions.Item label={STEP_FIELDS.timeOut.label}>{step.timeOut} ms</Descriptions.Item>
          )}
        </Descriptions>
        {step.type === "macro" && macroRef && (
          <div style={{ marginTop: 16 }}>
            <Typography.Text strong>关联宏步骤：{macroRef.id}</Typography.Text>
            {macroRef.description && (
              <Typography.Text type="secondary" style={{ display: "block", marginBottom: 8, fontSize: 12 }}>
                {macroRef.description}
              </Typography.Text>
            )}
            <Table
              size="small"
              rowKey={(_, index) => String(index)}
              pagination={false}
              dataSource={macroRef.steps}
              columns={[
                { title: "ID", dataIndex: "stepId", width: 56 },
                { title: "类型", dataIndex: "type", width: 72, render: (t: string) => <Tag color="orange">{t}</Tag> },
                { title: "描述", dataIndex: "desc", ellipsis: true },
              ]}
            />
          </div>
        )}
      </div>
    );
  }

  const valueMeta = valueFieldMeta(step.type);

  return (
    <div style={{ padding: 16, overflow: "auto", height: "100%" }}>
      {fixtureParamNames && fixtureParamNames.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <Typography.Text type="secondary" style={{ fontSize: 12, marginRight: 8 }}>
            可用参数：
          </Typography.Text>
          {fixtureParamNames.map((name) => (
            <Tag
              key={name}
              color="blue"
              style={{ cursor: "pointer", marginBottom: 4 }}
              onClick={() => navigator.clipboard.writeText(`{${name}}`)}
            >
              {`{${name}}`}
            </Tag>
          ))}
          <Typography.Text type="secondary" style={{ display: "block", fontSize: 11, marginTop: 4 }}>
            点击复制，粘贴到描述、选择器等字段
          </Typography.Text>
        </div>
      )}
      <Form layout="vertical" size="small">
        <Form.Item label={STEP_FIELDS.stepId.label} tooltip={STEP_FIELDS.stepId.tooltip}>
          <Input
            value={step.stepId}
            placeholder={STEP_FIELDS.stepId.placeholder}
            onChange={(e) => onChange({ stepId: e.target.value })}
          />
        </Form.Item>
        <Form.Item label={STEP_FIELDS.type.label} tooltip={STEP_FIELDS.type.tooltip}>
          <Select value={step.type} options={stepTypeOptions()} onChange={(type) => onChange({ type })} />
        </Form.Item>
        <Form.Item label={STEP_FIELDS.desc.label} tooltip={STEP_FIELDS.desc.tooltip}>
          <Input
            value={step.desc}
            placeholder={STEP_FIELDS.desc.placeholder}
            onChange={(e) => onChange({ desc: e.target.value })}
          />
        </Form.Item>
        {["click", "hover", "input", "keyboard"].includes(step.type) && (
          <Form.Item label={STEP_FIELDS.selector.label} tooltip={STEP_FIELDS.selector.tooltip}>
            <Input
              value={step.selector}
              placeholder={STEP_FIELDS.selector.placeholder}
              onChange={(e) => onChange({ selector: e.target.value })}
            />
          </Form.Item>
        )}
        {step.type === "link" && (
          <Form.Item label={STEP_FIELDS.url.label} tooltip={STEP_FIELDS.url.tooltip}>
            <Input
              value={step.url}
              placeholder={STEP_FIELDS.url.placeholder}
              onChange={(e) => onChange({ url: e.target.value })}
            />
          </Form.Item>
        )}
        {["input", "wait", "screenshot", "log", "keyboard"].includes(step.type) && (
          <Form.Item label={valueMeta.label} tooltip={valueMeta.tooltip}>
            <Input
              value={step.value == null ? "" : String(step.value)}
              placeholder={valueMeta.placeholder}
              onChange={(e) => onChange({ value: e.target.value })}
            />
          </Form.Item>
        )}
        {step.type === "macro" && (
          <Form.Item label={valueMeta.label} tooltip={valueMeta.tooltip}>
            <Select
              value={step.value as string}
              options={macroIds.map((id) => ({ value: id, label: id }))}
              onChange={(v) => onChange({ value: v })}
              showSearch
              placeholder="选择宏"
            />
          </Form.Item>
        )}
        {step.type === "verify" && (
          <>
            <Form.Item label={STEP_FIELDS.verifyValue.label} tooltip={STEP_FIELDS.verifyValue.tooltip}>
              <Input
                value={step.verifyValue}
                placeholder={STEP_FIELDS.verifyValue.placeholder}
                onChange={(e) => onChange({ verifyValue: e.target.value })}
              />
            </Form.Item>
            <Form.Item label={STEP_FIELDS.expectValue.label} tooltip={STEP_FIELDS.expectValue.tooltip}>
              <Input
                value={step.expectValue}
                placeholder={STEP_FIELDS.expectValue.placeholder}
                onChange={(e) => onChange({ expectValue: e.target.value })}
              />
            </Form.Item>
            <Form.Item label={STEP_FIELDS.matchRule.label} tooltip={STEP_FIELDS.matchRule.tooltip}>
              <Select
                value={step.matchRule ?? "contains"}
                options={matchRuleOptions()}
                onChange={(v) => onChange({ matchRule: v })}
              />
            </Form.Item>
            {step.branch && (
              <Form.Item label={STEP_FIELDS.instantVerify.label} tooltip={STEP_FIELDS.instantVerify.tooltip}>
                <Switch
                  checked={paramBool(step, "instantVerify")}
                  onChange={(v) => patchParams({ instantVerify: v || undefined })}
                />
              </Form.Item>
            )}
          </>
        )}
        {READY_SELECTOR_TYPES.has(step.type) && (
          <Form.Item label={STEP_FIELDS.readySelectors.label} tooltip={STEP_FIELDS.readySelectors.tooltip}>
            <Input
              value={((step.params?.readySelectors as string[]) ?? []).join(", ")}
              placeholder={STEP_FIELDS.readySelectors.placeholder}
              onChange={(e) =>
                patchParams({
                  readySelectors: e.target.value.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
                })
              }
            />
          </Form.Item>
        )}
        {step.type === "click" && (
          <>
            <Form.Item label={STEP_FIELDS.clickAny.label} tooltip={STEP_FIELDS.clickAny.tooltip}>
              <Input
                value={((step.params?.clickAny as string[]) ?? []).join(", ")}
                placeholder={STEP_FIELDS.clickAny.placeholder}
                onChange={(e) =>
                  patchParams({
                    clickAny: e.target.value.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
                  })
                }
              />
            </Form.Item>
            <Form.Item label={STEP_FIELDS.optional.label} tooltip={STEP_FIELDS.optional.tooltip}>
              <Switch
                checked={paramBool(step, "optional")}
                onChange={(v) => patchParams({ optional: v || undefined })}
              />
            </Form.Item>
          </>
        )}
        <Form.Item label={STEP_FIELDS.continueOnFail.label} tooltip={STEP_FIELDS.continueOnFail.tooltip}>
          <Switch
            checked={paramBool(step, "continueOnFail")}
            onChange={(v) => patchParams({ continueOnFail: v || undefined })}
          />
        </Form.Item>
        <Form.Item label={STEP_FIELDS.next.label} tooltip={STEP_FIELDS.next.tooltip}>
          <Select
            allowClear
            placeholder={STEP_FIELDS.next.placeholder}
            value={step.next}
            options={nextStepOptions(steps, step.stepId, step.next)}
            onChange={(v) => onChange({ next: v })}
            showSearch
            optionFilterProp="label"
          />
        </Form.Item>
        <Form.Item label={STEP_FIELDS.delay.label} tooltip={STEP_FIELDS.delay.tooltip}>
          <InputNumber
            value={step.delay ?? 0}
            onChange={(v) => onChange({ delay: v ?? 0 })}
            style={{ width: "100%" }}
            addonAfter="ms"
          />
        </Form.Item>
        <Form.Item label={STEP_FIELDS.timeOut.label} tooltip={STEP_FIELDS.timeOut.tooltip}>
          <InputNumber
            value={step.timeOut}
            onChange={(v) => onChange({ timeOut: v ?? undefined })}
            style={{ width: "100%" }}
            addonAfter="ms"
          />
        </Form.Item>
      </Form>
      {step.type === "macro" && macroRef && (
        <div style={{ marginTop: 8 }}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            宏「{macroRef.id}」包含 {macroRef.steps.length} 个子步骤
          </Typography.Text>
        </div>
      )}
    </div>
  );
}
