export type DiffViewportRect = {
  ordinal: number;
  top: number;
  bottom: number;
};

export type DiffNavigationState = {
  diffIdentity: string;
  ordinal: number;
};

export type ProgrammaticDiffNavigationLock = {
  diffIdentity: string;
  fromOrdinal: number;
  targetOrdinal: number;
} | null;

export function findCurrentDiffOrdinalByViewport(anchorY: number, rects: DiffViewportRect[]): number | null {
  if (rects.length === 0) return null;

  let nearest = rects[0];
  let nearestDistance = Math.abs((nearest.top + nearest.bottom) / 2 - anchorY);

  for (const rect of rects.slice(1)) {
    const distance = Math.abs((rect.top + rect.bottom) / 2 - anchorY);
    if (distance < nearestDistance) {
      nearest = rect;
      nearestDistance = distance;
    }
  }

  return nearest.ordinal;
}

export function resolveDiffNavigationStateAfterScroll(args: {
  diffIdentity: string;
  currentState: DiffNavigationState;
  programmaticLock: ProgrammaticDiffNavigationLock;
  scrollOrdinal: number;
}): { state: DiffNavigationState; programmaticLock: ProgrammaticDiffNavigationLock } {
  const nextState = { diffIdentity: args.diffIdentity, ordinal: args.scrollOrdinal };
  const lock = args.programmaticLock;

  if (!lock || lock.diffIdentity !== args.diffIdentity) {
    return { state: nextState, programmaticLock: null };
  }

  if (args.scrollOrdinal === lock.targetOrdinal) {
    return {
      state: { diffIdentity: args.diffIdentity, ordinal: lock.targetOrdinal },
      programmaticLock: null,
    };
  }

  if (args.scrollOrdinal === lock.fromOrdinal) {
    return {
      state: { diffIdentity: args.diffIdentity, ordinal: lock.targetOrdinal },
      programmaticLock: lock,
    };
  }

  return { state: nextState, programmaticLock: null };
}
