/**
 * Giải quyết iconURL từ config:
 * - Nếu là URL hợp lệ (https://...) → trả về URL đó
 * - Nếu là đường dẫn file cục bộ → trả về fallbackURL (avatar bot, v.v.)
 *   (Discord không cho phép đính kèm ảnh làm author icon mà không hiện preview)
 * @param {string} iconURL - giá trị iconURL từ config
 * @param {string} [fallbackURL] - URL dự phòng nếu iconURL là local path
 * @returns {{ iconURL: string|undefined, files: [] }}
 */
function resolveIcon(iconURL, fallbackURL) {
  const empty = { iconURL: undefined, files: [] };
  if (!iconURL) return empty;

  // Nếu là HTTP/HTTPS URL hợp lệ → dùng thẳng
  if (/^https?:\/\//i.test(iconURL)) {
    return { iconURL, files: [] };
  }

  // Nếu là đường dẫn cục bộ → dùng fallback (thường là avatar bot)
  if (fallbackURL && /^https?:\/\//i.test(fallbackURL)) {
    return { iconURL: fallbackURL, files: [] };
  }

  return empty;
}

module.exports = resolveIcon;
