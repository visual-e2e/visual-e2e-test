import { Form, Input, InputNumber, Select, Space, Button } from "antd";
import { DeleteOutlined, ArrowUpOutlined, ArrowDownOutlined } from "@ant-design/icons";
import type { StepDraft } from "../../types/scenario";
import { STEP_TYPES, MATCH_RULES } from "../../types/scenario";

interface StepListEditorProps {
  steps: StepDraft[];
  onChange: (steps: StepDraft[]) => void;
  macroIds?: string[];
}

export function StepListEditor({ steps, onChange, macroIds = [] }: StepListEditorProps) {
  const update = (index: number, patch: Partial<StepDraft>) => {
    const next = [...steps];
    next[index] = { ...next[index], ...patch };
    onChange(next);
  };

  const remove = (index: number) => onChange(steps.filter((_, i) => i !== index));

  const move = (index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= steps.length) return;
    const next = [...steps];
    [next[index], next[j]] = [next[j], next[index]];
    onChange(next);
  };

  const add = () => {
    const nums = steps.map((s) => parseInt(s.stepId.replace(/\D/g, ""), 10)).filter((n) => !Number.isNaN(n));
    const id = `s${(nums.length ? Math.max(...nums) : 0) + 1}`;
    onChange([...steps, { stepId: id, type: "click", desc: "", selector: "" }]);
  };

  return (
    <div>
      {steps.map((step, i) => (
        <div key={`${step.stepId}-${i}`} style={{ border: "1px solid #f0f0f0", borderRadius: 8, padding: 12, marginBottom: 12 }}>
          <Space style={{ marginBottom: 8 }}>
            <strong>{step.stepId}</strong>
            <Select
              size="small"
              value={step.type}
              style={{ width: 120 }}
              options={STEP_TYPES.map((t) => ({ value: t, label: t }))}
              onChange={(type) => update(i, { type })}
            />
            <Button size="small" icon={<ArrowUpOutlined />} onClick={() => move(i, -1)} disabled={i === 0} />
            <Button size="small" icon={<ArrowDownOutlined />} onClick={() => move(i, 1)} disabled={i === steps.length - 1} />
            <Button size="small" danger icon={<DeleteOutlined />} onClick={() => remove(i)} />
          </Space>
          <Form layout="vertical" size="small">
            <Form.Item label="描述">
              <Input value={step.desc} onChange={(e) => update(i, { desc: e.target.value })} />
            </Form.Item>
            <Form.Item label="stepId">
              <Input value={step.stepId} onChange={(e) => update(i, { stepId: e.target.value })} />
            </Form.Item>
            {["click", "hover", "input", "keyboard"].includes(step.type) && (
              <Form.Item label="selector">
                <Input value={step.selector} onChange={(e) => update(i, { selector: e.target.value })} />
              </Form.Item>
            )}
            {step.type === "link" && (
              <Form.Item label="url">
                <Input value={step.url} onChange={(e) => update(i, { url: e.target.value })} />
              </Form.Item>
            )}
            {["input", "wait", "screenshot", "log", "keyboard", "macro"].includes(step.type) && (
              <Form.Item label="value">
                <Input
                  value={step.value == null ? "" : String(step.value)}
                  onChange={(e) => update(i, { value: e.target.value })}
                />
              </Form.Item>
            )}
            {step.type === "macro" && (
              <Form.Item label="宏 ID">
                <Select
                  value={step.value as string}
                  options={macroIds.map((id) => ({ value: id, label: id }))}
                  onChange={(v) => update(i, { value: v })}
                  showSearch
                  allowClear
                />
              </Form.Item>
            )}
            {step.type === "verify" && (
              <>
                <Form.Item label="verifyValue">
                  <Input value={step.verifyValue} onChange={(e) => update(i, { verifyValue: e.target.value })} />
                </Form.Item>
                <Form.Item label="expectValue">
                  <Input value={step.expectValue} onChange={(e) => update(i, { expectValue: e.target.value })} />
                </Form.Item>
                <Form.Item label="matchRule">
                  <Select
                    value={step.matchRule ?? "contains"}
                    options={MATCH_RULES.map((r) => ({ value: r, label: r }))}
                    onChange={(v) => update(i, { matchRule: v })}
                  />
                </Form.Item>
              </>
            )}
            {["ready", "link"].includes(step.type) && (
              <Form.Item label="readySelectors (逗号分隔)">
                <Input
                  value={((step.params?.readySelectors as string[]) ?? []).join(", ")}
                  onChange={(e) =>
                    update(i, {
                      params: {
                        ...step.params,
                        readySelectors: e.target.value.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
                      },
                    })
                  }
                />
              </Form.Item>
            )}
            <Form.Item label="next (跳转 stepId)">
              <Input value={step.next} onChange={(e) => update(i, { next: e.target.value || undefined })} />
            </Form.Item>
            <Form.Item label="delay (ms)">
              <InputNumber value={step.delay ?? 0} onChange={(v) => update(i, { delay: v ?? 0 })} style={{ width: "100%" }} />
            </Form.Item>
          </Form>
        </div>
      ))}
      <Button type="dashed" block onClick={add}>
        + 添加步骤
      </Button>
    </div>
  );
}
