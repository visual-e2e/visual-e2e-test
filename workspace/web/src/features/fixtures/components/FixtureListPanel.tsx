import { useQuery } from "@tanstack/react-query";
import type { MacroSummary, RuleSummary } from "../../../types/module";
import { useProject } from "../../../context/ProjectContext";

interface FixtureListPanelProps {
  title: string;
  queryKey: string;
  listFn: () => Promise<Array<MacroSummary | RuleSummary>>;
  selectedId?: string;
  onSelect: (id: string) => void;
}

export function FixtureListPanel({
  title, queryKey, listFn, selectedId, onSelect,
}: FixtureListPanelProps) {
  const { projectId } = useProject();
  const listQuery = useQuery({
    queryKey: [queryKey, projectId],
    queryFn: listFn,
    enabled: !!projectId,
  });
  const items = listQuery.data ?? [];

  return (
    <div className="studio-list-panel">
      <div className="studio-list-panel__head">
        <div className="studio-list-panel__title">{title}</div>
      </div>
      <div className="studio-list-panel__body">
        {items.map((item) => {
          const active = selectedId === item.id;
          const label = "description" in item && item.description ? item.description : item.id;
          return (
            <div
              key={item.id}
              className={`studio-list-item${active ? " studio-list-item--active" : ""}`}
              onClick={() => onSelect(item.id)}
            >
              <span className="studio-list-item__name" title={`${item.id} — ${label}`}>
                {label}
              </span>
            </div>
          );
        })}
        {!listQuery.isLoading && items.length === 0 && (
          <div style={{ padding: 16, color: "#bfbfbf", fontSize: 12, textAlign: "center" }}>
            暂无数据，点击「新建」
          </div>
        )}
      </div>
    </div>
  );
}
