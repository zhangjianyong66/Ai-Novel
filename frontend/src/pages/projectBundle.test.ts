import { describe, expect, it } from "vitest";

import {
  PROJECT_BUNDLE_SCHEMA_VERSION,
  buildProjectBundleSummary,
  formatBytes,
  getProjectBundleApiKeyWarnings,
  isProjectBundleV1,
} from "./projectBundle";

describe("projectBundle", () => {
  it("accepts only project_bundle_v1 payloads", () => {
    expect(isProjectBundleV1({ schema_version: PROJECT_BUNDLE_SCHEMA_VERSION })).toBe(true);
    expect(isProjectBundleV1({ schema_version: "project_bundle_v0" })).toBe(false);
    expect(isProjectBundleV1(null)).toBe(false);
  });

  it("builds a stable summary from optional bundle sections", () => {
    const summary = buildProjectBundleSummary({
      schema_version: PROJECT_BUNDLE_SCHEMA_VERSION,
      project: { name: "Novel" },
      outlines: [{ id: "o1" }],
      chapters: [{ id: "c1" }, { id: "c2" }],
      characters: [{ id: "char1" }],
      worldbook: { entries: [{ title: "City" }] },
      prompt_presets: { presets: [{ preset: { name: "P" }, blocks: [{ identifier: "b" }] }] },
      structured_memory: { entities: [{ id: "e1" }], relations: [{ id: "r1" }] },
      story_memory: { memories: [{ id: "m1" }] },
      knowledge_bases: { kbs: [{ kb_id: "default" }] },
      source_documents: { docs: [{ id: "d1" }] },
      project_tables: { tables: [{ id: "t1", rows: [{ id: "r1" }, { id: "r2" }] }] },
      glossary_terms: { terms: [{ term: "灵能" }] },
    });

    expect(summary.projectName).toBe("Novel");
    expect(summary.schemaVersion).toBe(PROJECT_BUNDLE_SCHEMA_VERSION);
    expect(summary.counts).toMatchObject({
      outlines: 1,
      chapters: 2,
      characters: 1,
      worldbookEntries: 1,
      promptPresets: 1,
      promptBlocks: 1,
      structuredMemoryItems: 2,
      storyMemories: 1,
      knowledgeBases: 1,
      sourceDocuments: 1,
      projectTables: 1,
      projectTableRows: 2,
      glossaryTerms: 1,
    });
  });

  it("detects api key warnings without exposing key material", () => {
    const warnings = getProjectBundleApiKeyWarnings({
      schema_version: PROJECT_BUNDLE_SCHEMA_VERSION,
      settings: {
        vector_embedding: { has_api_key: true, masked_api_key: "sk****1234" },
        vector_rerank: { has_api_key: true, masked_api_key: "rk****5678" },
      },
    });

    expect(warnings).toEqual(["向量 embedding API Key 不会随项目包导入", "向量 rerank API Key 不会随项目包导入"]);
    expect(warnings.join("\n")).not.toContain("1234");
    expect(warnings.join("\n")).not.toContain("5678");
  });

  it("formats byte limits for display", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(50 * 1024 * 1024)).toBe("50 MB");
  });
});
