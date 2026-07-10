import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Layout, Modal, message, Spin, Button } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { api } from "../../api/client";
import { useProject } from "../../context/ProjectContext";
import {
  emptyMacro, emptyRule, rawToMacroDraft, rawToRuleDraft,
  macroDraftToRaw, ruleDraftToRaw,
  type MacroDraft, type RuleDraft,
} from "../../types/fixture";
import { nextStepId } from "../../types/scenario";
import { FixtureListPanel } from "./components/FixtureListPanel";
import { FixtureMetaPanel } from "./components/FixtureMetaPanel";
import { FixtureStudioHeader } from "./components/FixtureStudioHeader";
import { StepTablePanel } from "../studio/components/StepTablePanel";
import { StepDetailPanel } from "../studio/components/StepDetailPanel";
import { StudioSection } from "../studio/components/StudioSection";
import { JsonPreviewDrawer } from "../../components/JsonPreviewDrawer";
import "../studio/studio.css";

const { Sider, Content } = Layout;

type FixtureKind = "macro" | "rule";

interface FixtureStudioPageProps {
  kind: FixtureKind;
}

function emptyDraft(kind: FixtureKind): MacroDraft | RuleDraft {
  return kind === "rule" ? emptyRule("") : emptyMacro("");
}

const ID_PATTERN = /^[a-zA-Z][\w.-]*$/;

export function FixtureStudioPage({ kind }: FixtureStudioPageProps) {
  const location = useLocation();
  const [search, setSearch] = useSearchParams();
  const qc = useQueryClient();
  const { projectId } = useProject();
  const lastErrorId = useRef<string>();

  const isRule = kind === "rule";
  const listKey = isRule ? "rules" : "macros";
  const label = isRule ? "规则" : "宏";
  const saveSubdir = isRule ? "rules" : "macros";

  const pathId = location.pathname.match(new RegExp(`^/${listKey}/(.+)`))?.[1];
  const [activeId, setActiveId] = useState<string | undefined>(search.get("id") ?? pathId ?? undefined);
  const [isNew, setIsNew] = useState(false);
  const [draft, setDraft] = useState<MacroDraft | RuleDraft>(() => emptyDraft(kind));
  const [dirty, setDirty] = useState(false);
  const [selectedStepIndex, setSelectedStepIndex] = useState<number>();
  const [jsonPreviewOpen, setJsonPreviewOpen] = useState(false);

  const listQuery = useQuery({
    queryKey: [listKey, projectId],
    queryFn: isRule ? api.rules : api.macros,
    enabled: !!projectId,
  });

  const fixtureQuery = useQuery({
    queryKey: [listKey, projectId, activeId],
    queryFn: () => (isRule ? api.getRule(activeId!) : api.getMacro(activeId!)),
    enabled: !!projectId && !!activeId && !isNew,
  });

  const macrosQuery = useQuery({
    queryKey: ["macros", projectId],
    queryFn: api.macros,
    enabled: !!projectId && isRule,
  });

  useEffect(() => {
    if (isNew || activeId) return;
    const first = listQuery.data?.[0];
    if (first) setActiveId(first.id);
  }, [listQuery.data, activeId, isNew]);

  useEffect(() => {
    if (!activeId || isNew) return;

    if (fixtureQuery.isError) {
      if (lastErrorId.current !== activeId) {
        lastErrorId.current = activeId;
        message.error(fixtureQuery.error instanceof Error ? fixtureQuery.error.message : "加载失败");
      }
      return;
    }

    if (!fixtureQuery.data) return;

    const raw = fixtureQuery.data as Record<string, unknown>;
    const next = isRule ? rawToRuleDraft(raw) : rawToMacroDraft(raw);
    setDraft(next);
    setDirty(false);
    setSelectedStepIndex(next.steps.length > 0 ? 0 : undefined);
  }, [activeId, fixtureQuery.data, fixtureQuery.isError, fixtureQuery.error, isNew, isRule]);

  const selectFixture = useCallback((id: string) => {
    if (id === activeId && !isNew) return;
    setActiveId(id);
    setIsNew(false);
    setSearch({ id });
  }, [activeId, isNew, setSearch]);

  const patchDraft = useCallback((patch: Partial<MacroDraft | RuleDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
  }, []);

  const patchStep = useCallback((patch: Partial<MacroDraft["steps"][0]>) => {
    if (selectedStepIndex == null) return;
    setDraft((d) => ({
      ...d,
      steps: d.steps.map((s, i) => (i === selectedStepIndex ? { ...s, ...patch } : s)),
    }));
    setDirty(true);
  }, [selectedStepIndex]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload = isRule ? ruleDraftToRaw(draft as RuleDraft) : macroDraftToRaw(draft);
      if (isNew) {
        return isRule
          ? api.createRule(draft.id, payload)
          : api.createMacro(draft.id, payload);
      }
      return isRule
        ? api.saveRule(draft.id, payload)
        : api.saveMacro(draft.id, payload);
    },
    onSuccess: () => {
      message.success("已保存");
      setDirty(false);
      setIsNew(false);
      setActiveId(draft.id);
      setSearch({ id: draft.id });
      qc.invalidateQueries({ queryKey: [listKey, projectId] });
      qc.invalidateQueries({ queryKey: [listKey, projectId, draft.id] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: () =>
      isRule ? api.deleteRule(activeId!) : api.deleteMacro(activeId!),
    onSuccess: () => {
      message.success("已删除");
      setActiveId(undefined);
      setIsNew(false);
      setDraft(emptyDraft(kind));
      setDirty(false);
      setSelectedStepIndex(undefined);
      setSearch({});
      qc.invalidateQueries({ queryKey: [listKey, projectId] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  const handleNew = () => {
    setIsNew(true);
    setActiveId(undefined);
    setDraft(emptyDraft(kind));
    setDirty(true);
    setSelectedStepIndex(undefined);
    setSearch({});
  };

  const handleDelete = () => {
    if (!activeId || isNew) return;
    Modal.confirm({
      title: `确认删除 ${activeId}？`,
      onOk: () => deleteMut.mutateAsync(),
    });
  };

  const handleSave = () => {
    if (!draft.id.trim()) {
      message.error("请填写 id");
      return;
    }
    if (!ID_PATTERN.test(draft.id)) {
      message.error("ID 格式无效（字母开头，可含字母数字 ._-）");
      return;
    }
    if (isNew && (listQuery.data ?? []).some((item) => item.id === draft.id)) {
      message.error("ID 已存在");
      return;
    }
    if (draft.steps.length === 0) {
      message.error("至少需要一个步骤");
      return;
    }
    saveMut.mutate();
  };

  const selectedStep =
    selectedStepIndex != null ? (draft.steps[selectedStepIndex] ?? null) : null;
  const hasEditor = !!activeId || isNew;
  const isStale = !isNew && !!activeId && draft.id !== activeId;
  const isLoadingFixture = !isNew && !!activeId && (fixtureQuery.isFetching || isStale);
  const savePath = `fixtures/${saveSubdir}/${draft.id || "new"}.json`;
  const previewData = isRule ? ruleDraftToRaw(draft as RuleDraft) : macroDraftToRaw(draft);
  const macroIds = (macrosQuery.data ?? []).map((m) => m.id);
  const listSelectedId = isNew ? undefined : activeId;

  return (
    <Layout className="studio-page">
      <Sider width={220} theme="light" style={{ background: "#fff" }}>
        <FixtureListPanel
          title={`${label}列表`}
          queryKey={listKey}
          listFn={isRule ? api.rules : api.macros}
          selectedId={listSelectedId}
          onSelect={selectFixture}
        />
      </Sider>

      <Layout className="studio-page__main">
        <FixtureStudioHeader
          label={label}
          dirty={dirty}
          saving={saveMut.isPending}
          canDelete={!!activeId && !isNew}
          onNew={handleNew}
          onSave={handleSave}
          onDelete={handleDelete}
          onPreviewJson={() => setJsonPreviewOpen(true)}
        />

        <Content className="studio-main">
          {!hasEditor ? (
            <div className="studio-empty">请从左侧选择，或点击「新建{label}」</div>
          ) : (
            <div className="studio-grid">
              <div className="studio-grid__col studio-grid__col--left">
              <StudioSection title={`${label}配置`} variant="config" className="studio-grid__config">
                <FixtureMetaPanel
                  draft={draft}
                  isNew={isNew}
                  isRule={isRule}
                  onChange={patchDraft}
                />
              </StudioSection>

              <StudioSection
                title="步骤列表"
                variant="steps"
                className="studio-grid__steps"
                extra={
                  <Button
                    type="primary"
                    size="small"
                    icon={<PlusOutlined />}
                    onClick={() => {
                      const steps = [
                        ...draft.steps,
                        { stepId: nextStepId(draft.steps), type: "click" as const, desc: "", selector: "" },
                      ];
                      patchDraft({ steps });
                      if (selectedStepIndex == null) setSelectedStepIndex(steps.length - 1);
                    }}
                  >
                    添加步骤
                  </Button>
                }
              >
                <StepTablePanel
                  embedded
                  steps={draft.steps}
                  selectedIndex={selectedStepIndex}
                  onSelect={setSelectedStepIndex}
                  onChange={(steps) => patchDraft({ steps })}
                />
              </StudioSection>
              </div>

              <div className="studio-grid__col studio-grid__col--right">
              <StudioSection title="步骤详情" variant="detail" className="studio-grid__detail">
                <StepDetailPanel
                  step={selectedStep}
                  steps={draft.steps}
                  macroIds={macroIds}
                  onChange={patchStep}
                  fixtureParamNames={Object.keys(draft.params)}
                />
              </StudioSection>
              </div>
            </div>
          )}
        </Content>

        {isLoadingFixture && hasEditor && (
          <Spin style={{ position: "absolute", top: "50%", left: "50%" }} />
        )}
      </Layout>

      <JsonPreviewDrawer
        open={jsonPreviewOpen && hasEditor}
        onClose={() => setJsonPreviewOpen(false)}
        title={`JSON 预览: ${draft.id || `新建${label}`}`}
        savePath={savePath}
        mode="draft"
        onModeChange={() => undefined}
        draftData={previewData}
        expandedData={undefined}
        expandedAvailable={false}
        loading={isLoadingFixture}
      />
    </Layout>
  );
}
