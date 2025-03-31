/**
 * 将小时格式化为时间字符串 (HH:MM)
 * @param {number} hour - 小时数(0-24)
 * @returns {string} 格式化后的时间字符串
 */
export function formatTime(hour) {
  const hours = Math.floor(hour);
  const minutes = Math.floor((hour - hours) * 60);
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

/**
 * 将时间字符串 (HH:MM:SS) 转换为小时数
 * @param {string} timeStr - 时间字符串，格式为 HH:MM:SS
 * @returns {number} 小时数(十进制)
 */
export function timeStringToHours(timeStr) {
  const [hours, minutes, seconds = '0'] = timeStr.split(':').map(Number);
  return hours + (minutes / 60) + (seconds / 3600);
} 