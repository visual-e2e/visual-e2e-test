import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import { AppRoutes } from "./routes";
import { ProjectProvider } from "../context/ProjectContext";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

export function App() {
  return (
    <ConfigProvider locale={zhCN}>
      <QueryClientProvider client={queryClient}>
        <ProjectProvider>
          <AppRoutes />
        </ProjectProvider>
      </QueryClientProvider>
    </ConfigProvider>
  );
}
