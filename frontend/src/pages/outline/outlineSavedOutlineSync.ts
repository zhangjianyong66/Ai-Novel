import type { Outline, OutlineListItem } from "../../types";

export type SavedOutlineSyncInput = {
  outlines: OutlineListItem[];
  activeOutline: Outline | null;
  content: string;
  savedOutline: Outline;
};

export type SavedOutlineSyncState = {
  outlines: OutlineListItem[];
  activeOutline: Outline;
  content: string;
  baseline: string;
};

function outlineListItemFromSavedOutline(savedOutline: Outline, existing?: OutlineListItem): OutlineListItem {
  return {
    id: savedOutline.id,
    title: savedOutline.title,
    created_at: savedOutline.created_at,
    updated_at: savedOutline.updated_at,
    has_chapters: existing?.has_chapters ?? false,
  };
}

export function buildSavedOutlineSyncState(input: SavedOutlineSyncInput): SavedOutlineSyncState {
  const normalizedContent = input.savedOutline.content_md ?? "";
  const existing = input.outlines.find((outline) => outline.id === input.savedOutline.id);
  const savedListItem = outlineListItemFromSavedOutline(input.savedOutline, existing);
  const remaining = input.outlines.filter((outline) => outline.id !== input.savedOutline.id);

  return {
    outlines: [savedListItem, ...remaining],
    activeOutline: input.savedOutline,
    content: normalizedContent,
    baseline: normalizedContent,
  };
}
