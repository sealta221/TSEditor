import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import * as d3 from 'd3'
import { generateHouseData } from '../utils/generateData'
import { ElMessage } from 'element-plus'
import { useDatasetStore } from './datasetStore'

export const useTimeSeriesStore = defineStore('timeSeries', () => {
  const series = ref([])
  const operations = ref([])
  const operationIndex = ref(-1)
  const maxOperations = 100

  const selectedTimeRange = ref(null)
  const selectedSeries = ref([])
  const previewSeries = ref(null)

  const viewport = ref({
    start: 0,
    end: 24
  });

  const editedSeriesData = ref([]);

  const clearAllData = () => {
    series.value = [];
    operations.value = [];
    operationIndex.value = -1;
    selectedTimeRange.value = null;
    selectedSeries.value = [];
    previewSeries.value = null;
    
    // 清除本地存储，如果有的话
    localStorage.removeItem('timeSeriesData');
  }

  const initializeData = () => {
    // 确保没有默认曲线
    clearAllData();
  }

  const addSeries = (newSeries) => {
    // 构建更严格的唯一性检查条件
    const existingSeries = series.value.find(s => {
      // 完全匹配检查：ID、日期和变量
      const idMatch = s.id === newSeries.id;
      const dateMatch = s.date === newSeries.date;
      const variableMatch = s.variable === newSeries.variable;
      
      // 旧数据可能没有日期和变量 - 只检查ID
      if (!newSeries.date && !newSeries.variable) {
        return idMatch;
      }
      
      // 新数据需要完全匹配
      return idMatch && dateMatch && variableMatch;
    });
    
    if (existingSeries) {
      // 如果找到现有序列，检查是否需要更新其信息
      // 确保现有序列包含所有最新属性
      if (newSeries.date && !existingSeries.date) {
        existingSeries.date = newSeries.date;
      }
      
      if (newSeries.variable && !existingSeries.variable) {
        existingSeries.variable = newSeries.variable;
      }
      
      // 更新其他数据
      Object.assign(existingSeries, {
        data: newSeries.data,
        visible: newSeries.visible,
        type: newSeries.type || existingSeries.type
      });
    } else {
      // 如果没有匹配的序列，添加新序列
      series.value.push(newSeries);
      
      // 保持子序列的排序
      const typeOrder = { 'lf': 1, 'mf': 2, 'hf': 3 };
      series.value.sort((a, b) => {
        if (a.parentId && b.parentId && a.parentId === b.parentId) {
          return (typeOrder[a.type] || 99) - (typeOrder[b.type] || 99);
        }
        return 0;
      });
    }
    
    saveState();
  }

  const saveState = () => {
    series.value.forEach(s => {
      if (s.data.length !== 1440) {
        console.warn(`Series ${s.id} has ${s.data.length} points, fixing...`);
        s.data = ensureDataPoints(s.data);
      }
    });
    
    if (operationIndex.value < operations.value.length - 1) {
      operations.value = operations.value.slice(0, operationIndex.value + 1)
    }
    operations.value.push({
      id: Date.now() + Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString(),
      type: 'save',
      seriesIds: series.value.map(s => s.id),
      timeRange: selectedTimeRange.value ? { ...selectedTimeRange.value } : null,
      params: {},
      beforeData: null,
      afterData: JSON.parse(JSON.stringify(series.value))
    })
    if (operations.value.length > maxOperations) {
      operations.value.shift()
    }
    operationIndex.value = operations.value.length - 1
  }

  const setSelection = (range, seriesIds) => {
    if (!range) {
      selectedTimeRange.value = null
      selectedSeries.value = []
      return
    }
    
    selectedTimeRange.value = range
    
    // 过滤掉不可见的序列
    const visibleSeriesIds = seriesIds.filter(id => {
      const seriesObj = series.value.find(s => s.id === id);
      return seriesObj && seriesObj.visible;
    });
    
    selectedSeries.value = visibleSeriesIds
  }

  const clearSelection = () => {
    selectedTimeRange.value = null
    selectedSeries.value = []
  }

  const setPreviewSeries = (pattern) => {
    if (!pattern || !selectedTimeRange.value) {
      previewSeries.value = null
      return
    }

    const { start, end } = selectedTimeRange.value
    const duration = end - start

    const previewData = pattern.data.map(point => {
      const normalizedTime = (point.time - pattern.start) / (pattern.end - pattern.start)
      const newTime = start + normalizedTime * duration
      return {
        time: newTime,
        value: point.value
      }
    }).sort((a, b) => a.time - b.time)

    previewSeries.value = {
      id: 'preview',
      data: previewData,
      type: 'preview',
      visible: true
    }
  }

  const clearPreviewSeries = () => {
    previewSeries.value = null
  }

  const moveSeries = (seriesId, offset) => {
    const seriesIndex = series.value.findIndex(s => s.id === seriesId)
    if (seriesIndex === -1) return

    const currentSeries = series.value[seriesIndex]
    
    // 如果序列不可见，则不进行任何操作
    if (!currentSeries.visible) {
      return;
    }
    
    if (!selectedTimeRange.value) return

    const beforeData = getSeriesSnapshot([seriesId])
    
    const operationType = offset.x !== 0 && offset.y === 0 ? 'move-x' : 
                         offset.x === 0 && offset.y !== 0 ? 'move-y' : 'move-xy'

    const { start, end } = selectedTimeRange.value

    const hasChildren = series.value.some(s => s.parentId === seriesId)

    if (currentSeries.parentId) {
      const parentIndex = series.value.findIndex(s => s.id === currentSeries.parentId)
      if (parentIndex !== -1) {
        const childSeries = series.value.filter(s => s.parentId === currentSeries.parentId)
        
        const newParentData = JSON.parse(JSON.stringify(series.value[parentIndex].data))
        
        const newData = JSON.parse(JSON.stringify(currentSeries.data))
        
        newData.forEach((point, i) => {
          if (point && point.time >= start && point.time <= end) {
            // Apply prevention of negative values for step and electricity datasets
            let newValue = point.value + offset.y;
            if (preventNegative) {
              newValue = Math.max(0, newValue);
            }
            
            newData[i] = {
              time: point.time + offset.x,
              value: Math.min(15000, newValue)
            };
          }
        })
        
        newParentData.forEach((point, i) => {
          if (point) {
            point.value = 0;
            
            childSeries.forEach(child => {
              const childData = child.id === seriesId ? newData : child.data;
              point.value += findClosestPointValue(childData, point.time);
            });
          }
        })
        
        series.value[seriesIndex] = {
          ...currentSeries,
          data: newData
        }
        
        series.value[parentIndex] = {
          ...series.value[parentIndex],
          data: newParentData
        }
      }
    } else {
      if (hasChildren) {
        ElMessage.warning('Warning: Modifying the parent series will break consistency with child series')
      }
      
      const newData = JSON.parse(JSON.stringify(currentSeries.data))
      
      newData.forEach((point, i) => {
        if (point && point.time >= start && point.time <= end) {
          // Apply prevention of negative values for step and electricity datasets
          let newValue = point.value + offset.y;
          if (preventNegative) {
            newValue = Math.max(0, newValue);
          }
          
          newData[i] = {
            time: point.time + offset.x,
            value: Math.min(15000, newValue)
          };
        }
      })
      
      newData.sort((a, b) => a.time - b.time)
      
      series.value[seriesIndex] = {
        ...currentSeries,
        data: newData
      }
    }

    series.value[seriesIndex].data = ensureDataPoints(series.value[seriesIndex].data);
    
    const afterData = getSeriesSnapshot([seriesId])
    recordOperation(operationType, seriesId, { offset }, beforeData, afterData);

    // 如果是子序列被移动，也更新父序列的选择范围
    if (currentSeries.parentId) {
      setSelection(
        {
          start: selectedTimeRange.value.start,
          end: selectedTimeRange.value.end
        }, 
        [currentSeries.id, currentSeries.parentId]
      );
    }

    // 确保任何操作后都更新父序列
    if (currentSeries.parentId) {
      // 如果原函数中已有父序列更新逻辑，确保它们正确执行
      // 如果没有，则手动调用更新函数
      if (!currentSeries.parentId.includes('_decomp_')) { // 避免重复更新分解序列
        updateParentSeriesFromChild(seriesId, series.value[seriesIndex].data);
      }
    }
  }

  const applyCurve = (seriesId, curve) => {
    if (!selectedTimeRange.value) return

    const seriesIndex = series.value.findIndex(s => s.id === seriesId)
    if (seriesIndex === -1) return

    const beforeData = getSeriesSnapshot([seriesId])

    const currentSeries = series.value[seriesIndex]
    const newData = JSON.parse(JSON.stringify(currentSeries.data))
    const { start, end } = selectedTimeRange.value
    const duration = end - start

    newData.forEach((point, i) => {
      if (point.time >= start && point.time <= end) {
        const relativePosition = (point.time - start) / duration
        
        const multiplier = interpolateCurveAtPosition(curve, relativePosition)
        
        newData[i] = {
          time: point.time,
          value: point.value * multiplier
        }
      }
    })

    series.value[seriesIndex] = {
      ...currentSeries,
      data: newData
    }

    // 如果是子序列，更新父序列
    if (currentSeries.parentId) {
      const parentIndex = series.value.findIndex(s => s.id === currentSeries.parentId)
      if (parentIndex !== -1) {
        const childSeries = series.value.filter(s => s.parentId === currentSeries.parentId)
        
        const newParentData = JSON.parse(JSON.stringify(series.value[parentIndex].data))
        
        // 重新计算父序列的值
        newParentData.forEach((point, i) => {
          if (point) {
            point.value = 0
            childSeries.forEach(child => {
              const childData = child.id === seriesId ? newData : child.data
              point.value += findClosestPointValue(childData, point.time)
            })
          }
        })
        
        series.value[parentIndex] = {
          ...series.value[parentIndex],
          data: newParentData
        }

        // 确保父序列数据点完整
        series.value[parentIndex].data = ensureDataPoints(series.value[parentIndex].data)
      }
    }

    series.value[seriesIndex].data = ensureDataPoints(series.value[seriesIndex].data)
    
    const afterData = getSeriesSnapshot([seriesId])
    recordOperation('curve', seriesId, { curve }, beforeData, afterData)
    
    // 如果是子序列被修改，也更新选择范围包括父序列
    if (currentSeries.parentId) {
      setSelection(
        {
          start: selectedTimeRange.value.start,
          end: selectedTimeRange.value.end
        }, 
        [currentSeries.id, currentSeries.parentId]
      )
    }

    // 确保任何操作后都更新父序列
    if (currentSeries.parentId) {
      // 如果原函数中已有父序列更新逻辑，确保它们正确执行
      // 如果没有，则手动调用更新函数
      if (!currentSeries.parentId.includes('_decomp_')) { // 避免重复更新分解序列
        updateParentSeriesFromChild(seriesId, series.value[seriesIndex].data);
      }
    }
  }

  const interpolateCurveAtPosition = (curve, position) => {
    position = Math.max(0, Math.min(1, position))
    
    let leftIndex = 0
    let rightIndex = curve.length - 1
    
    for (let i = 0; i < curve.length - 1; i++) {
      if (curve[i].x <= position && curve[i + 1].x >= position) {
        leftIndex = i
        rightIndex = i + 1
        break
      }
    }
    
    if (curve[leftIndex].x === position) return curve[leftIndex].y
    if (curve[rightIndex].x === position) return curve[rightIndex].y
    
    const t = (position - curve[leftIndex].x) / (curve[rightIndex].x - curve[leftIndex].x)
    return curve[leftIndex].y + t * (curve[rightIndex].y - curve[leftIndex].y)
  }

  const expandTimeSeries = (selections) => {
    if (!selections || selections.length === 0) return;
    
    const beforeData = getSeriesSnapshot(selectedSeries.value);
    
    const totalSelectedTime = selections.reduce((sum, sel) => sum + (sel.end - sel.start), 0);
    const scaleFactor = 24 / totalSelectedTime;
    
    selectedSeries.value.forEach(id => {
      const seriesIndex = series.value.findIndex(s => s.id === id);
      if (seriesIndex === -1) return;
      
      const originalData = series.value[seriesIndex].data;
      const newData = new Array(1440);
      
      for (let i = 0; i < 1440; i++) {
        const hour = i / 60;
        newData[i] = {
          time: parseFloat(hour.toFixed(2)),
          value: null
        };
      }
      
      let currentTime = 0;
      
      const interpolate = (time, p1, p2) => {
        const t = (time - p1.time) / (p2.time - p1.time);
        return p1.value + t * (p2.value - p1.value);
      };
      
      const getValueAtTime = (time, data) => {
        const points = data.filter(p => p && !isNaN(p.time) && !isNaN(p.value));
        if (points.length === 0) return null;
        if (points.length === 1) return points[0].value;
        
        const i = points.findIndex(p => p.time > time);
        if (i === 0) return points[0].value;
        if (i === -1) return points[points.length - 1].value;
        
        return interpolate(time, points[i - 1], points[i]);
      };
      
      selections.forEach((selection, index) => {
        const segmentData = originalData.filter(
          point => point && !isNaN(point.time) && !isNaN(point.value) &&
                  point.time >= selection.start && point.time <= selection.end
        );
        
        if (segmentData.length === 0) return;
        
        const segmentDuration = (selection.end - selection.start) * scaleFactor;
        const segmentEndTime = currentTime + segmentDuration;
        
        for (let minute = Math.floor(currentTime * 60); minute < Math.floor(segmentEndTime * 60); minute++) {
          if (minute >= 1440) break;
          
          const progress = (minute / 60 - currentTime) / segmentDuration;
          const originalTime = selection.start + progress * (selection.end - selection.start);
          
          const value = getValueAtTime(originalTime, segmentData);
          
          if (value !== null) {
            newData[minute] = {
              time: minute / 60,
              value: parseFloat(value.toFixed(8))
            };
          }
        }
        
        currentTime = segmentEndTime;
      });
      
      for (let i = 0; i < 1440; i++) {
        if (newData[i].value === null) {
          let prevValue = null;
          let nextValue = null;
          
          for (let j = i - 1; j >= 0; j--) {
            if (newData[j].value !== null) {
              prevValue = newData[j].value;
              break;
            }
          }
          
          for (let j = i + 1; j < 1440; j++) {
            if (newData[j].value !== null) {
              nextValue = newData[j].value;
              break;
            }
          }
          
          if (prevValue !== null && nextValue !== null) {
            newData[i].value = parseFloat(((prevValue + nextValue) / 2).toFixed(8));
          } else if (prevValue !== null) {
            newData[i].value = prevValue;
          } else if (nextValue !== null) {
            newData[i].value = nextValue;
          } else {
            newData[i].value = originalData[0]?.value || 0;
          }
        }
      }
      
      series.value[seriesIndex] = {
        ...series.value[seriesIndex],
        data: newData
      };
    });
    
    const afterData = getSeriesSnapshot(selectedSeries.value);
    
    recordOperation('expand', selectedSeries.value, { selections }, beforeData, afterData);
    
    clearSelection();
  }

  const findSimilarPatterns = (seriesId) => {
    if (!selectedTimeRange.value || !seriesId) return []
    
    const datasetStore = useDatasetStore()
    const originalDataset = datasetStore.getOriginalData
    
    // 以下是处理当前选中序列的逻辑
    const patterns = []
    
    const sourceSeries = series.value.find(s => s.id === seriesId)
    if (!sourceSeries) return []
    
    const { start, end } = selectedTimeRange.value
    const duration = end - start
    
    // 提取目标模式的边界值用于相似度匹配
    const leftValue = interpolateValue(sourceSeries.data, start)
    const rightValue = interpolateValue(sourceSeries.data, end)
    
    // 计算在选定范围内的模式能量
    const selectedData = sourceSeries.data.filter(p => 
      p && p.time !== null && p.time !== undefined && 
      p.value !== null && p.value !== undefined && 
      !isNaN(p.time) && !isNaN(p.value) && 
      p.time >= start && p.time <= end
    )
    
    
    // 从数据集中搜索相似模式
    const maxPossibleDiff = 200 // 可能的最大差异值
    
    // 只在数据集中搜索，不在编辑视图中搜索
    if (originalDataset && originalDataset.length > 0) {
      // 跟踪匹配的日期分布
      const matchedDateDistribution = {}
      // 跟踪每个用户的匹配计数
      const userMatchCounts = {}
      
      // 对于每个用户，处理其数据
      for (const userData of originalDataset) {
        if (!userData || !userData.data || !userData.id) continue
        
        // 初始化这个用户的匹配计数
        if (!userMatchCounts[userData.id]) {
          userMatchCounts[userData.id] = 0;
        }
        
        // 限制每个用户的最大匹配数为3，以确保多样性
        if (userMatchCounts[userData.id] >= 3) continue;
        
        // 按日期分组数据
        const dataByDate = {}
        
        // 第一次遍历：将数据按日期分组
        for (const point of userData.data) {
          if (!point.time || !point.value) continue
          
          let dateStr = '未知';
          let timeValue = 0;
          
          // 提取日期和转换时间
          if (typeof point.time === 'string' && point.time.includes('-') && point.time.includes(' ')) {
            const parts = point.time.split(' ');
            dateStr = parts[0]; // 日期部分: YYYY-MM-DD
            const timePart = parts[1]; // 时间部分: HH:MM:SS
            
            if (timePart) {
              const timeParts = timePart.split(':').map(Number);
              if (timeParts.length >= 2) {
                timeValue = timeParts[0] + (timeParts[1] / 60) + ((timeParts.length > 2 ? timeParts[2] : 0) / 3600);
              }
            }
          } else if (typeof point.time === 'string') {
            // 如果只有时间部分，没有日期
            const parts = point.time.split(':').map(Number);
            if (parts.length >= 2) {
              timeValue = parts[0] + (parts[1] / 60) + ((parts.length > 2 ? parts[2] : 0) / 3600);
            }
          } else if (typeof point.time === 'number') {
            timeValue = point.time;
          }
          
          // 只添加有效数据点
          if (!isNaN(timeValue) && !isNaN(point.value)) {
            if (!dataByDate[dateStr]) {
              dataByDate[dateStr] = [];
            }
            
            dataByDate[dateStr].push({
              time: timeValue,
              value: point.value,
              originalTime: point.time
            });
          }
        }
        
        // 第二次遍历：处理每个日期的数据
        for (const [dateStr, dateData] of Object.entries(dataByDate)) {
          // 跳过太少数据点的日期
          if (dateData.length < 100) continue;
          
          // 排序数据
          dateData.sort((a, b) => a.time - b.time);
          
          
          // 对每个日期的数据进行模式匹配
          const datasetStep = Math.max(1, Math.floor(dateData.length / 200));
          
          // 预计算窗口左边界值
          const windowLeftValues = [];
          for (let i = 0; i < dateData.length; i += datasetStep) {
            const point = dateData[i];
            if (!point) continue;
            
            const windowStart = point.time;
            windowLeftValues.push({
              index: i,
              time: windowStart,
              leftValue: interpolateValue(dateData, windowStart)
            });
          }
          
          // 按左边界值相似度排序
          windowLeftValues.sort((a, b) => {
            const aDiff = Math.abs(leftValue - a.leftValue);
            const bDiff = Math.abs(leftValue - b.leftValue);
            return aDiff - bDiff;
          });
          
          // 只处理相似度最高的前50%窗口
          const topWindowsCount = Math.ceil(windowLeftValues.length * 0.5);
          const topWindows = windowLeftValues.slice(0, topWindowsCount);
          
          for (const window of topWindows) {
            const windowStart = window.time;
            const windowEnd = windowStart + duration;
            
            if (windowEnd > 24) continue;
            
            // 避免匹配过近区域
            if (sourceSeries.id && sourceSeries.id.includes(`user_${userData.id}`) && 
                Math.abs(windowStart - start) < duration * 0.3) {
              continue;
            }
            
            // 使用预计算的左边界值
            const windowLeftValue = window.leftValue;
            const leftDiff = Math.abs(leftValue - windowLeftValue);
            const leftSimilarity = 1 - Math.min(leftDiff / maxPossibleDiff, 1);
            
            // 左边界相似度阈值过滤
            if (leftSimilarity < 0.6) continue;
            
            // 计算右边界值和整体相似度
            const windowRightValue = interpolateValue(dateData, windowEnd);
            const rightDiff = Math.abs(rightValue - windowRightValue);
            const rightSimilarity = 1 - Math.min(rightDiff / maxPossibleDiff, 1);
            
            const similarity = (leftSimilarity + rightSimilarity) / 2;
            
            if (similarity <= 0.7) continue;
            
            // 提取窗口数据
            const windowData = dateData.filter(p => 
              p && p.time >= windowStart && p.time <= windowEnd
            );
            
            const patternEnergy = calculatePatternEnergy(windowData);
            
            // 使用日期作为模式标识的一部分
            const displayName = `user ${userData.id} (${dateStr})`;
            
            patterns.push({
              seriesId: `dataset_user_${userData.id}_${dateStr}`,
              start: windowStart,
              end: windowEnd,
              data: windowData,
              similarity,
              leftValue: windowLeftValue,
              rightValue: windowRightValue,
              color: getColorForEnergy(patternEnergy),
              sourceName: displayName,
              sourceType: 'dataset',
              userId: userData.id,
              date: dateStr
            });
            
            // 更新日期分布统计
            matchedDateDistribution[dateStr] = (matchedDateDistribution[dateStr] || 0) + 1;
            
            // 更新用户匹配计数
            userMatchCounts[userData.id]++;
          }
        }
      }
      
    }

    // 确保按相似度进行排序
    patterns.sort((a, b) => b.similarity - a.similarity);
    
    // 改进用户多样性 - 尝试从不同用户获取模式
    const diversePatterns = [];
    const includedUsers = new Set();
    
    // 首先添加相似度最高的模式
    if (patterns.length > 0) {
      diversePatterns.push(patterns[0]);
      includedUsers.add(patterns[0].userId);
    }
    
    // 然后尝试添加来自不同用户的模式，同时保持相似度顺序
    for (const pattern of patterns) {
      // 如果已经有这个用户的模式，但我们还没有收集足够多的用户，跳过
      if (includedUsers.has(pattern.userId) && includedUsers.size < Math.min(5, patterns.length / 2)) {
        continue;
      }
      
      // 添加这个模式
      if (!diversePatterns.includes(pattern)) {
        diversePatterns.push(pattern);
        includedUsers.add(pattern.userId);
      }
      
      // 如果我们已经有10个模式了，停止
      if (diversePatterns.length >= 10) {
        break;
      }
    }
    
    // 如果我们没有收集到足够的多样性模式，添加更多按相似度排序的模式
    if (diversePatterns.length < Math.min(10, patterns.length)) {
      for (const pattern of patterns) {
        if (!diversePatterns.includes(pattern)) {
          diversePatterns.push(pattern);
        }
        
        if (diversePatterns.length >= 10) {
          break;
        }
      }
    }
    
    // 最终的结果，确保它仍然按相似度排序
    return diversePatterns;
  }

  const interpolateValue = (data, time) => {
    const validData = data.filter(p => 
      p && p.time !== null && p.time !== undefined && 
      p.value !== null && p.value !== undefined && 
      !isNaN(p.time) && !isNaN(p.value)
    )
    
    if (validData.length === 0) return 0
    
    const points = validData.filter(p => p.time <= time).sort((a, b) => b.time - a.time)
    const nextPoints = validData.filter(p => p.time > time).sort((a, b) => a.time - b.time)

    if (points.length === 0) return nextPoints[0]?.value ?? 0
    if (nextPoints.length === 0) return points[0]?.value ?? 0

    const prev = points[0]
    const next = nextPoints[0]
    
    if (Math.abs(next.time - prev.time) < 0.0001) return prev.value
    
    const t = (time - prev.time) / (next.time - prev.time)
    return prev.value + t * (next.value - prev.value)
  }

  const replaceWithPattern = (pattern, seriesId) => {
    if (!pattern || !seriesId || !selectedTimeRange.value) return
    
    const seriesIndex = series.value.findIndex(s => s.id === seriesId)
    if (seriesIndex === -1) return
    
    const currentSeries = series.value[seriesIndex]
    const beforeData = getSeriesSnapshot([seriesId])
    
    const { start, end } = selectedTimeRange.value
    const duration = end - start
    
    // 将模式数据缩放到当前选定范围
    const scaledData = pattern.data.map(point => {
      const normalizedTime = (point.time - pattern.start) / (pattern.end - pattern.start)
      const newTime = start + normalizedTime * duration
      return {
        time: newTime,
        value: point.value
      }
    }).sort((a, b) => a.time - b.time)
    
    // 克隆当前序列数据并替换选中范围内的值
    const newData = JSON.parse(JSON.stringify(currentSeries.data))
    
    // 移除选中范围内的所有点
    const filteredData = newData.filter(point => 
      point.time < start || point.time > end
    )
    
    // 合并保留的点和新模式点
    const mergedData = [...filteredData, ...scaledData].sort((a, b) => a.time - b.time)
    
    // 更新序列
    series.value[seriesIndex] = {
      ...currentSeries,
      data: mergedData
    }
    
    // 如果是子序列，更新父序列
    if (currentSeries.parentId) {
      updateParentSeriesFromChild(seriesId, mergedData)
    }
    
    // 确保数据点完整
    series.value[seriesIndex].data = ensureDataPoints(series.value[seriesIndex].data)
    
    const afterData = getSeriesSnapshot([seriesId])
    recordOperation('replace', seriesId, { 
      patternId: pattern.seriesId,
      patternSource: pattern.sourceType,
      timeRange: { start, end }
    }, beforeData, afterData)
    
    // 如果是子序列被修改，也更新选择范围包括父序列
    if (currentSeries.parentId) {
      setSelection(
        {
          start: selectedTimeRange.value.start,
          end: selectedTimeRange.value.end
        }, 
        [currentSeries.id, currentSeries.parentId]
      )
    }

    // 确保任何操作后都更新父序列
    if (currentSeries.parentId) {
      // 如果原函数中已有父序列更新逻辑，确保它们正确执行
      // 如果没有，则手动调用更新函数
      if (!currentSeries.parentId.includes('_decomp_')) { // 避免重复更新分解序列
        updateParentSeriesFromChild(seriesId, series.value[seriesIndex].data);
      }
    }
  }

  // 添加这个新函数来确保每分钟都有数据点
  const ensureMinuteGranularity = (points, start, end) => {
    if (points.length < 2) return points;
    
    // 先按时间排序
    points.sort((a, b) => a.time - b.time);
    
    const result = [];
    // 转换小时为分钟，并计算需要的分钟点
    const startMinutes = Math.floor(start * 60);
    const endMinutes = Math.ceil(end * 60);
    
    // 为每一分钟创建一个数据点
    for (let minuteIndex = startMinutes; minuteIndex <= endMinutes; minuteIndex++) {
      const currentTime = minuteIndex / 60; // 转回小时表示
      
      // 如果在已有点附近(±0.001小时，约3.6秒)，使用已有点
      const existingPoint = points.find(p => Math.abs(p.time - currentTime) < 0.001);
      if (existingPoint) {
        result.push({
          time: currentTime, // 使用精确的分钟时间
          value: existingPoint.value
        });
        continue;
      }
      
      // 找到当前时间点的左右边界点进行插值
      const lowerIndex = points.findIndex(p => p.time > currentTime) - 1;
      
      // 边界情况处理
      if (lowerIndex < 0) {
        // 在第一个点之前，使用第一个点的值
        result.push({
          time: currentTime,
          value: points[0].value
        });
      } else if (lowerIndex >= points.length - 1) {
        // 在最后一个点之后，使用最后一个点的值
        result.push({
          time: currentTime,
          value: points[points.length - 1].value
        });
      } else {
        // 正常情况，进行线性插值
        const lowerPoint = points[lowerIndex];
        const upperPoint = points[lowerIndex + 1];
        
        // 计算权重
        const totalInterval = upperPoint.time - lowerPoint.time;
        if (totalInterval <= 0) {
          // 如果两点时间相同，使用其中一个的值
          result.push({
            time: currentTime,
            value: lowerPoint.value
          });
        } else {
          const weight = (currentTime - lowerPoint.time) / totalInterval;
          // 线性插值计算值
          const interpolatedValue = lowerPoint.value + weight * (upperPoint.value - lowerPoint.value);
          
          result.push({
            time: currentTime,
            value: interpolatedValue
          });
        }
      }
    }
    
    return result;
  }

  const cloneSeries = (seriesId, sourceRange, targetRange) => {
    const seriesIndex = series.value.findIndex(s => s.id === seriesId)
    if (seriesIndex === -1) return

    const beforeData = getSeriesSnapshot([seriesId])
    
    const currentSeries = series.value[seriesIndex]
    let newData = JSON.parse(JSON.stringify(currentSeries.data))

    // 计算范围
    const sourceDuration = sourceRange.end - sourceRange.start
    const targetDuration = targetRange.end - targetRange.start
    
    // 找到源范围内的点
    const sourcePoints = currentSeries.data.filter(
      p => p && p.time >= sourceRange.start && p.time <= sourceRange.end
    ).sort((a, b) => a.time - b.time)

    // 对于目标范围内的每个点进行移除
    newData = newData.filter(
      p => p && !(p.time >= targetRange.start && p.time <= targetRange.end)
    )

    // 克隆并缩放点到目标范围
    const clonedPoints = sourcePoints.map(point => {
      const relativePosition = (point.time - sourceRange.start) / sourceDuration
      return {
        time: targetRange.start + relativePosition * targetDuration,
        value: point.value
      }
    })

    // 合并数据
    newData = [...newData, ...clonedPoints].sort((a, b) => a.time - b.time)

    series.value[seriesIndex] = {
      ...currentSeries,
      data: newData
    }

    // 如果是子序列，立即更新父序列
    if (currentSeries.parentId) {
      updateParentSeriesFromChild(seriesId, newData)
    }

    series.value[seriesIndex].data = ensureDataPoints(series.value[seriesIndex].data)

    const afterData = getSeriesSnapshot([seriesId])
    recordOperation('clone', seriesId, {
      sourceRange,
      targetRange
    }, beforeData, afterData)
  }

  const importData = (importedSeries) => {
    if (!importedSeries || importedSeries.length === 0) return
    
    importedSeries.forEach(imported => {
      const existingIndex = series.value.findIndex(s => s.id === imported.id)
      
      if (existingIndex !== -1) {
        series.value[existingIndex] = {
          ...series.value[existingIndex],
          data: imported.data
        }
      } else {
        addSeries({
          id: imported.id,
          data: imported.data,
          type: 'original',
          visible: true
        })
      }
    })
    
    saveState()
  }

  const undo = () => {
    if (operationIndex.value < 0) return;
    
    const operation = operations.value[operationIndex.value];
    
    if (operation.beforeData) {
      operation.seriesIds.forEach(id => {
        const seriesIndex = series.value.findIndex(s => s.id === id);
        if (seriesIndex !== -1 && operation.beforeData[id]) {
          series.value[seriesIndex] = {
            ...series.value[seriesIndex],
            data: JSON.parse(JSON.stringify(operation.beforeData[id]))
          };
        }
      });
    }
    
    operationIndex.value--;
    
  }

  const redo = () => {
    if (operationIndex.value >= operations.value.length - 1) return;
    
    operationIndex.value++;
    const operation = operations.value[operationIndex.value];
    
    if (operation.afterData) {
      operation.seriesIds.forEach(id => {
        const seriesIndex = series.value.findIndex(s => s.id === id);
        if (seriesIndex !== -1 && operation.afterData[id]) {
          series.value[seriesIndex] = {
            ...series.value[seriesIndex],
            data: JSON.parse(JSON.stringify(operation.afterData[id]))
          };
        }
      });
    }
    
  }

  const canUndo = computed(() => operationIndex.value >= 0);
  const canRedo = computed(() => operationIndex.value < operations.value.length - 1);

  const deleteSeries = (seriesId) => {
    const seriesIndex = series.value.findIndex(s => s.id === seriesId)
    if (seriesIndex === -1) return

    const currentSeries = series.value[seriesIndex]
    const beforeData = getSeriesSnapshot([seriesId])

    // 记录操作
    recordOperation('delete', seriesId, {}, beforeData, null)

    // 如果是子序列，需要先从父序列中移除它的贡献
    if (currentSeries.parentId) {
      // 创建一个值全为0的临时数据集
      const zeroData = JSON.parse(JSON.stringify(currentSeries.data))
      zeroData.forEach(point => {
        if (point) point.value = 0
      })
      
      // 更新父序列，移除此子序列的贡献
      updateParentSeriesFromChild(seriesId, zeroData)
    }

    // 移除序列
    series.value.splice(seriesIndex, 1)
    
    // 如果此序列是父序列，也删除所有子序列
    const childSeries = series.value.filter(s => s.parentId === seriesId)
    for (const child of childSeries) {
      deleteSeries(child.id)
    }
  }

  function triggerUpdate() {
    series.value = [...series.value];
  }

  function setViewport(newViewport) {
    viewport.value = newViewport;
  }

  const getViewport = computed(() => viewport.value);

  const updateEditedSeriesData = (data) => {
    const processedData = data.map(series => {
      const processedPoints = series.data.map(point => {
        let time = point.time;
        let value = point.value;
        
        if (typeof time === 'number') {
          time = parseFloat(time.toFixed(2));
        }
        
        if (typeof value === 'number') {
          value = parseFloat(value.toFixed(8));
        }
        
        return {
          time,
          value
        };
      });
      
      return {
        ...series,
        data: processedPoints
      };
    });
    
    editedSeriesData.value = processedData;
  }

  const ensureDataPoints = (data, expectedPoints = 1440) => {
    if (!data || data.length === 0) return [];
    
    if (data.length === expectedPoints) return data;
    
    const newData = new Array(expectedPoints);
    
    for (let i = 0; i < expectedPoints; i++) {
      const hour = i / 60;
      newData[i] = {
        time: parseFloat(hour.toFixed(2)),
        value: null
      };
    }
    
    data.sort((a, b) => a.time - b.time);
    
    for (let i = 0; i < expectedPoints; i++) {
      const currentTime = i / 60;
      
      const leftIndex = data.findIndex(p => p.time > currentTime) - 1;
      const rightIndex = leftIndex + 1;
      
      if (leftIndex < 0) {
        newData[i].value = data[0].value;
      } else if (rightIndex >= data.length) {
        newData[i].value = data[data.length - 1].value;
      } else {
        const leftPoint = data[leftIndex];
        const rightPoint = data[rightIndex];
        const t = (currentTime - leftPoint.time) / (rightPoint.time - leftPoint.time);
        newData[i].value = parseFloat((leftPoint.value + t * (rightPoint.value - leftPoint.value)).toFixed(8));
      }
    }
    
    return newData;
  };

  const getSeriesSnapshot = (seriesIds) => {
    if (!seriesIds || !seriesIds.length) return null;
    
    const snapshot = {};
    seriesIds.forEach(id => {
      const seriesIndex = series.value.findIndex(s => s.id === id);
      if (seriesIndex !== -1) {
        snapshot[id] = JSON.parse(JSON.stringify(series.value[seriesIndex].data));
      }
    });
    
    return snapshot;
  }

  const recordOperation = (type, affectedSeriesIds, params = {}, beforeData = null, afterData = null) => {
    if (operationIndex.value < operations.value.length - 1) {
      operations.value = operations.value.slice(0, operationIndex.value + 1)
    }
    
    if (!beforeData && !afterData) {
      const seriesIds = Array.isArray(affectedSeriesIds) ? affectedSeriesIds : [affectedSeriesIds];
      
      afterData = getSeriesSnapshot(seriesIds);
      
      console.warn(`Operation ${type} recorded without before data`);
    }
    
    const operation = {
      id: Date.now() + Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString(),
      type,
      seriesIds: Array.isArray(affectedSeriesIds) ? affectedSeriesIds : [affectedSeriesIds],
      timeRange: selectedTimeRange.value ? { ...selectedTimeRange.value } : null,
      params,
      beforeData,
      afterData
    }
    
    operations.value.push(operation)
    
    if (operations.value.length > maxOperations) {
      operations.value.shift()
    }
    
    operationIndex.value = operations.value.length - 1
  }

  const exportEditHistory = () => {
    // 为每个操作确保beforeData和afterData可用
    const processedOperations = operations.value.map(op => {
      // 创建一个新对象，避免修改原始数据
      const processedOp = { ...op };
      
      // 确保beforeData和afterData存在
      if (!processedOp.beforeData || !processedOp.afterData) {
        console.warn(`Operation ${op.id} (${op.type}) has missing data`);
      }
      
      return processedOp;
    });
    
    return {
      operations: processedOperations,
      currentIndex: operationIndex.value
    };
  }

  const moveSeriesWithoutRecord = (seriesId, offset) => {
    if (!selectedTimeRange.value) return;

    const seriesIndex = series.value.findIndex(s => s.id === seriesId);
    if (seriesIndex === -1) return;

    // Get current dataset type to check if we should prevent negative values
    const datasetStore = useDatasetStore();
    const currentDataset = datasetStore.getCurrentDataset;
    const preventNegative = currentDataset === 'step' || currentDataset === 'electricity';

    const currentSeries = series.value[seriesIndex];
    const { start, end } = selectedTimeRange.value;

    const hasChildren = series.value.some(s => s.parentId === seriesId);

    if (currentSeries.parentId) {
      const parentIndex = series.value.findIndex(s => s.id === currentSeries.parentId);
      if (parentIndex !== -1) {
        const childSeries = series.value.filter(s => s.parentId === currentSeries.parentId);
        
        const newParentData = JSON.parse(JSON.stringify(series.value[parentIndex].data));
        
        const newData = JSON.parse(JSON.stringify(currentSeries.data));
        
        newData.forEach((point, i) => {
          if (point && point.time >= start && point.time <= end) {
            // Apply prevention of negative values for step and electricity datasets
            let newValue = point.value + offset.y;
            if (preventNegative) {
              newValue = Math.max(0, newValue);
            }
            
            newData[i] = {
              time: point.time + offset.x,
              value: Math.min(15000, newValue)
            };
          }
        });
        
        newParentData.forEach((point, i) => {
          if (point) {
            point.value = 0;
            
            childSeries.forEach(child => {
              const childData = child.id === seriesId ? newData : child.data;
              point.value += findClosestPointValue(childData, point.time);
            });
          }
        });
        
        series.value[seriesIndex] = {
          ...currentSeries,
          data: newData
        };
        
        series.value[parentIndex] = {
          ...series.value[parentIndex],
          data: newParentData
        };
      }
    } else {
      if (hasChildren) {
        console.warn('Modifying parent series will break consistency with child series');
      }
      
      const newData = JSON.parse(JSON.stringify(currentSeries.data));
      
      newData.forEach((point, i) => {
        if (point && point.time >= start && point.time <= end) {
          // Apply prevention of negative values for step and electricity datasets
          let newValue = point.value + offset.y;
          if (preventNegative) {
            newValue = Math.max(0, newValue);
          }
          
          newData[i] = {
            time: point.time + offset.x,
            value: Math.min(15000, newValue)
          };
        }
      });
      
      newData.sort((a, b) => a.time - b.time);
      
      series.value[seriesIndex] = {
        ...currentSeries,
        data: newData
      };
    }

    series.value[seriesIndex].data = ensureDataPoints(series.value[seriesIndex].data);

    // 确保任何操作后都更新父序列
    if (currentSeries.parentId) {
      // 如果原函数中已有父序列更新逻辑，确保它们正确执行
      // 如果没有，则手动调用更新函数
      if (!currentSeries.parentId.includes('_decomp_')) { // 避免重复更新分解序列
        updateParentSeriesFromChild(seriesId, series.value[seriesIndex].data);
      }
    }
  }

  const recordBatchOperation = (type, affectedSeriesIds, params = {}, beforeData = null, afterData = null) => {
    if (operationIndex.value < operations.value.length - 1) {
      operations.value = operations.value.slice(0, operationIndex.value + 1);
    }
    
    const operation = {
      id: Date.now() + Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString(),
      type,
      seriesIds: Array.isArray(affectedSeriesIds) ? affectedSeriesIds : [affectedSeriesIds],
      timeRange: selectedTimeRange.value ? { ...selectedTimeRange.value } : null,
      params,
      beforeData,
      afterData
    };
    
    operations.value.push(operation);
    
    if (operations.value.length > maxOperations) {
      operations.value.shift();
    }
    
    operationIndex.value = operations.value.length - 1;
  };

  const convertTimeStringToHours = (timeStr) => {
    if (!timeStr) return 0;
    
    // 如果已经是数字，直接返回
    if (typeof timeStr === 'number') return timeStr;
    
    // 如果是时间字符串格式
    if (typeof timeStr === 'string') {
      // 处理包含日期的完整时间戳 (YYYY-MM-DD HH:MM:SS)
      if (timeStr.includes('-') && timeStr.includes(' ')) {
        // 提取时间部分
        const timePart = timeStr.split(' ')[1];
        if (timePart) {
          const parts = timePart.split(':').map(Number);
          if (parts.length >= 2) {
            const hours = parts[0];
            const minutes = parts[1];
            const seconds = parts.length > 2 ? parts[2] : 0;
            
            // 确保时间范围在0-24小时内
            const decimalHours = hours + (minutes / 60) + (seconds / 3600);
            
            return decimalHours;
          }
        }
      }
      
      // 处理标准时间格式 (HH:MM:SS 或 HH:MM)
      const parts = timeStr.split(':').map(Number);
      if (parts.length >= 2) {
        const hours = parts[0];
        const minutes = parts[1];
        const seconds = parts.length > 2 ? parts[2] : 0;
        
        // 确保时间范围在0-24小时内
        const decimalHours = hours + (minutes / 60) + (seconds / 3600);
        
        return decimalHours;
      }
    }
    
    return 0;
  };

  const calculatePatternEnergy = (data) => {
    if (!data || data.length < 2) return 0;
    
    let sum = 0;
    for (let i = 1; i < data.length; i++) {
      sum += Math.abs(data[i].value - data[i-1].value);
    }
    
    return sum / (data.length - 1);
  };

  const getColorForEnergy = (energy) => {
    if (energy > 5) return '#6548C7';
    if (energy > 2) return '#9B71F6';
    return '#8367F8';
  };

  // 提取日期函数
  const extractDateFromTimestamp = (timestamp) => {
    if (!timestamp || typeof timestamp !== 'string') return '';
    
    // 尝试从时间戳中提取日期部分
    if (timestamp.includes('-') && timestamp.includes(' ')) {
      return timestamp.split(' ')[0]; // 提取YYYY-MM-DD部分
    }
    return '';
  };

  // 添加一个辅助函数进行更精确的插值
  const findClosestPointValue = (data, targetTime, threshold = 0.01) => {
    // 如果没有数据，返回0
    if (!data || data.length === 0) return 0;
    
    // 查找最接近的点
    let closestPoint = null;
    let minDiff = threshold;
    
    for (const point of data) {
      if (!point) continue;
      const diff = Math.abs(point.time - targetTime);
      if (diff < minDiff) {
        closestPoint = point;
        minDiff = diff;
      }
    }
    
    // 如果找到足够接近的点，返回其值
    if (closestPoint) return closestPoint.value;
    
    // 如果没有足够接近的点，尝试线性插值
    let before = null;
    let after = null;
    
    // 找出目标时间前后的点
    for (const point of data) {
      if (!point) continue;
      
      if (point.time <= targetTime && (!before || point.time > before.time)) {
        before = point;
      }
      
      if (point.time >= targetTime && (!after || point.time < after.time)) {
        after = point;
      }
    }
    
    // 如果能找到前后点，进行线性插值
    if (before && after) {
      const timeDiff = after.time - before.time;
      if (timeDiff > 0) {
        const ratio = (targetTime - before.time) / timeDiff;
        return before.value + (after.value - before.value) * ratio;
      }
    }
    
    // 退化情况：仅有一侧点
    if (before) return before.value;
    if (after) return after.value;
    
    // 如果完全没有相关点，返回0
    return 0;
  };

  // 记录上次更新时间
  let lastParentUpdateTime = Date.now()
  const updateParentSeriesFromChild = (childSeriesId, childData) => {
    const now = Date.now()
    // 确保至少25ms间隔，避免过于频繁更新导致性能问题
    if (now - lastParentUpdateTime < 25) {
      setTimeout(() => {
        updateParentSeriesFromChild(childSeriesId, childData)
      }, 25)
      return
    }
    
    lastParentUpdateTime = now
    
    const childSeries = series.value.find(s => s.id === childSeriesId)
    if (!childSeries || !childSeries.parentId) return
    
    const parentIndex = series.value.findIndex(s => s.id === childSeries.parentId)
    if (parentIndex === -1) return
    
    // 获取所有相关子序列
    const allChildSeries = series.value.filter(s => s.parentId === childSeries.parentId)
    
    // 准备新的父序列数据
    const newParentData = JSON.parse(JSON.stringify(series.value[parentIndex].data))
    
    // 重新计算父序列的值
    newParentData.forEach((point) => {
      if (point) {
        point.value = 0
        allChildSeries.forEach(child => {
          // 使用传入的新数据或现有数据
          const dataToUse = child.id === childSeriesId ? childData : child.data
          point.value += findClosestPointValue(dataToUse, point.time)
        })
      }
    })
    
    // 更新父序列
    series.value[parentIndex] = {
      ...series.value[parentIndex],
      data: ensureDataPoints(newParentData)
    }
    
    // 更新选择范围包括父序列（如果有选择）
    if (selectedTimeRange.value) {
      setSelection(
        {
          start: selectedTimeRange.value.start,
          end: selectedTimeRange.value.end
        }, 
        [...selectedSeries.value, childSeries.parentId].filter((v, i, a) => a.indexOf(v) === i) // 确保无重复
      )
    }
    
    return series.value[parentIndex]
  }

  return {
    series,
    selectedTimeRange,
    selectedSeries,
    previewSeries,
    addSeries,
    initializeData,
    setSelection,
    clearSelection,
    moveSeries,
    applyCurve,
    expandTimeSeries,
    cloneSeries,
    undo,
    redo,
    canUndo,
    canRedo,
    findSimilarPatterns,
    replaceWithPattern,
    importData,
    setPreviewSeries,
    clearPreviewSeries,
    deleteSeries,
    triggerUpdate,
    viewport,
    setViewport,
    getViewport,
    editedSeriesData,
    updateEditedSeriesData,
    exportEditHistory,
    operations: computed(() => operations.value),
    operationIndex,
    moveSeriesWithoutRecord,
    recordBatchOperation,
    getSeriesSnapshot
  }
})