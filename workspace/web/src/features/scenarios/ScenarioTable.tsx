import { Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { ScenarioSummary } from "../../types/module";

interface ScenarioTableProps {
  scenarios: ScenarioSummary[];
  loading: boolean;
  selectedFile?: string;
  onSelect: (scenario: ScenarioSummary) => void;
}

export function ScenarioTable({ scenarios, loading, selectedFile, onSelect }: ScenarioTableProps) {
  const columns: ColumnsType<ScenarioSummary> = [
    {
      title: "ID",
      dataIndex: "id",
      width: 200,
      ellipsis: true,
    },
    {
      title: "名称",
      dataIndex: "name",
      ellipsis: true,
    },
    {
      title: "模式",
      key: "mode",
      width: 100,
      render: (_, row) =>
        row.extends ? <Tag color="blue">extends</Tag> : <Tag>steps</Tag>,
    },
    {
      title: "步骤",
      dataIndex: "stepCount",
      width: 72,
      render: (v: number | undefined, row) => (row.extends ? "—" : (v ?? "—")),
    },
    {
      title: "状态",
      dataIndex: "enabled",
      width: 72,
      render: (enabled: boolean) =>
        enabled ? <Tag color="green">启用</Tag> : <Tag>禁用</Tag>,
    },
  ];

  return (
    <Table<ScenarioSummary>
      rowKey="file"
      size="small"
      loading={loading}
      columns={columns}
      dataSource={scenarios}
      pagination={false}
      scroll={{ y: "calc(100vh - 220px)" }}
      rowSelection={{
        type: "radio",
        selectedRowKeys: selectedFile ? [selectedFile] : [],
        onChange: (_keys, rows) => {
          if (rows[0]) onSelect(rows[0]);
        },
      }}
      onRow={(record) => ({
        onClick: () => onSelect(record),
        style: { cursor: "pointer" },
      })}
    />
  );
}
