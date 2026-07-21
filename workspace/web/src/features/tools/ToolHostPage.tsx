import { useEffect, useRef, useState } from "react";
import { Alert, Spin, Typography } from "antd";
import { LoadingOutlined } from "@ant-design/icons";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import { ScrollPane } from "../../components/layout/ScrollPane";
import { TOOL_MSG, toolWebOrigin, type ToolRegistryEntry } from "./types";
import "./tools.css";

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

  useEffect(() => {
    setReady(false);
    setIframeLoaded(false);
    setError(null);
  }, [apiOrigin, tool.id, iframeSrc]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (window.electronAPI?.ensureBuiltinTool) {
        try {
          await window.electronAPI.ensureBuiltinTool(tool.id);
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
        setError("工具暂不可用，请稍后重试");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiOrigin, tool.id]);

  useEffect(() => {
    const onMessage = async (event: MessageEvent) => {
      if (event.origin !== webOrigin) return;
      const data = event.data as { type?: string };
      if (data?.type !== TOOL_MSG.PICK_FOLDER) return;

      let path: string | null = null;
      if (window.electronAPI?.pickFolder) {
        path = await window.electronAPI.pickFolder();
      }

      iframeRef.current?.contentWindow?.postMessage(
        { type: TOOL_MSG.PICK_FOLDER_RESULT, path },
        webOrigin,
      );
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [webOrigin]);

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
        sandbox="allow-scripts allow-forms allow-popups allow-same-origin"
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

  const registryQuery = useQuery({
    queryKey: ["tools-registry"],
    queryFn: api.toolsRegistry,
  });

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

  const webOrigin = toolWebOrigin(builtinTool, isDev);
  const apiOrigin = `http://127.0.0.1:${isDev ? builtinTool.devPort : builtinTool.prodPort}`;

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
