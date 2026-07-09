import { Form, Input, Switch, Select, Row, Col } from "antd";
import type { ScenarioDraft } from "../../../types/scenario";
import { SCENARIO_FIELDS } from "../../../constants/field-meta";

interface ScenarioMetaPanelProps {
  draft: ScenarioDraft;
  file: string;
  isNew: boolean;
  ruleIds: string[];
  onChange: (patch: Partial<ScenarioDraft>) => void;
  onFileChange: (file: string) => void;
}

export function ScenarioMetaPanel({
  draft, file, isNew, ruleIds, onChange, onFileChange,
}: ScenarioMetaPanelProps) {
  return (
    <div style={{ padding: "12px 16px" }}>
      <Form layout="vertical" size="small">
        <Row gutter={16}>
          {isNew && (
            <Col span={8}>
              <Form.Item label={SCENARIO_FIELDS.file.label} tooltip={SCENARIO_FIELDS.file.tooltip}>
                <Input
                  value={file}
                  placeholder={SCENARIO_FIELDS.file.placeholder}
                  onChange={(e) => onFileChange(e.target.value)}
                />
              </Form.Item>
            </Col>
          )}
          <Col span={isNew ? 8 : 12}>
            <Form.Item label={SCENARIO_FIELDS.id.label} tooltip={SCENARIO_FIELDS.id.tooltip}>
              <Input
                value={draft.id}
                placeholder={SCENARIO_FIELDS.id.placeholder}
                onChange={(e) => onChange({ id: e.target.value })}
              />
            </Form.Item>
          </Col>
          <Col span={isNew ? 8 : 12}>
            <Form.Item label={SCENARIO_FIELDS.name.label} tooltip={SCENARIO_FIELDS.name.tooltip}>
              <Input
                value={draft.name}
                placeholder={SCENARIO_FIELDS.name.placeholder}
                onChange={(e) => onChange({ name: e.target.value })}
              />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16} align="middle">
          <Col>
            <Form.Item label={SCENARIO_FIELDS.enabled.label} tooltip={SCENARIO_FIELDS.enabled.tooltip} style={{ marginBottom: 0 }}>
              <Switch checked={draft.enabled} onChange={(v) => onChange({ enabled: v })} />
            </Form.Item>
          </Col>
          <Col>
            <Form.Item label={SCENARIO_FIELDS.requiresLogin.label} tooltip={SCENARIO_FIELDS.requiresLogin.tooltip} style={{ marginBottom: 0 }}>
              <Switch
                checked={draft.setup.requiresLogin}
                onChange={(v) => onChange({ setup: { ...draft.setup, requiresLogin: v } })}
              />
            </Form.Item>
          </Col>
          <Col flex="auto">
            <Form.Item label={SCENARIO_FIELDS.entryRoute.label} tooltip={SCENARIO_FIELDS.entryRoute.tooltip} style={{ marginBottom: 0 }}>
              <Input
                value={draft.setup.entryRoute}
                placeholder={SCENARIO_FIELDS.entryRoute.placeholder}
                onChange={(e) => onChange({ setup: { ...draft.setup, entryRoute: e.target.value } })}
              />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item label={SCENARIO_FIELDS.mode.label} tooltip={SCENARIO_FIELDS.mode.tooltip} style={{ marginBottom: 0 }}>
              <Select
                value={draft.mode}
                options={[
                  { value: "full", label: "完整步骤" },
                  { value: "extends", label: "继承规则" },
                ]}
                onChange={(mode) => onChange({ mode })}
              />
            </Form.Item>
          </Col>
        </Row>
        {draft.mode === "extends" && (
          <Row gutter={16} style={{ marginTop: 8 }}>
            <Col span={12}>
              <Form.Item label={SCENARIO_FIELDS.extends.label} tooltip={SCENARIO_FIELDS.extends.tooltip}>
                <Select
                  value={draft.extends}
                  placeholder="选择规则模板"
                  options={ruleIds.map((id) => ({ value: id, label: id }))}
                  onChange={(v) => onChange({ extends: v })}
                  showSearch
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label={SCENARIO_FIELDS.params.label} tooltip={SCENARIO_FIELDS.params.tooltip}>
                <Input
                  placeholder={SCENARIO_FIELDS.params.placeholder}
                  value={JSON.stringify(draft.params ?? {})}
                  onChange={(e) => {
                    try { onChange({ params: JSON.parse(e.target.value) }); } catch { /* */ }
                  }}
                />
              </Form.Item>
            </Col>
          </Row>
        )}
      </Form>
    </div>
  );
}
