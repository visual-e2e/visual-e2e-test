import { JsonPreview } from "../../components/JsonPreview";

interface ScenarioDetailPanelProps {
  data: unknown | undefined;
  loading: boolean;
  file?: string;
}

export function ScenarioDetailPanel({ data, loading, file }: ScenarioDetailPanelProps) {
  if (!file) {
    return (
      <div style={{ padding: 24, color: "#999" }}>
        从左侧列表选择一个场景查看 JSON
      </div>
    );
  }

  return <JsonPreview data={data} loading={loading} title={file} />;
}
