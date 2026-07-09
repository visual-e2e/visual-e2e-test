import { Button, Dropdown, Space, type MenuProps } from "antd";
import {
  SaveOutlined, CheckOutlined, EyeOutlined, PlayCircleOutlined,
  PlusOutlined, ImportOutlined,
} from "@ant-design/icons";

interface StudioHeaderProps {
  dirty: boolean;
  saving: boolean;
  onNewScenario: () => void;
  onImportProfile: () => void;
  onSave: () => void;
  onValidate: () => void;
  onExpand: () => void;
  onRunCurrent: () => void;
  onRunModule: () => void;
}

export function StudioHeader({
  dirty, saving, onNewScenario, onImportProfile, onSave, onValidate, onExpand,
  onRunCurrent, onRunModule,
}: StudioHeaderProps) {
  const runItems: MenuProps["items"] = [
    { key: "current", label: "运行当前场景", onClick: onRunCurrent },
    { key: "module", label: "运行本模块全部", onClick: onRunModule },
  ];

  return (
    <div className="studio-header">
      <div className="studio-header__left">
        <Button type="primary" icon={<PlusOutlined />} onClick={onNewScenario}>
          新建场景
        </Button>
        <Button icon={<ImportOutlined />} onClick={onImportProfile}>
          导入画像
        </Button>
      </div>
      <div className="studio-header__right">
        <Space>
          <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={onSave}>
            保存{dirty ? " *" : ""}
          </Button>
          <Button icon={<CheckOutlined />} onClick={onValidate}>校验</Button>
          <Button icon={<EyeOutlined />} onClick={onExpand}>展开预览</Button>
          <Dropdown menu={{ items: runItems }}>
            <Button icon={<PlayCircleOutlined />}>运行</Button>
          </Dropdown>
        </Space>
      </div>
    </div>
  );
}
