import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Typography, Button, message, Form, Switch, InputNumber, Input, Select, Card, Row, Col, Alert,
} from "antd";
import { SaveOutlined, ReloadOutlined } from "@ant-design/icons";
import { api } from "../../api/client";
import { SETTINGS_FIELDS } from "../../constants/config-field-meta";
import type { SettingsDraft } from "../../types/settings";
import { JsonPreview } from "../../components/JsonPreview";
import { ScrollPane } from "../../components/layout/ScrollPane";

const NAV_WAIT_OPTIONS = [
  { value: "load", label: "load" },
  { value: "domcontentloaded", label: "domcontentloaded" },
  { value: "networkidle", label: "networkidle" },
  { value: "commit", label: "commit" },
];

const LOG_LEVEL_OPTIONS = [
  { value: "trace", label: "trace" },
  { value: "debug", label: "debug" },
  { value: "info", label: "info" },
  { value: "warn", label: "warn" },
  { value: "error", label: "error" },
  { value: "silent", label: "silent" },
];

export function SettingsPage() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<SettingsDraft | null>(null);
  const [dirty, setDirty] = useState(false);

  const query = useQuery({
    queryKey: ["settings"],
    queryFn: api.getSettings,
  });

  useEffect(() => {
    if (query.data && !dirty) {
      setDraft(query.data);
    }
  }, [query.data, dirty]);

  const saveMut = useMutation({
    mutationFn: () => api.saveSettings(draft!),
    onSuccess: () => {
      message.success("已保存");
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  const patchBrowser = (patch: Partial<SettingsDraft["browser"]>) => {
    setDraft((d) => (d ? { ...d, browser: { ...d.browser, ...patch } } : d));
    setDirty(true);
  };

  const patchTest = (patch: Partial<SettingsDraft["test"]>) => {
    setDraft((d) => (d ? { ...d, test: { ...d.test, ...patch } } : d));
    setDirty(true);
  };

  const patchOutput = (patch: Partial<SettingsDraft["output"]>) => {
    setDraft((d) => (d ? { ...d, output: { ...d.output, ...patch } } : d));
    setDirty(true);
  };

  const patchLogging = (patch: Partial<SettingsDraft["logging"]>) => {
    setDraft((d) => (d ? { ...d, logging: { ...d.logging, ...patch } } : d));
    setDirty(true);
  };

  if (!draft) {
    return (
      <ScrollPane>
        加载中…
      </ScrollPane>
    );
  }

  return (
    <ScrollPane>
      <Typography.Title level={4}>全局配置</Typography.Title>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="配置文件：config/settings.json"
        description={
          <>
            控制浏览器行为、默认超时、录屏与日志等。<strong>账号密码、BASE_URL</strong> 请在运行中心的 .env 配置；
            场景步骤中的 <code>{`{变量名}`}</code> 请在「全局变量」中配置。
          </>
        }
      />

      <div style={{ marginBottom: 16 }}>
        <Button
          type="primary"
          icon={<SaveOutlined />}
          loading={saveMut.isPending}
          disabled={!dirty}
          onClick={() => saveMut.mutate()}
        >
          保存{dirty ? " *" : ""}
        </Button>
        <Button
          icon={<ReloadOutlined />}
          style={{ marginLeft: 8 }}
          onClick={() => { setDirty(false); query.refetch(); }}
        >
          重新加载
        </Button>
      </div>

      <Form layout="vertical" size="small">
        <Card size="small" title={SETTINGS_FIELDS.browser.label} style={{ marginBottom: 12 }}>
          <Row gutter={16}>
            <Col span={6}>
              <Form.Item label={SETTINGS_FIELDS.headless.label} tooltip={SETTINGS_FIELDS.headless.tooltip}>
                <Switch checked={draft.browser.headless} onChange={(v) => patchBrowser({ headless: v })} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label={SETTINGS_FIELDS.devtools.label} tooltip={SETTINGS_FIELDS.devtools.tooltip}>
                <Switch checked={draft.browser.devtools} onChange={(v) => patchBrowser({ devtools: v })} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label={SETTINGS_FIELDS.slowMo.label} tooltip={SETTINGS_FIELDS.slowMo.tooltip}>
                <InputNumber
                  min={0}
                  value={draft.browser.slowMo}
                  onChange={(v) => patchBrowser({ slowMo: v ?? 0 })}
                  style={{ width: "100%" }}
                  addonAfter="ms"
                />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label={SETTINGS_FIELDS.timeout.label} tooltip={SETTINGS_FIELDS.timeout.tooltip}>
                <InputNumber
                  min={1}
                  value={draft.browser.timeout}
                  onChange={(v) => patchBrowser({ timeout: v ?? 30000 })}
                  style={{ width: "100%" }}
                  addonAfter="ms"
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={6}>
              <Form.Item label={SETTINGS_FIELDS.actionTimeout.label} tooltip={SETTINGS_FIELDS.actionTimeout.tooltip}>
                <InputNumber
                  min={1}
                  value={draft.browser.actionTimeout}
                  onChange={(v) => patchBrowser({ actionTimeout: v ?? 10000 })}
                  style={{ width: "100%" }}
                  addonAfter="ms"
                />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label={SETTINGS_FIELDS.navigationWaitUntil.label} tooltip={SETTINGS_FIELDS.navigationWaitUntil.tooltip}>
                <Select
                  value={draft.browser.navigationWaitUntil}
                  options={NAV_WAIT_OPTIONS}
                  onChange={(v) => patchBrowser({ navigationWaitUntil: v })}
                />
              </Form.Item>
            </Col>
            <Col span={3}>
              <Form.Item label={SETTINGS_FIELDS.viewportWidth.label} tooltip={SETTINGS_FIELDS.viewportWidth.tooltip}>
                <InputNumber
                  min={1}
                  value={draft.browser.viewport.width}
                  onChange={(v) => patchBrowser({ viewport: { ...draft.browser.viewport, width: v ?? 1280 } })}
                  style={{ width: "100%" }}
                />
              </Form.Item>
            </Col>
            <Col span={3}>
              <Form.Item label={SETTINGS_FIELDS.viewportHeight.label} tooltip={SETTINGS_FIELDS.viewportHeight.tooltip}>
                <InputNumber
                  min={1}
                  value={draft.browser.viewport.height}
                  onChange={(v) => patchBrowser({ viewport: { ...draft.browser.viewport, height: v ?? 720 } })}
                  style={{ width: "100%" }}
                />
              </Form.Item>
            </Col>
          </Row>
        </Card>

        <Card size="small" title={SETTINGS_FIELDS.test.label} style={{ marginBottom: 12 }}>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item label={SETTINGS_FIELDS.defaultStepDelay.label} tooltip={SETTINGS_FIELDS.defaultStepDelay.tooltip}>
                <InputNumber
                  min={0}
                  value={draft.test.defaultStepDelay}
                  onChange={(v) => patchTest({ defaultStepDelay: v ?? 0 })}
                  style={{ width: "100%" }}
                  addonAfter="ms"
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label={SETTINGS_FIELDS.defaultStepTimeout.label} tooltip={SETTINGS_FIELDS.defaultStepTimeout.tooltip}>
                <InputNumber
                  min={1}
                  value={draft.test.defaultStepTimeout}
                  onChange={(v) => patchTest({ defaultStepTimeout: v ?? 10000 })}
                  style={{ width: "100%" }}
                  addonAfter="ms"
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label={SETTINGS_FIELDS.defaultReadyTimeout.label} tooltip={SETTINGS_FIELDS.defaultReadyTimeout.tooltip}>
                <InputNumber
                  min={1}
                  value={draft.test.defaultReadyTimeout}
                  onChange={(v) => patchTest({ defaultReadyTimeout: v ?? 30000 })}
                  style={{ width: "100%" }}
                  addonAfter="ms"
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label={SETTINGS_FIELDS.intervalBetweenScenariosMs.label} tooltip={SETTINGS_FIELDS.intervalBetweenScenariosMs.tooltip}>
                <InputNumber
                  min={0}
                  value={draft.test.intervalBetweenScenariosMs}
                  onChange={(v) => patchTest({ intervalBetweenScenariosMs: v ?? 0 })}
                  style={{ width: "100%" }}
                  addonAfter="ms"
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label={SETTINGS_FIELDS.continueOnScenarioFailure.label} tooltip={SETTINGS_FIELDS.continueOnScenarioFailure.tooltip}>
                <Switch
                  checked={draft.test.continueOnScenarioFailure}
                  onChange={(v) => patchTest({ continueOnScenarioFailure: v })}
                />
              </Form.Item>
            </Col>
          </Row>
        </Card>

        <Card size="small" title={SETTINGS_FIELDS.output.label} style={{ marginBottom: 12 }}>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item label={SETTINGS_FIELDS.baseDir.label} tooltip={SETTINGS_FIELDS.baseDir.tooltip}>
                <Input value={draft.output.baseDir} onChange={(e) => patchOutput({ baseDir: e.target.value })} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label={SETTINGS_FIELDS.logsDir.label} tooltip={SETTINGS_FIELDS.logsDir.tooltip}>
                <Input value={draft.output.logsDir} onChange={(e) => patchOutput({ logsDir: e.target.value })} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label={SETTINGS_FIELDS.videosDir.label} tooltip={SETTINGS_FIELDS.videosDir.tooltip}>
                <Input value={draft.output.videosDir} onChange={(e) => patchOutput({ videosDir: e.target.value })} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label={SETTINGS_FIELDS.recordVideo.label} tooltip={SETTINGS_FIELDS.recordVideo.tooltip}>
            <Switch checked={draft.output.recordVideo} onChange={(v) => patchOutput({ recordVideo: v })} />
          </Form.Item>
        </Card>

        <Card size="small" title={SETTINGS_FIELDS.logging.label} style={{ marginBottom: 12 }}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label={SETTINGS_FIELDS.level.label} tooltip={SETTINGS_FIELDS.level.tooltip}>
                <Select
                  value={draft.logging.level}
                  options={LOG_LEVEL_OPTIONS}
                  onChange={(v) => patchLogging({ level: v })}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label={SETTINGS_FIELDS.consoleOutput.label} tooltip={SETTINGS_FIELDS.consoleOutput.tooltip}>
                <Switch checked={draft.logging.consoleOutput} onChange={(v) => patchLogging({ consoleOutput: v })} />
              </Form.Item>
            </Col>
          </Row>
        </Card>
      </Form>

      <Card size="small" title="JSON 预览" style={{ marginTop: 8 }}>
        <JsonPreview embedded data={draft} />
      </Card>
    </ScrollPane>
  );
}
