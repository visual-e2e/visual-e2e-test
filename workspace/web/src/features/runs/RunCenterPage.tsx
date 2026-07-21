import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Typography, Table, Button, Tag, Popconfirm, message, Space,
} from "antd";
import { DeleteOutlined, DownloadOutlined, ReloadOutlined } from "@ant-design/icons";
import { api, canOpenReport, reportUrl } from "../../api/client";
import { ReportLink } from "../../components/ReportLink";
import { useProject } from "../../context/ProjectContext";
import type { RunJob } from "../../types/module";
import { RunLaunchPanel } from "./RunLaunchPanel";
import { EnvConfigPanel } from "./EnvConfigPanel";
import { RunDetailDrawer } from "./RunDetailDrawer";
import { formatRunSelection } from "./run-selection";
import { canCancelJob, canDeleteJob, canManageRunArtifacts, resolveDeleteId, resolveRunId } from "./run-id";
import { downloadRunsArchive } from "./download-runs";
import { ScrollPane } from "../../components/layout/ScrollPane";

const STATUS_COLOR: Record<string, string> = {
  running: "processing",
  passed: "success",
  failed: "error",
  cancelled: "default",
  error: "error",
};

export function RunCenterPage() {
  const qc = useQueryClient();
  const location = useLocation();
  const { projectId } = useProject();
  const [detailJobId, setDetailJobId] = useState<string | null>(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);

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

  const deleteMut = useMutation({
    mutationFn: (runIds: string[]) => api.deleteRuns(runIds),
    onSuccess: (result) => {
      const n = result.deleted.length;
      if (n > 0) message.success(`已删除 ${n} 条运行记录`);
      if (result.skipped.length > 0) {
        message.warning(`${result.skipped.length} 条未删除（运行中或不存在）`);
      }
      setSelectedRowKeys((prev) =>
        prev.filter((key) => {
          const row = rows.find((r) => r.jobId === key);
          const runId = row ? resolveRunId(row) : undefined;
          return !runId || !result.deleted.includes(runId);
        }),
      );
      void qc.invalidateQueries({ queryKey: ["runs", projectId] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  useEffect(() => {
    const jobId = (location.state as { jobId?: string })?.jobId;
    if (jobId) setDetailJobId(jobId);
  }, [location.state]);

  const rows = runsQuery.data ?? [];

  const selectedRunIds = selectedRowKeys
    .map((key) => rows.find((r) => r.jobId === key))
    .filter((r): r is RunJob => !!r)
    .filter(canDeleteJob)
    .map((r) => resolveDeleteId(r));

  const batchDeletable = selectedRunIds.length > 0;

  const shortenPath = (path: string) => path.replace(/^\/Users\/[^/]+/, "~");

  const handleDownload = async (runIds: string[]) => {
    if (!projectId || runIds.length === 0) return;
    const loadingText =
      runIds.length === 1 ? "正在打包报告…" : `正在打包 ${runIds.length} 条记录…`;
    const hide = message.loading(loadingText, 0);
    try {
      const result = await downloadRunsArchive(projectId, runIds);
      hide();
      if (result.status === "cancelled") {
        message.info("已取消保存");
      } else if (result.status === "saved") {
        message.success(`已保存至 ${shortenPath(result.path)}`);
      } else {
        message.success(`已保存到浏览器默认下载目录：${result.filename}`);
      }
    } catch (e) {
      hide();
      message.error(e instanceof Error ? e.message : "下载失败");
    }
  };

  const handleDelete = (runIds: string[]) => {
    if (runIds.length === 0) return;
    deleteMut.mutate(runIds);
  };

  return (
    <ScrollPane>
      <Typography.Title level={4}>运行中心</Typography.Title>

      <EnvConfigPanel />

      <RunLaunchPanel />

      <Space size="middle" style={{ marginBottom: 16 }}>
        <Button icon={<ReloadOutlined />} onClick={() => runsQuery.refetch()}>
          刷新历史
        </Button>
        <Button
          icon={<DownloadOutlined />}
          disabled={!batchDeletable}
          onClick={() => void handleDownload(selectedRunIds)}
        >
          批量下载
        </Button>
        <Popconfirm
          title={`删除选中的 ${selectedRunIds.length} 条记录？`}
          description="将永久删除 Storage 中的报告、日志与截图，不可恢复。"
          okText="删除"
          cancelText="取消"
          okButtonProps={{ danger: true }}
          disabled={!batchDeletable}
          onConfirm={() => handleDelete(selectedRunIds)}
        >
          <Button
            icon={<DeleteOutlined />}
            danger
            disabled={!batchDeletable}
            loading={deleteMut.isPending}
          >
            批量删除
          </Button>
        </Popconfirm>
      </Space>

      <Table
        rowKey="jobId"
        loading={runsQuery.isLoading}
        dataSource={rows}
        rowSelection={{
          selectedRowKeys,
          onChange: (keys) => setSelectedRowKeys(keys as string[]),
          getCheckboxProps: (row) => ({
            disabled: !canDeleteJob(row),
          }),
        }}
        columns={[
          { title: "Job ID", dataIndex: "jobId", ellipsis: true },
          {
            title: "状态",
            dataIndex: "status",
            render: (s: string) => <Tag color={STATUS_COLOR[s]}>{s}</Tag>,
          },
          {
            title: "运行范围",
            render: (_, row: RunJob) => formatRunSelection(row),
          },
          { title: "开始", dataIndex: "startedAt", width: 200 },
          {
            title: "报告",
            render: (_, row) => {
              const runId = resolveRunId(row);
              if (canOpenReport(row)) {
                return (
                  <Space size={4}>
                    <ReportLink href={reportUrl(row)!} />
                    {runId && projectId ? (
                      <Button
                        type="link"
                        size="small"
                        style={{ paddingInline: 0 }}
                        onClick={() => void handleDownload([runId])}
                      >
                        下载
                      </Button>
                    ) : null}
                  </Space>
                );
              }
              if (runId && projectId && canManageRunArtifacts(row)) {
                return (
                  <Button
                    type="link"
                    size="small"
                    style={{ paddingInline: 0 }}
                    onClick={() => void handleDownload([runId])}
                  >
                    下载
                  </Button>
                );
              }
              return "—";
            },
          },
          {
            title: "操作",
            width: 140,
            align: "center",
            render: (_, row) => (
              <Space size={4}>
                <Button
                  type="link"
                  size="small"
                  onClick={() => setDetailJobId(row.jobId)}
                  style={{ paddingInline: 0 }}
                >
                  详情
                </Button>
                {canCancelJob(row) ? (
                  <Popconfirm
                    title="终止当前运行？"
                    description="将停止测试进程，已完成的场景结果可能不完整。"
                    okText="终止"
                    cancelText="取消"
                    okButtonProps={{ danger: true }}
                    onConfirm={() => cancelMut.mutate(row.jobId)}
                  >
                    <Button type="link" size="small" danger loading={cancelMut.isPending} style={{ paddingInline: 0 }}>
                      终止
                    </Button>
                  </Popconfirm>
                ) : canDeleteJob(row) ? (
                  <Popconfirm
                    title="删除此运行记录？"
                    description="将永久删除报告与相关文件。"
                    okText="删除"
                    cancelText="取消"
                    okButtonProps={{ danger: true }}
                    onConfirm={() => handleDelete([resolveDeleteId(row)])}
                  >
                    <Button type="link" size="small" danger style={{ paddingInline: 0 }}>
                      删除
                    </Button>
                  </Popconfirm>
                ) : null}
              </Space>
            ),
          },
        ]}
      />

      <RunDetailDrawer
        jobId={detailJobId}
        open={!!detailJobId}
        onClose={() => setDetailJobId(null)}
      />
    </ScrollPane>
  );
}
