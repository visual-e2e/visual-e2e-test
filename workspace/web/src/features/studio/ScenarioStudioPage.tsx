import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Layout, Modal, message, Alert, Spin, Button } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { api } from "../../api/client";
import { useProject } from "../../context/ProjectContext";
import { emptyScenario, rawToDraft, nextStepId, type ScenarioDraft, type StepDraft } from "../../types/scenario";
import { ScenarioListPanel } from "./components/ScenarioListPanel";
import { ScenarioMetaPanel } from "./components/ScenarioMetaPanel";
import { StepTablePanel } from "./components/StepTablePanel";
import { StepDetailPanel } from "./components/StepDetailPanel";
import { ExtendsStepsPanel } from "./components/ExtendsStepsPanel";
import { StudioHeader } from "./components/StudioHeader";
import { StudioSection } from "./components/StudioSection";
import { ImportProfileModal } from "./components/ImportProfileModal";
import { JsonPreviewDrawer, type JsonPreviewMode } from "../../components/JsonPreviewDrawer";
import "./studio.css";

const { Sider, Content } = Layout;

export function ScenarioStudioPage() {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const qc = useQueryClient();
  const { projectId } = useProject();

  const [activeModule, setActiveModule] = useState(search.get("module") ?? "login");
  const [scenarioFile, setScenarioFile] = useState<string | undefined>(search.get("scenario") ?? undefined);
  const [file, setFile] = useState("");
  const [isNew, setIsNew] = useState(false);
  const [draft, setDraft] = useState<ScenarioDraft>(() => emptyScenario(activeModule));
  const [dirty, setDirty] = useState(false);
  const [selectedStepIndex, setSelectedStepIndex] = useState<number>();
  const [expanded, setExpanded] = useState<unknown>();
  const [jsonPreviewOpen, setJsonPreviewOpen] = useState(false);
  const [previewMode, setPreviewMode] = useState<JsonPreviewMode>("draft");
  const [issues, setIssues] = useState<{ level: string; message: string }[]>([]);
  const [importOpen, setImportOpen] = useState(false);

  const macrosQuery = useQuery({ queryKey: ["macros", projectId], queryFn: api.macros, enabled: !!projectId });
  const rulesQuery = useQuery({ queryKey: ["rules", projectId], queryFn: api.rules, enabled: !!projectId });

  const scenariosQuery = useQuery({
    queryKey: ["scenarios", projectId, activeModule],
    queryFn: () => api.scenarios(activeModule),
    enabled: !!projectId && !!activeModule,
  });

  const scenarioQuery = useQuery({
    queryKey: ["scenario", projectId, activeModule, scenarioFile],
    queryFn: () => api.getScenario(activeModule, scenarioFile!),
    enabled: !!projectId && !!scenarioFile && !isNew,
  });

  useEffect(() => {
    if (isNew || scenarioFile) return;
    const first = scenariosQuery.data?.[0];
    if (first) setScenarioFile(first.file);
  }, [scenariosQuery.data, scenarioFile, isNew]);

  useEffect(() => {
    if (scenarioQuery.data) {
      const next = rawToDraft(scenarioQuery.data, activeModule);
      setDraft(next);
      setFile(scenarioFile!);
      setDirty(false);
      setPreviewMode("draft");
      setSelectedStepIndex(next.mode === "extends" || next.steps.length > 0 ? 0 : undefined);
    }
  }, [scenarioQuery.data, activeModule, scenarioFile]);

  const patchDraft = useCallback((patch: Partial<ScenarioDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
  }, []);

  const patchStep = useCallback((patch: Partial<ScenarioDraft["steps"][0]>) => {
    if (selectedStepIndex == null) return;
    setDraft((d) => ({
      ...d,
      steps: d.steps.map((s, i) => (i === selectedStepIndex ? { ...s, ...patch } : s)),
    }));
    setDirty(true);
  }, [selectedStepIndex]);

  const saveScenarioMut = useMutation({
    mutationFn: async () => {
      const rel = file.endsWith(".json") ? file : `${file}.json`;
      if (isNew) return api.createScenario(activeModule, rel, draft);
      return api.updateScenario(activeModule, scenarioFile!, draft);
    },
    onSuccess: (res) => {
      message.success("已保存");
      setDirty(false);
      setIsNew(false);
      setScenarioFile(res.file);
      setFile(res.file);
      qc.invalidateQueries({ queryKey: ["scenarios", projectId, activeModule] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: () => api.deleteScenario(activeModule, scenarioFile!),
    onSuccess: () => {
      message.success("已删除");
      setScenarioFile(undefined);
      setIsNew(false);
      setDraft(emptyScenario(activeModule));
      setFile("");
      setDirty(false);
      setSelectedStepIndex(undefined);
      setExpanded(undefined);
      setPreviewMode("draft");
      setJsonPreviewOpen(false);
      qc.invalidateQueries({ queryKey: ["scenarios", projectId, activeModule] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  const validateMut = useMutation({
    mutationFn: () => api.validateScenario(draft),
    onSuccess: (res) => {
      setIssues(res.issues);
      message[res.valid ? "success" : "warning"](res.valid ? "校验通过" : "校验有问题");
    },
  });

  const expandMut = useMutation({
    mutationFn: () => api.expandScenario(draft),
    onSuccess: (res) => {
      setExpanded(res.expanded);
      setPreviewMode("expanded");
    },
  });

  const runMut = useMutation({
    mutationFn: (plan: { scope: "scenarios" | "module" | "all"; scenarios: string[] }) =>
      api.createRun({
        scope: plan.scope,
        modules: [activeModule],
        scenarios: plan.scenarios,
        options: { headless: true },
      }),
    onSuccess: (job) => {
      message.success("运行已启动");
      navigate("/runs", { state: { jobId: job.jobId } });
    },
    onError: (e: Error) => message.error(e.message),
  });

  const handleNewScenario = () => {
    setIsNew(true);
    setScenarioFile(undefined);
    setDraft(emptyScenario(activeModule));
    setFile("new_scenario.json");
    setDirty(true);
    setSelectedStepIndex(undefined);
    setPreviewMode("draft");
  };

  const handleImport = (imported: ScenarioDraft, suggestedFile: string) => {
    setIsNew(true);
    setScenarioFile(undefined);
    setDraft(imported);
    setFile(suggestedFile);
    setDirty(true);
    setSelectedStepIndex(imported.mode === "extends" || imported.steps.length > 0 ? 0 : undefined);
    setPreviewMode("draft");
  };

  const handleSave = () => {
    if (dirty) saveScenarioMut.mutate();
    else message.info("无修改");
  };

  const handleDelete = () => {
    if (!scenarioFile || isNew) return;
    Modal.confirm({
      title: `确认删除 ${draft.name || draft.id || scenarioFile}？`,
      content: "将永久删除场景 JSON 文件，不可恢复。",
      okText: "删除",
      okButtonProps: { danger: true },
      onOk: () => deleteMut.mutateAsync(),
    });
  };

  const handleRun = (scope: "current" | "module") => {
    const go = () => {
      if (scope === "module") runMut.mutate({ scope: "module", scenarios: [] });
      else runMut.mutate({ scope: "scenarios", scenarios: [draft.id] });
    };
    if (dirty) {
      Modal.confirm({
        title: "有未保存修改",
        content: "将使用磁盘上已保存的版本运行，是否继续？",
        onOk: go,
      });
    } else {
      go();
    }
  };

  const selectedStep =
    selectedStepIndex != null ? (draft.steps[selectedStepIndex] ?? null) : null;
  const isExtends = draft.mode === "extends";

  const expandedStepQuery = useQuery({
    queryKey: ["expand-step", projectId, draft.module, draft.id, draft.extends, draft.params, draft.steps, selectedStepIndex],
    queryFn: () => api.expandScenario(draft),
    enabled: !!projectId && isExtends && !!draft.extends && selectedStepIndex != null,
  });

  const expandedSelectedStep = useMemo(() => {
    if (!isExtends || selectedStepIndex == null) return null;
    const steps = (expandedStepQuery.data?.expanded as { steps?: StepDraft[] } | undefined)?.steps;
    return steps?.[selectedStepIndex] ?? null;
  }, [isExtends, selectedStepIndex, expandedStepQuery.data]);

  const displayStep = isExtends ? expandedSelectedStep : selectedStep;

  const ruleQuery = useQuery({
    queryKey: ["rule", projectId, draft.extends],
    queryFn: () => api.getRule(draft.extends!),
    enabled: !!projectId && isExtends && !!draft.extends,
  });

  const macroQuery = useQuery({
    queryKey: ["macro", projectId, displayStep?.value],
    queryFn: () => api.getMacro(String(displayStep!.value)),
    enabled: !!projectId && displayStep?.type === "macro" && !!displayStep.value,
  });
  const savePath = `scenarios/${draft.module}/${file.endsWith(".json") ? file : `${file}.json`}`;
  const hasEditor = !!scenarioFile || isNew;

  return (
    <Layout className="studio-page">
      <Sider width={220} theme="light" style={{ background: "#fff" }}>
        <ScenarioListPanel
          activeModule={activeModule}
          onModuleChange={(m) => {
            setActiveModule(m);
            setScenarioFile(undefined);
            setIsNew(false);
          }}
          selectedFile={scenarioFile}
          onSelectScenario={(f) => {
            setScenarioFile(f);
            setIsNew(false);
          }}
        />
      </Sider>

      <Layout className="studio-page__main">
        <StudioHeader
          dirty={dirty}
          saving={saveScenarioMut.isPending}
          canDelete={!!scenarioFile && !isNew}
          onNewScenario={handleNewScenario}
          onImportProfile={() => setImportOpen(true)}
          onSave={handleSave}
          onValidate={() => validateMut.mutate()}
          onPreviewJson={() => {
            setPreviewMode("draft");
            setJsonPreviewOpen(true);
          }}
          onDelete={handleDelete}
          onRunCurrent={() => handleRun("current")}
          onRunModule={() => handleRun("module")}
        />

        {issues.length > 0 && (
          <Alert
            type="warning"
            message={issues.map((i) => i.message).join("; ")}
            closable
            onClose={() => setIssues([])}
            className="studio-page__alert"
          />
        )}

        <Content className="studio-main">
          {!hasEditor ? (
            <div className="studio-empty">请从左侧选择场景，或点击「新建场景」/「导入画像」</div>
          ) : (
            <div className="studio-grid">
              <div className="studio-grid__col studio-grid__col--left">
              <StudioSection title="场景配置" variant="config" className="studio-grid__config">
                <ScenarioMetaPanel
                  draft={draft}
                  file={file}
                  isNew={isNew}
                  ruleIds={(rulesQuery.data ?? []).map((r) => r.id)}
                  onChange={patchDraft}
                  onFileChange={(f) => { setFile(f); setDirty(true); }}
                />
              </StudioSection>

              <StudioSection
                title="步骤列表"
                variant="steps"
                className="studio-grid__steps"
                extra={
                  draft.mode === "full" ? (
                    <Button
                      type="primary"
                      size="small"
                      icon={<PlusOutlined />}
                      onClick={() =>
                        patchDraft({
                          steps: [...draft.steps, { stepId: nextStepId(draft.steps), type: "click", desc: "", selector: "" }],
                        })
                      }
                    >
                      添加步骤
                    </Button>
                  ) : null
                }
              >
                {draft.mode === "full" ? (
                  <StepTablePanel
                    embedded
                    steps={draft.steps}
                    selectedIndex={selectedStepIndex}
                    onSelect={setSelectedStepIndex}
                    onChange={(steps) => patchDraft({ steps })}
                  />
                ) : (
                  <ExtendsStepsPanel
                    draft={draft}
                    selectedIndex={selectedStepIndex}
                    onSelect={setSelectedStepIndex}
                  />
                )}
              </StudioSection>
              </div>

              <div className="studio-grid__col studio-grid__col--right">
              <StudioSection title="步骤详情" variant="detail" className="studio-grid__detail">
                <StepDetailPanel
                  step={displayStep}
                  steps={draft.steps}
                  macroIds={(macrosQuery.data ?? []).map((m) => m.id)}
                  onChange={patchStep}
                  readOnly={isExtends}
                  ruleRef={
                    isExtends && draft.extends
                      ? {
                          id: draft.extends,
                          description: ruleQuery.data?.description as string | undefined,
                        }
                      : undefined
                  }
                  macroRef={
                    displayStep?.type === "macro" && macroQuery.data
                      ? {
                          id: String(displayStep.value),
                          description: macroQuery.data.description as string | undefined,
                          steps: (macroQuery.data.steps as StepDraft[]) ?? [],
                        }
                      : undefined
                  }
                />
              </StudioSection>
              </div>
            </div>
          )}
        </Content>

        {scenarioQuery.isLoading && <Spin style={{ position: "absolute", top: "50%", left: "50%" }} />}
      </Layout>

      <JsonPreviewDrawer
        open={jsonPreviewOpen && hasEditor}
        onClose={() => setJsonPreviewOpen(false)}
        title={`JSON 预览: ${draft.name || draft.id || file || "场景"}`}
        savePath={savePath}
        mode={previewMode}
        onModeChange={setPreviewMode}
        draftData={draft}
        expandedData={expanded}
        expandedAvailable={expanded != null}
        loading={expandMut.isPending}
        onExpand={() => expandMut.mutate()}
        expandLoading={expandMut.isPending}
      />

      <ImportProfileModal
        open={importOpen}
        module={activeModule}
        onClose={() => setImportOpen(false)}
        onImported={handleImport}
      />
    </Layout>
  );
}
