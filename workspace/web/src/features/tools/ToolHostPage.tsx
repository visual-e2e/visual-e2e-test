import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Spin, Typography, message } from "antd";
import { LoadingOutlined } from "@ant-design/icons";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import { useProject } from "../../context/ProjectContext";
import { ScrollPane } from "../../components/layout/ScrollPane";
import { getCustomTool, isCustomToolId, type CustomTool } from "./custom-tools-store";
import {
  TOOL_MSG,
  toolApiOrigin,
  toolWebOrigin,
  type ToolProjectContextMessage,
  type ToolRegistryEntry,
} from "./types";
import {
  attachHostRpcBridge,
  normalizeCapabilities,
  notifyTool,
} from "@vet/rpc/host-bridge";
import "./tools.css";

function parseBaseUrlFromEnv(content: string): string {
  const match = content.match(/^BASE_URL=(.*)$/m);
  if (!match) return "";
  return match[1].trim().replace(/^["']|["']$/g, "");
}

interface BuiltinHostFrameProps {
  tool: ToolRegistryEntry;
  iframeSrc: string;
  apiOrigin: string;
}

function BuiltinHostFrame({ tool, iframeSrc, apiOrigin }: BuiltinHostFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const webOrigin = toolWebOrigin(tool, import.meta.env.DEV);
  const { projectId, projects } = useProject();
  const navigate = useNavigate();

  const envQuery = useQuery({
    queryKey: ["env", projectId],
    queryFn: api.getEnv,
    enabled: Boolean(projectId),
  });

  const buildProjectContext = useCallback((): ToolProjectContextMessage | null => {
    if (!projectId) return null;
    const project = projects.find((p) => p.id === projectId);
    return {
      type: TOOL_MSG.PROJECT_CONTEXT,
      projectId,
      projectName: project?.name,
      baseUrl: parseBaseUrlFromEnv(envQuery.data?.content ?? ""),
      scenariosRelPath: `projects/${projectId}/scenarios`,
    };
  }, [projectId, projects, envQuery.data?.content]);

  const pushProjectContext = useCallback(() => {
    const payload = buildProjectContext();
    if (!payload || !iframeRef.current?.contentWindow) return;
    iframeRef.current.contentWindow.postMessage(payload, webOrigin);
    notifyTool(iframeRef.current.contentWindow, webOrigin, "project.contextChanged", {
      projectId: payload.projectId,
      projectName: payload.projectName,
      baseUrl: payload.baseUrl,
      scenariosRelPath: payload.scenariosRelPath,
    });
  }, [buildProjectContext, webOrigin]);

  useEffect(() => {
    setReady(false);
    setIframeLoaded(false);
    setError(null);
  }, [apiOrigin, tool.id, iframeSrc]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ensure = window.electronAPI?.ensureTool ?? window.electronAPI?.ensureBuiltinTool;
      if (ensure) {
        try {
          await ensure(tool.id);
        } catch (err) {
          if (!cancelled) {
            setError(err instanceof Error ? err.message : "工具启动失败");
          }
          return;
        }
      }

      const healthUrl = `${apiOrigin}/api/health`;
      const started = Date.now();
      while (Date.now() - started < 20_000) {
        if (cancelled) return;
        try {
          const res = await fetch(healthUrl, { signal: AbortSignal.timeout(1500) });
          if (res.ok) {
            setReady(true);
            return;
          }
        } catch {
          // retry
        }
        await new Promise((r) => setTimeout(r, 400));
      }
      if (!cancelled) {
        setError("工具暂不可用，请确认已安装工具包并稍后重试");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiOrigin, tool.id]);

  useEffect(() => {
    if (iframeLoaded && ready) {
      pushProjectContext();
    }
  }, [iframeLoaded, ready, pushProjectContext]);

  useEffect(() => {
    const capabilities = normalizeCapabilities(tool.capabilities);
    const detachRpc = attachHostRpcBridge({
      webOrigin,
      capabilities,
      getContentWindow: () => iframeRef.current?.contentWindow,
      handlers: {
        getProjectContext: () => {
          const ctx = buildProjectContext();
          if (!ctx) return null;
          return {
            projectId: ctx.projectId,
            projectName: ctx.projectName,
            baseUrl: ctx.baseUrl,
            scenariosRelPath: ctx.scenariosRelPath,
          };
        },
        pickFolder: async () => {
          if (window.electronAPI?.pickFolder) {
            return window.electronAPI.pickFolder();
          }
          return null;
        },
        navigateScenario: (module, scenario) => {
          message.success(`已导入场景，正在打开 ${module}/${scenario}`);
          navigate(
            `/scenarios?module=${encodeURIComponent(module)}&scenario=${encodeURIComponent(scenario)}`,
          );
        },
      },
    });

    const onLegacyMessage = async (event: MessageEvent) => {
      if (event.origin !== webOrigin) return;
      const data = event.data as {
        type?: string;
        module?: string;
        scenario?: string;
      };

      if (data?.type === TOOL_MSG.PICK_FOLDER) {
        let path: string | null = null;
        if (window.electronAPI?.pickFolder) {
          path = await window.electronAPI.pickFolder();
        }
        iframeRef.current?.contentWindow?.postMessage(
          { type: TOOL_MSG.PICK_FOLDER_RESULT, path },
          webOrigin,
        );
        return;
      }

      if (data?.type === TOOL_MSG.PROJECT_CONTEXT_REQUEST) {
        pushProjectContext();
        return;
      }

      if (data?.type === TOOL_MSG.NAVIGATE_SCENARIO) {
        const module = data.module?.trim();
        const scenario = data.scenario?.trim();
        if (!module || !scenario) return;
        message.success(`已导入场景，正在打开 ${module}/${scenario}`);
        navigate(`/scenarios?module=${encodeURIComponent(module)}&scenario=${encodeURIComponent(scenario)}`);
      }
    };

    window.addEventListener("message", onLegacyMessage);
    return () => {
      detachRpc();
      window.removeEventListener("message", onLegacyMessage);
    };
  }, [webOrigin, pushProjectContext, navigate, buildProjectContext, tool.capabilities]);

  if (error) {
    return (
      <ScrollPane>
        <Alert type="warning" message={error} showIcon />
      </ScrollPane>
    );
  }

  if (!ready) {
    return (
      <div className="tool-host__loading">
        <div className="tool-host__loading-inner">
          <Spin indicator={<LoadingOutlined style={{ fontSize: 32 }} spin />} />
          <Typography.Text type="secondary">正在连接 {tool.name}…</Typography.Text>
        </div>
      </div>
    );
  }

  return (
    <>
      {!iframeLoaded && (
        <div className="tool-host__loading">
          <div className="tool-host__loading-inner">
            <Spin indicator={<LoadingOutlined style={{ fontSize: 32 }} spin />} />
            <Typography.Text type="secondary">正在加载 {tool.name}…</Typography.Text>
          </div>
        </div>
      )}
      <iframe
        ref={iframeRef}
        className="tool-host__iframe"
        src={iframeSrc}
        title={tool.name}
        sandbox="allow-scripts allow-forms allow-popups allow-same-origin allow-downloads"
        referrerPolicy="no-referrer"
        style={{ opacity: iframeLoaded ? 1 : 0 }}
        onLoad={() => setIframeLoaded(true)}
      />
    </>
  );
}

function CustomHostFrame({ tool }: { tool: CustomTool }) {
  const [iframeLoaded, setIframeLoaded] = useState(false);

  return (
    <>
      {!iframeLoaded && (
        <div className="tool-host__loading">
          <div className="tool-host__loading-inner">
            <Spin indicator={<LoadingOutlined style={{ fontSize: 32 }} spin />} />
            <Typography.Text type="secondary">正在加载 {tool.name}…</Typography.Text>
          </div>
        </div>
      )}
      <iframe
        className="tool-host__iframe"
        src={tool.url}
        title={tool.name}
        sandbox="allow-scripts allow-forms allow-popups allow-same-origin allow-downloads"
        referrerPolicy="no-referrer"
        style={{ opacity: iframeLoaded ? 1 : 0 }}
        onLoad={() => setIframeLoaded(true)}
      />
    </>
  );
}

export function ToolHostPage() {
  const { toolId } = useParams<{ toolId: string }>();
  const isDev = import.meta.env.DEV;
  const isCustomTool = Boolean(toolId && isCustomToolId(toolId));
  const customTool = isCustomTool && toolId ? getCustomTool(toolId) : undefined;

  const registryQuery = useQuery({
    queryKey: ["tools-registry"],
    queryFn: api.listTools,
    enabled: !isCustomTool,
  });

  if (customTool?.openMode === "embedded") {
    return (
      <div className="tool-host">
        <CustomHostFrame tool={customTool} />
      </div>
    );
  }

  if (isCustomTool) {
    return (
      <ScrollPane>
        <Typography.Text type="danger">
          {customTool ? "该工具配置为新窗口打开" : `未找到工具: ${toolId}`}
        </Typography.Text>
      </ScrollPane>
    );
  }

  const builtinTool = registryQuery.data?.tools.find((t) => t.id === toolId);

  if (registryQuery.isLoading) {
    return (
      <div className="tool-host__loading">
        <div className="tool-host__loading-inner">
          <Spin indicator={<LoadingOutlined style={{ fontSize: 32 }} spin />} />
          <Typography.Text type="secondary">正在加载…</Typography.Text>
        </div>
      </div>
    );
  }

  if (!builtinTool) {
    return (
      <ScrollPane>
        <Typography.Text type="danger">未找到工具: {toolId}</Typography.Text>
      </ScrollPane>
    );
  }

  if (builtinTool.compatible === false) {
    return (
      <ScrollPane>
        <Alert
          type="warning"
          showIcon
          message={`${builtinTool.name}（v${builtinTool.version ?? "?"}）与当前主应用协议不兼容`}
          description={builtinTool.incompatibleReason || "请更新工具后重新安装"}
        />
      </ScrollPane>
    );
  }

  const webOrigin = toolWebOrigin(builtinTool, isDev);
  const apiOrigin = toolApiOrigin(builtinTool, isDev);

  return (
    <div className="tool-host">
      <BuiltinHostFrame
        tool={builtinTool}
        iframeSrc={`${webOrigin}/`}
        apiOrigin={apiOrigin}
      />
    </div>
  );
}
