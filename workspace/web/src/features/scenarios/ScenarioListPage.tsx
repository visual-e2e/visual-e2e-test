import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Typography, Alert, Spin, Button, Space, Input, Modal, message,
} from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined, CopyOutlined, PlayCircleOutlined } from "@ant-design/icons";
import { api } from "../../api/client";
import { useProject } from "../../context/ProjectContext";
import type { ScenarioSummary } from "../../types/module";
import { ScenarioTable } from "./ScenarioTable";
import { ScenarioDetailPanel } from "./ScenarioDetailPanel";

export function ScenarioListPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { projectId } = useProject();
  const [activeModule, setActiveModule] = useState<string>();
  const [selected, setSelected] = useState<ScenarioSummary>();
  const [search, setSearch] = useState("");

  const modulesQuery = useQuery({
    queryKey: ["modules", projectId],
    queryFn: api.modules,
    enabled: !!projectId,
  });
  const scenariosQuery = useQuery({
    queryKey: ["scenarios", projectId, activeModule, search],
    queryFn: () => api.scenarios(activeModule!, search || undefined),
    enabled: !!projectId && !!activeModule,
  });
  const detailQuery = useQuery({
    queryKey: ["scenario", projectId, activeModule, selected?.file],
    queryFn: () => api.getScenario(activeModule!, selected!.file),
    enabled: !!projectId && !!activeModule && !!selected?.file,
  });

  const deleteMut = useMutation({
    mutationFn: () => api.deleteScenario(activeModule!, selected!.file),
    onSuccess: () => {
      message.success("已删除");
      setSelected(undefined);
      qc.invalidateQueries({ queryKey: ["scenarios", projectId, activeModule] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  const dupMut = useMutation({
    mutationFn: (newId: string) => api.duplicateScenario(activeModule!, selected!.file, newId),
    onSuccess: () => {
      message.success("已复制");
      qc.invalidateQueries({ queryKey: ["scenarios", projectId, activeModule] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  const runMut = useMutation({
    mutationFn: () => api.createRun({ scope: "scenarios", modules: [activeModule!], scenarios: [selected!.id], options: { headless: true } }),
    onSuccess: () => {
      message.success("试跑已启动");
      navigate("/runs");
    },
    onError: (e: Error) => message.error(e.message),
  });

  const handleDuplicate = () => {
    if (!selected) return;
    let newId = `${selected.id}_copy`;
    Modal.confirm({
      title: "复制场景",
      content: (
        <Input
          defaultValue={newId}
          onChange={(e) => { newId = e.target.value; }}
          placeholder="新场景 ID"
        />
      ),
      onOk: () => dupMut.mutateAsync(newId),
    });
  };

  return (
    <div style={{ padding: 24, height: "100%" }}>
      <Typography.Title level={4} style={{ marginTop: 0 }}>场景管理</Typography.Title>

      <Space wrap style={{ marginBottom: 16 }}>
        {(modulesQuery.data ?? []).map((m) => (
          <Button
            key={m.module}
            type={activeModule === m.module ? "primary" : "default"}
            onClick={() => { setActiveModule(m.module); setSelected(undefined); }}
          >
            {m.module} ({m.scenarioCount})
          </Button>
        ))}
        <Button
          type="dashed"
          icon={<PlusOutlined />}
          disabled={!activeModule}
          onClick={() => navigate(`/scenarios/new?module=${activeModule}`)}
        >
          新建场景
        </Button>
      </Space>

      {modulesQuery.isError && <Alert type="error" message="无法加载模块" />}

      {!activeModule ? (
        <div style={{ padding: 48, textAlign: "center", color: "#999" }}>
          <Spin spinning={modulesQuery.isLoading} />
          {!modulesQuery.isLoading && "请选择模块"}
        </div>
      ) : (
        <div style={{ display: "flex", minHeight: 480 }}>
          <div style={{ flex: "0 0 50%", borderRight: "1px solid #f0f0f0", padding: 16 }}>
            <Space style={{ marginBottom: 12 }}>
              <Input.Search
                placeholder="搜索 id / 名称"
                allowClear
                onSearch={setSearch}
                style={{ width: 220 }}
              />
              <Button
                icon={<EditOutlined />}
                disabled={!selected}
                onClick={() => navigate(`/scenarios/${activeModule}/edit/${selected!.file}`)}
              >
                编辑
              </Button>
              <Button icon={<CopyOutlined />} disabled={!selected} onClick={handleDuplicate}>
                复制
              </Button>
              <Button icon={<PlayCircleOutlined />} disabled={!selected} loading={runMut.isPending} onClick={() => runMut.mutate()}>
                试跑
              </Button>
              <Button
                danger
                icon={<DeleteOutlined />}
                disabled={!selected}
                onClick={() => {
                  Modal.confirm({
                    title: "确认删除？",
                    onOk: () => deleteMut.mutateAsync(),
                  });
                }}
              >
                删除
              </Button>
            </Space>
            <ScenarioTable
              scenarios={scenariosQuery.data ?? []}
              loading={scenariosQuery.isLoading}
              selectedFile={selected?.file}
              onSelect={setSelected}
            />
          </div>
          <div style={{ flex: 1, minHeight: 400 }}>
            <ScenarioDetailPanel
              data={detailQuery.data}
              loading={detailQuery.isLoading}
              file={selected?.file}
            />
          </div>
        </div>
      )}
    </div>
  );
}
