import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Card, Space, Input, message } from "antd";
import { SaveOutlined, ReloadOutlined } from "@ant-design/icons";
import { api } from "../../api/client";
import { useProject } from "../../context/ProjectContext";

export function EnvConfigPanel() {
  const qc = useQueryClient();
  const { projectId } = useProject();
  const [text, setText] = useState("");
  const [dirty, setDirty] = useState(false);

  const envQuery = useQuery({ queryKey: ["env-check", projectId], queryFn: api.envCheck });
  const contentQuery = useQuery({ queryKey: ["env-content", projectId], queryFn: api.getEnv });

  useEffect(() => {
    setDirty(false);
    setText("");
  }, [projectId]);

  useEffect(() => {
    if (contentQuery.data && !dirty) {
      setText(contentQuery.data.content);
    }
  }, [contentQuery.data, dirty]);

  const saveMut = useMutation({
    mutationFn: () => api.saveEnv(text),
    onSuccess: () => {
      message.success("环境配置已保存");
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["env-check", projectId] });
      qc.invalidateQueries({ queryKey: ["env-content", projectId] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  const fillTemplate = () => {
    const template = contentQuery.data?.template;
    if (!template) {
      message.warning("未找到 .env.example 模板");
      return;
    }
    setText(template);
    setDirty(true);
  };

  const reload = () => {
    setDirty(false);
    contentQuery.refetch();
    envQuery.refetch();
  };

  const envPath = contentQuery.data?.path ?? `projects/${projectId}/.env`;

  return (
    <Card size="small" title={`环境配置 (${envPath})`} style={{ marginBottom: 16 }}>
      {envQuery.data && !envQuery.data.ok && (
        <Alert
          type="warning"
          message="环境未就绪"
          description={`缺少: ${envQuery.data.missing.join(", ")}`}
          style={{ marginBottom: 12 }}
          showIcon
        />
      )}
      {envQuery.data?.ok && (
        <Alert type="success" message="环境已就绪" style={{ marginBottom: 12 }} showIcon />
      )}
      <Space style={{ marginBottom: 12 }}>
        <Button
          type="primary"
          icon={<SaveOutlined />}
          loading={saveMut.isPending}
          onClick={() => saveMut.mutate()}
        >
          保存{dirty ? " *" : ""}
        </Button>
        <Button icon={<ReloadOutlined />} onClick={reload}>
          重新加载
        </Button>
        <Button onClick={fillTemplate}>从 .env.example 填充</Button>
      </Space>
      <Input.TextArea
        rows={10}
        value={text}
        onChange={(e) => { setText(e.target.value); setDirty(true); }}
        placeholder="BASE_URL=..."
        style={{ fontFamily: "monospace", fontSize: 12 }}
      />
      <div style={{ marginTop: 8, fontSize: 12, color: "#8c8c8c" }}>
        必填项：BASE_URL、USERNAME、PASSWORD。密码保存后显示为 ******，未修改时保留原值。
      </div>
    </Card>
  );
}
