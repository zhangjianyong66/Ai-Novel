import { describe, expect, it } from "vitest";

import { validateChangePasswordForm } from "./accountSecurity";

describe("validateChangePasswordForm", () => {
  it("rejects a new password shorter than 8 characters", () => {
    expect(
      validateChangePasswordForm({
        oldPassword: "old-password",
        newPassword: "short",
        confirmPassword: "short",
      }),
    ).toEqual("新密码至少 8 位");
  });

  it("rejects mismatched confirmation password", () => {
    expect(
      validateChangePasswordForm({
        oldPassword: "old-password",
        newPassword: "new-password-123",
        confirmPassword: "another-password-123",
      }),
    ).toEqual("两次输入的新密码不一致");
  });

  it("accepts a complete valid password change form", () => {
    expect(
      validateChangePasswordForm({
        oldPassword: "old-password",
        newPassword: "new-password-123",
        confirmPassword: "new-password-123",
      }),
    ).toBeNull();
  });
});
