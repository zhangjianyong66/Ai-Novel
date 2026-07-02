import { describe, expect, it } from "vitest";

import { shouldResetConfirmOptions } from "./confirmProviderState";

describe("ConfirmProvider", () => {
  it("does not let a stale close timer clear a newer confirmation", () => {
    expect(shouldResetConfirmOptions(1, 2)).toBe(false);
  });

  it("allows the latest close timer to clear its own confirmation options", () => {
    expect(shouldResetConfirmOptions(2, 2)).toBe(true);
  });
});
