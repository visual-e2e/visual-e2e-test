import { Form, Input, InputNumber, Select, Switch } from "antd";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { StepType } from "../../../../types/scenario";
import { STEP_FIELDS, stepTypeOptions, descPlaceholder } from "../../../../constants/field-meta";
import { defaultFieldsForType } from "../../../../utils/scenario-serialize";
import { api } from "../../../../api/client";
import { useProject } from "../../../../context/ProjectContext";
import type { StepFieldsProps } from "./types";
import { nextStepOptions, paramBoolOverride } from "./helpers";

export function StepHeaderFields({ step, onChange }: Pick<StepFieldsProps, "step" | "onChange">) {
  const [stepIdDraft, setStepIdDraft] = useState(step.stepId);

  useEffect(() => {
    setStepIdDraft(step.stepId);
  }, [step.stepId]);

  const commitStepId = () => {
    const next = stepIdDraft.trim();
    if (!next || next === step.stepId) {
      setStepIdDraft(step.stepId);
      return;
    }
    onChange({ stepId: next });
  };

  const handleTypeChange = (type: StepType) => {
    onChange({ type, ...defaultFieldsForType(type) });
  };

  return (
    <>
      <Form.Item
        label={STEP_FIELDS.stepId.label}
        tooltip={`${STEP_FIELDS.stepId.tooltip}；符合 s1、s2… 的会在增减步骤时自动重排，自定义 ID 会跳过`}
        required
      >
        <Input
          value={stepIdDraft}
          placeholder={STEP_FIELDS.stepId.placeholder}
          onChange={(e) => setStepIdDraft(e.target.value)}
          onBlur={commitStepId}
          onPressEnter={commitStepId}
        />
      </Form.Item>
      <Form.Item label={STEP_FIELDS.type.label} tooltip={STEP_FIELDS.type.tooltip} required>
        <Select value={step.type} options={stepTypeOptions()} onChange={handleTypeChange} />
      </Form.Item>
      <Form.Item label={STEP_FIELDS.desc.label} tooltip={STEP_FIELDS.desc.tooltip}>
        <Input
          value={step.desc}
          placeholder={descPlaceholder(step.type)}
          onChange={(e) => onChange({ desc: e.target.value })}
        />
      </Form.Item>
    </>
  );
}

export function StepFooterFields({
  step, steps, onChange, patchParams,
}: Pick<StepFieldsProps, "step" | "steps" | "onChange" | "patchParams">) {
  const { projectId } = useProject();
  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: api.getSettings,
    enabled: !!projectId,
  });

  const defaultDelay = settingsQuery.data?.test.defaultStepDelay;
  const defaultTimeout = settingsQuery.data?.test.defaultStepTimeout;
  const defaultContinueOnFail = settingsQuery.data?.test.defaultContinueOnFail === true;
  const continueOverride = paramBoolOverride(step, "continueOnFail");
  const continueEffective = continueOverride ?? defaultContinueOnFail;

  return (
    <>
      <Form.Item
        label={STEP_FIELDS.continueOnFail.label}
        tooltip={
          continueOverride === undefined
            ? `${STEP_FIELDS.continueOnFail.tooltip}（当前跟随全局：${defaultContinueOnFail ? "开" : "关"}）`
            : STEP_FIELDS.continueOnFail.tooltip
        }
      >
        <Switch
          checked={continueEffective}
          onChange={(v) => {
            if (v === defaultContinueOnFail) {
              patchParams({ continueOnFail: undefined });
            } else {
              patchParams({ continueOnFail: v });
            }
          }}
        />
      </Form.Item>
      <Form.Item label={STEP_FIELDS.next.label} tooltip={STEP_FIELDS.next.tooltip}>
        <Select
          allowClear
          placeholder={STEP_FIELDS.next.placeholder}
          value={step.next}
          options={nextStepOptions(steps, step.stepId, step.next)}
          onChange={(v) => onChange({ next: v })}
          showSearch
          optionFilterProp="label"
        />
      </Form.Item>
      <Form.Item
        label={STEP_FIELDS.delay.label}
        tooltip={
          defaultDelay != null
            ? `${STEP_FIELDS.delay.tooltip}；留空则使用全局默认 ${defaultDelay} ms`
            : STEP_FIELDS.delay.tooltip
        }
      >
        <InputNumber
          value={step.delay}
          placeholder={defaultDelay != null ? `默认 ${defaultDelay}` : undefined}
          onChange={(v) => onChange({ delay: v ?? undefined })}
          style={{ width: "100%" }}
          addonAfter="ms"
          min={0}
        />
      </Form.Item>
      <Form.Item
        label={STEP_FIELDS.timeOut.label}
        tooltip={
          defaultTimeout != null
            ? `${STEP_FIELDS.timeOut.tooltip}；留空则使用全局默认 ${defaultTimeout} ms`
            : STEP_FIELDS.timeOut.tooltip
        }
      >
        <InputNumber
          value={step.timeOut}
          placeholder={defaultTimeout != null ? `默认 ${defaultTimeout}` : undefined}
          onChange={(v) => onChange({ timeOut: v ?? undefined })}
          style={{ width: "100%" }}
          addonAfter="ms"
          min={0}
        />
      </Form.Item>
    </>
  );
}
