import { useQuery } from "@tanstack/react-query";
import { Select } from "antd";
import { api } from "../../../api/client";
import { useProject } from "../../../context/ProjectContext";

interface ScenarioListPanelProps {
  activeModule: string;
  onModuleChange: (m: string) => void;
  selectedFile?: string;
  onSelectScenario: (file: string) => void;
}

export function ScenarioListPanel({
  activeModule,
  onModuleChange,
  selectedFile,
  onSelectScenario,
}: ScenarioListPanelProps) {
  const { projectId } = useProject();
  const modulesQuery = useQuery({
    queryKey: ["modules", projectId],
    queryFn: api.modules,
    enabled: !!projectId,
  });
  const scenariosQuery = useQuery({
    queryKey: ["scenarios", projectId, activeModule],
    queryFn: () => api.scenarios(activeModule),
    enabled: !!projectId && !!activeModule,
  });

  const scenarios = scenariosQuery.data ?? [];

  return (
    <div className="studio-list-panel">
      <div className="studio-list-panel__head">
        <Select
          style={{ width: "100%" }}
          value={activeModule}
          onChange={onModuleChange}
          options={(modulesQuery.data ?? []).map((m) => ({ value: m.module, label: m.module }))}
        />
        <div className="studio-list-panel__title">场景列表</div>
      </div>
      <div className="studio-list-panel__body">
        {scenarios.map((s) => {
          const active = selectedFile === s.file;
          return (
            <div
              key={s.file}
              className={`studio-list-item${active ? " studio-list-item--active" : ""}`}
              onClick={() => onSelectScenario(s.file)}
            >
              <span className="studio-list-item__name" title={s.name}>
                {s.name}
              </span>
            </div>
          );
        })}
        {!scenariosQuery.isLoading && scenarios.length === 0 && (
          <div style={{ padding: 16, color: "#bfbfbf", fontSize: 12, textAlign: "center" }}>
            暂无场景
          </div>
        )}
      </div>
    </div>
  );
}
