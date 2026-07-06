export type DiffViewportRect = {
  ordinal: number;
  top: number;
  bottom: number;
};

export function findCurrentDiffOrdinalByViewport(anchorY: number, rects: DiffViewportRect[]): number | null {
  if (rects.length === 0) return null;

  const firstBelowAnchor = rects.find((rect) => rect.bottom >= anchorY);
  return firstBelowAnchor?.ordinal ?? rects[rects.length - 1].ordinal;
}
