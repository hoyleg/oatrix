/** Filesystem-only checks; never serialized into world state.
 * Use bigint stats: Windows file IDs can exceed Number.MAX_SAFE_INTEGER.
 * Windows path-stat may omit the device ID (0) while handle-stat reports it.
 * Only that directional exception is allowed; handle-to-handle remains strict.
 */
function regular(info) {
  return info && info.isFile() && !info.isSymbolicLink() && info.nlink === 1n &&
    typeof info.ino === 'bigint' && info.ino > 0n && typeof info.dev === 'bigint' && info.dev >= 0n &&
    typeof info.size === 'bigint' && info.size >= 0n;
}
export function pathMatchesHandle(pathInfo, handleInfo, platform = process.platform) {
  return Boolean(regular(pathInfo) && regular(handleInfo) && pathInfo.ino === handleInfo.ino && pathInfo.size === handleInfo.size &&
    (pathInfo.dev === handleInfo.dev || (platform === 'win32' && pathInfo.dev === 0n)));
}
export function sameOpenFile(left, right) {
  return Boolean(regular(left) && regular(right) && left.ino === right.ino && left.dev === right.dev && left.size === right.size);
}
