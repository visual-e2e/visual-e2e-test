import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Button,
  Card,
  Empty,
  Modal,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import {
  CodeOutlined,
  ExportOutlined,
  PauseOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  StopOutlined,
  VideoCameraOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { api } from "./api/client";
import { FIXED_DEFAULTS, loadCache, saveCache } from "./cache/store";
import {
  CreateScenarioModal,
  type CreateScenarioValues,
} from "./components/CreateScenarioModal";
import { RecordingList } from "./components/RecordingList";
import { ScenarioJsonDrawer } from "./components/ScenarioJsonDrawer";
import {
  TOOL_MSG,
  type HostProjectContext,
  type Recording,
  type RecorderSession,
  type ScenarioExport,
  type StepDraft,
} from "./types";
import "./app.css";

const ACTIVE = new Set(["starting", "preparing", "recording", "paused", "stopping"]);

const STATUS_LABEL: Record<string, string> = {
  starting: "正在启动浏览器",
  preparing: "浏览器已就绪",
  recording: "录制中",
  paused: "已暂停",
  stopping: "正在结束",
  stopped: "已结束",
  cancelled: "已取消",
  error: "错误",
};

const STATUS_COLOR: Record<string, string> = {
  starting: "processing",
  preparing: "default",
  recording: "success",
  paused: "warning",
  stopping: "processing",
  stopped: "default",
  error: "error",
};

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([`${JSON.stringify(data, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function isEmbedded(): boolean {
  try {
    return window.parent !== window;
  } catch {
    return true;
  }
}

function requestHostContext() {
  if (!isEmbedded()) return;
  window.parent.postMessage({ type: TOOL_MSG.PROJECT_CONTEXT_REQUEST }, "*");
}

function navigateHostToScenario(module: string, file: string) {
  if (!isEmbedded()) return;
  window.parent.postMessage(
    { type: TOOL_MSG.NAVIGATE_SCENARIO, module, scenario: file },
    "*",
  );
}

function parseScenarioFromUnknown(raw: unknown, allowEmptySteps = false): ScenarioExport {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("根节点须为 JSON 对象");
  }
  const record = raw as Record<string, unknown>;
  const setup = (record.setup as Record<string, unknown> | undefined) ?? {};
  const scenario: ScenarioExport = {
    id: String(record.id ?? "").trim(),
    name: String(record.name ?? "").trim(),
    module: String(record.module ?? "").trim(),
    enabled: record.enabled !== false,
    setup: {
      requiresLogin: setup.requiresLogin !== false,
      entryRoute: String(setup.entryRoute ?? ""),
    },
    steps: Array.isArray(record.steps) ? (record.steps as ScenarioExport["steps"]) : [],
  };
  if (!scenario.id) throw new Error("场景 id 不能为空");
  if (!scenario.name) throw new Error("场景名称不能为空");
  if (!scenario.module) throw new Error("模块不能为空");
  if (!allowEmptySteps && !scenario.steps.length) throw new Error("场景至少需要一个步骤");
  return scenario;
}

export function App() {
  const qc = useQueryClient();
  const [projectId, setProjectId] = useState("");
  const [hostContext, setHostContext] = useState<HostProjectContext | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [session, setSession] = useState<RecorderSession | null>(null);
  const [activeRecording, setActiveRecording] = useState<Recording | null>(null);
  const [jsonDrawerOpen, setJsonDrawerOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);

  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: api.projects,
  });

  const projectContextQuery = useQuery({
    queryKey: ["project-context", projectId],
    queryFn: () => api.projectContext(projectId),
    enabled: Boolean(projectId),
  });

  const baseUrl =
    (hostContext?.projectId === projectId ? hostContext.baseUrl : undefined)
    ?? projectContextQuery.data?.baseUrl
    ?? "";

  const createDefaults = useMemo((): CreateScenarioValues => {
    const cache = projectId ? loadCache(projectId) : null;
    return {
      scenarioId: cache?.scenarioId || FIXED_DEFAULTS.scenarioId,
      scenarioName: cache?.scenarioName || FIXED_DEFAULTS.scenarioName,
      module: cache?.module || FIXED_DEFAULTS.module,
      startUrl: cache?.startUrl || baseUrl || "",
      requiresLogin: cache?.requiresLogin ?? FIXED_DEFAULTS.requiresLogin,
      description: "",
    };
  }, [projectId, baseUrl, createOpen]);

  const editDefaults = useMemo((): CreateScenarioValues => {
    if (!activeRecording) {
      return createDefaults;
    }
    return {
      scenarioId: activeRecording.scenario.id,
      scenarioName: activeRecording.scenario.name,
      module: activeRecording.scenario.module,
      startUrl:
        activeRecording.sessionMeta.startUrl
        || activeRecording.scenario.setup.entryRoute
        || baseUrl
        || "",
      requiresLogin: activeRecording.scenario.setup.requiresLogin,
      description: activeRecording.description ?? "",
    };
  }, [activeRecording, baseUrl, createDefaults, editOpen]);

  useEffect(() => {
    requestHostContext();
    const onMessage = (event: MessageEvent) => {
      const data = event.data as {
        type?: string;
        projectId?: string;
        projectName?: string;
        baseUrl?: string;
        scenariosRelPath?: string;
      };
      if (data?.type === TOOL_MSG.PROJECT_CONTEXT && data.projectId) {
        setHostContext({
          type: TOOL_MSG.PROJECT_CONTEXT,
          projectId: data.projectId,
          projectName: data.projectName,
          baseUrl: data.baseUrl ?? "",
          scenariosRelPath: data.scenariosRelPath ?? `projects/${data.projectId}/scenarios`,
        });
        setProjectId(data.projectId);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    if (projectId) return;
    const first = projectsQuery.data?.projects[0]?.id;
    if (first) setProjectId(first);
  }, [projectId, projectsQuery.data]);

  const prevProjectIdRef = useRef(projectId);
  useEffect(() => {
    const prev = prevProjectIdRef.current;
    if (prev && prev !== projectId) {
      setActiveRecording(null);
      setSession(null);
      setSessionId(null);
    }
    prevProjectIdRef.current = projectId;
  }, [projectId]);

  const browserStatus = useQuery({
    queryKey: ["browser-status"],
    queryFn: api.browserStatus,
    refetchInterval: 30_000,
  });

  const recordingsQuery = useQuery({
    queryKey: ["recordings", projectId],
    queryFn: () => api.listRecordings(projectId),
    enabled: Boolean(projectId),
  });

  useEffect(() => {
    if (!projectId || activeRecording) return;
    const first = recordingsQuery.data?.recordings?.[0];
    if (!first) return;
    let cancelled = false;
    void api
      .getRecording(projectId, first.id)
      .then((recording) => {
        if (cancelled) return;
        setActiveRecording(recording);
        setSession(null);
        setSessionId(null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [projectId, activeRecording, recordingsQuery.data?.recordings]);

  const sessionQuery = useQuery({
    queryKey: ["session", sessionId],
    queryFn: () => api.getSession(sessionId!),
    enabled: Boolean(sessionId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && ACTIVE.has(status) ? 500 : false;
    },
  });

  useEffect(() => {
    if (sessionQuery.data) setSession(sessionQuery.data);
  }, [sessionQuery.data]);

  const createSessionMutation = useMutation({
    mutationFn: api.createSession,
    onSuccess: (data) => {
      setSessionId(data.sessionId);
      setSession(data);
      message.success("浏览器启动中");
    },
    onError: (err: Error) => message.error(err.message),
  });

  const commandMutation = useMutation({
    mutationFn: ({ id, command }: { id: string; command: "start" | "pause" | "resume" | "stop" }) =>
      api.command(id, command),
    onSuccess: async (data) => {
      setSession(data);
      if (data.status === "recording") message.success("开始录制");
      if (data.status === "stopped") {
        message.success("录制已结束");
        if (projectId && data.scenario && activeRecording) {
          try {
            const updated = await api.updateRecording(activeRecording.id, {
              projectId,
              scenario: data.scenario,
              sessionMeta: {
                ...data.meta,
                startUrl: data.startUrl,
              },
              status: "draft",
              clearImported: true,
            });
            setActiveRecording(updated);
            await qc.invalidateQueries({ queryKey: ["recordings", projectId] });
          } catch (err) {
            message.error(err instanceof Error ? err.message : "保存录制失败");
          }
        }
      }
    },
    onError: (err: Error) => message.error(err.message),
  });

  const displayScenario = useMemo((): ScenarioExport | null => {
    if (session && activeRecording && ACTIVE.has(session.status)) {
      const entryLink = session.steps.find((s) => s.type === "link" && s.url);
      return {
        id: session.meta.id,
        name: session.meta.name,
        module: session.meta.module,
        enabled: true,
        setup: {
          requiresLogin: session.meta.requiresLogin,
          entryRoute: entryLink?.url ?? activeRecording.scenario.setup.entryRoute,
        },
        steps: session.steps,
      };
    }
    if (session?.scenario && activeRecording) return session.scenario;
    if (activeRecording) return activeRecording.scenario;
    return null;
  }, [session, activeRecording]);

  const scenariosRelPath =
    (hostContext?.projectId === projectId ? hostContext.scenariosRelPath : undefined)
    ?? projectContextQuery.data?.scenariosRelPath
    ?? (projectId ? `projects/${projectId}/scenarios` : "scenarios");

  const scenarioSavePath = useMemo(() => {
    if (!displayScenario) return "";
    return `${scenariosRelPath}/${displayScenario.module}/${displayScenario.id || "scenario"}.json`;
  }, [displayScenario, scenariosRelPath]);

  const selectRecording = async (id: string) => {
    if (!projectId) return;
    if (sessionId && statusActive) {
      message.warning("请先结束当前录制");
      return;
    }
    try {
      const recording = await api.getRecording(projectId, id);
      setActiveRecording(recording);
      setSession(null);
      setSessionId(null);
    } catch (err) {
      message.error(err instanceof Error ? err.message : "打开失败");
    }
  };

  const createScenario = async (values: CreateScenarioValues) => {
    if (!projectId) {
      message.error("请先选择项目");
      return;
    }
    setCreating(true);
    try {
      saveCache(projectId, {
        scenarioId: values.scenarioId,
        scenarioName: values.scenarioName,
        module: values.module,
        startUrl: values.startUrl,
        requiresLogin: values.requiresLogin,
      });
      const description = values.description.trim();
      const scenario: ScenarioExport = {
        id: values.scenarioId.trim(),
        name: values.scenarioName.trim(),
        module: values.module.trim(),
        enabled: true,
        setup: {
          requiresLogin: values.requiresLogin,
          entryRoute: values.startUrl.trim(),
        },
        steps: [],
      };
      const recording = await api.createRecording({
        projectId,
        allowEmptySteps: true,
        ...(description ? { description } : {}),
        sessionMeta: {
          id: scenario.id,
          name: scenario.name,
          module: scenario.module,
          requiresLogin: scenario.setup.requiresLogin,
          startUrl: values.startUrl.trim(),
        },
        scenario,
      });
      setActiveRecording(recording);
      setSession(null);
      setSessionId(null);
      setCreateOpen(false);
      await qc.invalidateQueries({ queryKey: ["recordings", projectId] });
      message.success("场景已创建，可点击「启动浏览器」开始录制");
    } catch (err) {
      message.error(err instanceof Error ? err.message : "创建失败");
    } finally {
      setCreating(false);
    }
  };

  const saveScenarioMeta = async (values: CreateScenarioValues) => {
    if (!activeRecording || !projectId) {
      message.error("请先选择场景");
      return;
    }
    if (statusActive) {
      message.warning("请先结束当前录制");
      return;
    }
    setEditing(true);
    try {
      saveCache(projectId, {
        scenarioId: values.scenarioId,
        scenarioName: values.scenarioName,
        module: values.module,
        startUrl: values.startUrl,
        requiresLogin: values.requiresLogin,
      });
      const id = values.scenarioId.trim();
      const name = values.scenarioName.trim();
      const module = values.module.trim();
      const startUrl = values.startUrl.trim();
      const description = values.description.trim();
      const scenario: ScenarioExport = {
        id,
        name,
        module,
        enabled: activeRecording.scenario.enabled,
        setup: {
          requiresLogin: values.requiresLogin,
          entryRoute: startUrl,
        },
        steps: activeRecording.scenario.steps,
      };
      const idOrModuleChanged =
        id !== activeRecording.scenario.id || module !== activeRecording.scenario.module;
      const updated = await api.updateRecording(activeRecording.id, {
        projectId,
        scenario,
        description,
        sessionMeta: {
          id,
          name,
          module,
          requiresLogin: values.requiresLogin,
          startUrl,
        },
        allowEmptySteps: true,
        ...(idOrModuleChanged && activeRecording.status === "imported"
          ? { clearImported: true, status: "draft" as const }
          : {}),
      });
      setActiveRecording(updated);
      setEditOpen(false);
      await qc.invalidateQueries({ queryKey: ["recordings", projectId] });
      message.success(
        idOrModuleChanged && activeRecording.status === "imported"
          ? "已保存；ID 或模块已变更，需重新导入场景管理"
          : "已保存",
      );
    } catch (err) {
      message.error(err instanceof Error ? err.message : "保存失败");
    } finally {
      setEditing(false);
    }
  };

  const startRecordFor = async (recordingId: string) => {
    if (!projectId) return;
    if (sessionId && statusActive) {
      message.warning("请先结束当前录制");
      return;
    }
    try {
      const recording = await api.getRecording(projectId, recordingId);
      setActiveRecording(recording);
      if (sessionId) {
        await api.cancel(sessionId).catch(() => undefined);
        setSessionId(null);
        setSession(null);
      }
      const startUrl = recording.sessionMeta.startUrl || recording.scenario.setup.entryRoute || baseUrl;
      if (!startUrl) {
        message.error("缺少起始地址，请先编辑场景补充起始地址");
        return;
      }
      saveCache(projectId, {
        scenarioId: recording.scenario.id,
        scenarioName: recording.scenario.name,
        module: recording.scenario.module,
        startUrl,
        requiresLogin: recording.scenario.setup.requiresLogin,
      });
      createSessionMutation.mutate({
        startUrl,
        meta: {
          id: recording.scenario.id,
          name: recording.scenario.name,
          module: recording.scenario.module,
          requiresLogin: recording.scenario.setup.requiresLogin,
        },
      });
    } catch (err) {
      message.error(err instanceof Error ? err.message : "启动录制失败");
    }
  };

  const applyScenarioEdit = async (raw: unknown) => {
    if (!activeRecording || !projectId) throw new Error("请先选择场景");
    const scenario = parseScenarioFromUnknown(raw, true);
    const updated = await api.updateRecording(activeRecording.id, {
      projectId,
      scenario,
      sessionMeta: {
        id: scenario.id,
        name: scenario.name,
        module: scenario.module,
        requiresLogin: scenario.setup.requiresLogin,
        startUrl: activeRecording.sessionMeta.startUrl || scenario.setup.entryRoute,
      },
      allowEmptySteps: true,
      status: "draft",
      clearImported: true,
    });
    setActiveRecording(updated);
    await qc.invalidateQueries({ queryKey: ["recordings", projectId] });
  };

  const doImport = async (recordingId: string, overwrite = false) => {
    if (!projectId) throw new Error("请先选择项目");
    const result = await api.importRecording(recordingId, { projectId, overwrite });
    setActiveRecording(result.recording);
    await qc.invalidateQueries({ queryKey: ["recordings", projectId] });
    message.success(
      result.overwritten
        ? `已覆盖导入到 ${result.recording.importedFile}`
        : `已导入到 ${result.recording.importedFile}`,
    );
    navigateHostToScenario(result.recording.scenario.module, result.file);
    return result;
  };

  const importWithConfirm = async (recordingId: string, scenario: ScenarioExport) => {
    if (!projectId) {
      message.error("请先选择项目");
      return;
    }
    if (!scenario.steps.length) {
      message.error("暂无步骤，请先录制再导入");
      return;
    }
    const file = `${scenario.id}.json`;

    const confirmAndOverwrite = () =>
      new Promise<void>((resolve, reject) => {
        Modal.confirm({
          title: "场景已存在",
          content: `${scenario.module}/${file} 已存在，是否覆盖？`,
          okText: "覆盖导入",
          cancelText: "取消",
          onOk: () =>
            doImport(recordingId, true).then(() => resolve()).catch(reject),
          onCancel: () => resolve(),
        });
      });

    try {
      const { exists } = await api.scenarioExists(projectId, scenario.module, file);
      if (exists) {
        await confirmAndOverwrite();
        return;
      }
      await doImport(recordingId, false);
    } catch (err) {
      const error = err as Error & { status?: number; code?: string };
      if (error.status === 409 || error.code === "CONFLICT") {
        await confirmAndOverwrite();
        return;
      }
      message.error(error.message);
      throw error;
    }
  };

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!activeRecording || !displayScenario) throw new Error("请先选择场景");
      await importWithConfirm(activeRecording.id, displayScenario);
    },
    onError: (err: Error) => message.error(err.message),
  });

  const deleteRecording = async (id: string) => {
    if (!projectId) return;
    try {
      await api.deleteRecording(projectId, id);
      if (activeRecording?.id === id) {
        setActiveRecording(null);
        setJsonDrawerOpen(false);
        if (sessionId) {
          await api.cancel(sessionId).catch(() => undefined);
          setSessionId(null);
          setSession(null);
        }
      }
      await qc.invalidateQueries({ queryKey: ["recordings", projectId] });
      message.success("已删除");
    } catch (err) {
      message.error(err instanceof Error ? err.message : "删除失败");
    }
  };

  const patchRequiresLogin = async (checked: boolean) => {
    if (!activeRecording || !projectId || statusActive) return;
    const scenario = {
      ...activeRecording.scenario,
      setup: { ...activeRecording.scenario.setup, requiresLogin: checked },
    };
    const updated = await api.updateRecording(activeRecording.id, {
      projectId,
      scenario,
      sessionMeta: { ...activeRecording.sessionMeta, requiresLogin: checked },
      allowEmptySteps: true,
    });
    setActiveRecording(updated);
    await qc.invalidateQueries({ queryKey: ["recordings", projectId] });
  };

  const status = session?.status;
  const statusActive = status ? ACTIVE.has(status) : false;
  const canLaunch = Boolean(activeRecording) && (!sessionId || status === "stopped" || status === "cancelled" || status === "error");
  const canStart = status === "preparing" || status === "paused";
  const canStop = status === "recording" || status === "paused" || status === "preparing";

  const stepColumns: ColumnsType<StepDraft> = [
    {
      title: "#",
      width: 48,
      render: (_, __, index) => index + 1,
    },
    {
      title: "类型",
      dataIndex: "type",
      width: 88,
      render: (type: string) => <Tag>{type}</Tag>,
    },
    {
      title: "步骤 ID",
      dataIndex: "stepId",
      width: 88,
    },
    {
      title: "描述",
      dataIndex: "desc",
      ellipsis: true,
    },
    {
      title: "详情",
      ellipsis: true,
      render: (_, step) => {
        const detail = step.selector || step.url || (step.value != null && step.type !== "click" ? String(step.value) : "");
        return detail ? <Typography.Text code>{detail}</Typography.Text> : "—";
      },
    },
  ];

  const steps = displayScenario?.steps ?? [];

  return (
    <div className="recorder-page">
      <div className="recorder-header">
        <div>
          <Typography.Title level={4} style={{ margin: 0 }}>
            <VideoCameraOutlined /> 场景录制
          </Typography.Title>
          <Typography.Text type="secondary">
            先创建场景，再在列表中录制；结束后可编辑 JSON 并导入场景管理。
          </Typography.Text>
        </div>
      </div>

      {browserStatus.data && !browserStatus.data.ok && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message="测试浏览器未就绪"
          description={browserStatus.data.hints.join("；") || "请先在主项目设置中安装或配置浏览器"}
        />
      )}

      <div className="recorder-layout">
        <Card
          className="recorder-list-card"
          title="录制列表"
          size="small"
          extra={(
            <Button
              type="primary"
              size="small"
              icon={<PlusOutlined />}
              disabled={!projectId || statusActive}
              onClick={() => setCreateOpen(true)}
            >
              新建场景
            </Button>
          )}
        >
          <Typography.Text type="secondary" className="recorder-path-hint">
            {scenariosRelPath.replace(/\/scenarios$/, "/recordings")}
          </Typography.Text>
          <RecordingList
            recordings={recordingsQuery.data?.recordings ?? []}
            loading={recordingsQuery.isLoading}
            activeId={activeRecording?.id}
            recordingBusy={statusActive}
            onSelect={(id) => void selectRecording(id)}
            onEdit={(id) => {
              void (async () => {
                if (sessionId && statusActive) {
                  message.warning("请先结束当前录制");
                  return;
                }
                try {
                  await selectRecording(id);
                  setEditOpen(true);
                } catch (err) {
                  message.error(err instanceof Error ? err.message : "打开失败");
                }
              })();
            }}
            onImport={(id) => {
              void (async () => {
                try {
                  const rec = await api.getRecording(projectId, id);
                  setActiveRecording(rec);
                  await importWithConfirm(id, rec.scenario);
                } catch (err) {
                  message.error(err instanceof Error ? err.message : "导入失败");
                }
              })();
            }}
            onDelete={(id) => void deleteRecording(id)}
          />
        </Card>

        <Card
          className="recorder-detail-card"
          size="small"
          title={activeRecording ? activeRecording.scenario.name : "场景详情"}
          extra={activeRecording ? (
            <Space wrap>
              <Button
                icon={<ExportOutlined />}
                loading={importMutation.isPending}
                disabled={!steps.length || statusActive}
                onClick={() => importMutation.mutate()}
              >
                导入到场景管理
              </Button>
              <Button icon={<CodeOutlined />} onClick={() => setJsonDrawerOpen(true)}>
                JSON
              </Button>
            </Space>
          ) : null}
        >
          {!activeRecording ? (
            <Empty description="请选择或新建场景" />
          ) : (
            <div className="recorder-detail">
              <div className="recorder-detail__meta">
                <Space wrap size="middle">
                  <Typography.Text>
                    <Typography.Text type="secondary">ID </Typography.Text>
                    {activeRecording.scenario.id}
                  </Typography.Text>
                  <Typography.Text>
                    <Typography.Text type="secondary">模块 </Typography.Text>
                    {activeRecording.scenario.module}
                  </Typography.Text>
                  <Space size={6}>
                    <Typography.Text type="secondary">需要登录</Typography.Text>
                    <Switch
                      checked={activeRecording.scenario.setup.requiresLogin}
                      disabled={statusActive}
                      onChange={(v) => void patchRequiresLogin(v)}
                    />
                  </Space>
                  <Typography.Text ellipsis style={{ maxWidth: 360 }}>
                    <Typography.Text type="secondary">起始 </Typography.Text>
                    {activeRecording.sessionMeta.startUrl || activeRecording.scenario.setup.entryRoute || "—"}
                  </Typography.Text>
                </Space>
              </div>

              <Space wrap className="recorder-detail__actions">
                <Button
                  type="primary"
                  icon={<PlayCircleOutlined />}
                  onClick={() => void startRecordFor(activeRecording.id)}
                  loading={createSessionMutation.isPending || status === "starting"}
                  disabled={!canLaunch}
                >
                  启动浏览器
                </Button>
                <Button
                  type="primary"
                  icon={<VideoCameraOutlined />}
                  onClick={() => sessionId && commandMutation.mutate({ id: sessionId, command: "start" })}
                  loading={commandMutation.isPending}
                  disabled={!canStart}
                >
                  开始录制
                </Button>
                {status === "recording" && (
                  <Button
                    icon={<PauseOutlined />}
                    onClick={() => sessionId && commandMutation.mutate({ id: sessionId, command: "pause" })}
                  >
                    暂停
                  </Button>
                )}
                {status === "paused" && (
                  <Button
                    icon={<PlayCircleOutlined />}
                    onClick={() => sessionId && commandMutation.mutate({ id: sessionId, command: "resume" })}
                  >
                    继续
                  </Button>
                )}
                <Button
                  danger
                  icon={<StopOutlined />}
                  onClick={() => sessionId && commandMutation.mutate({ id: sessionId, command: "stop" })}
                  disabled={!canStop}
                  loading={status === "stopping"}
                >
                  结束录制
                </Button>
                {session && (
                  <Tag color={STATUS_COLOR[session.status] ?? "default"}>
                    {STATUS_LABEL[session.status] ?? session.status}
                  </Tag>
                )}
              </Space>

              {session?.currentUrl && (
                <Typography.Text type="secondary" ellipsis className="recorder-detail__url">
                  当前页面：{session.currentUrl}
                </Typography.Text>
              )}
              {session?.error && <Alert type="error" showIcon message={session.error} />}

              <Table
                className="recorder-steps-table"
                size="small"
                rowKey={(row, index) => `${row.stepId}-${index}`}
                columns={stepColumns}
                dataSource={steps}
                pagination={false}
                locale={{ emptyText: "暂无步骤，点击「启动浏览器」后开始录制" }}
                scroll={{ y: "calc(100vh - 360px)" }}
              />
            </div>
          )}
        </Card>
      </div>

      <CreateScenarioModal
        open={createOpen}
        mode="create"
        defaults={createDefaults}
        confirmLoading={creating}
        onCancel={() => setCreateOpen(false)}
        onSubmit={createScenario}
      />

      <CreateScenarioModal
        open={editOpen}
        mode="edit"
        defaults={editDefaults}
        confirmLoading={editing}
        onCancel={() => setEditOpen(false)}
        onSubmit={saveScenarioMeta}
      />

      <ScenarioJsonDrawer
        open={jsonDrawerOpen && Boolean(displayScenario)}
        onClose={() => setJsonDrawerOpen(false)}
        title={`JSON: ${displayScenario?.name || displayScenario?.id || "场景"}`}
        savePath={scenarioSavePath}
        data={displayScenario}
        onCopy={() => {
          if (!displayScenario) return;
          void navigator.clipboard.writeText(JSON.stringify(displayScenario, null, 2));
          message.success("已复制 JSON");
        }}
        onDownload={() => {
          if (!displayScenario) return;
          downloadJson(`${displayScenario.id || "scenario"}.json`, displayScenario);
        }}
        onApplyEdit={applyScenarioEdit}
        onImport={() => importMutation.mutateAsync()}
        importing={importMutation.isPending}
      />
    </div>
  );
}
