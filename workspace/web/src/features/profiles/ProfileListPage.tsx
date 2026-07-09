import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Typography, Table, Button, Space, Select, message, Modal, Alert, Drawer, Input, Spin,
} from "antd";
import { EditOutlined, SyncOutlined, SaveOutlined } from "@ant-design/icons";
import { api } from "../../api/client";
import { useProject } from "../../context/ProjectContext";

export function ProfileListPage() {
  const qc = useQueryClient();
  const { projectId } = useProject();
  const [module, setModule] = useState<string>();
  const [editing, setEditing] = useState<{ module: string; file: string } | null>(null);
  const [mdContent, setMdContent] = useState("");
  const [dirty, setDirty] = useState(false);

  const query = useQuery({
    queryKey: ["profiles", projectId, module],
    queryFn: () => api.profiles(module),
    enabled: !!projectId,
  });
  const modulesQuery = useQuery({
    queryKey: ["profile-modules", projectId],
    queryFn: async () => {
      const profiles = await api.profiles();
      return [...new Set(profiles.map((p) => p.module))].sort();
    },
    enabled: !!projectId,
  });

  const contentQuery = useQuery({
    queryKey: ["profile-content", projectId, editing?.module, editing?.file],
    queryFn: () => api.getProfileContent(editing!.module, editing!.file),
    enabled: !!editing,
  });

  useEffect(() => {
    if (contentQuery.data) {
      setMdContent(contentQuery.data.content);
      setDirty(false);
    }
  }, [contentQuery.data]);

  const openEditor = (row: { module: string; file: string }) => {
    setEditing(row);
    setMdContent("");
    setDirty(false);
  };

  const closeEditor = () => {
    if (dirty) {
      Modal.confirm({
        title: "有未保存修改",
        content: "确定关闭？",
        onOk: () => { setEditing(null); setMdContent(""); setDirty(false); },
      });
    } else {
      setEditing(null);
      setMdContent("");
    }
  };

  const syncMut = useMutation({
    mutationFn: (opts: { module: string; name?: string; force?: boolean }) =>
      api.syncProfile(opts.module, opts.name, opts.force),
    onSuccess: (res) => {
      message.success(res.ok ? "同步完成" : "同步结束（有警告）");
      qc.invalidateQueries({ queryKey: ["profiles", projectId] });
      qc.invalidateQueries({ queryKey: ["scenarios", projectId] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  const saveMut = useMutation({
    mutationFn: () => api.saveProfile(editing!.module, editing!.file, mdContent),
    onSuccess: () => {
      message.success("已保存");
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["profile-content", projectId, editing?.module, editing?.file] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  return (
    <div style={{ padding: 24 }}>
      <Typography.Title level={4}>产品画像</Typography.Title>
      <Alert
        style={{ marginBottom: 16 }}
        type="info"
        showIcon
        message="在此模块编辑 Markdown 画像；同步 JSON 将写入 scenarios/。场景管理页可通过「导入画像」从画像创建场景。"
      />
      <Space style={{ marginBottom: 16 }}>
        <Select
          allowClear
          placeholder="筛选模块"
          style={{ width: 160 }}
          options={(modulesQuery.data ?? []).map((m) => ({ value: m, label: m }))}
          onChange={setModule}
        />
        <Button
          icon={<SyncOutlined />}
          onClick={() => {
            Modal.confirm({
              title: "批量同步全部画像？",
              onOk: () => api.syncProfileBatch(true).then(() => message.success("完成")),
            });
          }}
        >
          批量同步
        </Button>
      </Space>
      <Table
        rowKey={(r) => `${r.module}/${r.file}`}
        loading={query.isLoading}
        dataSource={query.data ?? []}
        columns={[
          { title: "模块", dataIndex: "module", width: 100 },
          { title: "文件", dataIndex: "file", ellipsis: true },
          { title: "标题", dataIndex: "title" },
          { title: "ID", dataIndex: "id", width: 160 },
          {
            title: "converted",
            dataIndex: "converted",
            width: 100,
            render: (v: boolean) => (v ? "是" : "否"),
          },
          {
            title: "操作",
            render: (_, row) => (
              <Space>
                <Button size="small" icon={<EditOutlined />} onClick={() => openEditor(row)}>
                  编辑
                </Button>
                <Button
                  size="small"
                  icon={<SyncOutlined />}
                  loading={syncMut.isPending}
                  onClick={() =>
                    syncMut.mutate({
                      module: row.module,
                      name: row.file.replace(/\.md$/, "").split("/").pop(),
                      force: true,
                    })
                  }
                >
                  同步 JSON
                </Button>
              </Space>
            ),
          },
        ]}
      />

      <Drawer
        title={editing ? `产品画像/${editing.module}/${editing.file}` : ""}
        open={!!editing}
        onClose={closeEditor}
        width={720}
        extra={
          <Space>
            <Button icon={<SaveOutlined />} type="primary" loading={saveMut.isPending} onClick={() => saveMut.mutate()}>
              保存
            </Button>
            {editing && (
              <Button
                icon={<SyncOutlined />}
                onClick={() =>
                  syncMut.mutate({
                    module: editing.module,
                    name: editing.file.replace(/\.md$/, "").split("/").pop(),
                    force: true,
                  })
                }
              >
                同步 JSON
              </Button>
            )}
          </Space>
        }
      >
        <Spin spinning={contentQuery.isLoading}>
          <Input.TextArea
            value={mdContent}
            onChange={(e) => { setMdContent(e.target.value); setDirty(true); }}
            style={{ height: "calc(100vh - 160px)", fontFamily: "monospace", fontSize: 13 }}
          />
        </Spin>
      </Drawer>
    </div>
  );
}
