export function shouldResetConfirmOptions(resetVersion: number, currentVersion: number): boolean {
  return resetVersion === currentVersion;
}
