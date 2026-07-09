import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";

const STORAGE_KEY = "activeProjectId";

interface ProjectMeta {
  id: string;
  name: string;
  description?: string;
  envReady?: boolean;
  moduleCount?: number;
}

interface ProjectContextValue {
  projectId: string;
  projects: ProjectMeta[];
  setProjectId: (id: string) => void;
  isLoading: boolean;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

function syncProjectIdToClient(id: string): void {
  api.setProjectId(id);
  localStorage.setItem(STORAGE_KEY, id);
}

export function ProjectProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const healthQuery = useQuery({ queryKey: ["health"], queryFn: api.health });
  const projectsQuery = useQuery({ queryKey: ["projects"], queryFn: api.projects });

  const [projectId, setProjectIdState] = useState(
    () => localStorage.getItem(STORAGE_KEY) ?? "",
  );

  const projects = projectsQuery.data ?? healthQuery.data?.projects ?? [];
  const effectiveId = projectId || healthQuery.data?.defaultProject || projects[0]?.id || "";

  useEffect(() => {
    if (!projectId && healthQuery.data?.defaultProject) {
      syncProjectIdToClient(healthQuery.data.defaultProject);
      setProjectIdState(healthQuery.data.defaultProject);
    }
  }, [projectId, healthQuery.data?.defaultProject]);

  useEffect(() => {
    if (effectiveId && effectiveId !== api.getProjectId()) {
      syncProjectIdToClient(effectiveId);
    }
  }, [effectiveId]);

  const setProjectId = (id: string) => {
    if (id === api.getProjectId()) return;
    syncProjectIdToClient(id);
    setProjectIdState(id);
    void qc.invalidateQueries();
  };

  return (
    <ProjectContext.Provider
      value={{
        projectId: effectiveId,
        projects,
        setProjectId,
        isLoading: healthQuery.isLoading || projectsQuery.isLoading,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject(): ProjectContextValue {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProject must be used within ProjectProvider");
  return ctx;
}
