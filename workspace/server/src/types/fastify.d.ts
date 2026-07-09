import type { FastifyRequest } from "fastify";
import type { ProjectContext } from "./project-context.js";

declare module "fastify" {
  interface FastifyRequest {
    project: ProjectContext;
  }
}

export type ProjectRequest = FastifyRequest & { project: ProjectContext };
