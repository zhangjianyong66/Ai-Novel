import { describe, expect, it } from "vitest";

import {
  getMemoryUpdateDrawerSessionKey,
  isMemoryUpdateDrawerAsyncResponseCurrent,
  shouldResetMemoryUpdateDrawerSession,
} from "./MemoryUpdateDrawerState";

describe("MemoryUpdateDrawerState", () => {
  it("resets proposal state when the drawer is reopened for another chapter", () => {
    const previous = getMemoryUpdateDrawerSessionKey({ chapterId: "chapter-1", open: true });
    const next = getMemoryUpdateDrawerSessionKey({ chapterId: "chapter-2", open: true });

    expect(shouldResetMemoryUpdateDrawerSession(previous, next)).toBe(true);
  });

  it("keeps proposal state for the same open chapter", () => {
    const previous = getMemoryUpdateDrawerSessionKey({ chapterId: "chapter-1", open: true });
    const next = getMemoryUpdateDrawerSessionKey({ chapterId: "chapter-1", open: true });

    expect(shouldResetMemoryUpdateDrawerSession(previous, next)).toBe(false);
  });

  it("ignores async proposal responses from a previous chapter session", () => {
    expect(
      isMemoryUpdateDrawerAsyncResponseCurrent({
        requestId: 1,
        activeRequestId: 1,
        requestSessionKey: "open:chapter-1",
        activeSessionKey: "open:chapter-2",
      }),
    ).toBe(false);
  });
});
