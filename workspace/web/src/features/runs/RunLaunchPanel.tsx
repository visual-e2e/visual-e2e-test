import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Space, Select, message, Card, Alert } from "antd";
import { PlayCircleOutlined } from "@ant-design/icons";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import { useProject } from "../../context/ProjectContext";
import type { RunScope, ScenarioSummary } from "../../types/module";
import { seedRunCache } from "./seed-run-cache";

function scenarioRef(s: ScenarioSummary): string {
  return `${s.module}/${s.id}`;
}

export function RunLaunchPanel() {
  const qc = useQueryClient();
  const { projectId } = useProject();
  const [scope, setScope] = useState<RunScope>("all");
  const [module, setModule] = useState<string>();
  const [scenarios, setScenarios] = useState<string[]>([]);
  const [scenarioSearch, setScenarioSearch] = useState("");
  const [headed, setHeaded] = useState(false);

  const modulesQuery = useQuery({
    queryKey: ["modules", projectId],
    queryFn: api.modules,
    enabled: !!projectId,
  });
  const envQuery = useQuery({
    queryKey: ["env-check", projectId],
    queryFn: api.envCheck,
    enabled: !!projectId,
  });
  const browserQuery = useQuery({
    queryKey: ["browser-check"],
    queryFn: api.browserCheck,
  });

  const allScenariosQuery = useQuery({
    queryKey: ["all-scenarios", projectId],
    queryFn: async () => {
      const mods = await api.modules();
      const lists = await Promise.all(mods.map((m) => api.scenarios(m.module)));
      return lists.flat();
    },
    enabled: !!projectId && scope === "scenarios",
  });

  const scenarioOptions = useMemo(() => {
    const all = allScenariosQuery.data ?? [];
    const filtered = module ? all.filter((s) => s.module === module) : all;
    const selected = new Set(scenarios);
    const extras = all.filter(
      (s) => selected.has(scenarioRef(s)) && !filtered.some((f) => scenarioRef(f) === scenarioRef(s)),
    );
    return [...filtered, ...extras].map((s) => ({
      value: scenarioRef(s),
      label: !module || s.module === module ? s.name : `[${s.module}] ${s.name}`,
    }));
  }, [allScenariosQuery.data, module, scenarios]);

  const runMut = useMutation({
    mutationFn: () => {
      if (scope === "scenarios") {
        return api.createRun({
          scope,
          modules: [],
          scenarios,
          options: { headed, headless: !headed },
        });
      }
      return api.createRun({
        scope,
        modules: scope === "all" ? [] : module ? [module] : [],
        scenarios: [],
        options: { headed, headless: !headed },
      });
    },
    onSuccess: (job) => {
      message.success("运行已启动");
      seedRunCache(qc, projectId, job);
    },
    onError: (e: Error) => message.error(e.message),
  });

  const envReady = envQuery.data?.ok ?? false;
  const browserReady = browserQuery.data?.ok ?? false;
  const canRun = envReady && browserReady
    && (scope !== "scenarios" ? scope === "all" || !!module : scenarios.length > 0);

  return (
    <Card size="small" title="发起运行" style={{ marginBottom: 16 }}>
      {!browserReady && browserQuery.data ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message="测试浏览器未就绪"
          description={(
            <>
              {browserQuery.data.hints.join(" ") || "请先配置测试浏览器。"}
              {" "}
              <Link to="/browser">前往浏览器环境</Link>
            </>
          )}
        />
      ) : null}
      <Space wrap>
        <Select
          value={scope}
          onChange={(v) => {
            setScope(v);
            if (v !== "scenarios") setScenarios([]);
          }}
          style={{ width: 140 }}
          options={[
            { value: "all", label: "全部" },
            { value: "module", label: "整模块" },
            { value: "scenarios", label: "指定场景" },
          ]}
        />
        {scope !== "all" && (
          <Select
            allowClear={scope === "scenarios"}
            placeholder={scope === "scenarios" ? "筛选模块（可选）" : "模块"}
            style={{ width: scope === "scenarios" ? 160 : 120 }}
            value={module}
            onChange={(v) => {
              setModule(v);
              setScenarioSearch("");
            }}
            options={(modulesQuery.data ?? []).map((m) => ({ value: m.module, label: m.module }))}
          />
        )}
        {scope === "scenarios" && (
          <Select
            mode="multiple"
            placeholder="场景（可跨模块，按选择顺序执行）"
            style={{ minWidth: 360 }}
            value={scenarios}
            onChange={setScenarios}
            loading={allScenariosQuery.isLoading}
            options={scenarioOptions}
            optionFilterProp="label"
            showSearch
            searchValue={scenarioSearch}
            onSearch={setScenarioSearch}
            autoClearSearchValue
          />
        )}
        <label>
          <input type="checkbox" checked={headed} onChange={(e) => setHeaded(e.target.checked)} /> Headed
        </label>
        <Button
          type="primary"
          icon={<PlayCircleOutlined />}
          loading={runMut.isPending}
          disabled={!canRun}
          onClick={() => runMut.mutate()}
        >
          开始运行
        </Button>
      </Space>
      <Alert
        type="info"
        message="多场景将按选择顺序在同一 run 中串行执行，生成一份报告。指定场景模式支持跨模块选择（如 login + project）。"
        style={{ marginTop: 12 }}
        showIcon
      />
    </Card>
  );
}
