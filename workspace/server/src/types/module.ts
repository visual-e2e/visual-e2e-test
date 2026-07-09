export interface ScenarioSummary {
  id: string;
  name: string;
  module: string;
  file: string;
  enabled: boolean;
  extends?: string;
  stepCount?: number;
}

export interface ModuleManifest {
  module: string;
  description?: string;
  entryRoute?: string;
  scenarios: string[];
}

export interface ModuleInfo {
  module: string;
  description?: string;
  entryRoute?: string;
  scenarioCount: number;
}

export interface ScenarioTreeNode {
  key: string;
  title: string;
  isLeaf: boolean;
  children?: ScenarioTreeNode[];
  file?: string;
  scenarioId?: string;
}
