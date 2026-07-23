import { Button, Empty, List, Popconfirm, Space, Spin, Typography } from "antd";
import { DeleteOutlined, EditOutlined, ExportOutlined } from "@ant-design/icons";
import type { RecordingSummary } from "../types";

interface RecordingListProps {
  recordings: RecordingSummary[];
  loading?: boolean;
  activeId?: string | null;
  recordingBusy?: boolean;
  onSelect: (id: string) => void;
  onEdit: (id: string) => void;
  onImport: (id: string) => void;
  onDelete: (id: string) => void;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("zh-CN", { hour12: false });
  } catch {
    return iso;
  }
}

export function RecordingList({
  recordings,
  loading,
  activeId,
  recordingBusy,
  onSelect,
  onEdit,
  onImport,
  onDelete,
}: RecordingListProps) {
  if (loading) {
    return (
      <div className="recorder-list__loading">
        <Spin />
      </div>
    );
  }

  if (recordings.length === 0) {
    return <Empty description="暂无场景，点击「新建场景」开始" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
  }

  return (
    <List
      className="recorder-list"
      dataSource={recordings}
      renderItem={(item) => (
        <List.Item
          className={
            item.id === activeId
              ? "recorder-list__item recorder-list__item--active"
              : "recorder-list__item"
          }
          onClick={() => onSelect(item.id)}
        >
          <div className="recorder-list__item-body">
            <div className="recorder-list__row">
              <Typography.Text code ellipsis className="recorder-list__id">
                {item.scenarioId}
              </Typography.Text>
              <Typography.Text type="secondary" className="recorder-list__time">
                {formatTime(item.updatedAt)}
              </Typography.Text>
            </div>
            <div className="recorder-list__row">
              <Space size={8} className="recorder-list__name-wrap">
                <Typography.Text strong ellipsis>
                  {item.scenarioName || item.scenarioId}
                </Typography.Text>
                <Typography.Text type="secondary">{item.stepCount} 步</Typography.Text>
              </Space>
              <Space size={0} className="recorder-list__actions" onClick={(e) => e.stopPropagation()}>
                <Button
                  type="link"
                  size="small"
                  icon={<EditOutlined />}
                  disabled={recordingBusy && item.id === activeId}
                  onClick={() => onEdit(item.id)}
                >
                  编辑
                </Button>
                <Button
                  type="link"
                  size="small"
                  icon={<ExportOutlined />}
                  disabled={item.stepCount === 0}
                  onClick={() => onImport(item.id)}
                >
                  导入
                </Button>
                <Popconfirm title="删除该场景？" onConfirm={() => onDelete(item.id)}>
                  <Button type="link" size="small" danger icon={<DeleteOutlined />}>
                    删除
                  </Button>
                </Popconfirm>
              </Space>
            </div>
            {item.description ? (
              <Typography.Paragraph
                type="secondary"
                ellipsis={{ rows: 2 }}
                className="recorder-list__desc"
              >
                {item.description}
              </Typography.Paragraph>
            ) : null}
          </div>
        </List.Item>
      )}
    />
  );
}
