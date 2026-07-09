import { Dropdown, Tooltip, Typography } from "antd";
import { ExperimentOutlined, CheckOutlined, SettingOutlined } from "@ant-design/icons";
import type { MenuProps } from "antd";
import { useNavigate } from "react-router-dom";
import { useProject } from "../../context/ProjectContext";
import "./sidebar.css";

interface ProjectSwitcherProps {
  collapsed: boolean;
}

export function ProjectSwitcher({ collapsed }: ProjectSwitcherProps) {
  const navigate = useNavigate();
  const { projectId, projects, setProjectId } = useProject();
  const current = projects.find((p) => p.id === projectId);

  const menuItems: MenuProps["items"] = [
    ...projects.map((p) => ({
      key: p.id,
      label: (
        <div className="sidebar-project-option">
          <div className="sidebar-project-option-name">{p.name}</div>
          <div className="sidebar-project-option-id">{p.id}</div>
        </div>
      ),
      extra: p.id === projectId ? <CheckOutlined style={{ color: "#1677ff" }} /> : null,
    })),
    { type: "divider" as const },
    {
      key: "__manage__",
      label: "项目管理",
      icon: <SettingOutlined />,
    },
  ];

  const onMenuClick: MenuProps["onClick"] = ({ key }) => {
    if (key === "__manage__") {
      navigate("/projects");
      return;
    }
    setProjectId(key);
  };

  const trigger = collapsed ? (
    <button type="button" className="sidebar-project-trigger sidebar-project-trigger--collapsed" aria-label="切换项目">
      <span className="sidebar-project-icon">
        <ExperimentOutlined />
      </span>
    </button>
  ) : (
    <button type="button" className="sidebar-project-trigger" aria-label="切换项目">
      <span className="sidebar-project-icon">
        <ExperimentOutlined />
      </span>
      <span className="sidebar-project-text">
        <Typography.Text className="sidebar-project-name" ellipsis>
          {current?.name ?? "选择项目"}
        </Typography.Text>
        <Typography.Text className="sidebar-project-id" ellipsis type="secondary">
          {current?.id ?? "—"}
        </Typography.Text>
      </span>
      <span className="sidebar-project-chevron" aria-hidden>▾</span>
    </button>
  );

  const dropdown = (
    <Dropdown
      menu={{ items: menuItems, onClick: onMenuClick, selectedKeys: projectId ? [projectId] : [] }}
      trigger={["click"]}
      placement={collapsed ? "bottomRight" : "bottomLeft"}
      overlayClassName="sidebar-project-dropdown"
    >
      {trigger}
    </Dropdown>
  );

  if (collapsed) {
    return (
      <div className="sidebar-brand sidebar-brand--collapsed">
        <Tooltip title={current ? `${current.name} (${current.id})` : "切换项目"} placement="right">
          {dropdown}
        </Tooltip>
      </div>
    );
  }

  return <div className="sidebar-brand">{dropdown}</div>;
}
