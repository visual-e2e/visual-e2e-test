import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Typography, Table, Button, Tag, Drawer, Popconfirm, message,
} from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import { api, reportUrl } from "../../api/client";
import { useProject } from "../../context/ProjectContext";
import type { RunJob } from "../../types/module";
import { RunLaunchPanel } from "./RunLaunchPanel";
import { EnvConfigPanel } from "./EnvConfigPanel";
import { formatRunSelection } from "./run-selection";

export function RunCenterPage() {
  const qc = useQueryClient();
  const location = useLocation();
  const { projectId } = useProject();
  const [detailJob, setDetailJob] = useState<RunJob | null>(null);

  const runsQuery = useQuery({
    queryKey: ["runs", projectId],
    queryFn: api.listRuns,
    enabled: !!projectId,
    refetchInterval: (q) =>
      q.state.data?.some((j) => j.status === "running") ? 2000 : false,
  });

  const cancelMut = useMutation({
    mutationFn: (jobId: string) => api.cancelRun(jobId),
    onSuccess: () => {
      message.success("任务已终止");
      void qc.invalidateQueries({ queryKey: ["runs", projectId] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  useEffect(() => {
    const jobId = (location.state as { jobId?: string })?.jobId;
    if (jobId) {
      api.getRun(jobId).then(setDetailJob).catch(() => undefined);
    }
  }, [location.state]);

  useEffect(() => {
    if (!detailJob || detailJob.status !== "running") return;
    const fresh = runsQuery.data?.find((j) => j.jobId === detailJob.jobId);
    if (fresh) setDetailJob(fresh);
  }, [runsQuery.data, detailJob?.jobId, detailJob?.status]);

  const statusColor: Record<string, string> = {
    running: "processing",
    passed: "success",
    failed: "error",
    cancelled: "default",
    error: "error",
  };

  const openDetail = (row: RunJob) => {
    setDetailJob(row);
    if (row.status !== "running") return;
    api.getRun(row.jobId).then((fresh) => {
      if (fresh) setDetailJob(fresh);
    }).catch(() => undefined);
  };

  return (
    <div style={{ padding: 24 }}>
      <Typography.Title level={4}>运行中心</Typography.Title>

      <EnvConfigPanel />

      <RunLaunchPanel />

      <Button icon={<ReloadOutlined />} onClick={() => runsQuery.refetch()} style={{ marginBottom: 16 }}>
        刷新历史
      </Button>

      <Table
        rowKey="jobId"
        loading={runsQuery.isLoading}
        dataSource={runsQuery.data ?? []}
        columns={[
          { title: "Job ID", dataIndex: "jobId", ellipsis: true },
          {
            title: "状态",
            dataIndex: "status",
            render: (s: string) => <Tag color={statusColor[s]}>{s}</Tag>,
          },
          {
            title: "运行范围",
            render: (_, row: RunJob) => formatRunSelection(row),
          },
          { title: "开始", dataIndex: "startedAt", width: 200 },
          {
            title: "报告",
            render: (_, row) =>
              reportUrl(row) ? (
                <a href={reportUrl(row)} target="_blank" rel="noreferrer">查看</a>
              ) : "—",
          },
          {
            title: "操作",
            width: 120,
            align: "center",
            render: (_, row) => (
              <div style={{ display: "inline-flex", width: 96, justifyContent: "center" }}>
                <Button
                  type="link"
                  size="small"
                  onClick={() => openDetail(row)}
                  style={{ width: 44, paddingInline: 0 }}
                >
                  详情
                </Button>
                {row.cancellable ? (
                  <Popconfirm
                    title="终止当前运行？"
                    description="将停止测试进程，已完成的场景结果可能不完整。"
                    okText="终止"
                    cancelText="取消"
                    okButtonProps={{ danger: true }}
                    onConfirm={() => cancelMut.mutate(row.jobId)}
                  >
                    <Button
                      type="link"
                      size="small"
                      danger
                      loading={cancelMut.isPending}
                      style={{ width: 44, paddingInline: 0 }}
                    >
                      终止
                    </Button>
                  </Popconfirm>
                ) : (
                  <span style={{ width: 44, flexShrink: 0 }} aria-hidden />
                )}
              </div>
            ),
          },
        ]}
      />

      <Drawer
        title={detailJob ? `运行详情: ${detailJob.jobId}` : "运行详情"}
        open={!!detailJob}
        onClose={() => setDetailJob(null)}
        width={720}
        extra={
          detailJob && reportUrl(detailJob) ? (
            <a href={reportUrl(detailJob)} target="_blank" rel="noreferrer">打开报告</a>
          ) : null
        }
      >
        {detailJob && (
          <>
            <Tag color={statusColor[detailJob.status]} style={{ marginBottom: 12 }}>{detailJob.status}</Tag>
            <Typography.Text type="secondary" style={{ display: "block", marginBottom: 12 }}>
              {formatRunSelection(detailJob)}
            </Typography.Text>
            <pre style={{ maxHeight: "calc(100vh - 200px)", overflow: "auto", background: "#fafafa", padding: 12, fontSize: 12 }}>
              {detailJob.logs.join("\n") || "暂无日志"}
            </pre>
          </>
        )}
      </Drawer>
    </div>
  );
}
