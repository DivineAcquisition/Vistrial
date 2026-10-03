/**
 * Where an asset is filed inside the client's chosen root: one folder per
 * kind of asset, then one per month.
 *
 *   <root>/<asset kind>/<YYYY-MM>/<file>
 *
 * This is the only place the layout is decided. It is a placeholder for the
 * Sales OS Agent's asset-storage structure, which is not in this repository;
 * replace this function and nothing else changes.
 */
export function assetFolderPath(assetKind: string, now = new Date()): string[] {
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  return [assetKind, month];
}
