import { Table, Button, Space, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { ReactNode } from "react";
import { ArrowUpOutlined, ArrowDownOutlined } from "@ant-design/icons";
import type { StepDraft } from "../../../types/scenario";
import { stepTypeLabel, stepTypeShortLabel } from "../../../constants/field-meta";

interface StepTablePanelProps {
  steps: StepDraft[];
  selectedIndex?: number;
  onSelect: (index: number) => void;
  onChange: (steps: StepDraft[]) => void;
  embedded?: boolean;
  readOnly?: boolean;
  renderTags?: (step: StepDraft) => ReactNode;
}

function stepSummary(step: StepDraft): string {
  if (step.type === "link") return step.url ?? "";
  if (step.type === "verify") return step.verifyValue ?? "";
  if (step.type === "macro") return String(step.value ?? "");
  return step.selector ?? String(step.value ?? "");
}

export function StepTablePanel({
  steps, selectedIndex, onSelect, onChange, embedded, readOnly, renderTags,
}: StepTablePanelProps) {
  const move = (index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= steps.length) return;
    const next = [...steps];
    [next[index], next[j]] = [next[j], next[index]];
    onChange(next);
  };

  const columns: ColumnsType<StepDraft> = [
    { title: "ID", dataIndex: "stepId", width: 52, ellipsis: true },
    {
      title: "类型",
      dataIndex: "type",
      width: 96,
      ellipsis: true,
      render: (t: string) => (
        <Tag color="purple" title={stepTypeLabel(t as StepDraft["type"])}>
          {stepTypeShortLabel(t as StepDraft["type"])}
        </Tag>
      ),
    },
    ...(renderTags
      ? [{
          title: "来源",
          key: "tags",
          width: 100,
          ellipsis: true,
          render: (_: unknown, r: StepDraft) => renderTags(r),
        }]
      : []),
    { title: "描述", dataIndex: "desc", ellipsis: true },
    ...(!embedded
      ? [{ title: "摘要", key: "sum", width: 140, ellipsis: true, render: (_: unknown, r: StepDraft) => stepSummary(r) }]
      : []),
    ...(!readOnly
      ? [{
          title: "操作",
          width: 100,
          fixed: "right" as const,
          render: (_: unknown, __: StepDraft, i: number) => (
            <Space size={2}>
              <Button size="small" icon={<ArrowUpOutlined />} onClick={(e) => { e.stopPropagation(); move(i, -1); }} />
              <Button size="small" icon={<ArrowDownOutlined />} onClick={(e) => { e.stopPropagation(); move(i, 1); }} />
              <Button
                size="small"
                danger
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(steps.filter((_, idx) => idx !== i));
                }}
              >
                删
              </Button>
            </Space>
          ),
        }]
      : []),
  ];

  return (
    <div className="studio-step-table">
      <Table<StepDraft>
        rowKey={(_, index) => String(index)}
        size="small"
        tableLayout="fixed"
        pagination={false}
        columns={columns}
        dataSource={steps}
        scroll={{
          x: embedded ? 360 : 640,
          y: embedded ? "calc(100vh - 340px)" : "calc(100vh - 380px)",
        }}
        rowClassName={(_, index) =>
          index === selectedIndex ? "studio-table-row--active" : ""
        }
        onRow={(_, index) => ({
          onClick: () => onSelect(index ?? 0),
          style: { cursor: "pointer" },
        })}
      />
    </div>
  );
}
