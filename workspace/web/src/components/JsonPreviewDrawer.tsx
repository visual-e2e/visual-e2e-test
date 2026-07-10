import { Button, Drawer, Segmented, Space, Typography } from "antd";
import { JsonPreview } from "./JsonPreview";
import "./json-preview.css";
import "./json-preview-drawer.css";

export type JsonPreviewMode = "draft" | "expanded";

interface JsonPreviewDrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  savePath: string;
  mode: JsonPreviewMode;
  onModeChange: (mode: JsonPreviewMode) => void;
  draftData: unknown;
  expandedData: unknown | undefined;
  expandedAvailable: boolean;
  loading?: boolean;
  onExpand?: () => void;
  expandLoading?: boolean;
}

export function JsonPreviewDrawer({
  open,
  onClose,
  title,
  savePath,
  mode,
  onModeChange,
  draftData,
  expandedData,
  expandedAvailable,
  loading,
  onExpand,
  expandLoading,
}: JsonPreviewDrawerProps) {
  const extra = expandedAvailable ? (
    <Segmented
      size="small"
      value={mode}
      options={[
        { label: "草稿", value: "draft" },
        { label: "展开后", value: "expanded" },
      ]}
      onChange={(v) => onModeChange(v as JsonPreviewMode)}
    />
  ) : onExpand ? (
    <Button size="small" loading={expandLoading} onClick={onExpand}>
      展开
    </Button>
  ) : null;

  return (
    <Drawer
      title={title}
      open={open}
      onClose={onClose}
      width={720}
      destroyOnClose={false}
      extra={extra ? <Space>{extra}</Space> : undefined}
    >
      <Typography.Text type="secondary" className="json-preview-drawer__path">
        保存路径：{savePath}
      </Typography.Text>
      <div className="json-preview-drawer__body">
        <JsonPreview
          embedded
          data={mode === "expanded" && expandedAvailable ? expandedData : draftData}
          loading={loading || expandLoading}
        />
      </div>
    </Drawer>
  );
}
