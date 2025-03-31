/**
 * 生成随机颜色
 * @returns {string} 十六进制颜色值
 */
export function getRandomColor() {
  const letters = '0123456789ABCDEF';
  let color = '#';
  for (let i = 0; i < 6; i++) {
    color += letters[Math.floor(Math.random() * 16)];
  }
  return color;
}

/**
 * 根据类型获取预定义颜色
 * @param {string} type - 数据类型
 * @returns {string} 十六进制颜色值
 */
export function getColorByType(type) {
  const colorMap = {
    'hf': '#6548C7',  // 高频
    'mf': '#9B71F6',  // 中频
    'lf': '#8367F8',  // 低频
    'trend': '#8367F8',
    'seasonal': '#9B71F6',
    'residual': '#6548C7'
  };
  
  return colorMap[type?.toLowerCase()] || getRandomColor();
} 