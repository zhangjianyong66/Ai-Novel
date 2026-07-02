export const PROJECT_BUNDLE_SCHEMA_VERSION = "project_bundle_v1";
export const DEFAULT_PROJECT_BUNDLE_IMPORT_MAX_BYTES = 50 * 1024 * 1024;

type UnknownRecord = Record<string, unknown>;

export type ProjectBundleSummaryCounts = {
  outlines: number;
  chapters: number;
  characters: number;
  worldbookEntries: number;
  promptPresets: number;
  promptBlocks: number;
  structuredMemoryItems: number;
  storyMemories: number;
  knowledgeBases: number;
  sourceDocuments: number;
  projectTables: number;
  projectTableRows: number;
  glossaryTerms: number;
};

export type ProjectBundleSummary = {
  projectName: string;
  schemaVersion: string;
  counts: ProjectBundleSummaryCounts;
  apiKeyWarnings: string[];
};

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): UnknownRecord {
  return isRecord(value) ? value : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function countArray(value: unknown): number {
  return asArray(value).length;
}

function section(value: unknown, key: string): unknown {
  return asRecord(value)[key];
}

export function isProjectBundleV1(value: unknown): value is UnknownRecord {
  return isRecord(value) && value.schema_version === PROJECT_BUNDLE_SCHEMA_VERSION;
}

export function getProjectBundleApiKeyWarnings(bundle: unknown): string[] {
  const settings = asRecord(section(bundle, "settings"));
  const embedding = asRecord(settings.vector_embedding);
  const rerank = asRecord(settings.vector_rerank);
  const warnings: string[] = [];
  if (embedding.has_api_key === true) warnings.push("向量 embedding API Key 不会随项目包导入");
  if (rerank.has_api_key === true) warnings.push("向量 rerank API Key 不会随项目包导入");
  return warnings;
}

export function buildProjectBundleSummary(bundle: unknown): ProjectBundleSummary {
  const root = asRecord(bundle);
  const project = asRecord(root.project);
  const projectName = typeof project.name === "string" && project.name.trim() ? project.name.trim() : "未命名项目";
  const worldbook = asRecord(root.worldbook);
  const promptPresets = asRecord(root.prompt_presets);
  const structuredMemory = asRecord(root.structured_memory);
  const storyMemory = asRecord(root.story_memory);
  const knowledgeBases = asRecord(root.knowledge_bases);
  const sourceDocuments = asRecord(root.source_documents);
  const projectTables = asRecord(root.project_tables);
  const glossaryTerms = asRecord(root.glossary_terms);

  const promptPresetItems = asArray(promptPresets.presets);
  const tableItems = asArray(projectTables.tables);

  const counts: ProjectBundleSummaryCounts = {
    outlines: countArray(root.outlines),
    chapters: countArray(root.chapters),
    characters: countArray(root.characters),
    worldbookEntries: countArray(worldbook.entries),
    promptPresets: promptPresetItems.length,
    promptBlocks: promptPresetItems.reduce<number>((sum, item) => sum + countArray(asRecord(item).blocks), 0),
    structuredMemoryItems:
      countArray(structuredMemory.entities) +
      countArray(structuredMemory.relations) +
      countArray(structuredMemory.events) +
      countArray(structuredMemory.foreshadows) +
      countArray(structuredMemory.evidence),
    storyMemories: countArray(storyMemory.memories),
    knowledgeBases: countArray(knowledgeBases.kbs),
    sourceDocuments: countArray(sourceDocuments.docs),
    projectTables: tableItems.length,
    projectTableRows: tableItems.reduce<number>((sum, item) => sum + countArray(asRecord(item).rows), 0),
    glossaryTerms: countArray(glossaryTerms.terms),
  };

  return {
    projectName,
    schemaVersion: typeof root.schema_version === "string" ? root.schema_version : "",
    counts,
    apiKeyWarnings: getProjectBundleApiKeyWarnings(bundle),
  };
}

export function formatBytes(bytes: number): string {
  const normalized = Number.isFinite(bytes) ? Math.max(0, bytes) : 0;
  if (normalized < 1024) return `${Math.round(normalized)} B`;
  const kb = normalized / 1024;
  if (kb < 1024) return `${Number.isInteger(kb) ? kb : kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`;
}
