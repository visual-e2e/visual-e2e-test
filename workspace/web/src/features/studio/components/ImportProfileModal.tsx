import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Modal, Table, message } from "antd";
import { api } from "../../../api/client";
import { useProject } from "../../../context/ProjectContext";
import { rawToDraft } from "../../../types/scenario";
import type { ScenarioDraft } from "../../../types/scenario";

interface ImportProfileModalProps {
  open: boolean;
  module: string;
  onClose: () => void;
  onImported: (draft: ScenarioDraft, suggestedFile: string) => void;
}

export function ImportProfileModal({ open, module, onClose, onImported }: ImportProfileModalProps) {
  const [loading, setLoading] = useState(false);
  const { projectId } = useProject();
  const query = useQuery({
    queryKey: ["profiles", projectId, module],
    queryFn: () => api.profiles(module),
    enabled: open && !!projectId && !!module,
  });

  const handleImport = async (file: string) => {
    setLoading(true);
    try {
      const res = await api.parseProfile(module, file);
      const draft = rawToDraft(res.scenario, module);
      const suggestedFile = `${draft.id || "imported"}.json`;
      onImported(draft, suggestedFile);
      message.success("画像已导入为场景草稿");
      onClose();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "导入失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="导入产品画像"
      open={open}
      onCancel={onClose}
      footer={null}
      width={640}
      destroyOnClose
    >
      <Table
        size="small"
        rowKey={(r) => r.file}
        loading={query.isLoading || loading}
        dataSource={query.data ?? []}
        pagination={false}
        columns={[
          { title: "文件", dataIndex: "file", ellipsis: true },
          { title: "标题", dataIndex: "title" },
          { title: "ID", dataIndex: "id", width: 140 },
          {
            title: "操作",
            width: 80,
            render: (_, row) => (
              <a onClick={() => handleImport(row.file)}>导入</a>
            ),
          },
        ]}
      />
    </Modal>
  );
}
