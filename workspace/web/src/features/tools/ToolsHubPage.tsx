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
  Alert,
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
  CloudUploadOutlined,
  DownloadOutlined,
  CloudDownloadOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { api } from "../../api/client";
import { ScrollPane } from "../../components/layout/ScrollPane";
import type { ToolRegistryEntry } from "./types";
import {
  compareToolVersions,
  normalizeToolVersion,
  type ToolCatalogEntry,
} from "./catalog";
import { useToolsCatalog } from "./useToolsCatalog";
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

type StoreStatus = "available" | "installed" | "updatable" | "unavailable";

function storeStatus(
  entry: ToolCatalogEntry,
  installed?: ToolRegistryEntry,
): StoreStatus {
  if (!entry.package?.url || !entry.version) return "unavailable";
  if (!installed) return "available";
  if (compareToolVersions(entry.version, installed.version) > 0) return "updatable";
  return "installed";
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
  const [storeOpen, setStoreOpen] = useState(false);
  const [storeInstallingId, setStoreInstallingId] = useState<string | null>(null);
  const [form] = Form.useForm<ToolFormValues>();

  const registryQuery = useQuery({
    queryKey: ["tools-registry"],
    queryFn: api.listTools,
  });
  const catalogQuery = useToolsCatalog();

  const platformTools = registryQuery.data?.tools ?? [];
  const catalogTools = catalogQuery.data?.tools ?? [];

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

  const installFromPath = async (path: string, options?: { expectToolId?: string }) => {
    const info = await api.inspectTool(path);
    if (options?.expectToolId && info.id !== options.expectToolId) {
      message.error(
        `安装包工具 id 为「${info.id}」，与当前工具「${options.expectToolId}」不一致`,
      );
      return;
    }

    const installed = platformTools.find((t) => t.id === info.id && t.source === "user");
    let force = false;

    if (installed || info.alreadyInstalled) {
      const localVer = installed?.version ?? info.installedVersion ?? "?";
      const sameVersion = localVer === info.version;
      const ok = await new Promise<boolean>((resolve) => {
        Modal.confirm({
          title: sameVersion ? "覆盖安装" : "更新工具",
          content: sameVersion
            ? `「${info.name}」v${localVer} 已安装，版本相同。是否停止服务并覆盖安装？`
            : `将「${info.name}」从 v${localVer} 更新到 v${info.version}。将先停止服务再安装，是否继续？`,
          okText: sameVersion ? "覆盖" : "更新",
          cancelText: "取消",
          onOk: () => resolve(true),
          onCancel: () => resolve(false),
        });
      });
      if (!ok) return;
      force = true;

      if (window.electronAPI?.stopTool) {
        await window.electronAPI.stopTool(info.id);
      }
    }

    const result = await api.installTool(path, { force });
    await queryClient.invalidateQueries({ queryKey: ["tools-registry"] });

    try {
      const ensure = window.electronAPI?.ensureTool ?? window.electronAPI?.ensureBuiltinTool;
      if (ensure) await ensure(result.tool.id);
    } catch (err) {
      message.warning(
        err instanceof Error
          ? `已安装，但自动启动失败: ${err.message}`
          : "已安装，但自动启动失败",
      );
      return;
    }

    if (result.tool.replaced) {
      message.success(
        result.tool.previousVersion && result.tool.previousVersion !== result.tool.version
          ? `已更新 ${result.tool.name} v${result.tool.previousVersion} → v${result.tool.version}`
          : `已覆盖安装 ${result.tool.name} v${result.tool.version}`,
      );
    } else {
      message.success(`已安装 ${result.tool.name} v${result.tool.version}`);
    }
  };

  const handleInstall = async (options?: { expectToolId?: string }) => {
    if (!window.electronAPI?.pickToolPackage) {
      message.warning("请在桌面客户端中安装工具包");
      return;
    }
    setInstalling(true);
    try {
      const path = await window.electronAPI.pickToolPackage();
      if (!path) return;
      await installFromPath(path, options);
    } catch (err) {
      message.error(err instanceof Error ? err.message : "安装失败");
    } finally {
      setInstalling(false);
    }
  };

  const handleStoreInstall = async (entry: ToolCatalogEntry) => {
    if (!entry.package?.url) {
      message.warning("该工具暂无安装包");
      return;
    }
    setStoreInstallingId(entry.id);
    try {
      let path: string;
      if (window.electronAPI?.downloadToolPackage) {
        path = await window.electronAPI.downloadToolPackage(
          entry.package.url,
          entry.package.filename,
        );
      } else {
        const fetched = await api.fetchToolPackage(
          entry.package.url,
          entry.package.filename,
        );
        path = fetched.path;
      }
      await installFromPath(path, { expectToolId: entry.id });
    } catch (err) {
      message.error(err instanceof Error ? err.message : "安装失败");
    } finally {
      setStoreInstallingId(null);
    }
  };

  const handleStoreDownload = (entry: ToolCatalogEntry) => {
    if (!entry.package?.url) {
      message.warning("该工具暂无安装包");
      return;
    }
    const href = api.toolPackageDownloadUrl(entry.package.url, entry.package.filename);
    const a = document.createElement("a");
    a.href = href;
    a.download = entry.package.filename || "tool.vettool.zip";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
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
        key: "update",
        icon: <CloudUploadOutlined />,
        label: "更新…",
        onClick: ({ domEvent }) => {
          domEvent.stopPropagation();
          void handleInstall({ expectToolId: tool.id });
        },
      },
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
          <Button
            icon={<CloudDownloadOutlined />}
            onClick={() => {
              setStoreOpen(true);
              void catalogQuery.refetch();
            }}
          >
            打开应用市场
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
        title="应用市场"
        open={storeOpen}
        onCancel={() => setStoreOpen(false)}
        footer={null}
        width="90%"
        style={{ maxWidth: 1200 }}
        centered
        destroyOnHidden
        className="tools-hub__store-modal"
      >
        <div className="tools-hub__store-modal-toolbar">
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0, flex: 1 }}>
            可一键安装，或下载安装包后使用「安装工具」本地安装。
            {catalogQuery.data?.updatedAt
              ? ` 目录更新于 ${new Date(catalogQuery.data.updatedAt).toLocaleString("zh-CN")}。`
              : ""}
          </Typography.Paragraph>
          <Space>
            <Button
              icon={<ReloadOutlined />}
              loading={catalogQuery.isFetching}
              onClick={() => void catalogQuery.refetch()}
            >
              刷新
            </Button>
            <Button
              icon={<UploadOutlined />}
              loading={installing}
              onClick={() => void handleInstall()}
            >
              安装工具
            </Button>
          </Space>
        </div>

        {catalogQuery.isError ? (
          <Alert
            type="warning"
            showIcon
            message="无法加载应用市场目录"
            description={
              catalogQuery.error instanceof Error
                ? catalogQuery.error.message
                : "请检查网络后刷新"
            }
            style={{ marginBottom: 16 }}
          />
        ) : null}

        {catalogQuery.isLoading ? (
          <div className="tools-hub__store-modal-loading">
            <Spin />
          </div>
        ) : catalogTools.length === 0 && !catalogQuery.isError ? (
          <Empty description="暂无已发布工具" />
        ) : (
          <div className="tools-hub__grid tools-hub__grid--store">
            {catalogTools.map((entry) => {
              const installed = platformTools.find((t) => t.id === entry.id);
              const status = storeStatus(entry, installed);
              const remoteVer = normalizeToolVersion(entry.version);
              const localVer = normalizeToolVersion(installed?.version);
              const busy = storeInstallingId === entry.id;

              return (
                <Card
                  key={entry.id}
                  className="tools-hub__card tools-hub__card--store"
                  size="small"
                  title={
                    <div className="tools-hub__card-title">
                      <BuiltinIcon icon={entry.icon} />
                      <span className="tools-hub__card-title-text">{entry.name}</span>
                    </div>
                  }
                >
                  <div className="tools-hub__meta">
                    <Tag>{remoteVer ? `v${remoteVer}` : "未发布"}</Tag>
                    {status === "installed" && <Tag color="success">已安装</Tag>}
                    {status === "updatable" && <Tag color="processing">可更新</Tag>}
                    {status === "available" && <Tag color="blue">可安装</Tag>}
                    {status === "unavailable" && <Tag>暂无包</Tag>}
                    {status === "updatable" && localVer ? <Tag>本地 v{localVer}</Tag> : null}
                  </div>
                  <Typography.Paragraph type="secondary" ellipsis={{ rows: 2 }}>
                    {entry.description || "—"}
                  </Typography.Paragraph>
                  <div className="tools-hub__store-actions">
                    {status === "available" || status === "updatable" ? (
                      <Button
                        type="primary"
                        size="small"
                        icon={
                          status === "updatable" ? <CloudDownloadOutlined /> : <DownloadOutlined />
                        }
                        loading={busy}
                        disabled={busy}
                        onClick={() => void handleStoreInstall(entry)}
                      >
                        {status === "updatable" ? "一键更新" : "一键安装"}
                      </Button>
                    ) : null}
                    {entry.package?.url ? (
                      <Button size="small" onClick={() => handleStoreDownload(entry)}>
                        下载包
                      </Button>
                    ) : null}
                    <Button
                      size="small"
                      type="link"
                      href={entry.releaseUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Release
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </Modal>

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
