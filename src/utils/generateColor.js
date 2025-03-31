function generateGradientColors(targetColor, steps) {
  const startColor = [255, 255, 255]; // 白色
  const endColor = hexToRgb(targetColor);
  const gradientColors = [];

  for (let i = 1; i <= steps; i++) {
    const ratio = i / steps;
    const color = startColor.map((start, index) => {
      return Math.round(start + ratio * (endColor[index] - start));
    });
    gradientColors.push(`rgb(${color.join(',')})`);
  }

  return gradientColors;
}

function hexToRgb(hex) {
  const bigint = parseInt(hex.slice(1), 16);
  return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
}

export { generateGradientColors };