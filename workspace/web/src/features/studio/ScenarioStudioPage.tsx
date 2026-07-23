import { useEffect, useState, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Layout, Modal, message, Alert, Spin, Button } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { api } from "../../api/client";
import { useProject } from "../../context/ProjectContext";
import { emptyScenario, rawToDraft, type ScenarioDraft, type StepDraft } from "../../types/scenario";
import { createEmptyStep, insertStep, compactScenarioPayload } from "../../utils/scenario-serialize";
import { renameStepId } from "../../utils/step-id";
import { validateScenarioDraft, hasScenarioErrors } from "../../utils/scenario-validate";
import { ScenarioListPanel } from "./components/ScenarioListPanel";
import { ScenarioMetaPanel } from "./components/ScenarioMetaPanel";
import { StepTablePanel } from "./components/StepTablePanel";
import { StepDetailPanel } from "./components/StepDetailPanel";
import { ExtendsStepsPanel } from "./components/ExtendsStepsPanel";
import { StudioHeader } from "./components/StudioHeader";
import { StudioSection } from "./components/StudioSection";
import { ImportProfileModal } from "./components/ImportProfileModal";
import { ImportScenarioJsonModal } from "./components/ImportScenarioJsonModal";
import { JsonPreviewDrawer, type JsonPreviewMode } from "../../components/JsonPreviewDrawer";
import { RunDetailDrawer } from "../runs/RunDetailDrawer";
import { seedRunCache } from "../runs/seed-run-cache";
import "./studio.css";

const { Sider, Content } = Layout;

export function ScenarioStudioPage() {
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
  const [importJsonOpen, setImportJsonOpen] = useState(false);
  const [runJobId, setRunJobId] = useState<string | null>(null);

  useEffect(() => {
    const module = search.get("module");
    const scenario = search.get("scenario") ?? undefined;
    if (module && module !== activeModule) {
      setActiveModule(module);
      setIsNew(false);
    }
    if (scenario && scenario !== scenarioFile) {
      setScenarioFile(scenario);
      setIsNew(false);
    }
    if (module || scenario) {
      void qc.invalidateQueries({ queryKey: ["modules", projectId] });
      void qc.invalidateQueries({ queryKey: ["scenarios", projectId] });
      if (module && scenario) {
        void qc.invalidateQueries({ queryKey: ["scenario", projectId, module, scenario] });
      }
    }
    // Sync from URL when navigating from recorder import
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

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
    setDraft((d) => {
      const prev = d.steps[selectedStepIndex];
      if (!prev) return d;
      if (patch.stepId != null && patch.stepId !== prev.stepId) {
        return { ...d, steps: renameStepId(d.steps, prev.stepId, patch.stepId) };
      }
      return {
        ...d,
        steps: d.steps.map((s, i) => (i === selectedStepIndex ? { ...s, ...patch } : s)),
      };
    });
    setDirty(true);
  }, [selectedStepIndex]);

  const saveScenarioMut = useMutation({
    mutationFn: async () => {
      const mod = draft.module.trim();
      if (!mod) throw new Error("模块不能为空");

      const existingModules = await api.modules();
      if (!existingModules.some((m) => m.module === mod)) {
        await api.createModule(mod);
      }

      const rel = file.endsWith(".json") ? file : `${file}.json`;
      if (isNew) return api.createScenario(mod, rel, draft);
      return api.updateScenario(mod, scenarioFile!, draft);
    },
    onSuccess: (res) => {
      message.success("已保存");
      setDirty(false);
      setIsNew(false);
      setScenarioFile(res.file);
      setFile(res.file);
      if (draft.module !== activeModule) {
        setActiveModule(draft.module);
      }
      void qc.invalidateQueries({ queryKey: ["modules", projectId] });
      qc.invalidateQueries({ queryKey: ["scenarios", projectId, draft.module] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (file: string) => api.deleteScenario(activeModule, file),
    onSuccess: async (_res, deletedFile) => {
      message.success("已删除");

      const listKey = ["scenarios", projectId, activeModule] as const;
      const prevList = qc.getQueryData<{ file: string }[]>(listKey) ?? [];
      const nextList = prevList.filter((s) => s.file !== deletedFile);
      qc.setQueryData(listKey, nextList);
      qc.removeQueries({ queryKey: ["scenario", projectId, activeModule, deletedFile] });

      setIsNew(false);
      setDirty(false);
      setExpanded(undefined);
      setPreviewMode("draft");
      setJsonPreviewOpen(false);

      const nextFile = nextList[0]?.file;
      if (nextFile) {
        setScenarioFile(nextFile);
        setFile(nextFile);
        const cached = qc.getQueryData<Record<string, unknown>>([
          "scenario", projectId, activeModule, nextFile,
        ]);
        if (cached) {
          const next = rawToDraft(cached, activeModule);
          setDraft(next);
          setSelectedStepIndex(next.mode === "extends" || next.steps.length > 0 ? 0 : undefined);
        } else {
          setDraft(emptyScenario(activeModule));
          setSelectedStepIndex(undefined);
        }
      } else {
        setScenarioFile(undefined);
        setFile("");
        setDraft(emptyScenario(activeModule));
        setSelectedStepIndex(undefined);
      }

      await qc.invalidateQueries({ queryKey: listKey });
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
      seedRunCache(qc, projectId, job);
      setRunJobId(job.jobId);
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
    if (imported.module !== activeModule) {
      setActiveModule(imported.module);
    }
    setSelectedStepIndex(imported.mode === "extends" || imported.steps.length > 0 ? 0 : undefined);
    setPreviewMode("draft");
  };

  const applyClientValidation = (): boolean => {
    const local = validateScenarioDraft(draft);
    if (hasScenarioErrors(local)) {
      setIssues(local);
      message.warning(local.map((i) => i.message).join("; "));
      return false;
    }
    return true;
  };

  const handleAddStep = () => {
    const newStep = createEmptyStep(draft.steps);
    const next = insertStep(draft.steps, selectedStepIndex, newStep);
    const newIndex =
      selectedStepIndex == null || selectedStepIndex < 0 || selectedStepIndex >= draft.steps.length
        ? next.length - 1
        : selectedStepIndex + 1;
    patchDraft({ steps: next });
    setSelectedStepIndex(newIndex);
  };

  const handleSave = () => {
    if (!dirty) {
      message.info("无修改");
      return;
    }
    if (!applyClientValidation()) return;
    saveScenarioMut.mutate();
  };

  const handleValidate = () => {
    if (!applyClientValidation()) return;
    validateMut.mutate();
  };

  const handleDelete = () => {
    if (!scenarioFile || isNew) return;
    Modal.confirm({
      title: `确认删除 ${draft.name || draft.id || scenarioFile}？`,
      content: "将永久删除场景 JSON 文件，不可恢复。",
      okText: "删除",
      okButtonProps: { danger: true },
      onOk: () => deleteMut.mutateAsync(scenarioFile),
    });
  };

  const handleRun = (scope: "current" | "module") => {
    if (scope === "current" && !applyClientValidation()) return;
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

  const previewDraft = useMemo(() => compactScenarioPayload(draft), [draft]);

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
          onImportScenarioJson={() => setImportJsonOpen(true)}
          onSave={handleSave}
          onValidate={handleValidate}
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
            <div className="studio-empty">请从左侧选择场景，或点击「新建场景」/「导入画像」/「导入场景 JSON」</div>
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
                      onClick={handleAddStep}
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
        draftData={previewDraft}
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

      <ImportScenarioJsonModal
        open={importJsonOpen}
        module={activeModule}
        onClose={() => setImportJsonOpen(false)}
        onImported={handleImport}
      />

      <RunDetailDrawer
        jobId={runJobId}
        open={!!runJobId}
        onClose={() => setRunJobId(null)}
      />
    </Layout>
  );
}
