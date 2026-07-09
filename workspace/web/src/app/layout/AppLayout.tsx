import { Layout, Menu, Typography } from "antd";
import {
  AppstoreOutlined,
  DatabaseOutlined,
  BlockOutlined,
  FileMarkdownOutlined,
  PlayCircleOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  FolderOutlined,
} from "@ant-design/icons";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import { useSiderCollapsed } from "../../hooks/useSiderCollapsed";
import { useProject } from "../../context/ProjectContext";
import { ProductBrand } from "./ProductBrand";
import { ProjectSwitcher } from "./ProjectSwitcher";
import "./sidebar.css";

const { Sider, Content } = Layout;

const NAV = [
  { key: "/scenarios", icon: <AppstoreOutlined />, label: "场景管理" },
  { key: "/settings", icon: <SettingOutlined />, label: "全局配置" },
  { key: "/variables", icon: <DatabaseOutlined />, label: "全局变量" },
  { key: "/macros", icon: <BlockOutlined />, label: "宏步骤" },
  { key: "/rules", icon: <BlockOutlined />, label: "规则模板" },
  { key: "/profiles", icon: <FileMarkdownOutlined />, label: "产品画像" },
  { key: "/runs", icon: <PlayCircleOutlined />, label: "运行中心" },
  { key: "/validate", icon: <SafetyCertificateOutlined />, label: "校验中心" },
  { key: "/projects", icon: <FolderOutlined />, label: "项目管理" },
];

export function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const selected = NAV.find((n) => location.pathname.startsWith(n.key))?.key ?? "/scenarios";
  const [collapsed, setCollapsed] = useSiderCollapsed();
  const { projectId } = useProject();

  const healthQuery = useQuery({ queryKey: ["health"], queryFn: api.health });

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        width={220}
        collapsedWidth={64}
        theme="light"
        style={{ borderRight: "1px solid #f0f0f0" }}
      >
        <ProductBrand collapsed={collapsed} />
        <ProjectSwitcher collapsed={collapsed} />

        <Menu
          mode="inline"
          inlineCollapsed={collapsed}
          selectedKeys={[selected]}
          items={NAV}
          onClick={({ key }) => navigate(key)}
        />

        {!collapsed && healthQuery.data && (
          <Typography.Text
            type="secondary"
            style={{ fontSize: 11, padding: "8px 16px", display: "block", wordBreak: "break-all" }}
          >
            {healthQuery.data.e2eRoot}
          </Typography.Text>
        )}
      </Sider>

      <Content style={{ background: "#fff", overflow: "hidden" }}>
        <Outlet key={projectId} />
      </Content>
    </Layout>
  );
}
