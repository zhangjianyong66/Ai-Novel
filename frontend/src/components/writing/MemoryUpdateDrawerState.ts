export type MemoryUpdateDrawerSessionKeyInput = {
  chapterId: string | null | undefined;
  open: boolean;
};

export function getMemoryUpdateDrawerSessionKey(input: MemoryUpdateDrawerSessionKeyInput): string {
  const chapterId = String(input.chapterId || "").trim();
  return input.open && chapterId ? `open:${chapterId}` : "closed";
}

export function shouldResetMemoryUpdateDrawerSession(previous: string | null | undefined, next: string): boolean {
  return Boolean(previous && previous !== next);
}

export type MemoryUpdateDrawerAsyncGuardInput = {
  requestId: number;
  activeRequestId: number;
  requestSessionKey: string;
  activeSessionKey: string | null | undefined;
};

export function isMemoryUpdateDrawerAsyncResponseCurrent(input: MemoryUpdateDrawerAsyncGuardInput): boolean {
  return input.requestId === input.activeRequestId && input.requestSessionKey === input.activeSessionKey;
}
