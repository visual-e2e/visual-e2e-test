import { useEffect, useState } from "react";
import { Button, Drawer, Input, Space, Tooltip, Typography, message } from "antd";
import { CopyOutlined, DownloadOutlined, EditOutlined, SaveOutlined } from "@ant-design/icons";
import { JsonPreview } from "./JsonPreview";
import "./json-preview-drawer.css";

interface ScenarioJsonDrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  savePath: string;
  data: unknown;
  onCopy: () => void;
  onDownload: () => void;
  onApplyEdit?: (parsed: unknown) => void | Promise<void>;
  onImport?: () => void | Promise<void>;
  importing?: boolean;
}

export function ScenarioJsonDrawer({
  open,
  onClose,
  title,
  savePath,
  data,
  onCopy,
  onDownload,
  onApplyEdit,
  onImport,
  importing,
}: ScenarioJsonDrawerProps) {
  const [editing, setEditing] = useState(false);
  const [draftText, setDraftText] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && !editing) {
      setDraftText(data !== undefined ? `${JSON.stringify(data, null, 2)}\n` : "");
    }
  }, [open, data, editing]);

  useEffect(() => {
    if (!open) setEditing(false);
  }, [open]);

  const startEdit = () => {
    setDraftText(data !== undefined ? `${JSON.stringify(data, null, 2)}\n` : "");
    setEditing(true);
  };

  const cancelEdit = () => {
    setDraftText(data !== undefined ? `${JSON.stringify(data, null, 2)}\n` : "");
    setEditing(false);
  };

  const applyEdit = async () => {
    if (!onApplyEdit) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(draftText);
    } catch {
      message.error("JSON 语法无效");
      return;
    }
    setSaving(true);
    try {
      await onApplyEdit(parsed);
      setEditing(false);
      message.success("已应用 JSON 修改");
    } catch (err) {
      message.error(err instanceof Error ? err.message : "应用失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      title={title}
      open={open}
      onClose={onClose}
      width={720}
      destroyOnClose={false}
      extra={(
        <Space wrap>
          {editing ? (
            <>
              <Button onClick={cancelEdit} disabled={saving}>
                取消
              </Button>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                loading={saving}
                onClick={() => void applyEdit()}
              >
                应用修改
              </Button>
            </>
          ) : (
            <>
              <Button icon={<DownloadOutlined />} onClick={onDownload}>
                下载 JSON
              </Button>
              {onImport && (
                <Button type="primary" loading={importing} onClick={() => void onImport()}>
                  导入到场景管理
                </Button>
              )}
            </>
          )}
        </Space>
      )}
    >
      <Typography.Text type="secondary" className="json-preview-drawer__path">
        保存路径：{savePath}
      </Typography.Text>
      <div className="json-preview-drawer__body">
        {!editing && (
          <div className="json-preview-drawer__toolbar">
            {onApplyEdit && (
              <Tooltip title="编辑">
                <Button type="text" size="small" icon={<EditOutlined />} onClick={startEdit} />
              </Tooltip>
            )}
            <Tooltip title="复制 JSON">
              <Button type="text" size="small" icon={<CopyOutlined />} onClick={onCopy} />
            </Tooltip>
          </div>
        )}
        {editing ? (
          <Input.TextArea
            className="json-preview-drawer__editor"
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            spellCheck={false}
          />
        ) : (
          <JsonPreview embedded data={data} />
        )}
      </div>
    </Drawer>
  );
}
