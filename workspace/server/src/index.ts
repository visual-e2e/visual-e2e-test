import Fastify from "fastify";
import cors from "@fastify/cors";
import { loadConfig } from "./config.js";
import { RunOrchestratorService } from "./services/run-orchestrator.service.js";
import { SettingsRepository } from "./repositories/settings.repo.js";
import { ProjectRepository } from "./repositories/project.repo.js";
import { listProjectIds } from "./project-context.js";
import { registerProjectRoutes, registerProjectMiddleware } from "./routes/projects.js";
import { registerModuleRoutes } from "./routes/modules.js";
import { registerScenarioRoutes } from "./routes/scenarios.js";
import { registerValidateRoutes } from "./routes/validate.js";
import { registerFixtureRoutes } from "./routes/fixtures.js";
import { registerProfileRoutes } from "./routes/profiles.js";
import { registerRunRoutes } from "./routes/runs.js";
import { registerConfigRoutes } from "./routes/config.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const app = Fastify({ logger: true });

  const runService = new RunOrchestratorService(config);
  const settingsRepo = new SettingsRepository(config);
  const projectRepo = new ProjectRepository(config);

  await app.register(cors, { origin: true });

  registerProjectMiddleware(app, config);

  app.get("/api/health", async () => ({
    ok: true,
    e2eRoot: config.e2eRoot,
    defaultProject: config.defaultProjectId,
    projects: projectRepo.list().map((p) => ({
      id: p.id,
      name: p.name,
      envReady: p.envReady,
    })),
  }));

  registerProjectRoutes(app, config);
  registerModuleRoutes(app, config);
  registerScenarioRoutes(app, config);
  registerValidateRoutes(app, config);
  registerFixtureRoutes(app, config);
  registerProfileRoutes(app, config);
  registerRunRoutes(app, runService, config);
  registerConfigRoutes(app, settingsRepo);

  await app.listen({ port: config.port, host: "0.0.0.0" });
  console.log(`Workspace API: http://localhost:${config.port}`);
  console.log(`E2E_ROOT: ${config.e2eRoot}`);
  console.log(`Projects: ${listProjectIds(config.e2eRoot).join(", ")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
