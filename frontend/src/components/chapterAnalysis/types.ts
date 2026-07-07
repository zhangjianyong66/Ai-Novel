export type MemoryAnnotation = {
  id: string;
  type: string;
  title: string | null;
  content: string;
  importance: number;
  position: number;
  length: number;
  tags: string[];
  metadata: Record<string, unknown>;
};

const TYPE_LABELS: Record<string, string> = {
  chapter_summary: "摘要",
  hook: "钩子",
  foreshadow: "伏笔",
  plot_point: "情节点",
  character_state: "人物状态",
  continuity_fact: "连续性事实",
  next_requirement: "下一章要求",
};

export function labelForAnnotationType(type: string): string {
  return TYPE_LABELS[type] ?? type;
}

export function sortKeyForAnnotationType(type: string): number {
  switch (type) {
    case "chapter_summary":
      return 10;
    case "hook":
      return 20;
    case "foreshadow":
      return 30;
    case "plot_point":
      return 40;
    case "character_state":
      return 50;
    case "continuity_fact":
      return 60;
    case "next_requirement":
      return 70;
    default:
      return 999;
  }
}
