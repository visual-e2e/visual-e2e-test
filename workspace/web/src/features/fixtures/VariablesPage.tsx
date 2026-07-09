import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Typography, Input, Button, message, Alert } from "antd";
import { SaveOutlined } from "@ant-design/icons";
import { api } from "../../api/client";
import { VARIABLES_USAGE } from "../../constants/config-field-meta";
import { useProject } from "../../context/ProjectContext";

export function VariablesPage() {
  const { projectId } = useProject();
  const [text, setText] = useState("");
  const query = useQuery({
    queryKey: ["variables", projectId],
    queryFn: api.variables,
    enabled: !!projectId,
  });

  const saveMut = useMutation({
    mutationFn: () => api.saveVariables(JSON.parse(text)),
    onSuccess: () => message.success("已保存"),
    onError: (e: Error) => message.error(e.message),
  });

  const data = query.data;
  const display = text || (data ? JSON.stringify(data, null, 2) : "");

  return (
    <div style={{ padding: 24 }}>
      <Typography.Title level={4}>全局变量</Typography.Title>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message={`配置文件：projects/${projectId}/fixtures/variables.json`}
        description={
          <ul style={{ margin: "8px 0 0", paddingLeft: 20 }}>
            {VARIABLES_USAGE.map((line) => (
              <li key={line} style={{ marginBottom: 4 }}>{line}</li>
            ))}
          </ul>
        }
      />

      <Button
        type="primary"
        icon={<SaveOutlined />}
        style={{ marginBottom: 12 }}
        loading={saveMut.isPending}
        onClick={() => saveMut.mutate()}
      >
        保存
      </Button>
      <Input.TextArea
        rows={24}
        value={display}
        onChange={(e) => setText(e.target.value)}
        style={{ fontFamily: "monospace", fontSize: 12 }}
      />
    </div>
  );
}
