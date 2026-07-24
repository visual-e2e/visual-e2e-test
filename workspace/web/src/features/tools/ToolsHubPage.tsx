import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Typography,
  Card,
  Button,
  Spin,
  Empty,
  message,
  Modal,
  Form,
  Input,
  Dropdown,
  Radio,
  Tag,
  Space,
} from "antd";
import type { MenuProps } from "antd";
import {
  PictureOutlined,
  ToolOutlined,
  VideoCameraOutlined,
  PlusOutlined,
  MoreOutlined,
  EditOutlined,
  DeleteOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import { api } from "../../api/client";
import { ScrollPane } from "../../components/layout/ScrollPane";
import type { ToolRegistryEntry } from "./types";
import {
  createCustomTool,
  deleteCustomTool,
  isValidHttpUrl,
  listCustomTools,
  updateCustomTool,
  type CustomTool,
  type CustomToolOpenMode,
} from "./custom-tools-store";
import "./tools.css";

const ICONS: Record<string, React.ReactNode> = {
  picture: <PictureOutlined />,
  video: <VideoCameraOutlined />,
};

interface ToolFormValues {
  name: string;
  url: string;
  iconUrl?: string;
  description?: string;
  openMode: CustomToolOpenMode;
}

function BuiltinIcon({ icon }: { icon?: string }) {
  if (icon && ICONS[icon]) return <>{ICONS[icon]}</>;
  return <ToolOutlined />;
}

function CustomIcon({ iconUrl, toolUrl }: { iconUrl?: string; toolUrl: string }) {
  const [failed, setFailed] = useState(false);
  let src = iconUrl;
  if (!src) {
    try {
      src = new URL("/favicon.ico", toolUrl).href;
    } catch {
      src = undefined;
    }
  }
  if (!src || failed) return <ToolOutlined />;
  return (
    <img
      src={src}
      alt=""
      className="tools-hub__icon-img"
      onError={() => setFailed(true)}
    />
  );
}

function sourceLabel(source?: ToolRegistryEntry["source"]): string | null {
  if (source === "user") return "已安装";
  if (source === "dev-link") return "开发";
  if (source === "bundled") return "内置";
  return null;
}

interface ToolCardProps {
  title: React.ReactNode;
  description?: string;
  extra?: React.ReactNode;
  footer?: React.ReactNode;
  onOpen: () => void;
  menuItems?: MenuProps["items"];
}

function ToolCard({ title, description, extra, footer, onOpen, menuItems }: ToolCardProps) {
  return (
    <Card
      className="tools-hub__card"
      onClick={onOpen}
      title={
        <div className="tools-hub__card-title">
          {title}
          {menuItems && menuItems.length > 0 && (
            <Dropdown
              menu={{ items: menuItems }}
              trigger={["click"]}
              placement="bottomRight"
            >
              <Button
                type="text"
                size="small"
                className="tools-hub__card-actions"
                icon={<MoreOutlined />}
                onClick={(e) => e.stopPropagation()}
              />
            </Dropdown>
          )}
        </div>
      }
    >
      {extra}
      <Typography.Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ marginBottom: footer ? 8 : 0 }}>
        {description || "—"}
      </Typography.Paragraph>
      {footer}
    </Card>
  );
}

export function ToolsHubPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [customTools, setCustomTools] = useState<CustomTool[]>(() => listCustomTools());
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CustomTool | null>(null);
  const [installing, setInstalling] = useState(false);
  const [form] = Form.useForm<ToolFormValues>();

  const registryQuery = useQuery({
    queryKey: ["tools-registry"],
    queryFn: api.listTools,
  });

  const platformTools = registryQuery.data?.tools ?? [];

  const openCreateModal = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldValue("openMode", "external");
    setModalOpen(true);
  };

  const openEditModal = (tool: CustomTool) => {
    setEditing(tool);
    form.setFieldsValue({
      name: tool.name,
      url: tool.url,
      iconUrl: tool.iconUrl,
      description: tool.description,
      openMode: tool.openMode,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    const payload = {
      name: values.name.trim(),
      url: values.url.trim(),
      iconUrl: values.iconUrl?.trim() || undefined,
      description: values.description?.trim() || undefined,
      openMode: values.openMode,
    };

    if (editing) {
      updateCustomTool(editing.id, payload);
      message.success("已更新");
    } else {
      createCustomTool(payload);
      message.success("已添加");
    }
    setCustomTools(listCustomTools());
    setModalOpen(false);
    setEditing(null);
    form.resetFields();
  };

  const handleDelete = (tool: CustomTool) => {
    Modal.confirm({
      title: "删除工具",
      content: `确定删除「${tool.name}」？`,
      okText: "删除",
      okType: "danger",
      cancelText: "取消",
      onOk: () => {
        deleteCustomTool(tool.id);
        setCustomTools(listCustomTools());
        message.success("已删除");
      },
    });
  };

  const handleInstall = async () => {
    if (!window.electronAPI?.pickToolPackage) {
      message.warning("请在桌面客户端中安装工具包");
      return;
    }
    setInstalling(true);
    try {
      const path = await window.electronAPI.pickToolPackage();
      if (!path) return;
      const result = await api.installTool(path);
      await queryClient.invalidateQueries({ queryKey: ["tools-registry"] });
      message.success(`已安装 ${result.tool.name} v${result.tool.version}`);
    } catch (err) {
      message.error(err instanceof Error ? err.message : "安装失败");
    } finally {
      setInstalling(false);
    }
  };

  const handleUninstall = (tool: ToolRegistryEntry) => {
    Modal.confirm({
      title: "卸载工具",
      content: `确定卸载「${tool.name}」v${tool.version ?? "?"}？`,
      okText: "卸载",
      okType: "danger",
      cancelText: "取消",
      onOk: async () => {
        try {
          if (window.electronAPI?.stopTool) {
            await window.electronAPI.stopTool(tool.id);
          }
          await api.uninstallTool(tool.id);
          await queryClient.invalidateQueries({ queryKey: ["tools-registry"] });
          message.success("已卸载");
        } catch (err) {
          message.error(err instanceof Error ? err.message : "卸载失败");
        }
      },
    });
  };

  const customMenu = (tool: CustomTool): MenuProps["items"] => [
    {
      key: "edit",
      icon: <EditOutlined />,
      label: "编辑",
      onClick: ({ domEvent }) => {
        domEvent.stopPropagation();
        openEditModal(tool);
      },
    },
    {
      key: "delete",
      icon: <DeleteOutlined />,
      label: "删除",
      danger: true,
      onClick: ({ domEvent }) => {
        domEvent.stopPropagation();
        handleDelete(tool);
      },
    },
  ];

  const platformMenu = (tool: ToolRegistryEntry): MenuProps["items"] | undefined => {
    if (!tool.uninstallable) return undefined;
    return [
      {
        key: "uninstall",
        icon: <DeleteOutlined />,
        label: "卸载",
        danger: true,
        onClick: ({ domEvent }) => {
          domEvent.stopPropagation();
          handleUninstall(tool);
        },
      },
    ];
  };

  const openCustomTool = async (tool: CustomTool) => {
    if (tool.openMode === "embedded") {
      navigate(`/tools/${tool.id}`);
      return;
    }
    if (window.electronAPI?.openExternalTool) {
      try {
        await window.electronAPI.openExternalTool(tool.url, tool.name);
        return;
      } catch (err) {
        message.warning(err instanceof Error ? err.message : "应用内打开失败，已尝试浏览器打开");
      }
    }
    window.open(tool.url, "_blank", "noopener,noreferrer");
  };

  return (
    <ScrollPane>
      <div className="tools-hub__header">
        <div>
          <Typography.Title level={4} style={{ marginBottom: 4 }}>
            工具箱
          </Typography.Title>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
            安装包工具与内置工具；用户安装的工具保存在本机，升级主应用不会清除。
          </Typography.Paragraph>
        </div>
        <Space>
          <Button icon={<UploadOutlined />} loading={installing} onClick={() => void handleInstall()}>
            安装工具包
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
            添加外链
          </Button>
        </Space>
      </div>

      {registryQuery.isLoading && <Spin style={{ marginTop: 24 }} />}

      {!registryQuery.isLoading && platformTools.length > 0 && (
        <section className="tools-hub__section">
          <Typography.Title level={5} className="tools-hub__section-title">
            平台工具
          </Typography.Title>
          <div className="tools-hub__grid">
            {platformTools.map((tool: ToolRegistryEntry) => (
              <ToolCard
                key={tool.id}
                title={
                  <>
                    <BuiltinIcon icon={tool.icon} />
                    <span className="tools-hub__card-title-text">{tool.name}</span>
                  </>
                }
                extra={
                  <div className="tools-hub__meta">
                    <Tag>{tool.version ? `v${tool.version}` : "v?"}</Tag>
                    {sourceLabel(tool.source) && <Tag color="blue">{sourceLabel(tool.source)}</Tag>}
                    {tool.compatible === false && <Tag color="warning">需更新</Tag>}
                  </div>
                }
                description={tool.description}
                footer={
                  tool.prodPort ? (
                    <Typography.Text type="secondary" className="tools-hub__card-port">
                      端口 {tool.prodPort}
                    </Typography.Text>
                  ) : null
                }
                onOpen={() => navigate(`/tools/${tool.id}`)}
                menuItems={platformMenu(tool)}
              />
            ))}
          </div>
        </section>
      )}

      <section className="tools-hub__section">
        <Typography.Title level={5} className="tools-hub__section-title">
          自定义外链
        </Typography.Title>
        {customTools.length === 0 && !registryQuery.isLoading && platformTools.length === 0 ? (
          <Empty description="暂无工具" />
        ) : customTools.length === 0 ? (
          <Empty description="暂无自定义外链" />
        ) : (
          <div className="tools-hub__grid">
            {customTools.map((tool) => (
              <ToolCard
                key={tool.id}
                title={
                  <>
                    <CustomIcon
                      key={`${tool.iconUrl ?? ""}:${tool.url}`}
                      iconUrl={tool.iconUrl}
                      toolUrl={tool.url}
                    />
                    <span className="tools-hub__card-title-text">{tool.name}</span>
                  </>
                }
                description={tool.description}
                onOpen={() => void openCustomTool(tool)}
                menuItems={customMenu(tool)}
              />
            ))}
          </div>
        )}
      </section>

      <Modal
        title={editing ? "编辑外链" : "添加外链"}
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false);
          setEditing(null);
          form.resetFields();
        }}
        onOk={() => void handleSave()}
        okText="保存"
        cancelText="取消"
        destroyOnHidden
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="name"
            label="工具名"
            rules={[{ required: true, message: "请输入工具名" }]}
          >
            <Input placeholder="例如：JSON 格式化" />
          </Form.Item>
          <Form.Item
            name="url"
            label="工具地址"
            rules={[
              { required: true, message: "请输入工具地址" },
              {
                validator: (_, value: string) =>
                  !value || isValidHttpUrl(value)
                    ? Promise.resolve()
                    : Promise.reject(new Error("请输入有效的 http 或 https 地址")),
              },
            ]}
          >
            <Input placeholder="https://example.com" />
          </Form.Item>
          <Form.Item
            name="openMode"
            label="打开方式"
            rules={[{ required: true, message: "请选择打开方式" }]}
          >
            <Radio.Group>
              <Radio value="external">新窗口打开</Radio>
              <Radio value="embedded">应用内打开</Radio>
            </Radio.Group>
          </Form.Item>
          <Form.Item
            name="iconUrl"
            label="图标地址"
            extra="可选；未配置时使用工具地址根目录下的 favicon.ico"
            rules={[
              {
                validator: (_, value?: string) =>
                  !value?.trim() || isValidHttpUrl(value)
                    ? Promise.resolve()
                    : Promise.reject(new Error("请输入有效的图片 URL")),
              },
            ]}
          >
            <Input placeholder="https://example.com/icon.png" />
          </Form.Item>
          <Form.Item name="description" label="工具描述">
            <Input.TextArea rows={2} placeholder="简要说明用途" />
          </Form.Item>
        </Form>
      </Modal>
    </ScrollPane>
  );
}
