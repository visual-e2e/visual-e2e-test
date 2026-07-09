import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, Spin, Tag, Typography } from "antd";
import { api } from "../../../api/client";
import { useProject } from "../../../context/ProjectContext";
import type { ScenarioDraft, StepDraft } from "../../../types/scenario";
import { StepTablePanel } from "./StepTablePanel";

interface DisplayStep extends StepDraft {
  _tags?: string[];
}

interface ExtendsStepsPanelProps {
  draft: ScenarioDraft;
  selectedIndex?: number;
  onSelect: (index: number) => void;
}

export function ExtendsStepsPanel({ draft, selectedIndex, onSelect }: ExtendsStepsPanelProps) {
  const { projectId } = useProject();
  const expandQuery = useQuery({
    queryKey: ["expand", projectId, draft.module, draft.id, draft.extends, draft.params, draft.steps],
    queryFn: () => api.expandScenario(draft),
    enabled: !!projectId && !!draft.extends,
  });

  const ruleQuery = useQuery({
    queryKey: ["rule", projectId, draft.extends],
    queryFn: () => api.getRule(draft.extends!),
    enabled: !!projectId && !!draft.extends,
  });

  const displaySteps = useMemo((): DisplayStep[] => {
    const expanded = expandQuery.data?.expanded as { steps?: StepDraft[] } | undefined;
    if (!expanded?.steps) return [];

    const ruleStepCount = Array.isArray(ruleQuery.data?.steps)
      ? (ruleQuery.data.steps as StepDraft[]).length
      : 0;

    return expanded.steps.map((step, index) => {
      const tags: string[] = [];
      if (index < ruleStepCount) tags.push("规则");
      else tags.push("追加");
      if (step.type === "macro" && step.value) tags.push(`宏:${step.value}`);
      return { ...step, _tags: tags };
    });
  }, [expandQuery.data, ruleQuery.data]);

  if (!draft.extends) {
    return <div style={{ padding: 16, color: "#8c8c8c" }}>请先在场景配置中选择 extends 规则模板</div>;
  }

  if (expandQuery.isLoading || ruleQuery.isLoading) {
    return <Spin style={{ display: "block", margin: 24 }} />;
  }

  if (expandQuery.isError) {
    return (
      <Alert
        type="error"
        message="展开失败"
        description={(expandQuery.error as Error).message}
        style={{ margin: 16 }}
      />
    );
  }

  const ruleDesc = ruleQuery.data?.description as string | undefined;

  return (
    <div>
      <div style={{ padding: "8px 16px", borderBottom: "1px solid #f0f0f0" }}>
        <Typography.Text type="secondary">
          规则模板：<Tag color="blue">{draft.extends}</Tag>
          {ruleDesc && <span> — {ruleDesc}</span>}
        </Typography.Text>
        {draft.params && Object.keys(draft.params).length > 0 && (
          <Typography.Text type="secondary" style={{ display: "block", marginTop: 4, fontSize: 12 }}>
            参数：{JSON.stringify(draft.params)}
          </Typography.Text>
        )}
      </div>
      <StepTablePanel
        embedded
        readOnly
        steps={displaySteps}
        selectedIndex={selectedIndex}
        onSelect={onSelect}
        onChange={() => undefined}
        renderTags={(step) =>
          (step as DisplayStep)._tags?.map((t) => (
            <Tag key={t} color={t.startsWith("宏:") ? "orange" : t === "规则" ? "blue" : "default"} style={{ marginRight: 4 }}>
              {t}
            </Tag>
          ))
        }
      />
    </div>
  );
}
