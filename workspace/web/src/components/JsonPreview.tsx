import { Spin, Typography } from "antd";

interface JsonPreviewProps {
  data: unknown;
  loading?: boolean;
  title?: string;
}

export function JsonPreview({ data, loading, title }: JsonPreviewProps) {
  const text = data !== undefined ? JSON.stringify(data, null, 2) : "";

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {title && (
        <Typography.Text type="secondary" style={{ padding: "12px 16px", display: "block" }}>
          {title}
        </Typography.Text>
      )}
      <Spin spinning={loading ?? false} style={{ flex: 1 }}>
        <pre
          style={{
            margin: 0,
            padding: 16,
            flex: 1,
            overflow: "auto",
            background: "#fafafa",
            borderTop: "1px solid #f0f0f0",
            fontSize: 12,
            lineHeight: 1.6,
            height: "100%",
          }}
        >
          {text}
        </pre>
      </Spin>
    </div>
  );
}
