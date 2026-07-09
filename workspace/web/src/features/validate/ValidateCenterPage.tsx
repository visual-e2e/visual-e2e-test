import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Typography, Button, Table, Tag, Space, Select, message } from "antd";
import { SafetyCertificateOutlined } from "@ant-design/icons";
import { api } from "../../api/client";
import { useProject } from "../../context/ProjectContext";

interface BatchResult {
  module: string;
  total: number;
  valid: number;
  failed: number;
  results: Array<{ file: string; id: string; valid: boolean; issues: { level: string; message: string }[] }>;
}

export function ValidateCenterPage() {
  const { projectId } = useProject();
  const [module, setModule] = useState<string>();
  const [results, setResults] = useState<BatchResult[]>([]);

  const modulesQuery = useQuery({
    queryKey: ["modules", projectId],
    queryFn: api.modules,
    enabled: !!projectId,
  });

  const batchMut = useMutation({
    mutationFn: () => (module ? api.validateBatch(module) : api.validateBatchAll()),
    onSuccess: (data) => {
      setResults(Array.isArray(data) ? data : [data as BatchResult]);
      message.success("校验完成");
    },
    onError: (e: Error) => message.error(e.message),
  });

  const flat = results.flatMap((m) =>
    m.results.map((r) => ({ ...r, module: m.module, key: `${m.module}/${r.file}` })),
  );

  return (
    <div style={{ padding: 24 }}>
      <Typography.Title level={4}>校验中心</Typography.Title>
      <Space style={{ marginBottom: 16 }}>
        <Select
          allowClear
          placeholder="模块（空=全部）"
          style={{ width: 160 }}
          options={(modulesQuery.data ?? []).map((m) => ({ value: m.module, label: m.module }))}
          onChange={setModule}
        />
        <Button
          type="primary"
          icon={<SafetyCertificateOutlined />}
          loading={batchMut.isPending}
          onClick={() => batchMut.mutate()}
        >
          批量校验
        </Button>
      </Space>

      {results.length > 0 && (
        <Typography.Paragraph>
          {results.map((m) => (
            <span key={m.module} style={{ marginRight: 16 }}>
              {m.module}: {m.valid}/{m.total} 通过
            </span>
          ))}
        </Typography.Paragraph>
      )}

      <Table
        rowKey="key"
        dataSource={flat}
        columns={[
          { title: "模块", dataIndex: "module", width: 100 },
          { title: "文件", dataIndex: "file", ellipsis: true },
          { title: "ID", dataIndex: "id", width: 180 },
          {
            title: "结果",
            dataIndex: "valid",
            width: 80,
            render: (v: boolean) => (v ? <Tag color="green">通过</Tag> : <Tag color="red">失败</Tag>),
          },
          {
            title: "问题",
            dataIndex: "issues",
            render: (issues: { message: string }[]) =>
              issues.length ? issues.map((i) => i.message).join("; ") : "—",
            ellipsis: true,
          },
        ]}
      />
    </div>
  );
}
