import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Typography,
  Input,
  Button,
  Table,
  Tag,
  Space,
  Select,
  Switch,
  InputNumber,
  message,
  Modal,
  Alert,
  Row,
  Col,
  Card,
  Form,
} from "antd";
import {
  FolderOpenOutlined,
  ReloadOutlined,
  DeleteOutlined,
  PlayCircleOutlined,
} from "@ant-design/icons";
import { useMutation } from "@tanstack/react-query";
import { api } from "./api/client";
import {
  clearCache,
  loadCache,
  rememberDir,
  saveCache,
  TOOL_ID,
  type ImageRenameCache,
  type SortMode,
} from "./cache/store";
import { TOOL_MSG, SORT_OPTIONS, formatSize, type FileEntry } from "./types";
import { applyTemplate, splitName } from "./utils/template";
import "./app.css";

function defaultState(): ImageRenameCache {
  return loadCache();
}

function sortFileNames(files: FileEntry[], sort: SortMode): FileEntry[] {
  const copy = [...files];
  copy.sort((a, b) => {
    switch (sort) {
      case "name-asc":
        return a.name.localeCompare(b.name, undefined, { numeric: true });
      case "name-desc":
        return b.name.localeCompare(a.name, undefined, { numeric: true });
      case "mtime-asc":
        return a.mtime - b.mtime;
      case "mtime-desc":
        return b.mtime - a.mtime;
    }
  });
  return copy;
}

export function App() {
  const [cache, setCache] = useState<ImageRenameCache>(defaultState);
  const [dir, setDir] = useState(cache.lastDir);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [preview, setPreview] = useState<Array<{ from: string; to: string; conflict?: string }>>(
    [],
  );

  const listMut = useMutation({
    mutationFn: ({ targetDir, imagesOnly }: { targetDir: string; imagesOnly: boolean }) =>
      api.list(targetDir, imagesOnly),
    onSuccess: (data) => {
      setFiles(data);
      setSelected(data.map((f) => f.name));
      setPreview([]);
      setCurrentPage(1);
    },
    onError: (e: Error) => message.error(e.message),
  });

  const applyMut = useMutation({
    mutationFn: () => {
      const items = preview.filter((p) => p.from !== p.to && !p.conflict);
      return api.apply(dir, items);
    },
    onSuccess: (result) => {
      if (result.failed.length > 0) {
        message.warning(`完成 ${result.succeeded.length} 个，失败 ${result.failed.length} 个`);
      } else {
        message.success(`已重命名 ${result.succeeded.length} 个文件`);
      }
      loadDir(dir);
    },
    onError: (e: Error) => message.error(e.message),
  });

  const loadDir = useCallback(
    (path?: string) => {
      const target = (path ?? dir).trim();
      if (!target) {
        message.warning("请输入文件夹路径");
        return;
      }
      setDir(target);
      const next = rememberDir(target);
      setCache(next);
      listMut.mutate({ targetDir: target, imagesOnly: next.imagesOnly });
    },
    [dir, listMut],
  );

  const refreshPreview = useCallback(async () => {
    if (!dir.trim() || selected.length === 0) {
      setPreview([]);
      return;
    }
    try {
      const data = await api.preview({
        dir,
        files: selected,
        sort: cache.sort,
        rule: {
          template: cache.naming.template,
          prefix: cache.naming.prefix,
          startIndex: cache.naming.startIndex,
        },
        allFiles: files,
      });
      setPreview(data);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "预览失败");
    }
  }, [dir, selected, cache.sort, cache.naming, files]);

  useEffect(() => {
    void refreshPreview();
  }, [refreshPreview]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; path?: string | null };
      if (data?.type === TOOL_MSG.CACHE_CLEAR) {
        clearCache();
        const fresh = defaultState();
        setCache(fresh);
        setDir("");
        setFiles([]);
        setSelected([]);
        setPreview([]);
        setCurrentPage(1);
        if (event.source && "postMessage" in event.source) {
          event.source.postMessage(
            { type: TOOL_MSG.CACHE_CLEARED, toolId: TOOL_ID },
            { targetOrigin: event.origin },
          );
        }
        message.success("已清除缓存");
      }
      if (data?.type === TOOL_MSG.PICK_FOLDER_RESULT && data.path) {
        loadDir(data.path);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [loadDir]);

  useEffect(() => {
    if (cache.lastDir) {
      listMut.mutate({ targetDir: cache.lastDir, imagesOnly: cache.imagesOnly });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const previewMap = useMemo(() => new Map(preview.map((p) => [p.from, p])), [preview]);
  const previewNumberMap = useMemo(
    () => new Map(preview.map((p, index) => [p.from, cache.naming.startIndex + index])),
    [preview, cache.naming.startIndex],
  );
  const sortedFiles = useMemo(() => sortFileNames(files, cache.sort), [files, cache.sort]);
  const hasConflict = preview.some((p) => p.conflict);
  const hasChanges = preview.some((p) => p.from !== p.to && !p.conflict);

  const namingExample = useMemo(() => {
    const sample = sortedFiles.find((file) => selected.includes(file.name));
    if (!sample) return null;
    const { name, ext } = splitName(sample.name);
    const result = applyTemplate(cache.naming.template, {
      name,
      ext,
      index: cache.naming.startIndex,
      prefix: cache.naming.prefix,
    });
    return { from: sample.name, to: result };
  }, [sortedFiles, selected, cache.naming]);

  const pickFolder = () => {
    if (window.parent !== window) {
      window.parent.postMessage({ type: TOOL_MSG.PICK_FOLDER }, "*");
      return;
    }
    message.info("请在主工作台中打开，或手动输入路径");
  };

  const patchCache = (patch: Partial<ImageRenameCache>) => {
    const next = saveCache(patch);
    setCache(next);
  };

  const handleClearCache = () => {
    Modal.confirm({
      title: "清除缓存",
      content: "将清除 localStorage 中的路径与命名偏好，不影响磁盘文件。",
      okText: "清除",
      onOk: () => {
        clearCache();
        const fresh = defaultState();
        setCache(fresh);
        setDir("");
        setFiles([]);
        setSelected([]);
        setPreview([]);
        setCurrentPage(1);
        message.success("已清除缓存");
      },
    });
  };

  const handleApply = () => {
    if (hasConflict) {
      message.error("存在命名冲突，请调整规则");
      return;
    }
    if (!hasChanges) {
      message.info("没有需要重命名的文件");
      return;
    }
    const count = preview.filter((p) => p.from !== p.to && !p.conflict).length;
    Modal.confirm({
      title: "确认重命名",
      content: `将重命名 ${count} 个文件，此操作不可撤销。`,
      okText: "执行",
      onOk: () => applyMut.mutateAsync(),
    });
  };

  const columns = [
    {
      title: "#",
      width: 48,
      render: (_: unknown, row: FileEntry) => previewNumberMap.get(row.name) ?? "—",
    },
    { title: "文件名", dataIndex: "name", ellipsis: true },
    {
      title: "类型",
      dataIndex: "typeLabel",
      width: 80,
      render: (label: string) => <Tag>{label}</Tag>,
    },
    {
      title: "大小",
      dataIndex: "size",
      width: 88,
      render: (size: number) => formatSize(size),
    },
    {
      title: "新文件名",
      key: "preview",
      ellipsis: true,
      render: (_: unknown, row: FileEntry) => {
        const p = previewMap.get(row.name);
        if (!p) return "—";
        if (p.conflict) {
          return (
            <Typography.Text type="danger">
              {p.to} ({p.conflict})
            </Typography.Text>
          );
        }
        if (p.from === p.to) return <Typography.Text type="secondary">{p.to}</Typography.Text>;
        return p.to;
      },
    },
  ];

  return (
    <div className="rename-app">
      <div className="rename-app__header">
        <Typography.Title level={4} style={{ margin: 0 }}>
          图片批量重命名
        </Typography.Title>
        <Button icon={<DeleteOutlined />} onClick={handleClearCache}>
          清除缓存
        </Button>
      </div>

      <Space wrap style={{ marginBottom: 16 }}>
        <Input
          style={{ width: 360 }}
          placeholder="文件夹绝对路径"
          value={dir}
          onChange={(e) => setDir(e.target.value)}
          onPressEnter={() => loadDir()}
        />
        <Button icon={<FolderOpenOutlined />} onClick={pickFolder}>
          浏览
        </Button>
        <Button icon={<ReloadOutlined />} loading={listMut.isPending} onClick={() => loadDir()}>
          刷新
        </Button>
        <Select
          style={{ width: 140 }}
          value={cache.sort}
          options={SORT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          onChange={(sort: SortMode) => {
            setCurrentPage(1);
            patchCache({ sort });
          }}
        />
        <Space>
          仅图片
          <Switch
            checked={cache.imagesOnly}
            onChange={(imagesOnly) => {
              const next = saveCache({ imagesOnly });
              setCache(next);
              if (dir.trim()) {
                listMut.mutate({ targetDir: dir.trim(), imagesOnly });
              }
            }}
          />
        </Space>
        <Typography.Text type="secondary">
          已选 {selected.length}/{files.length}
        </Typography.Text>
      </Space>

      {cache.recentDirs.length > 0 && (
        <Space wrap style={{ marginBottom: 12 }}>
          <Typography.Text type="secondary">最近:</Typography.Text>
          {cache.recentDirs.map((d) => (
            <Button key={d} type="link" size="small" onClick={() => loadDir(d)}>
              {d}
            </Button>
          ))}
        </Space>
      )}

      <Row gutter={16}>
        <Col xs={24} lg={16}>
          <Table
            size="small"
            rowKey="name"
            loading={listMut.isPending}
            dataSource={sortedFiles}
            columns={columns}
            pagination={{
              current: currentPage,
              pageSize,
              showSizeChanger: true,
              onChange: (page, size) => {
                setCurrentPage(page);
                setPageSize(size);
              },
            }}
            rowSelection={{
              selectedRowKeys: selected,
              onChange: (keys) => setSelected(keys as string[]),
            }}
          />
        </Col>
        <Col xs={24} lg={8}>
          <Card title="命名规则" size="small">
            <Form layout="vertical" size="small" requiredMark={false}>
              <Form.Item
                label="前缀"
                tooltip="加到每个新文件名开头的固定文本"
                extra="示例：step、login、screenshot"
              >
                <Input
                  value={cache.naming.prefix}
                  onChange={(e) =>
                    patchCache({ naming: { ...cache.naming, prefix: e.target.value } })
                  }
                />
              </Form.Item>
              <Form.Item
                label="模板"
                tooltip="支持占位符：{prefix} {name} {ext} {index} {index:3}"
                extra="{index:3} 表示 3 位补零序号，{ext} 含点号"
              >
                <Input
                  value={cache.naming.template}
                  onChange={(e) =>
                    patchCache({ naming: { ...cache.naming, template: e.target.value } })
                  }
                  placeholder="{prefix}_{index:3}{ext}"
                />
              </Form.Item>
              <Form.Item
                label="起始序号"
                tooltip="按当前排序，第一个被选中文件的序号"
                extra="默认从 1 开始；下一个文件依次 +1"
              >
                <InputNumber
                  min={0}
                  style={{ width: "100%" }}
                  value={cache.naming.startIndex}
                  onChange={(v) =>
                    patchCache({
                      naming: { ...cache.naming, startIndex: v ?? 1 },
                    })
                  }
                />
              </Form.Item>
            </Form>

            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 12 }}
              message="命名示例"
              description={
                namingExample ? (
                  <Typography.Text>
                    <Typography.Text code>{namingExample.from}</Typography.Text>
                    {" → "}
                    <Typography.Text code>{namingExample.to}</Typography.Text>
                    <br />
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      以当前排序下第一个选中文件为例
                    </Typography.Text>
                  </Typography.Text>
                ) : (
                  <Typography.Text type="secondary">选择文件夹并勾选文件后显示示例</Typography.Text>
                )
              }
            />

            {hasConflict && (
              <Alert
                type="error"
                showIcon
                style={{ marginBottom: 12 }}
                message="存在命名冲突，请调整规则或取消勾选"
              />
            )}
            <Button
              type="primary"
              block
              icon={<PlayCircleOutlined />}
              loading={applyMut.isPending}
              disabled={!hasChanges || hasConflict}
              onClick={handleApply}
            >
              执行重命名
            </Button>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
