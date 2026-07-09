import { useState, useEffect } from "react";

const KEY = "workspace.sider.collapsed";

export function useSiderCollapsed(): [boolean, (v: boolean) => void] {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(KEY) === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(KEY, String(collapsed));
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  return [collapsed, setCollapsed];
}
