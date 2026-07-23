import { useState } from "react";
import { Alert, Button, Modal, Space, Typography, Upload, message } from "antd";
import { InboxOutlined } from "@ant-design/icons";
import type { UploadProps } from "antd";
import { api } from "../../../api/client";
import type { ScenarioDraft } from "../../../types/scenario";
import type { ValidateIssue } from "../../../types/module";
import { parseScenarioJsonText } from "../../../utils/scenario-import";
import type { ScenarioValidateIssue } from "../../../utils/scenario-validate";

interface ImportScenarioJsonModalProps {
  open: boolean;
  module: string;
  onClose: () => void;
  onImported: (draft: ScenarioDraft, suggestedFile: string) => void;
}

function mergeIssues(
  client: ScenarioValidateIssue[],
  server: ValidateIssue[],
): ValidateIssue[] {
  const seen = new Set<string>();
  const merged: ValidateIssue[] = [];
  for (const issue of [...client, ...server]) {
    const key = `${issue.level}:${issue.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(issue);
  }
  return merged;
}

export function ImportScenarioJsonModal({
  open,
  module,
  onClose,
  onImported,
}: ImportScenarioJsonModalProps) {
  const [loading, setLoading] = useState(false);
  const [parsed, setParsed] = useState<{
    draft: ScenarioDraft;
    suggestedFile: string;
    moduleAdjusted: boolean;
    moduleMissing: boolean;
    fileConflict: boolean;
  } | null>(null);
  const [issues, setIssues] = useState<ValidateIssue[]>([]);
  const [serverValid, setServerValid] = useState<boolean | null>(null);

  const reset = () => {
    setParsed(null);
    setIssues([]);
    setServerValid(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const processText = async (text: string) => {
    setLoading(true);
    reset();
    try {
      const result = parseScenarioJsonText(text, module);
      const validation = await api.validateScenario(result.draft);
      const merged = mergeIssues(result.clientIssues, validation.issues);
      setIssues(merged);
      setServerValid(validation.valid);
      if (!validation.valid) {
        message.error("场景 JSON 校验未通过");
        return;
      }

      const modules = await api.modules();
      const moduleExists = modules.some((m) => m.module === result.draft.module);
      const scenariosInModule = moduleExists
        ? await api.scenarios(result.draft.module)
        : [];
      const fileConflict = scenariosInModule.some(
        (s) => s.file === result.suggestedFile || s.file === `${result.draft.id}.json`,
      );

      setParsed({
        draft: result.draft,
        suggestedFile: result.suggestedFile,
        moduleAdjusted: result.moduleAdjusted,
        moduleMissing: !moduleExists,
        fileConflict,
      });

      if (!moduleExists) {
        message.info(`模块「${result.draft.module}」不存在，保存时将自动创建`);
      } else if (result.moduleAdjusted) {
        message.info(`将导入到模块「${result.draft.module}」`);
      }
    } catch (e) {
      const err = e as Error & { issues?: ScenarioValidateIssue[] };
      if (err.issues?.length) {
        setIssues(err.issues);
      }
      setServerValid(false);
      message.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const uploadProps: UploadProps = {
    accept: ".json,application/json",
    maxCount: 1,
    showUploadList: false,
    beforeUpload: (file) => {
      const reader = new FileReader();
      reader.onload = () => {
        void processText(String(reader.result ?? ""));
      };
      reader.onerror = () => message.error("读取文件失败");
      reader.readAsText(file);
      return false;
    },
  };

  const handleImport = () => {
    if (!parsed || serverValid !== true) return;
    onImported(parsed.draft, parsed.suggestedFile);
    message.success("场景 JSON 已导入到编辑器，请确认后保存");
    handleClose();
  };

  const errorCount = issues.filter((i) => i.level === "error").length;
  const warningCount = issues.filter((i) => i.level === "warning").length;

  return (
    <Modal
      title="导入场景 JSON"
      open={open}
      onCancel={handleClose}
      destroyOnClose
      width={640}
      footer={[
        <Button key="cancel" onClick={handleClose}>
          取消
        </Button>,
        <Button
          key="import"
          type="primary"
          disabled={!parsed || serverValid !== true || loading}
          loading={loading}
          onClick={handleImport}
        >
          导入到编辑器
        </Button>,
      ]}
    >
      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
          选择场景 JSON 文件，将校验结构与步骤内容。通过后可载入编辑器；若模块不存在，保存时会自动创建后再写入场景。
        </Typography.Paragraph>

        <Upload.Dragger {...uploadProps} disabled={loading}>
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">点击或拖拽 .json 文件到此处</p>
        </Upload.Dragger>

        {parsed && (
          <Alert
            type="info"
            showIcon
            message={
              <Space direction="vertical" size={0}>
                <span>ID：{parsed.draft.id}</span>
                <span>名称：{parsed.draft.name}</span>
                <span>模块：{parsed.draft.module}{parsed.moduleMissing ? "（保存时自动创建）" : ""}</span>
                <span>步骤数：{parsed.draft.steps.length}</span>
                <span>建议文件名：{parsed.suggestedFile}</span>
              </Space>
            }
          />
        )}

        {parsed?.moduleMissing && (
          <Alert
            type="info"
            showIcon
            message={`模块「${parsed.draft.module}」尚不存在，保存时将自动创建后再写入场景`}
          />
        )}

        {parsed?.fileConflict && (
          <Alert
            type="warning"
            showIcon
            message={`模块 ${parsed.draft.module} 中已存在 ${parsed.suggestedFile}，保存时将覆盖同名场景`}
          />
        )}

        {issues.length > 0 && (
          <Alert
            type={errorCount > 0 ? "error" : "warning"}
            showIcon
            message={`校验结果：${errorCount} 个错误${warningCount ? `，${warningCount} 个警告` : ""}`}
            description={
              <ul style={{ margin: "8px 0 0", paddingLeft: 20 }}>
                {issues.map((issue, index) => (
                  <li key={`${issue.level}-${issue.message}-${index}`}>
                    [{issue.level === "error" ? "错误" : "警告"}] {issue.message}
                  </li>
                ))}
              </ul>
            }
          />
        )}
      </Space>
    </Modal>
  );
}
