// Generate sample house data with values in the 0-150 range
export function generateHouseData(days = 1, patternType = 'default') {
  const data = [];
  const minutesPerDay = 24 * 60;
  const samplingInterval = 5; // 1分钟采样
  const samplesPerDay = minutesPerDay / samplingInterval;
  
  // 根据模式类型选择不同的基础模式
  const basePattern = (hour) => {
    switch (patternType) {
      case 'morning':
        // 早上高峰模式
        if (hour >= 7 && hour <= 10) {
          return 100 + Math.random() * 40;
        } else if (hour >= 17 && hour <= 21) {
          return 80 + Math.random() * 30;
        } else {
          return 30 + Math.random() * 20;
        }
        
      case 'afternoon':
        // 下午高峰模式
        if (hour >= 12 && hour <= 15) {
          return 120 + Math.random() * 25;
        } else if (hour >= 19 && hour <= 22) {
          return 90 + Math.random() * 20;
        } else {
          return 40 + Math.random() * 15;
        }
        
      case 'evening':
        // 晚上高峰模式
        if (hour >= 18 && hour <= 22) {
          return 130 + Math.random() * 20;
        } else if (hour >= 8 && hour <= 11) {
          return 70 + Math.random() * 20;
        } else {
          return 50 + Math.random() * 10;
        }
        
      default:
        // 默认模式
        if (hour >= 7 && hour <= 9) {
          return 100 + Math.random() * 30;
        }
        if (hour >= 18 && hour <= 22) {
          return 120 + Math.random() * 25;
        }
        if (hour <= 6 || hour === 23) {
          return 40 + Math.random() * 20;
        }
        return 70 + Math.random() * 30;
    }
  };

  for (let day = 0; day < days; day++) {
    for (let sample = 0; sample < samplesPerDay; sample++) {
      const timeInMinutes = sample * samplingInterval;
      const hour = timeInMinutes / 60;
      const value = basePattern(hour);
      
      // 添加噪声和日变化
      const noise = Math.random() * 10 - 5;
      const dailyVariation = Math.sin(day * Math.PI / 2) * 10;
      
      // 计算最终值并四舍五入到2位小数
      const finalValue = Math.max(5, Math.min(150, value + noise + dailyVariation));
      const roundedValue = parseFloat(finalValue.toFixed(2));
      
      data.push({
        time: parseFloat(hour.toFixed(2)), // 时间四舍五入到2位小数
        value: roundedValue
      });
    }
  }

  return data;
}