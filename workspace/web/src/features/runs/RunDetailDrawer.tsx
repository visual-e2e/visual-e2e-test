import { useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Drawer, Popconfirm, Space, Tag, Typography, message } from "antd";
import { api, canOpenReport, reportUrl } from "../../api/client";
import { ReportLink } from "../../components/ReportLink";
import { useProject } from "../../context/ProjectContext";
import { downloadRunsArchive } from "./download-runs";
import { canCancelJob, canManageRunArtifacts, resolveRunId } from "./run-id";
import { formatRunSelection } from "./run-selection";
import { useRunDetail } from "./use-run-detail";

const STATUS_COLOR: Record<string, string> = {
  running: "processing",
  passed: "success",
  failed: "error",
  cancelled: "default",
  error: "error",
};

interface RunDetailDrawerProps {
  jobId: string | null;
  open: boolean;
  onClose: () => void;
}

export function RunDetailDrawer({ jobId, open, onClose }: RunDetailDrawerProps) {
  const qc = useQueryClient();
  const { projectId } = useProject();
  const job = useRunDetail(open ? jobId ?? undefined : undefined);
  const logRef = useRef<HTMLPreElement>(null);

  const cancelMut = useMutation({
    mutationFn: (id: string) => api.cancelRun(id),
    onSuccess: () => {
      message.success("任务已终止");
      void qc.invalidateQueries({ queryKey: ["runs", projectId] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  useEffect(() => {
    if (!logRef.current || !job?.logs.length) return;
    logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [job?.logs]);

  const handleDownload = async () => {
    const runId = job ? resolveRunId(job) : undefined;
    if (!projectId || !runId) return;
    const hide = message.loading("正在打包报告…", 0);
    try {
      const result = await downloadRunsArchive(projectId, [runId]);
      hide();
      if (result.status === "cancelled") message.info("已取消保存");
      else if (result.status === "saved") message.success(`已保存至 ${result.path}`);
      else message.success(`已保存到浏览器默认下载目录：${result.filename}`);
    } catch (e) {
      hide();
      message.error(e instanceof Error ? e.message : "下载失败");
    }
  };

  const headerExtra = job ? (
    <Space>
      {canCancelJob(job) ? (
        <Popconfirm
          title="终止当前运行？"
          description="将停止测试进程，已完成的场景结果可能不完整。"
          okText="终止"
          cancelText="取消"
          okButtonProps={{ danger: true }}
          onConfirm={() => cancelMut.mutate(job.jobId)}
        >
          <Button type="link" size="small" danger loading={cancelMut.isPending}>
            终止
          </Button>
        </Popconfirm>
      ) : null}
      {canOpenReport(job) ? <ReportLink href={reportUrl(job)!}>打开报告</ReportLink> : null}
      {canManageRunArtifacts(job) && resolveRunId(job) && projectId ? (
        <Button type="link" size="small" onClick={() => void handleDownload()}>
          下载 ZIP
        </Button>
      ) : null}
    </Space>
  ) : null;

  return (
    <Drawer
      title={job ? `运行详情: ${job.jobId}` : jobId ? `运行详情: ${jobId}` : "运行详情"}
      open={open}
      onClose={onClose}
      width={720}
      extra={headerExtra}
      styles={{
        body: {
          display: "flex",
          flexDirection: "column",
          height: "100%",
          overflow: "hidden",
        },
      }}
    >
      {job ? (
        <>
          <div style={{ flexShrink: 0 }}>
            <Tag color={STATUS_COLOR[job.status]} style={{ marginBottom: 12 }}>
              {job.status}
            </Tag>
            <Typography.Text type="secondary" style={{ display: "block", marginBottom: 12 }}>
              {formatRunSelection(job)}
            </Typography.Text>
          </div>
          <pre
            ref={logRef}
            style={{
              flex: 1,
              minHeight: 0,
              overflow: "auto",
              background: "#fafafa",
              padding: 12,
              fontSize: 12,
              userSelect: "text",
              margin: 0,
            }}
          >
            {job.logs.join("\n") || "暂无日志"}
          </pre>
        </>
      ) : open && jobId ? (
        <Typography.Text type="secondary">加载中…</Typography.Text>
      ) : null}
    </Drawer>
  );
}
