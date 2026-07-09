import { Form, Input, Row, Col } from "antd";
import type { MacroDraft } from "../../../types/fixture";
import { FIXTURE_FIELDS } from "../../../constants/field-meta";
import { FixtureParamsEditor } from "./FixtureParamsEditor";

interface FixtureMetaPanelProps {
  draft: MacroDraft;
  isNew: boolean;
  isRule: boolean;
  onChange: (patch: Partial<MacroDraft>) => void;
}

export function FixtureMetaPanel({ draft, isNew, isRule, onChange }: FixtureMetaPanelProps) {
  return (
    <div style={{ padding: "12px 16px" }}>
      <Form layout="vertical" size="small">
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item label={FIXTURE_FIELDS.id.label} tooltip={FIXTURE_FIELDS.id.tooltip}>
              <Input
                value={draft.id}
                disabled={!isNew}
                placeholder={isRule ? "addon-nav-flow" : FIXTURE_FIELDS.id.placeholder}
                onChange={(e) => onChange({ id: e.target.value })}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label={FIXTURE_FIELDS.description.label} tooltip={FIXTURE_FIELDS.description.tooltip}>
              <Input
                value={draft.description}
                placeholder={FIXTURE_FIELDS.description.placeholder}
                onChange={(e) => onChange({ description: e.target.value })}
              />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item label={FIXTURE_FIELDS.params.label} tooltip={FIXTURE_FIELDS.params.tooltip}>
          <FixtureParamsEditor
            params={draft.params ?? {}}
            onChange={(params) => onChange({ params })}
          />
        </Form.Item>
      </Form>
    </div>
  );
}
