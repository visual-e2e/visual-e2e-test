import { Layout, Menu, Typography, Alert } from "antd";
import {
  AppstoreOutlined,
  DatabaseOutlined,
  BlockOutlined,
  FileMarkdownOutlined,
  PlayCircleOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  FolderOutlined,
  ChromeOutlined,
  ToolOutlined,
} from "@ant-design/icons";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import { useSiderCollapsed } from "../../hooks/useSiderCollapsed";
import { useProject } from "../../context/ProjectContext";
import { AppHeader } from "./AppHeader";

const { Sider, Content } = Layout;

const NAV = [
  { key: "/variables", icon: <DatabaseOutlined />, label: "全局变量" },
  { key: "/scenarios", icon: <AppstoreOutlined />, label: "场景管理" },
  { key: "/macros", icon: <BlockOutlined />, label: "宏步骤" },
  { key: "/rules", icon: <BlockOutlined />, label: "规则模板" },
  { key: "/profiles", icon: <FileMarkdownOutlined />, label: "产品画像" },
  { key: "/projects", icon: <FolderOutlined />, label: "项目管理" },
  { key: "/runs", icon: <PlayCircleOutlined />, label: "运行中心" },
  { key: "/validate", icon: <SafetyCertificateOutlined />, label: "校验中心" },
  { key: "/settings", icon: <SettingOutlined />, label: "全局配置" },
  { key: "/browser", icon: <ChromeOutlined />, label: "浏览器环境" },
  { key: "/tools", icon: <ToolOutlined />, label: "工具箱" },
];

function shortenHomePath(path: string): string {
  return path.replace(/^\/Users\/[^/]+/, "~");
}

function formatHealthFooter(health: {
  runtime?: string;
  port?: number;
  projectsDir?: string;
  e2eRoot: string;
}): string {
  const dataPath = shortenHomePath(health.projectsDir ?? health.e2eRoot);
  return [
    health.runtime ?? "workspace",
    health.port != null ? `:${health.port}` : null,
    dataPath,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const selected = NAV.find((n) => location.pathname.startsWith(n.key))?.key ?? "/scenarios";
  const [collapsed, setCollapsed] = useSiderCollapsed();
  const { projectId } = useProject();

  const healthQuery = useQuery({ queryKey: ["health"], queryFn: api.health });
  const browserCheckQuery = useQuery({
    queryKey: ["browser-check"],
    queryFn: api.browserCheck,
    refetchInterval: (q) => (q.state.data?.ok ? false : 30_000),
  });

  return (
    <Layout className="app-shell">
      <AppHeader />
      {browserCheckQuery.data && !browserCheckQuery.data.ok ? (
        <Alert
          type="warning"
          showIcon
          banner
          message="测试浏览器未就绪"
          action={(
            <Typography.Link onClick={() => navigate("/browser")}>
              去配置
            </Typography.Link>
          )}
        />
      ) : null}
      <Layout className="app-shell__body">
        <Sider
          className="app-shell__sider"
          collapsible
          collapsed={collapsed}
          onCollapse={setCollapsed}
          width={220}
          collapsedWidth={64}
          theme="light"
        >
          <Menu
            className="app-shell__sider-menu"
            mode="inline"
            inlineCollapsed={collapsed}
            selectedKeys={[selected]}
            items={NAV}
            onClick={({ key }) => navigate(key)}
          />

          {!collapsed && healthQuery.data && (
            <Typography.Text type="secondary" className="app-shell__sider-footer">
              {formatHealthFooter(healthQuery.data)}
            </Typography.Text>
          )}
        </Sider>

        <Content className="app-shell__main">
          <Outlet key={projectId} />
        </Content>
      </Layout>
    </Layout>
  );
}
