import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams, useLocation } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Button, Form, Input, Switch, Tabs, Select, Space, message, Alert, Spin,
} from "antd";
import { SaveOutlined, CheckOutlined, EyeOutlined, PlayCircleOutlined, ArrowLeftOutlined } from "@ant-design/icons";
import { api } from "../../api/client";
import { useProject } from "../../context/ProjectContext";
import {
  emptyScenario, rawToDraft, type ScenarioDraft,
} from "../../types/scenario";
import { StepListEditor } from "./StepListEditor";
import { JsonPreview } from "../../components/JsonPreview";

export function ScenarioEditorPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams<{ module: string }>();
  const [search] = useSearchParams();
  const splat = useParams()["*"];
  const module = params.module ?? search.get("module") ?? "login";
  const filePath = splat;
  const isNew = location.pathname.endsWith("/new") || !filePath;

  const qc = useQueryClient();
  const { projectId } = useProject();
  const [draft, setDraft] = useState<ScenarioDraft>(() => emptyScenario(module));
  const [file, setFile] = useState(`${draft.id || "new_scenario"}.json`);
  const [expanded, setExpanded] = useState<unknown>();
  const [issues, setIssues] = useState<{ level: string; message: string }[]>([]);

  const scenarioQuery = useQuery({
    queryKey: ["scenario", projectId, module, filePath],
    queryFn: () => api.getScenario(module, filePath!),
    enabled: !!projectId && !isNew && !!filePath,
  });

  const macrosQuery = useQuery({ queryKey: ["macros", projectId], queryFn: api.macros, enabled: !!projectId });
  const rulesQuery = useQuery({ queryKey: ["rules", projectId], queryFn: api.rules, enabled: !!projectId });

  useEffect(() => {
    if (isNew && search.get("fromProfile")) {
      const raw = sessionStorage.getItem("profile-import-draft");
      if (raw) {
        const { draft: imported } = JSON.parse(raw) as { draft: ScenarioDraft; file: string };
        setDraft(imported);
        setFile(`${imported.id}.json`);
        sessionStorage.removeItem("profile-import-draft");
      }
    }
  }, [isNew, search]);

  useEffect(() => {
    if (scenarioQuery.data) {
      setDraft(rawToDraft(scenarioQuery.data, module));
      setFile(filePath!);
    }
  }, [scenarioQuery.data, module, filePath]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const relFile = file.includes("/") ? file : file.endsWith(".json") ? file : `${file}.json`;
      if (isNew) return api.createScenario(module, relFile, draft);
      return api.updateScenario(module, filePath!, draft);
    },
    onSuccess: (res) => {
      message.success("已保存");
      qc.invalidateQueries({ queryKey: ["scenarios", projectId, module] });
      if (isNew || res.file !== filePath) {
        navigate(`/scenarios/${module}/edit/${res.file}`, { replace: true });
      }
    },
    onError: (e: Error) => message.error(e.message),
  });

  const validateMut = useMutation({
    mutationFn: () => api.validateScenario(draft),
    onSuccess: (res) => {
      setIssues(res.issues);
      if (res.valid) message.success("校验通过");
      else message.warning("校验有问题，请查看");
    },
  });

  const expandMut = useMutation({
    mutationFn: () => api.expandScenario(draft),
    onSuccess: (res) => setExpanded(res.expanded),
    onError: (e: Error) => message.error(e.message),
  });

  const runMut = useMutation({
    mutationFn: async () => {
      await saveMut.mutateAsync();
      return api.createRun({ scope: "scenarios", modules: [module], scenarios: [draft.id], options: { headless: true } });
    },
    onSuccess: (job) => {
      message.info("试跑已启动");
      navigate("/runs", { state: { jobId: job.jobId } });
    },
    onError: (e: Error) => message.error(e.message),
  });

  if (!isNew && scenarioQuery.isLoading) return <Spin style={{ margin: 48 }} />;

  return (
    <div style={{ padding: 24 }}>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/scenarios")}>返回</Button>
        <Button type="primary" icon={<SaveOutlined />} loading={saveMut.isPending} onClick={() => saveMut.mutate()}>
          保存
        </Button>
        <Button icon={<CheckOutlined />} onClick={() => validateMut.mutate()} loading={validateMut.isPending}>
          校验
        </Button>
        <Button icon={<EyeOutlined />} onClick={() => expandMut.mutate()} loading={expandMut.isPending}>
          展开预览
        </Button>
        <Button icon={<PlayCircleOutlined />} onClick={() => runMut.mutate()} loading={runMut.isPending}>
          试运行
        </Button>
      </Space>

      {issues.length > 0 && (
        <Alert
          type={issues.some((i) => i.level === "error") ? "error" : "warning"}
          message="校验结果"
          description={
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {issues.map((i, idx) => <li key={idx}>{i.message}</li>)}
            </ul>
          }
          style={{ marginBottom: 16 }}
          closable
          onClose={() => setIssues([])}
        />
      )}

      <Tabs
        items={[
          {
            key: "meta",
            label: "基本信息",
            children: (
              <Form layout="vertical" style={{ maxWidth: 560 }}>
                {isNew && (
                  <Form.Item label="文件路径 (相对模块)">
                    <Input value={file} onChange={(e) => setFile(e.target.value)} placeholder="login_success.json 或 addon/foo.json" />
                  </Form.Item>
                )}
                <Form.Item label="ID" required>
                  <Input value={draft.id} onChange={(e) => setDraft({ ...draft, id: e.target.value })} />
                </Form.Item>
                <Form.Item label="名称" required>
                  <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                </Form.Item>
                <Form.Item label="模块">
                  <Input value={draft.module} onChange={(e) => setDraft({ ...draft, module: e.target.value })} />
                </Form.Item>
                <Form.Item label="启用">
                  <Switch checked={draft.enabled} onChange={(v) => setDraft({ ...draft, enabled: v })} />
                </Form.Item>
                <Form.Item label="模式">
                  <Select
                    value={draft.mode}
                    options={[
                      { value: "full", label: "完整步骤" },
                      { value: "extends", label: "继承规则模板" },
                    ]}
                    onChange={(mode) => setDraft({ ...draft, mode })}
                  />
                </Form.Item>
              </Form>
            ),
          },
          {
            key: "setup",
            label: "运行配置",
            children: (
              <Form layout="vertical" style={{ maxWidth: 560 }}>
                <Form.Item label="requiresLogin">
                  <Switch
                    checked={draft.setup.requiresLogin}
                    onChange={(v) => setDraft({ ...draft, setup: { ...draft.setup, requiresLogin: v } })}
                  />
                </Form.Item>
                <Form.Item label="entryRoute">
                  <Input
                    value={draft.setup.entryRoute}
                    onChange={(e) => setDraft({ ...draft, setup: { ...draft.setup, entryRoute: e.target.value } })}
                  />
                </Form.Item>
                <Form.Item label="refresh">
                  <Switch
                    checked={!!draft.setup.refresh}
                    onChange={(v) => setDraft({ ...draft, setup: { ...draft.setup, refresh: v } })}
                  />
                </Form.Item>
              </Form>
            ),
          },
          {
            key: "steps",
            label: draft.mode === "extends" ? "模板 / 步骤" : "步骤",
            children: draft.mode === "extends" ? (
              <div style={{ maxWidth: 720 }}>
                <Form layout="vertical">
                  <Form.Item label="extends 规则">
                    <Select
                      value={draft.extends}
                      options={(rulesQuery.data ?? []).map((r) => ({ value: r.id, label: r.id }))}
                      onChange={(v) => setDraft({ ...draft, extends: v })}
                      showSearch
                    />
                  </Form.Item>
                  <Form.Item label="params (JSON)">
                    <Input.TextArea
                      rows={4}
                      value={JSON.stringify(draft.params ?? {}, null, 2)}
                      onChange={(e) => {
                        try {
                          setDraft({ ...draft, params: JSON.parse(e.target.value) });
                        } catch { /* ignore while typing */ }
                      }}
                    />
                  </Form.Item>
                </Form>
                <p>可选追加步骤：</p>
                <StepListEditor
                  steps={draft.steps}
                  onChange={(steps) => setDraft({ ...draft, steps })}
                  macroIds={(macrosQuery.data ?? []).map((m) => m.id)}
                />
              </div>
            ) : (
              <StepListEditor
                steps={draft.steps}
                onChange={(steps) => setDraft({ ...draft, steps })}
                macroIds={(macrosQuery.data ?? []).map((m) => m.id)}
              />
            ),
          },
          {
            key: "preview",
            label: "预览",
            children: (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, height: 480 }}>
                <JsonPreview data={draft} title="当前草稿" />
                <JsonPreview data={expanded} loading={expandMut.isPending} title="展开后" />
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
