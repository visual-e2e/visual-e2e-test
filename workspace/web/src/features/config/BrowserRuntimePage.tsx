import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert, Button, Card, List, Radio, Space, Tag, Typography, message,
} from "antd";
import {
  CloudDownloadOutlined, FolderOpenOutlined, ReloadOutlined, SearchOutlined,
} from "@ant-design/icons";
import { Link } from "react-router-dom";
import {
  api, BROWSER_COMPATIBILITY, type BrowserCheckResponse, type BrowserCompatibility,
} from "../../api/client";
import { ScrollPane } from "../../components/layout/ScrollPane";

const COMPATIBILITY_META = {
  [BROWSER_COMPATIBILITY.EXACT]: { label: "引擎匹配", color: "success" },
  [BROWSER_COMPATIBILITY.DIFFERENT]: { label: "引擎不匹配", color: "warning" },
  [BROWSER_COMPATIBILITY.UNKNOWN]: null,
} satisfies Record<BrowserCompatibility, { label: string; color: string } | null>;

function statusTag(check: BrowserCheckResponse | undefined) {
  if (!check) return <Tag>检测中</Tag>;
  if (check.ok) return <Tag color="success">已就绪</Tag>;
  if (check.status === "invalid") return <Tag color="error">路径无效</Tag>;
  return <Tag color="warning">未配置</Tag>;
}

function compatibilityTag(compatibility: BrowserCompatibility | undefined) {
  const meta = compatibility ? COMPATIBILITY_META[compatibility] : null;
  return meta ? <Tag color={meta.color}>{meta.label}</Tag> : null;
}

function displayBrowserPath(path: string): string {
  const appEnd = path.toLowerCase().indexOf(".app/");
  return appEnd >= 0 ? path.slice(0, appEnd + 4) : path;
}

export function BrowserRuntimePage() {
  const qc = useQueryClient();
  const [mode, setMode] = useState<"managed" | "custom">("managed");
  const [installJobId, setInstallJobId] = useState<string | null>(null);

  const runtimeQuery = useQuery({
    queryKey: ["browser-runtime"],
    queryFn: api.getBrowserRuntime,
  });

  const detectQuery = useQuery({
    queryKey: ["browser-detect"],
    queryFn: api.detectBrowsers,
  });

  useEffect(() => {
    if (runtimeQuery.data?.runtime.mode) {
      setMode(runtimeQuery.data.runtime.mode);
    }
  }, [runtimeQuery.data?.runtime.mode]);

  const installPoll = useQuery({
    queryKey: ["browser-install", installJobId],
    queryFn: () => api.getBrowserInstallJob(installJobId!),
    enabled: !!installJobId,
    refetchInterval: (q) => {
      const status = q.state.data?.status;
      return status === "running" ? 1000 : false;
    },
  });

  useEffect(() => {
    const job = installPoll.data;
    if (!job) return;
    if (job.status === "done") {
      message.success("Playwright 运行组件安装完成");
      setInstallJobId(null);
      qc.invalidateQueries({ queryKey: ["browser-runtime"] });
      qc.invalidateQueries({ queryKey: ["browser-check"] });
    } else if (job.status === "failed") {
      message.error(job.error ?? "安装失败");
      setInstallJobId(null);
    }
  }, [installPoll.data, qc]);

  const installMut = useMutation({
    mutationFn: api.installBrowser,
    onSuccess: (job) => {
      setInstallJobId(job.jobId);
      message.info("开始下载 Playwright 运行组件…");
    },
    onError: (e: Error) => message.error(e.message),
  });

  const setManagedMut = useMutation({
    mutationFn: () => api.saveBrowserRuntime({ mode: "managed" }),
    onSuccess: () => {
      message.success("已切换为一键安装模式");
      qc.invalidateQueries({ queryKey: ["browser-runtime"] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  const pickMut = useMutation({
    mutationFn: async () => {
      const path = await window.electronAPI?.pickExecutable?.();
      if (!path) return null;
      return api.saveBrowserRuntime({ executablePath: path });
    },
    onSuccess: (res) => {
      if (!res) return;
      message.success("已保存浏览器路径");
      qc.invalidateQueries({ queryKey: ["browser-runtime"] });
      qc.invalidateQueries({ queryKey: ["browser-check"] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  const useCandidateMut = useMutation({
    mutationFn: (path: string) => api.saveBrowserRuntime({ executablePath: path }),
    onSuccess: () => {
      message.success("已应用检测到的浏览器");
      qc.invalidateQueries({ queryKey: ["browser-runtime"] });
      qc.invalidateQueries({ queryKey: ["browser-check"] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  const runtime = runtimeQuery.data?.runtime;
  const check = runtimeQuery.data?.check;
  const engineVersion = runtimeQuery.data?.engineVersion ?? "";
  const currentVersion = check?.version.match(/\d+(?:\.\d+){3}/)?.[0] ?? "";
  const currentCompatibility: BrowserCompatibility = check?.mode === "managed"
    ? check.ok ? BROWSER_COMPATIBILITY.EXACT : BROWSER_COMPATIBILITY.UNKNOWN
    : currentVersion && engineVersion
      ? currentVersion === engineVersion
        ? BROWSER_COMPATIBILITY.EXACT
        : BROWSER_COMPATIBILITY.DIFFERENT
      : BROWSER_COMPATIBILITY.UNKNOWN;
  const installing = installMut.isPending || installPoll.data?.status === "running";
  const needsRecordingComponent = mode === "custom"
    && check?.ok === false
    && check.hints.some((hint) => hint.includes("录屏组件"));

  return (
    <ScrollPane>
      <Typography.Title level={4}>浏览器环境</Typography.Title>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="测试浏览器与安装包分离，首次使用需安装或指定本机 Chrome/Chromium。"
        description={(
          <Space direction="vertical" size={0}>
            <span>推荐使用「一键安装」，将下载与当前引擎版本匹配的 Chromium。</span>
            {engineVersion ? (
              <span>
                当前引擎匹配的 Chromium 版本：<Typography.Text code>{engineVersion}</Typography.Text>
              </span>
            ) : null}
          </Space>
        )}
      />

      <Card
        size="small"
        title="当前状态"
        style={{ marginBottom: 16 }}
        extra={(
          <Space size="small">
            {compatibilityTag(currentCompatibility)}
            {statusTag(check)}
          </Space>
        )}
      >
        {check ? (
          <Space direction="vertical" style={{ width: "100%" }}>
            <div>
              <Typography.Text type="secondary">平台：</Typography.Text> {check.platform}
            </div>
            <div>
              <Typography.Text type="secondary">模式：</Typography.Text>{" "}
              {check.mode === "managed" ? "应用管理（Playwright Chromium）" : "本机浏览器"}
            </div>
            {check.path ? (
              <div>
                <Typography.Text type="secondary">路径：</Typography.Text>{" "}
                <Typography.Text code>{displayBrowserPath(check.path)}</Typography.Text>
              </div>
            ) : null}
            {check.version ? (
              <div>
                <Typography.Text type="secondary">版本：</Typography.Text> {check.version}
              </div>
            ) : null}
            {!check.ok && check.hints.length > 0 ? (
              <Alert type="warning" showIcon message={check.hints.join(" ")} />
            ) : null}
          </Space>
        ) : (
          "加载中…"
        )}
      </Card>

      <Card size="small" title="配置方式" style={{ marginBottom: 16 }}>
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          <Radio.Group
            value={mode}
            onChange={(e) => {
              const next = e.target.value as "managed" | "custom";
              setMode(next);
              if (next === "managed") setManagedMut.mutate();
            }}
          >
            <Radio.Button value="managed">一键安装（推荐）</Radio.Button>
            <Radio.Button value="custom">本机浏览器</Radio.Button>
          </Radio.Group>

          {mode === "managed" ? (
            <Space wrap size="middle">
              <Button
                type="primary"
                icon={<CloudDownloadOutlined />}
                loading={installing}
                onClick={() => installMut.mutate()}
              >
                {installing ? "安装中…" : "一键安装测试浏览器"}
              </Button>
              {runtime?.managed.browsersPath ? (
                <Typography.Text type="secondary">
                  安装目录：{runtime.managed.browsersPath}
                </Typography.Text>
              ) : null}
            </Space>
          ) : (
            <Space direction="vertical" size="small" style={{ width: "100%" }}>
              <Space wrap size="middle">
                <Button
                  type="primary"
                  icon={<FolderOpenOutlined />}
                  loading={pickMut.isPending}
                  onClick={() => pickMut.mutate()}
                  disabled={!window.electronAPI?.pickExecutable}
                >
                  选择浏览器
                </Button>
                {needsRecordingComponent ? (
                  <Button
                    icon={<CloudDownloadOutlined />}
                    loading={installing}
                    onClick={() => installMut.mutate()}
                  >
                    {installing ? "安装中…" : "安装录屏组件"}
                  </Button>
                ) : null}
                {!window.electronAPI?.pickExecutable ? (
                  <Typography.Text type="secondary">
                    浏览器选择需在桌面客户端中使用；Web 开发模式请使用一键安装。
                  </Typography.Text>
                ) : null}
              </Space>
              {runtime?.custom.executablePath ? (
                <Typography.Text type="secondary">
                  当前：{displayBrowserPath(runtime.custom.executablePath)}
                </Typography.Text>
              ) : null}
            </Space>
          )}
        </Space>
      </Card>

      {installPoll.data && installPoll.data.logs.length > 0 ? (
        <Card size="small" title="安装日志" style={{ marginBottom: 16 }}>
          <pre style={{ margin: 0, maxHeight: 200, overflow: "auto", fontSize: 12 }}>
            {installPoll.data.logs.join("\n")}
          </pre>
        </Card>
      ) : null}

      <Card
        size="small"
        title="自动检测"
        extra={(
          <Button
            size="small"
            icon={<ReloadOutlined />}
            onClick={() => detectQuery.refetch()}
            loading={detectQuery.isFetching}
          >
            刷新
          </Button>
        )}
      >
        <List
          loading={detectQuery.isLoading}
          locale={{ emptyText: "未检测到本机 Chrome/Chromium" }}
          dataSource={detectQuery.data?.candidates ?? []}
          renderItem={(item) => (
            <List.Item
              actions={[
                <Button
                  key="open-path"
                  size="small"
                  icon={<FolderOpenOutlined />}
                  disabled={!window.electronAPI?.showItemInFolder}
                  onClick={() => {
                    void window.electronAPI?.showItemInFolder(displayBrowserPath(item.path));
                  }}
                >
                  打开路径
                </Button>,
                <Button
                  key="use"
                  size="small"
                  type="primary"
                  icon={<SearchOutlined />}
                  onClick={() => useCandidateMut.mutate(item.path)}
                >
                  使用
                </Button>,
              ]}
            >
              <List.Item.Meta
                title={(
                  <Space size="small" wrap>
                    <span>{item.label}</span>
                    {item.path === check?.path ? <Tag color="blue">当前使用</Tag> : null}
                    {compatibilityTag(item.compatibility)}
                  </Space>
                )}
                description={displayBrowserPath(item.path)}
              />
            </List.Item>
          )}
        />
      </Card>

      <Space size="middle" style={{ marginTop: 16 }}>
        <Button icon={<ReloadOutlined />} onClick={() => runtimeQuery.refetch()}>
          重新检测
        </Button>
        <Link to="/runs">前往运行中心</Link>
      </Space>
    </ScrollPane>
  );
}
