import { Button, Space } from "antd";
import { PlusOutlined, SaveOutlined, DeleteOutlined } from "@ant-design/icons";

interface FixtureStudioHeaderProps {
  label: string;
  dirty: boolean;
  saving: boolean;
  canDelete: boolean;
  onNew: () => void;
  onSave: () => void;
  onDelete: () => void;
}

export function FixtureStudioHeader({
  label, dirty, saving, canDelete, onNew, onSave, onDelete,
}: FixtureStudioHeaderProps) {
  return (
    <div className="studio-header">
      <div className="studio-header__left">
        <Button type="primary" icon={<PlusOutlined />} onClick={onNew}>
          新建{label}
        </Button>
      </div>
      <div className="studio-header__right">
        <Space>
          <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={onSave}>
            保存{dirty ? " *" : ""}
          </Button>
          <Button danger icon={<DeleteOutlined />} disabled={!canDelete} onClick={onDelete}>
            删除
          </Button>
        </Space>
      </div>
    </div>
  );
}
