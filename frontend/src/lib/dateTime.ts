export const APP_DISPLAY_TIME_ZONE = "Asia/Shanghai";

type DateTimeInput = string | number | Date | null | undefined;

type FormatDateTimeOptions = {
  seconds?: boolean;
  fallback?: string;
};

function toDate(value: DateTimeInput): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function readPart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  return parts.find((part) => part.type === type)?.value ?? "";
}

export function formatDateTime(value: DateTimeInput, options: FormatDateTimeOptions = {}): string {
  const fallback = options.fallback ?? "-";
  const date = toDate(value);
  if (!date) return typeof value === "string" && value ? value : fallback;

  const parts = new Intl.DateTimeFormat("zh-CN-u-nu-latn", {
    timeZone: APP_DISPLAY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: options.seconds === false ? undefined : "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).formatToParts(date);

  const datePart = `${readPart(parts, "year")}-${readPart(parts, "month")}-${readPart(parts, "day")}`;
  const timePart = `${readPart(parts, "hour")}:${readPart(parts, "minute")}`;
  if (options.seconds === false) return `${datePart} ${timePart}`;
  return `${datePart} ${timePart}:${readPart(parts, "second")}`;
}

export function formatDateTimeMinute(value: DateTimeInput, fallback = "-"): string {
  return formatDateTime(value, { seconds: false, fallback });
}

export function formatUnknownDateTime(value: unknown, fallback = "-"): string {
  if (value instanceof Date || typeof value === "string" || typeof value === "number") {
    return formatDateTime(value, { fallback });
  }
  return fallback;
}

export function formatEpochSecondsDateTime(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return formatDateTime(value * 1000);
}

export function formatDateTimeForFilename(value: DateTimeInput = new Date()): string {
  return formatDateTime(value).replaceAll(":", "-").replace(" ", "_");
}
