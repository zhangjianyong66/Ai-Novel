import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchNotificationSettings, saveNotificationSettings } from "./notificationSettingsApi";

describe("notificationSettingsApi", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads notification settings", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              ok: true,
              data: {
                settings: {
                  browser_enabled: true,
                  feishu_enabled: false,
                  feishu_webhook_configured: true,
                  feishu_webhook_masked: "x",
                },
              },
              request_id: "rid",
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
      ),
    );

    await expect(fetchNotificationSettings()).resolves.toMatchObject({ browser_enabled: true, feishu_enabled: false });
  });

  it("saves notification settings", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              ok: true,
              data: {
                settings: {
                  browser_enabled: true,
                  feishu_enabled: true,
                  feishu_webhook_configured: true,
                  feishu_webhook_masked: "x",
                },
              },
              request_id: "rid",
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
      ),
    );

    await expect(saveNotificationSettings({ browser_enabled: true, feishu_enabled: true })).resolves.toMatchObject({
      browser_enabled: true,
      feishu_enabled: true,
    });
  });
});
