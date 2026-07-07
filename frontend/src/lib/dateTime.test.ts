import { describe, expect, it } from "vitest";

import { formatDateTime, formatDateTimeForFilename, formatDateTimeMinute } from "./dateTime";

describe("dateTime", () => {
  it("formats UTC ISO timestamps in Asia/Shanghai", () => {
    expect(formatDateTime("2026-07-04T15:49:00Z")).toBe("2026-07-04 23:49:00");
    expect(formatDateTimeMinute("2026-07-04T15:49:00Z")).toBe("2026-07-04 23:49");
  });

  it("keeps invalid strings visible and empty values as fallback", () => {
    expect(formatDateTime("not-a-date")).toBe("not-a-date");
    expect(formatDateTime(null)).toBe("-");
  });

  it("builds filename-safe Shanghai timestamps", () => {
    expect(formatDateTimeForFilename("2026-07-04T15:49:00Z")).toBe("2026-07-04_23-49-00");
  });
});
