import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppLayout } from "./layout/AppLayout";
import { ScenarioStudioPage } from "../features/studio/ScenarioStudioPage";
import { VariablesPage } from "../features/fixtures/VariablesPage";
import { MacroListPage } from "../features/fixtures/MacroListPage";
import { RuleListPage } from "../features/fixtures/RuleListPage";
import { ProfileListPage } from "../features/profiles/ProfileListPage";
import { RunCenterPage } from "../features/runs/RunCenterPage";
import { ValidateCenterPage } from "../features/validate/ValidateCenterPage";
import { SettingsPage } from "../features/config/SettingsPage";
import { BrowserRuntimePage } from "../features/config/BrowserRuntimePage";
import { ProjectsPage } from "../features/projects/ProjectsPage";
import { ToolsHubPage } from "../features/tools/ToolsHubPage";
import { ToolHostPage } from "../features/tools/ToolHostPage";

export function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Navigate to="/scenarios" replace />} />
          <Route path="/scenarios" element={<ScenarioStudioPage />} />
          <Route path="/scenarios/*" element={<ScenarioStudioPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/browser" element={<BrowserRuntimePage />} />
          <Route path="/variables" element={<VariablesPage />} />
          <Route path="/macros" element={<MacroListPage />} />
          <Route path="/macros/*" element={<MacroListPage />} />
          <Route path="/rules" element={<RuleListPage />} />
          <Route path="/rules/*" element={<RuleListPage />} />
          <Route path="/profiles" element={<ProfileListPage />} />
          <Route path="/runs" element={<RunCenterPage />} />
          <Route path="/validate" element={<ValidateCenterPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/tools" element={<ToolsHubPage />} />
          <Route path="/tools/:toolId" element={<ToolHostPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/scenarios" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
