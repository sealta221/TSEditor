/**
 * @file radialLayout.js
 * @description 优化径向布局，让相邻的曲线尽可能相似
 */

/**
 * 找出曲线的峰值位置
 * @param {Array} curve 曲线数据数组，每个元素包含value属性
 * @returns {Array} 峰值位置的索引数组
 */
function findPeaks(curve) {
  const peakIndices = [];
  if (!curve || curve.length < 3) return peakIndices;

  // 简单的峰值检测: 如果一个点的值大于相邻两点的值，则认为该点是峰值
  for (let i = 1; i < curve.length - 1; i++) {
    const prevValue = curve[i - 1].value;
    const currValue = curve[i].value;
    const nextValue = curve[i + 1].value;

    if (currValue > prevValue && currValue > nextValue) {
      peakIndices.push(i);
    }
  }
  
  // 检查第一个点和最后一个点是否为峰值
  if (curve[0].value > curve[1].value) {
    peakIndices.push(0);
  }
  if (curve[curve.length - 1].value > curve[curve.length - 2].value) {
    peakIndices.push(curve.length - 1);
  }
  
  return peakIndices;
}

/**
 * 计算两条曲线之间的G1距离（峰值模式相似性）
 * @param {Array} curveA 第一条曲线数据
 * @param {Array} curveB 第二条曲线数据
 * @returns {number} 距离值
 */
function calculateG1Distance(curveA, curveB) {
  if (!curveA || !curveB || curveA.length === 0 || curveB.length === 0) {
    return 1; // 最大距离
  }
  
  // 确保两条曲线的长度相同，如果不同，则取较短的那个长度
  const n = Math.min(curveA.length, curveB.length);
  
  // 按照G1距离的定义：D_G1(A,B) = (1/N) * Σ|x_Ai - x_Bi|
  let totalDistance = 0;
  
  for (let i = 0; i < n; i++) {
    totalDistance += Math.abs(curveA[i].value - curveB[i].value);
  }
  
  // 归一化距离
  // 找出两条曲线中的最大值和最小值，用于归一化
  const allValues = [...curveA, ...curveB].map(point => point.value);
  const maxValue = Math.max(...allValues);
  const minValue = Math.min(...allValues);
  const range = maxValue - minValue;
  
  // 如果范围为0，则两条曲线完全相同
  if (range === 0) return 0;
  
  // 归一化为0-1范围
  return totalDistance / (n * range);
}

/**
 * 计算两条曲线之间的G2距离（方向性差异）
 * @param {Array} curveA 第一条曲线数据
 * @param {Array} curveB 第二条曲线数据
 * @returns {number} 距离值
 */
function calculateG2Distance(curveA, curveB) {
  if (!curveA || !curveB || curveA.length === 0 || curveB.length === 0) {
    return 1; // 最大距离
  }
  
  // 确保两条曲线的长度相同，如果不同，则取较短的那个长度
  const n = Math.min(curveA.length, curveB.length);
  
  // 按照G2距离的定义：D_G2(A,B) = (1/N) * Σmax(0, x_Ai - x_Bi)
  // 这只考虑了 x_Ai >= x_Bi 的情况，以确保方向一致性
  let totalDirectionalDiff = 0;
  
  for (let i = 0; i < n; i++) {
    totalDirectionalDiff += Math.max(0, curveA[i].value - curveB[i].value);
  }
  
  // 归一化
  // 找出第一条曲线的最大值，用于归一化
  const maxValue = Math.max(...curveA.map(point => point.value));
  const minValue = Math.min(...curveB.map(point => point.value));
  const maxPossibleDiff = Math.max(0, maxValue - minValue) * n;
  
  // 如果最大可能差异为0，则两条曲线没有方向性差异
  if (maxPossibleDiff === 0) return 0;
  
  // 归一化为0-1范围
  return totalDirectionalDiff / maxPossibleDiff;
}

/**
 * 计算两条曲线之间的综合距离，结合G1和G2
 * @param {Array} curveA 第一条曲线数据
 * @param {Array} curveB 第二条曲线数据
 * @param {number} alpha G1权重
 * @param {number} beta G2权重
 * @returns {number} 综合距离值
 */
function calculateCombinedDistance(curveA, curveB, alpha = 0.7, beta = 0.3) {
  const g1Distance = calculateG1Distance(curveA, curveB);
  const g2Distance = calculateG2Distance(curveA, curveB);
  return alpha * g1Distance + beta * g2Distance;
}

/**
 * 为所有曲线构建距离矩阵
 * @param {Array} curves 曲线数组
 * @returns {Array} 距离矩阵
 */
function buildDistanceMatrix(curves) {
  const n = curves.length;
  const distanceMatrix = Array(n).fill().map(() => Array(n).fill(0));
  
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue; // 自己到自己的距离为0
      distanceMatrix[i][j] = calculateCombinedDistance(curves[i].res, curves[j].res);
    }
  }
  
  return distanceMatrix;
}

/**
 * 使用贪心算法解决TSP问题，找到最佳路径
 * @param {Array} distanceMatrix 距离矩阵
 * @returns {Array} 最优路径索引
 */
function solveOptimalOrder(distanceMatrix) {
  const n = distanceMatrix.length;
  if (n <= 1) return [0];
  
  // 初始化：以第一个点作为起点
  const visited = Array(n).fill(false);
  const path = [0];
  visited[0] = true;
  
  // 贪心策略：每次选择距离当前位置最近的未访问节点
  while (path.length < n) {
    const current = path[path.length - 1];
    let minDistance = Infinity;
    let nextNode = -1;
    
    for (let i = 0; i < n; i++) {
      if (!visited[i] && distanceMatrix[current][i] < minDistance) {
        minDistance = distanceMatrix[current][i];
        nextNode = i;
      }
    }
    
    if (nextNode !== -1) {
      path.push(nextNode);
      visited[nextNode] = true;
    } else {
      // 如果找不到下一个节点（理论上不应该发生），跳出循环
      break;
    }
  }
  
  return path;
}

/**
 * 优化径向布局，使相邻曲线尽可能相似
 * @param {Array} data 原始数据
 * @returns {Array} 优化后的数据
 */
function optimizeRadialLayout(data) {
  if (!data || data.length <= 1) return data;
  
  // 创建深拷贝以避免修改原始数据
  const clonedData = JSON.parse(JSON.stringify(data));
  
  // 构建距离矩阵
  const distanceMatrix = buildDistanceMatrix(clonedData);
  
  // 解决TSP问题，获取最优路径
  const optimalOrder = solveOptimalOrder(distanceMatrix);
  
  // 按照最优路径重新排序数据
  const optimizedData = optimalOrder.map(index => clonedData[index]);
  // 按照最优路径重新排序数据后再逆向
  // const optimizedData = optimalOrder.map(index => clonedData[index]).reverse();
  return optimizedData;
}

/**
 * 计算两条曲线之间的正确的G2距离（考虑所有峰值对的方向性差异）
 * @param {Array} curveA 第一条曲线数据
 * @param {Array} curveB 第二条曲线数据
 * @returns {number} 距离值
 */
function calculateCorrectG2Distance(curveA, curveB) {
  if (!curveA || !curveB || curveA.length === 0 || curveB.length === 0) {
    return 1; // 最大距离
  }

  // 1. 找出两条曲线的峰值
  const peaksA = findPeaks(curveA);
  const peaksB = findPeaks(curveB);

  if (peaksA.length === 0 || peaksB.length === 0) {
    return 1; // 如果任一曲线没有峰值，返回最大距离
  }

  // 2. 计算所有峰值对的方向性差异
  let totalDirectionalDiff = 0;
  let pairCount = 0;

  // 对每一对峰值进行比较
  for (const peakA of peaksA) {
    for (const peakB of peaksB) {
      // 只考虑从左到右的方向（即 A 的峰值位置大于等于 B 的峰值位置的情况）
      if (peakA >= peakB) {
        totalDirectionalDiff += (peakA - peakB);
        pairCount++;
      }
    }
  }

  // 如果没有有效的峰值对，返回最大距离
  if (pairCount === 0) return 1;

  return totalDirectionalDiff / pairCount;
}

/**
 * 计算两条曲线之间的正确的综合距离
 * @param {Array} curveA 第一条曲线数据
 * @param {Array} curveB 第二条曲线数据
 * @returns {number} 综合距离值
 */
function calculateCorrectCombinedDistance(curveA, curveB) {
  // 直接使用G2距离，因为根据优化函数，我们只需要最小化G2
  return calculateCorrectG2Distance(curveA, curveB);
}

/**
 * 使用正确的距离度量构建距离矩阵
 * @param {Array} curves 曲线数组
 * @returns {Array} 距离矩阵
 */
function buildCorrectDistanceMatrix(curves) {
  const n = curves.length;
  const distanceMatrix = Array(n).fill().map(() => Array(n).fill(0));
  
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue; // 自己到自己的距离为0
      distanceMatrix[i][j] = calculateCorrectG2Distance(curves[i].res, curves[j].res);
    }
  }
  
  return distanceMatrix;
}

/**
 * 使用正确的度量优化径向布局
 * @param {Array} data 原始数据
 * @returns {Array} 优化后的数据
 */
function optimizeRadialLayoutCorrect(data) {
  if (!data || data.length <= 1) return data;
  
  // 创建深拷贝以避免修改原始数据
  const clonedData = JSON.parse(JSON.stringify(data));
  
  // 使用正确的距离度量构建距离矩阵
  const distanceMatrix = buildCorrectDistanceMatrix(clonedData);
  
  // 解决TSP问题，获取最优路径
  const optimalOrder = solveOptimalOrder(distanceMatrix);
  
  // 按照最优路径重新排序数据
  const optimizedData = optimalOrder.map(index => clonedData[index]);
  
  return optimizedData;
}

export {
  optimizeRadialLayout,
  optimizeRadialLayoutCorrect,
  calculateG1Distance,
  calculateG2Distance,
  calculateCombinedDistance,
  calculateCorrectG2Distance,
  calculateCorrectCombinedDistance
};