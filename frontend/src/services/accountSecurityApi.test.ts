import { afterEach, describe, expect, it, vi } from "vitest";

import { changeOwnPassword } from "./accountSecurityApi";

describe("changeOwnPassword", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts old and new password to the current-user password change endpoint", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      return new Response(JSON.stringify({ ok: true, data: {}, request_id: "req-1" }), {
        status: 200,
        headers: { "Content-Type": "application/json", "X-Request-Id": "req-1" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await changeOwnPassword({ oldPassword: "old-password", newPassword: "new-password-123" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe("/api/auth/password/change");
    expect(init?.method).toBe("POST");
    expect(init?.credentials).toBe("include");
    expect(JSON.parse(String(init?.body))).toEqual({
      old_password: "old-password",
      new_password: "new-password-123",
    });
  });
});
