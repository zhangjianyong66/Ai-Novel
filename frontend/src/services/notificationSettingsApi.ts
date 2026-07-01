import { apiJson } from "./apiClient";

export type UserNotificationSettings = {
  browser_enabled: boolean;
  feishu_enabled: boolean;
  feishu_webhook_configured: boolean;
  feishu_webhook_masked: string;
};

export type UserNotificationSettingsUpdate = {
  browser_enabled?: boolean;
  feishu_enabled?: boolean;
  feishu_webhook_url?: string | null;
};

export async function fetchNotificationSettings(): Promise<UserNotificationSettings> {
  const res = await apiJson<{ settings: UserNotificationSettings }>("/api/me/notification-settings");
  return res.data.settings;
}

export async function saveNotificationSettings(
  payload: UserNotificationSettingsUpdate,
): Promise<UserNotificationSettings> {
  const res = await apiJson<{ settings: UserNotificationSettings }>("/api/me/notification-settings", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  return res.data.settings;
}
