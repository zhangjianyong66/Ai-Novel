import { apiJson } from "./apiClient";

export type StoryMemory = {
  id: string;
  project_id: string;
  chapter_id?: string | null;
  outline_id?: string | null;
  scope?: "outline" | "project" | "unassigned";
  memory_type: string;
  title?: string | null;
  content: string;
  full_context_md?: string | null;
  importance_score: number;
  tags: string[];
  story_timeline: number;
  text_position: number;
  text_length: number;
  is_foreshadow: boolean;
  resolved_at_chapter_id?: string | null;
  done: boolean;
  created_at?: string | null;
  updated_at?: string | null;
  injectable_for_current_outline?: boolean;
};

export type StoryMemoryScope = "outline" | "project" | "unassigned";

export async function createStoryMemory(
  projectId: string,
  body: {
    chapter_id?: string | null;
    outline_id?: string | null;
    scope?: StoryMemoryScope;
    memory_type: string;
    title?: string | null;
    content: string;
    full_context_md?: string | null;
    importance_score?: number;
    tags?: string[];
    story_timeline?: number;
    text_position?: number;
    text_length?: number;
    is_foreshadow?: boolean;
  },
): Promise<StoryMemory> {
  const res = await apiJson<{ story_memory: StoryMemory }>(`/api/projects/${projectId}/story_memories`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return res.data.story_memory;
}

export async function updateStoryMemory(
  projectId: string,
  storyMemoryId: string,
  body: Partial<{
    chapter_id: string | null;
    outline_id: string | null;
    scope: StoryMemoryScope;
    memory_type: string;
    title: string | null;
    content: string;
    full_context_md: string | null;
    importance_score: number;
    tags: string[];
    story_timeline: number;
    text_position: number;
    text_length: number;
    is_foreshadow: boolean;
  }>,
): Promise<StoryMemory> {
  const res = await apiJson<{ story_memory: StoryMemory }>(
    `/api/projects/${projectId}/story_memories/${encodeURIComponent(storyMemoryId)}`,
    {
      method: "PUT",
      body: JSON.stringify(body),
    },
  );
  return res.data.story_memory;
}

export async function deleteStoryMemory(projectId: string, storyMemoryId: string): Promise<string> {
  const res = await apiJson<{ deleted_id: string }>(
    `/api/projects/${projectId}/story_memories/${encodeURIComponent(storyMemoryId)}`,
    {
      method: "DELETE",
    },
  );
  return res.data.deleted_id;
}

export async function listStoryMemories(
  projectId: string,
  params?: {
    chapter_id?: string | null;
    scope?: StoryMemoryScope | null;
    outline_id?: string | null;
    injectable_for_outline_id?: string | null;
    q?: string | null;
    memory_type?: string | null;
    limit?: number;
    offset?: number;
  },
): Promise<{ items: StoryMemory[]; next_offset: number | null }> {
  const qs = new URLSearchParams();
  if (params?.chapter_id) qs.set("chapter_id", params.chapter_id);
  if (params?.scope) qs.set("scope", params.scope);
  if (params?.outline_id) qs.set("outline_id", params.outline_id);
  if (params?.injectable_for_outline_id) qs.set("injectable_for_outline_id", params.injectable_for_outline_id);
  if (params?.q) qs.set("q", params.q);
  if (params?.memory_type) qs.set("memory_type", params.memory_type);
  qs.set("limit", String(params?.limit ?? 200));
  qs.set("offset", String(params?.offset ?? 0));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const res = await apiJson<{ items: StoryMemory[]; next_offset: number | null }>(
    `/api/projects/${projectId}/story_memories${suffix}`,
  );
  return res.data;
}

export async function bulkSetStoryMemoryScope(
  projectId: string,
  ids: string[],
  scope: StoryMemoryScope,
  outlineId?: string | null,
): Promise<{ updated_ids: string[] }> {
  const res = await apiJson<{ updated_ids: string[] }>(`/api/projects/${projectId}/story_memories/bulk`, {
    method: "POST",
    body: JSON.stringify({ action: "set_scope", ids, scope, outline_id: outlineId ?? null }),
  });
  return res.data;
}

export async function mergeStoryMemories(projectId: string, args: { targetId: string; sourceIds: string[] }) {
  return apiJson<{ story_memory: StoryMemory; deleted_ids: string[] }>(
    `/api/projects/${projectId}/story_memories/merge`,
    {
      method: "POST",
      body: JSON.stringify({ target_id: args.targetId, source_ids: args.sourceIds }),
    },
  );
}

export async function markStoryMemoryDone(
  projectId: string,
  storyMemoryId: string,
  done: boolean,
): Promise<StoryMemory> {
  const res = await apiJson<{ story_memory: StoryMemory }>(
    `/api/projects/${projectId}/story_memories/${encodeURIComponent(storyMemoryId)}/mark_done`,
    {
      method: "POST",
      body: JSON.stringify({ done }),
    },
  );
  return res.data.story_memory;
}
