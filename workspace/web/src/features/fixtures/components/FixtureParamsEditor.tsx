import { Button, Input, Space, Switch, Table, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { ArrowDownOutlined, ArrowUpOutlined, PlusOutlined } from "@ant-design/icons";
import type { FixtureParams } from "../../../types/fixture";
import { paramsToRows, rowsToParams, suggestParamName, type FixtureParamRow } from "../../../types/fixture";

interface FixtureParamsEditorProps {
  params: FixtureParams;
  onChange: (params: FixtureParams) => void;
}

export function FixtureParamsEditor({ params, onChange }: FixtureParamsEditorProps) {
  const rows = paramsToRows(params);

  const updateRows = (next: FixtureParamRow[]) => {
    onChange(rowsToParams(next));
  };

  const patchRow = (index: number, patch: Partial<FixtureParamRow>) => {
    const next = rows.map((row, i) => (i === index ? { ...row, ...patch } : row));
    updateRows(next);
  };

  const move = (index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[index], next[j]] = [next[j], next[index]];
    updateRows(next);
  };

  const columns: ColumnsType<FixtureParamRow> = [
    {
      title: "参数名",
      dataIndex: "name",
      render: (_, row, index) => (
        <Input
          size="small"
          value={row.name}
          placeholder="addonName"
          onChange={(e) => patchRow(index, { name: e.target.value })}
        />
      ),
    },
    {
      title: "必填",
      dataIndex: "required",
      width: 64,
      align: "center",
      render: (_, row, index) => (
        <Switch
          size="small"
          checked={row.required}
          onChange={(required) => patchRow(index, { required })}
        />
      ),
    },
    {
      title: "引用",
      key: "ref",
      width: 120,
      render: (_, row) =>
        row.name.trim() ? (
          <Typography.Text code style={{ fontSize: 11 }}>{`{${row.name.trim()}}`}</Typography.Text>
        ) : (
          "—"
        ),
    },
    {
      title: "操作",
      width: 108,
      render: (_, __, index) => (
        <Space size={2}>
          <Button size="small" icon={<ArrowUpOutlined />} onClick={() => move(index, -1)} />
          <Button size="small" icon={<ArrowDownOutlined />} onClick={() => move(index, 1)} />
          <Button
            size="small"
            danger
            onClick={() => updateRows(rows.filter((_, i) => i !== index))}
          >
            删
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          声明调用方传入的参数，步骤中用 {"{参数名}"} 引用
        </Typography.Text>
        <Button
          type="link"
          size="small"
          icon={<PlusOutlined />}
          onClick={() => updateRows([...rows, { name: suggestParamName(rows), required: true }])}
        >
          添加参数
        </Button>
      </div>
      <Table<FixtureParamRow>
        rowKey={(_, index) => String(index)}
        size="small"
        pagination={false}
        columns={columns}
        dataSource={rows}
        locale={{ emptyText: "暂无参数，点击「添加参数」" }}
      />
    </div>
  );
}
