import { describe, expect, it } from "vitest";

import { resolveRouteMeta } from "./routes";

describe("routes", () => {
  it("resolves notification settings route title correctly", () => {
    expect(resolveRouteMeta("/account/notification-settings")).toMatchObject({ title: "通知设置" });
  });

  it("resolves account security route title correctly", () => {
    expect(resolveRouteMeta("/account/security")).toMatchObject({ title: "账户安全" });
  });
});
