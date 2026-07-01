export type GenerationBrowserNotificationStatus = "success" | "failed";

type CachedSettings = {
  browser_enabled: boolean;
  loadedAt: number;
};

let cachedSettings: CachedSettings | null = null;
const SETTINGS_CACHE_MS = 30_000;

export function isBrowserNotificationSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function browserNotificationPermission(): NotificationPermission | "unsupported" {
  if (!isBrowserNotificationSupported()) return "unsupported";
  return Notification.permission;
}

export async function requestBrowserNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
  if (!isBrowserNotificationSupported()) return "unsupported";
  return await Notification.requestPermission();
}

export function invalidateGenerationNotificationSettingsCache(): void {
  cachedSettings = null;
}

export function isAiGenerationRequest(path: string, init?: RequestInit): boolean {
  const method = String(init?.method ?? "GET").toUpperCase();
  if (method !== "POST") return false;
  return /\/(generate|generate-stream|analyze|optimize|post-edit|rewrite)(?:[/?#]|$)/.test(path);
}

export function generationTaskLabelFromPath(path: string): string {
  if (path.includes("/outline/")) return "大纲生成";
  if (path.includes("/chapters/") || path.includes("/api/chapters/")) return "章节生成";
  if (path.includes("analyze")) return "AI 分析";
  if (path.includes("optimize")) return "正文优化";
  if (path.includes("post-edit")) return "润色";
  return "AI 生成";
}

async function loadBrowserEnabled(): Promise<boolean> {
  const now = Date.now();
  if (cachedSettings && now - cachedSettings.loadedAt <= SETTINGS_CACHE_MS) {
    return cachedSettings.browser_enabled;
  }

  try {
    const response = await fetch("/api/me/notification-settings", {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return false;
    const payload = (await response.json()) as unknown;
    const data =
      payload && typeof payload === "object" && "data" in payload
        ? (payload as { data?: { settings?: { browser_enabled?: unknown } } }).data
        : null;
    const browserEnabled = Boolean(data?.settings?.browser_enabled);
    cachedSettings = { browser_enabled: browserEnabled, loadedAt: now };
    return browserEnabled;
  } catch {
    return false;
  }
}

export async function notifyGenerationBrowser(args: {
  status: GenerationBrowserNotificationStatus;
  taskLabel: string;
  detail?: string;
}): Promise<void> {
  if (!isBrowserNotificationSupported()) return;
  if (Notification.permission !== "granted") return;
  if (!(await loadBrowserEnabled())) return;

  const title = `${args.taskLabel}${args.status === "success" ? "完成" : "失败"}`;
  const body = args.detail?.trim() || (args.status === "success" ? "AI 生成已完成。" : "AI 生成失败，请返回页面查看。");
  try {
    new Notification(title, { body, tag: `ainovel-generation-${args.status}` });
  } catch {
    // Browser notifications must never affect generation UX.
  }
}
