import { Tooltip, Typography } from "antd";
import "./sidebar.css";

interface ProductBrandProps {
  collapsed: boolean;
}

export function ProductBrand({ collapsed }: ProductBrandProps) {
  const logo = (
    <img
      src="/favicon-32x32.png"
      alt="Visual E2E Test"
      className="sidebar-product-logo"
      width={32}
      height={32}
    />
  );

  if (collapsed) {
    return (
      <div className="sidebar-product-brand sidebar-product-brand--collapsed">
        <Tooltip title="Visual E2E Test" placement="right">
          {logo}
        </Tooltip>
      </div>
    );
  }

  return (
    <div className="sidebar-product-brand">
      {logo}
      <div className="sidebar-product-text">
        <Typography.Text className="sidebar-product-name" ellipsis>
          Visual E2E Test
        </Typography.Text>
        <Typography.Text className="sidebar-product-tagline" ellipsis type="secondary">
          JSON-driven E2E Workbench
        </Typography.Text>
      </div>
    </div>
  );
}
