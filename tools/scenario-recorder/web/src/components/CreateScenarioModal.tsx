import { Form, Input, Modal, Switch } from "antd";
import { useEffect } from "react";
import { FIXED_DEFAULTS } from "../cache/store";

export interface CreateScenarioValues {
  scenarioId: string;
  scenarioName: string;
  module: string;
  startUrl: string;
  requiresLogin: boolean;
  description: string;
}

interface CreateScenarioModalProps {
  open: boolean;
  mode?: "create" | "edit";
  defaults: CreateScenarioValues;
  confirmLoading?: boolean;
  onCancel: () => void;
  onSubmit: (values: CreateScenarioValues) => void | Promise<void>;
}

export function CreateScenarioModal({
  open,
  mode = "create",
  defaults,
  confirmLoading,
  onCancel,
  onSubmit,
}: CreateScenarioModalProps) {
  const [form] = Form.useForm<CreateScenarioValues>();
  const isEdit = mode === "edit";

  useEffect(() => {
    if (open) form.setFieldsValue(defaults);
  }, [open, defaults, form]);

  return (
    <Modal
      title={isEdit ? "编辑场景" : "新建场景"}
      open={open}
      onCancel={onCancel}
      confirmLoading={confirmLoading}
      destroyOnClose
      okText={isEdit ? "保存" : "创建"}
      onOk={() => {
        void form.validateFields().then((values) => onSubmit(values));
      }}
    >
      <Form form={form} layout="vertical" initialValues={defaults}>
        <Form.Item label="需要登录" name="requiresLogin" valuePropName="checked">
          <Switch />
        </Form.Item>
        <Form.Item
          label="场景 ID"
          name="scenarioId"
          rules={[{ required: true, message: "请输入场景 ID" }]}
        >
          <Input placeholder={FIXED_DEFAULTS.scenarioId} />
        </Form.Item>
        <Form.Item
          label="场景名称"
          name="scenarioName"
          rules={[{ required: true, message: "请输入场景名称" }]}
        >
          <Input placeholder={FIXED_DEFAULTS.scenarioName} />
        </Form.Item>
        <Form.Item
          label="模块"
          name="module"
          rules={[{ required: true, message: "请输入模块名" }]}
        >
          <Input placeholder={FIXED_DEFAULTS.module} />
        </Form.Item>
        <Form.Item
          label="起始地址"
          name="startUrl"
          rules={[{ required: true, message: "请输入起始 URL" }]}
        >
          <Input placeholder="https://example.com" />
        </Form.Item>
        <Form.Item label="描述" name="description">
          <Input.TextArea
            rows={3}
            placeholder="可选，显示在录制列表中"
            maxLength={500}
            showCount
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
