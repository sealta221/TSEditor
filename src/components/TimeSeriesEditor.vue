<script setup>
import { ref, computed, onMounted, watch, onUnmounted, nextTick } from 'vue'
import { useTimeSeriesStore } from '../stores/timeSeriesStore'
import { useDatasetStore } from '../stores/datasetStore'
import TimeSeriesChart from './TimeSeriesChart.vue'
import TimeSeriesView from './TimeSeriesView.vue'
import CurveEditor from './CurveEditor.vue'
import { ElMessage } from 'element-plus'
import { BORDER_WIDTH, BORDER_COLOR, THEME_COLOR, THEME_COLOR_HOVER } from '../utils/constants'
import { generateHouseData } from '../utils/generateData'
import PatternChart from './PatternChart.vue'

const store = useTimeSeriesStore()

const tools = ref([
  { 
    id: 'move-x', 
    name: 'Move X',
    icon: 'move-x.svg',
    active: false 
  },
  { 
    id: 'expand', 
    name: 'Expand',
    icon: 'expand.svg',
    active: false 
  },
  { 
    id: 'move-y', 
    name: 'Move Y',
    icon: 'move-y.svg',
    active: false 
  },
  { 
    id: 'curve', 
    name: 'Curve',
    icon: 'curve.svg',
    active: false 
  },
  { 
    id: 'clone', 
    name: 'Clone',
    icon: 'clone.svg',
    active: false 
  },
  { 
    id: 'removal', 
    name: 'Removal',
    icon: 'removal.svg',
    active: false 
  }
])

const activeTool = ref(null)
const isDragging = ref(false)
const dragStartTime = ref(null)
const dragStartValue = ref(null)
const initialDragTime = ref(null)
const dragThreshold = 0.05
const isMultiSelect = ref(false)
const selections = ref([])
const dragStartPoint = ref(null)
const generatePatterns = ref([])
const selectedPattern = ref(null)
const selectedSeriesId = ref(null)
const hoveredSeriesId = ref(null)
const hoverTime = ref(null)
const selectionPending = ref(false)

const previewCurve = ref(null)

const timeAxisConfig = ref({
  marginLeft: 100,
  marginRight: 20,
  width: null
})

const cloneHighlightArea = ref(null)

const showSidePanel = computed(() => {
  return activeTool.value === 'curve' || activeTool.value === 'removal'
})

const handleChartHover = (time) => {
  hoverTime.value = time
}

const initialSeriesState = ref(null)

const selectTool = (toolId) => {
  if (selectionPending.value) {
    ElMessage.warning('Please confirm or cancel your selection first')
    return
  }

  if (toolId === activeTool.value) {
    if (toolId === 'expand' && selections.value.length > 0) {
      store.expandTimeSeries(selections.value)
    } else if (toolId === 'removal' && store.selectedTimeRange && selectedSeriesId.value) {
      // 获取数据集并输出到控制台
      const datasetStore = useDatasetStore()
      const fullDataset = datasetStore.getOriginalData
      console.log('完整数据集:', fullDataset)
      console.log('生成的匹配模式:', generatePatterns.value)
      
      return
    } else if ((toolId === 'move-x' || toolId === 'move-y') && initialSeriesState.value) {
      const finalState = store.getSeriesSnapshot(
        selectedSeriesId.value ? [selectedSeriesId.value] : store.selectedSeries
      );
      
      // 获取实际应用的偏移量
      let effectiveOffset = { x: 0, y: 0 };
      
      if (toolId === 'move-x' && store.selectedTimeRange) {
        // 计算实际位移
        const initialRange = initialSeriesState.value.timeRange;
        const finalRange = store.selectedTimeRange;
        
        if (initialRange && finalRange) {
          effectiveOffset.x = finalRange.start - initialRange.start;
        }
      } else if (toolId === 'move-y') {
        // 对于 move-y，我们可以通过比较点的值来计算偏移量
        // 但这不是必需的，因为偏移量主要用于显示，我们关心的是完整的 beforeData 和 afterData
      }
      
      store.recordBatchOperation(
        toolId, 
        selectedSeriesId.value ? [selectedSeriesId.value] : store.selectedSeries,
        { 
          type: toolId,
          offset: effectiveOffset,
          initialState: initialSeriesState.value  // 添加初始状态到参数中
        }, 
        initialSeriesState.value.series,  // 使用初始状态作为 beforeData 
        finalState
      );
      
      initialSeriesState.value = null;
    }
    
    activeTool.value = null
    tools.value.forEach(tool => tool.active = false)
    isMultiSelect.value = false
    selections.value = []
    dragStartTime.value = null
    dragStartValue.value = null
    previewCurve.value = null
    selectedPattern.value = null
    store.clearPreviewSeries()
    return
  }

  if (toolId !== activeTool.value) {
    dragStartTime.value = null
    dragStartValue.value = null
    selections.value = []
    previewCurve.value = null
    selectedPattern.value = null
    store.clearPreviewSeries()
    
    if (toolId === 'move-x' || toolId === 'move-y') {
      if (store.selectedTimeRange) {
        initialSeriesState.value = {
          timeRange: { ...store.selectedTimeRange },
          series: store.getSeriesSnapshot(
            selectedSeriesId.value ? [selectedSeriesId.value] : store.selectedSeries
          )
        };
      }
    }
  }

  tools.value.forEach(tool => tool.active = tool.id === toolId)
  activeTool.value = toolId

  if (toolId === 'expand') {
    isMultiSelect.value = true
    // 如果已存在选择范围，将其添加到selections中，但只包含可见序列
    if (store.selectedTimeRange) {
      const visibleIds = store.selectedSeries.filter(id => {
        const seriesObj = store.series.find(s => s.id === id);
        return seriesObj && seriesObj.visible;
      });
      
      if (visibleIds.length > 0 && 
          !selections.value.some(s => s.start === store.selectedTimeRange.start && s.end === store.selectedTimeRange.end)) {
        selections.value.push({
          ...store.selectedTimeRange,
          seriesIds: visibleIds
        });
      }
    }
  } else {
    isMultiSelect.value = false
    selections.value = []
  }

  if (toolId === 'removal' && store.selectedTimeRange && selectedSeriesId.value) {
    // 先显示右侧面板，展示加载状态
    isLoadingPatterns.value = true
    generatePatterns.value = [] // 清空之前的结果
    
    // 使用异步操作计算匹配模式
    setTimeout(() => {
      generatePatterns.value = store.findSimilarPatterns(selectedSeriesId.value)
      isLoadingPatterns.value = false
    }, 50) // 小延迟让界面有时间更新
  }
}

const handleChartClick = (time, value) => {
  if (!activeTool.value) {
    if (!dragStartTime.value) {
      dragStartTime.value = time
      dragStartValue.value = value
      initialDragTime.value = time
    } else {
      if (Math.abs(time - initialDragTime.value) < 0.01) {
        return
      }
      
      const timeRange = {
        start: Math.min(dragStartTime.value, time),
        end: Math.max(dragStartTime.value, time)
      }
      
      if (timeRange.end - timeRange.start < 0.1) {
        timeRange.end = timeRange.start + 0.1
      }
      
      if (selectedSeriesId.value) {
        store.setSelection(timeRange, [selectedSeriesId.value])
      } else {
        store.setSelection(timeRange, store.series.map(s => s.id))
      }
      
      dragStartTime.value = null
      dragStartValue.value = null
      initialDragTime.value = null
      selectionPending.value = true
    }
    return
  }

  switch (activeTool.value) {
    case 'clone':
      handleCloneOperation(time)
      break
  }
}

// 修改 handleCloneOperation 函数，支持多条曲线克隆
const handleCloneOperation = (targetTime) => {
  if (!store.selectedTimeRange) {
    ElMessage.warning('Please select a time range first')
    return
  }
  
  // 确定需要克隆的曲线列表
  const seriesToClone = selectedSeriesId.value 
    ? [selectedSeriesId.value] 
    : store.selectedSeries
  
  if (seriesToClone.length === 0) {
    ElMessage.warning('Please select at least one series to clone')
    return
  }
  
  // 构建源时间范围和目标时间范围
  const sourceTimeRange = { ...store.selectedTimeRange }
  const duration = sourceTimeRange.end - sourceTimeRange.start
  
  // 构建目标时间范围
  const targetTimeRange = {
    start: targetTime,
    end: targetTime + duration
  }
  
  // 设置目标区域高亮显示 - 只显示主要选中的或第一个曲线的高亮
  const highlightSeriesId = selectedSeriesId.value || seriesToClone[0]
  cloneHighlightArea.value = {
    seriesId: highlightSeriesId,
    start: targetTime,
    end: targetTime + duration
  }
  
  // 为每条选中的曲线执行克隆
  seriesToClone.forEach(seriesId => {
    store.cloneSeries(seriesId, sourceTimeRange, targetTimeRange)
  })
  
  // 设置定时器，两秒后清除高亮和重置工具
  setTimeout(() => {
    cloneHighlightArea.value = null
    activeTool.value = null
    tools.value.forEach(tool => tool.active = false)
  }, 2000)
}

// 添加一个引用来访问图表组件
const chartRef = ref(null)

// 完全重新设计的灵敏度算法，主要基于最大值，并针对电力数据集进行优化
const calculateChartBasedSensitivity = (seriesId) => {
  // 基础参数
  const minSensitivity = 0.0005  // 非常小的最小灵敏度，用于小数值
  const maxSensitivity = 1000    // 非常大的最大灵敏度，用于超大数值
  
  // 获取当前数据集类型
  const datasetStore = useDatasetStore()
  const currentDataset = datasetStore.getCurrentDataset
  
  // 如果是电力数据集，使用更高的灵敏度
  if (currentDataset === 'electricity') {
    return 5 // 为电力数据集提供更高的灵敏度
  }
  
  // 如果没有选择序列，返回默认中等灵敏度
  if (!seriesId) return 0.1
  
  // 获取当前选择的序列
  const selectedSeries = store.series.find(s => s.id === seriesId)
  if (!selectedSeries || !selectedSeries.data || selectedSeries.data.length === 0) {
    return 0.1
  }
  
  // 获取选中区域内的数据点
  const rangeData = selectedSeries.data.filter(point => {
    return point && store.selectedTimeRange &&
           point.time >= store.selectedTimeRange.start && 
           point.time <= store.selectedTimeRange.end
  })
  
  // 如果选中区域内没有数据点，使用全部数据点
  const dataToAnalyze = rangeData.length > 0 ? rangeData : selectedSeries.data
  
  // 查找最大绝对值 - 考虑正负值
  const absValues = dataToAnalyze.map(point => Math.abs(point.value))
  const maxAbsValue = absValues.length > 0 ? Math.max(...absValues) : 0
  
  // 获取图表高度
  let chartHeight = 300 // 默认值
  if (chartRef.value && chartRef.value.$el) {
    chartHeight = chartRef.value.$el.clientHeight
  }
  
  // 根据最大值使用不同的灵敏度计算方式
  let sensitivity
  
  // 完全基于最大值的分段式灵敏度计算
  if (maxAbsValue <= 0.01) {
    // 几乎为零的数值，使用极低灵敏度
    sensitivity = 0.0005
  } else if (maxAbsValue <= 1) {
    // 非常小的数值 (0-1)
    sensitivity = 0.001
  } else if (maxAbsValue <= 3) {
    // 小数值 (1-3)
    sensitivity = 0.005
  } else if (maxAbsValue <= 10) {
    // 小到中等数值 (3-10)
    sensitivity = 0.01
  } else if (maxAbsValue <= 100) {
    // 中等数值 (10-100)
    sensitivity = 0.05
  } else if (maxAbsValue <= 500) {
    // 中大数值 (100-500)
    sensitivity = 0.1
  } else if (maxAbsValue <= 1000) {
    // 大数值 (500-1000)
    sensitivity = 0.5
  } else if (maxAbsValue <= 5000) {
    // 很大数值 (1000-5000)
    sensitivity = 1.0
  } else if (maxAbsValue <= 10000) {
    // 超大数值 (5000-10000)
    sensitivity = 2.0
  } else {
    // 极大数值 (10000+) - 使用对数比例增加灵敏度
    const logScale = Math.log10(maxAbsValue / 1000)
    sensitivity = Math.max(3.0, logScale * 2)
  }
  
  // 应用图表高度调整 - 图表越高，每像素移动影响越小，所以增加灵敏度
  const heightFactor = 300 / chartHeight
  sensitivity *= heightFactor
  
  // 限制在合理范围内
  return Math.max(minSensitivity, Math.min(maxSensitivity, sensitivity))
}

const handleChartDrag = (timeRange, valueRange, dragPoint) => {
  if (!isDragging.value) return

  if (timeRange && Math.abs(timeRange.end - timeRange.start) < 0.1) {
    timeRange.end = timeRange.start + 0.1
  }

  switch (activeTool.value) {
    case 'move-x':
      if (store.selectedTimeRange) {
        const offset = dragPoint.x - (dragStartPoint.value?.x || 0)
        
        if (Math.abs(offset) < dragThreshold) {
          return
        }
        
        if (selectedSeriesId.value) {
          store.moveSeriesWithoutRecord(selectedSeriesId.value, { x: offset * 0.005, y: 0 })
          store.setSelection({
            start: store.selectedTimeRange.start + offset * 0.005,
            end: store.selectedTimeRange.end + offset * 0.005
          }, [selectedSeriesId.value])
        } else {
          store.selectedSeries.forEach(id => {
            store.moveSeriesWithoutRecord(id, { x: offset * 0.005, y: 0 })
          })
          store.setSelection({
            start: store.selectedTimeRange.start + offset * 0.005,
            end: store.selectedTimeRange.end + offset * 0.005
          }, store.selectedSeries)
        }
      }
      break
    case 'move-y':
      if (store.selectedTimeRange) {
        const offset = (dragStartPoint.value?.y || 0) - dragPoint.y
        
        if (Math.abs(offset) < dragThreshold) {
          return
        }
        
        if (selectedSeriesId.value) {
          // 使用基于图表的灵敏度调整
          const chartSensitivity = calculateChartBasedSensitivity(selectedSeriesId.value)
          store.moveSeriesWithoutRecord(selectedSeriesId.value, { 
            x: 0, 
            y: offset * chartSensitivity
          })
        } else {
          store.selectedSeries.forEach(id => {
            // 为每条曲线单独计算灵敏度
            const chartSensitivity = calculateChartBasedSensitivity(id)
            store.moveSeriesWithoutRecord(id, { 
              x: 0, 
              y: offset * chartSensitivity 
            })
          })
        }
      }
      break
    default:
      if (!isMultiSelect.value) {
        if (timeRange) {
          if (timeRange.end - timeRange.start < 0.1) {
            return
          }
          
          if (dragStartTime.value) {
            const currentDirection = timeRange.end > timeRange.start ? 'forward' : 'backward'
            const initialDirection = dragStartTime.value > initialDragTime.value ? 'forward' : 'backward'
            
            if (currentDirection !== initialDirection) {
              return
            }
          }
        }
        
        if (selectedSeriesId.value) {
          store.setSelection(timeRange, [selectedSeriesId.value])
        } else {
          store.setSelection(timeRange, store.series.map(s => s.id))
        }
        selectionPending.value = true
      }
      break
  }
  
  // 更新拖拽起点
  dragStartPoint.value = { ...dragPoint }
}

const handleSelectionComplete = (newSelections) => {
  selections.value = newSelections
}

const handleCurveChange = (curve) => {
  // 保存曲线控制点
  previewCurve.value = curve
  
  // 这里可以添加预览功能，显示应用曲线后的效果
  if (selectedSeriesId.value && store.selectedTimeRange) {
    // 创建临时预览
    const previewData = generatePreviewData(selectedSeriesId.value, curve)
    // 更新预览...
  }
}

// 生成预览数据的辅助函数
const generatePreviewData = (seriesId, curve) => {
  const series = store.series.find(s => s.id === seriesId)
  if (!series || !store.selectedTimeRange) return []
  
  const { start, end } = store.selectedTimeRange
  const duration = end - start
  
  // 复制数据避免直接修改
  const previewData = JSON.parse(JSON.stringify(series.data))
  
  // 对选中范围内的每个数据点应用曲线乘数
  previewData.forEach((point, i) => {
    if (point.time >= start && point.time <= end) {
      // 计算当前点在选择范围内的相对位置（0-1）
      const relativePosition = (point.time - start) / duration
      
      // 使用曲线在该位置的 y 值作为乘数
      let multiplier = 1
      for (let j = 0; j < curve.length - 1; j++) {
        if (curve[j].x <= relativePosition && curve[j + 1].x >= relativePosition) {
          const t = (relativePosition - curve[j].x) / (curve[j + 1].x - curve[j].x)
          multiplier = curve[j].y + t * (curve[j + 1].y - curve[j].y)
          break
        }
      }
      
      // 应用乘数到原始值
      previewData[i] = {
        time: point.time,
        value: point.value * multiplier
      }
    }
  })
  
  return previewData
}

const handleCurveApply = () => {
  if (!store.selectedTimeRange || !previewCurve.value) return
  
  const currentSelection = { ...store.selectedTimeRange }
  
  if (selectedSeriesId.value) {
    store.applyCurve(selectedSeriesId.value, previewCurve.value)
    store.setSelection(currentSelection, [selectedSeriesId.value])
  } else {
    store.selectedSeries.forEach(id => {
      store.applyCurve(id, previewCurve.value)
    })
    store.setSelection(currentSelection, store.selectedSeries)
  }
  
  previewCurve.value = null
  
  // 应用后关闭工具
  activeTool.value = null
  tools.value.forEach(tool => tool.active = false)
  
  // 成功消息反馈
  ElMessage.success('Curve applied successfully')
}

const handleCurveReset = () => {
  previewCurve.value = null
}

const handleGenerateSelect = (pattern) => {
  selectedPattern.value = pattern
  store.setPreviewSeries(pattern)
  
  // 在控制台显示详细的相似度信息，方便调试
  console.log(`Selected pattern with similarity: ${(pattern.similarity * 100).toFixed(2)}%`)
  console.log(`From user: ${pattern.userId}, date: ${pattern.date}`)
}

const handleGenerateApply = () => {
  if (!selectedPattern.value || !selectedSeriesId.value) {
    ElMessage.warning('Please select a pattern first')
    return
  }
  
  // 应用模式前记录状态
  const beforeState = store.getSeriesSnapshot([selectedSeriesId.value])
  
  // 应用替换操作
  store.replaceWithPattern(selectedPattern.value, selectedSeriesId.value)
  
  // 记录操作完成，提供清晰的反馈
  ElMessage.success(`Pattern from user ${selectedPattern.value.userId} applied successfully`)
  
  // 清除选择和预览
  selectedPattern.value = null
  store.clearPreviewSeries()
  
  // 关闭工具
  activeTool.value = null
  tools.value.forEach(tool => tool.active = false)
}

const handleGenerateReset = () => {
  selectedPattern.value = null
  store.clearPreviewSeries()
  
  // 清晰的用户反馈
  ElMessage.info('Pattern selection cancelled')
}

const handleDragStart = (point) => {
  isDragging.value = true
  dragStartPoint.value = point
  
  if (point && point.time) {
    initialDragTime.value = point.time
  }
}

const handleDragEnd = (event) => {
  isDragging.value = false
  dragStartPoint.value = null
  
  if (store.selectedTimeRange) {
    const { start, end } = store.selectedTimeRange
    if (Math.abs(end - start) < 0.1) {
      store.setSelection({
        start,
        end: start + 0.1
      }, store.selectedSeries)
    }
  }
  
  if (selectionPending.value) {
    const chartRect = event.target.getBoundingClientRect()
    mouseReleasePosition.value = {
      x: event.clientX - chartRect.left,
      y: event.clientY - chartRect.top
    }
    showSelectionButtons.value = true
  }

  if (activeTool.value === 'move-x' && initialSeriesState.value) {
    const finalState = store.getSeriesSnapshot(
      selectedSeriesId.value ? [selectedSeriesId.value] : store.selectedSeries
    );
    
    store.recordBatchOperation(
      'move-x', 
      selectedSeriesId.value ? [selectedSeriesId.value] : store.selectedSeries,
      { 
        type: 'move-x',
        initialState: initialSeriesState.value,  // 包含初始时间范围
        finalTimeRange: store.selectedTimeRange   // 包含最终时间范围
      }, 
      initialSeriesState.value.series, 
      finalState
    );
    
    initialSeriesState.value = null;
  }
}

const handleSeriesClick = (seriesId) => {
  const seriesObj = store.series.find(s => s.id === seriesId);
  
  // 如果序列不可见，则不能选择
  if (seriesObj && !seriesObj.visible) {
    return;
  }
  
  // 如果当前序列已经被选中，则取消选择
  if (selectedSeriesId.value === seriesId) {
    selectedSeriesId.value = null;
    // 如果store中有选中的时间范围，只清除选中的系列而保留时间范围
    if (store.selectedTimeRange) {
      store.setSelection(store.selectedTimeRange, []);
    } else {
      store.clearSelection();
    }
    return;
  }
  
  // 否则，选择新的序列
  selectedSeriesId.value = seriesId;
  
  // 如果有选中的时间范围，更新store中的选中系列
  if (store.selectedTimeRange) {
    store.setSelection(store.selectedTimeRange, [seriesId]);
  }
}

const handleSeriesHover = (seriesId, isHovering) => {
  hoveredSeriesId.value = isHovering ? seriesId : null
}

const formatTime = (time) => {
  const hours = Math.floor(time)
  const minutes = Math.floor((time - hours) * 60)
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
}

const confirmSelection = () => {
  selectionPending.value = false
  
  if (store.selectedTimeRange) {
    const { start, end } = store.selectedTimeRange
    if (Math.abs(end - start) < 0.1) {
      store.setSelection({
        start,
        end: start + 0.1
      }, store.selectedSeries)
    }
  }
  
  ElMessage.success('Selection confirmed')
}

const cancelSelection = () => {
  store.clearSelection()
  selectionPending.value = false
  showSelectionButtons.value = false
  dragStartTime.value = null
  dragStartValue.value = null
  ElMessage.info('Selection cancelled')
}

const applySelection = () => {
  selectionPending.value = false
  showSelectionButtons.value = false
}

const mouseReleasePosition = ref(null)
const showSelectionButtons = ref(false)

// 组织序列以支持父子关系显示
const organizedSeries = computed(() => {
  // 找出所有没有 parentId 的顶级序列
  return store.series.filter(s => !s.parentId);
});

// 获取特定父序列的所有子序列
const getChildSeries = (parentId) => {
  // 获取所有子序列
  const children = store.series.filter(s => s.parentId === parentId);
  
  // 定义序列类型的排序顺序
  const typeOrder = {
    'hf': 1,  // HF 排在最前面
    'mf': 2,  // MF 排在中间
    'lf': 3   // LF 排在最后
  };
  
  // 根据类型排序
  return children.sort((a, b) => {
    // 默认值，如果没有type属性或不是预期的类型
    const aOrder = a.type && typeOrder[a.type.toLowerCase()] ? typeOrder[a.type.toLowerCase()] : 99;
    const bOrder = b.type && typeOrder[b.type.toLowerCase()] ? typeOrder[b.type.toLowerCase()] : 99;
    return aOrder - bOrder;
  });
};

// Function to initialize default data with the new range
const initializeDefaultData = () => {
  // 使用三种不同类型的参数生成数据
  const defaultSeries = [
    { id: 'Default 1', patternType: 'morning' },
    { id: 'Default 2', patternType: 'afternoon' },
    { id: 'Default 3', patternType: 'evening' }
  ];
  
  defaultSeries.forEach(({ id, patternType }) => {
    // 直接使用 generateData.js 中的函数
    const data = generateHouseData(1, patternType); // 只生成1天的数据，传入模式类型
    
    // 添加到 store
    store.addSeries({
      id,
      label: id,
      data: data,
      type: 'original',
      visible: true,
      color: getRandomColor()
    });
  });
  
  // 设置视图范围
  if (typeof store.setViewport === 'function') {
    store.setViewport({
      start: 0,
      end: 24
    });
  }
};

// 添加清理函数
const cleanupDuplicateSeries = () => {
  // 将序列按ID分组
  const seriesGroups = {};
  
  store.series.forEach(s => {
    if (!seriesGroups[s.id]) {
      seriesGroups[s.id] = [];
    }
    seriesGroups[s.id].push(s);
  });
  
  // 对每个ID组检查重复
  Object.values(seriesGroups).forEach(group => {
    if (group.length <= 1) return; // 没有重复
    
    // 保留最完整的序列（有日期和变量的）
    let bestSeries = group[0];
    for (let i = 1; i < group.length; i++) {
      const current = group[i];
      // 有日期和变量的序列优先级最高
      if ((current.date && !bestSeries.date) || 
          (current.variable && !bestSeries.variable)) {
        // 删除旧的不完整序列
        const index = store.series.findIndex(s => s === bestSeries);
        if (index !== -1) {
          store.series.splice(index, 1);
        }
        bestSeries = current;
      } else if (bestSeries.date && bestSeries.variable) {
        // 如果最佳序列已经有日期和变量，删除其他重复序列
        const index = store.series.findIndex(s => s === current);
        if (index !== -1) {
          store.series.splice(index, 1);
        }
      }
    }
  });
};

onMounted(() => {
  // 确保初始化时清空所有数据
  store.series.splice(0, store.series.length);
  
  // 监听添加时间序列的事件
  window.addEventListener('add-time-series', (event) => {
    const data = event.detail;
    if (!data || !data.length) return;
    
    // 获取当前数据集类型
    const datasetStore = useDatasetStore();
    const currentDataset = datasetStore.getCurrentDataset;
    
    data.forEach(item => {
      const { id, date, variable, data: seriesData } = item;
      
      // 构建唯一的序列ID - 修改这部分逻辑
      let seriesId;
      if (currentDataset === 'capture' && variable) {
        seriesId = `user_${id}_${variable}`;
      } else if (date) {
        // 对于非capture数据集，如果有日期信息则将其包含在ID中
        seriesId = `user_${id}_${date}`;
      } else {
        // 如果没有日期信息，则使用简单的ID
        seriesId = `user_${id}`;
      }
      
      // 查找现有序列，根据不同的数据集使用不同的匹配条件
      let existingSeries;
      if (currentDataset === 'capture' && variable) {
        existingSeries = store.series.find(s => 
          s.id === seriesId && 
          s.date === date && 
          s.variable === variable
        );
      } else {
        existingSeries = store.series.find(s => 
          s.id === seriesId && 
          s.date === date
        );
      }
      
      if (existingSeries) {
        console.log(`序列已存在，不重复添加: ${seriesId}`);
        return;
      }
      
      // 转换为小时格式
      const processedData = seriesData.map(point => {
        const [hours, minutes] = point.time.split(':').map(Number);
        return {
          time: hours + minutes / 60,
          value: point.value
        };
      });
      
      // 创建序列对象，仅在capture数据集时添加variable属性
      const newSeries = {
        id: seriesId,
        date,
        data: processedData,
        visible: true,
        type: 'original'
      };
      
      // 只在capture数据集时添加variable属性
      if (currentDataset === 'capture' && variable) {
        newSeries.variable = variable;
      }
      
      // 添加到store
      store.addSeries(newSeries);
    });
  });
  
  // 添加延迟的清理操作，确保在初始化后执行
  setTimeout(() => {
    cleanupDuplicateSeries();
  }, 500);
})

onUnmounted(() => {
  // 移除事件监听 (也只需要一处)
  window.removeEventListener('add-time-series', () => {});
})

// Modify the handleAddTimeSeries function to ensure the series appears in the view
const handleAddTimeSeries = (event) => {
  const seriesDataArray = event.detail;
  
  if (!seriesDataArray || !seriesDataArray.length) {
    ElMessage.warning('No valid time series data to add');
    return;
  }
  
  let addedSeriesIds = []; // Track added series for selection
  
  // Process each series in the array
  seriesDataArray.forEach(seriesData => {
    const { id, date, data } = seriesData;
    
    // Create a unique series ID to avoid conflicts
    const seriesId = `user_${id}_${date}`;
    
    // Transform data format if needed for store
    const transformedData = data.map(point => ({
      time: convertTimeStringToHours(point.time),
      value: point.value
    })).sort((a, b) => a.time - b.time); // Ensure time-sorted data
    
    // Add the series to the store
    store.addSeries({
      id: seriesId,
      label: `User ${id} (${date})`,
      data: transformedData,
      visible: true,
      color: getRandomColor(),
      type: 'original' // Important: set the type for proper rendering
    });
    
    addedSeriesIds.push(seriesId);
  });
  
  // Select all newly added series
  if (addedSeriesIds.length > 0) {
    selectedSeriesId.value = addedSeriesIds[0];
    
    // Check if setSelectedSeries exists before calling it
    if (typeof store.setSelectedSeries === 'function') {
      store.setSelectedSeries(addedSeriesIds);
    }
    
    // Find the time range of the first added series to focus the chart
    const firstSeries = store.series.find(s => s.id === addedSeriesIds[0]);
    if (firstSeries && firstSeries.data.length > 0) {
      const times = firstSeries.data.map(p => p.time);
      const minTime = Math.min(...times);
      const maxTime = Math.max(...times);
      
      // Set the viewport to show the full time series if the function exists
      if (typeof store.setViewport === 'function') {
        store.setViewport({
          start: Math.max(0, minTime - 0.5), // Add some padding
          end: Math.min(24, maxTime + 0.5)   // Add some padding, but cap at 24 hours
        });
      }
    }
  }
  
  ElMessage.success(`Added ${seriesDataArray.length} new time series`);
  
  // Force reactivity update if needed
  nextTick(() => {
    // This ensures Vue's reactivity system picks up the changes
    store.triggerUpdate();
  });
};

// Helper function to convert time strings (HH:MM:SS) to hours (decimal format)
const convertTimeStringToHours = (timeStr) => {
  const [hours, minutes, seconds = '0'] = timeStr.split(':').map(Number);
  return hours + (minutes / 60) + (seconds / 3600);
};

// Helper function to generate random colors
const getRandomColor = () => {
  const letters = '0123456789ABCDEF';
  let color = '#';
  for (let i = 0; i < 6; i++) {
    color += letters[Math.floor(Math.random() * 16)];
  }
  return color;
};

// Debug helper - expose to window for console debugging
if (typeof window !== 'undefined') {
  window.__timeSeriesDebug = {
    store,
    getSeriesCount: () => store.series.length,
    getSeriesIds: () => store.series.map(s => s.id),
    organizedSeries: computed(() => organizedSeries.value),
    exportCurrentState: () => JSON.stringify(store.series)
  };
}

// 添加防抖函数
const debounce = (fn, delay) => {
  let timer = null;
  return function(...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      fn.apply(this, args);
    }, delay);
  };
};

// 将图表更新操作包装在防抖函数中
const debouncedUpdateChart = debounce(() => {
  // 图表更新逻辑
  store.triggerUpdate();
}, 100);

// 在数据变化监听中使用防抖函数
watch(() => store.series, () => {
  debouncedUpdateChart();
}, { deep: true });

// 添加一个新的计算属性，用于按类型获取子序列
const getChildSeriesByType = (parentId, type) => {
  return store.series.filter(s => 
    s.parentId === parentId && 
    s.type === type
  );
};

// Add this function to get a color based on similarity value
const getSimilarityColor = (similarity) => {
  if (similarity >= 0.9) return '#7C3AED'; // 深紫色 - 最高相似度
  if (similarity >= 0.8) return THEME_COLOR; // 标准主题色 - 高相似度
  if (similarity >= 0.7) return THEME_COLOR_HOVER; // 浅紫色 - 中等相似度
  return '#B69FFF'; // 更浅的紫色 - 低相似度
}

// 添加loading状态变量
const isLoadingPatterns = ref(false)
</script>

<template>
  <div class="h-screen flex flex-col bg-white no-drag">
    <div class="flex-1 flex flex-col overflow-hidden">
      <!-- Top section with editor -->
      <div class="h-[47.1%] flex overflow-hidden"
           :style="{
             borderBottomWidth: `${BORDER_WIDTH}px`,
             borderColor: BORDER_COLOR
           }">
        <!-- Toolbar -->
        <div class="w-[65px] flex-none flex flex-col items-center">
          <div class="toolbar flex flex-col items-center gap-4 mt-4 ml-2">
            <!-- 循环生成按钮和分隔线 -->
            <template v-for="(tool, index) in tools" :key="tool.id">
              <button
                @click="selectTool(tool.id)"
                class="w-[48px] h-[48px] flex items-center justify-center rounded-lg transition-all duration-200 shadow-sm"
                :class="{
                  [`bg-purple-100 text-[${THEME_COLOR}] shadow-md scale-105`]: tool.active,
                  'text-gray-500 hover:bg-gray-50 hover:scale-105 hover:shadow': !tool.active,
                  'opacity-50 cursor-not-allowed': selectionPending
                }"
                :title="tool.name"
                :disabled="selectionPending"
              >
                <img :src="`/src/assets/${tool.icon}`" :alt="tool.name" class="w-[36px] h-[36px]" draggable="false" />
              </button>
              
              <!-- 只在第1个和第3个按钮后添加分隔线 -->
              <div v-if="index === 1 || index === 3" 
                   class="w-[24px] h-0 border-b my-2"
                   :style="{ borderColor: THEME_COLOR }">
              </div>
            </template>
          </div>
        </div>

        <!-- Main content area -->
        <div class="flex-1 flex overflow-hidden">
          <!-- Main content -->
          <div class="flex-1 flex flex-col overflow-hidden">
            <div class="flex-1 px-6 pt-2 pb-4">
              <TimeSeriesChart
                ref="chartRef"
                :series="[...store.series, ...(store.previewSeries ? [store.previewSeries] : [])]"
                :height="null"
                :showGrid="true"
                :selection="store.selectedTimeRange"
                :multiSelect="isMultiSelect"
                :activeTool="activeTool"
                :isMainChart="true"
                :hoveredSeriesId="hoveredSeriesId"
                :selectedSeriesId="selectedSeriesId"
                :selectedSeries="store.selectedSeries"
                :timeAxisConfig="timeAxisConfig"
                :cloneHighlightArea="cloneHighlightArea"
                @click="handleChartClick"
                @drag="handleChartDrag"
                @dragStart="handleDragStart"
                @dragEnd="handleDragEnd"
                @selectionComplete="handleSelectionComplete"
                @seriesClick="handleSeriesClick"
                @hover="handleChartHover"
              />
            </div>
            
            <!-- 选择确认/取消按钮 -->
            <div 
              v-if="showSelectionButtons && mouseReleasePosition" 
              class="absolute flex flex-col gap-2"
              :style="{
                left: `${mouseReleasePosition.x + 10}px`,
                top: `${mouseReleasePosition.y - 40}px` 
              }"
            >
              <button 
                @click="applySelection" 
                class="p-1 rounded-full border border-gray-200 bg-white flex items-center justify-center w-7 h-7 hover:border-green-300" 
                title="Apply"
              >
                <img src="/src/assets/apply.svg" alt="Apply" class="w-5 h-5" />
              </button>
              <button 
                @click="cancelSelection" 
                class="p-1 rounded-full border border-gray-200 bg-white flex items-center justify-center w-7 h-7 hover:border-red-300" 
                title="Cancel"
              >
                <img src="/src/assets/cancel.svg" alt="Cancel" class="w-5 h-5" />
              </button>
            </div>
          </div>

          <!-- Side panel -->
          <div v-if="showSidePanel" class="w-[30%] border-l border-gray-200 flex flex-col h-full overflow-hidden">
            <template v-if="activeTool === 'curve'">
              <div class="h-full flex flex-col p-6">
                <div class="mb-4">
                  <p class="text-sm text-gray-600 mb-2">Presets:</p>
                  <div class="flex flex-wrap gap-2">
                    <button 
                      v-for="preset in ['double', 'half', 'ease-in', 'ease-out', 'ease-in-out', 's-curve', 'step']"
                      :key="preset"
                      @click="$refs.curveEditor.applyPreset(preset)"
                      :style="{
                        backgroundColor: `${THEME_COLOR}10`,
                        color: THEME_COLOR
                      }"
                      class="px-3 py-1 text-xs rounded hover:bg-opacity-20"
                    >
                      {{ 
                        preset === 'double' ? 'Double (200%)' : 
                        preset === 'half' ? 'Half (50%)' : 
                        preset.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ') 
                      }}
                    </button>
                  </div>
                </div>
                
                <div class="flex-1 overflow-hidden">
                  <CurveEditor
                    ref="curveEditor"
                    :visible="true"
                    :timeRange="store.selectedTimeRange"
                    :seriesId="selectedSeriesId"
                    @change="handleCurveChange"
                  />
                </div>
                
                <div class="mt-4 pt-4 border-t flex justify-end gap-2">
                  <button
                    @click="$refs.curveEditor.resetToDefault()"
                    class="p-2 transition-all duration-150 hover:scale-110"
                    title="Reset"
                  >
                    <img src="/src/assets/cancel.svg" alt="Reset" class="w-6 h-6" />
                  </button>
                  <button
                    @click="handleCurveApply"
                    class="p-2 transition-all duration-150 hover:scale-110"
                    :disabled="!previewCurve"
                    title="Apply"
                  >
                    <img src="/src/assets/apply.svg" alt="Apply" class="w-6 h-6" />
                  </button>
                </div>
              </div>
            </template>

            <template v-if="activeTool === 'removal'">
              <div class="h-full flex flex-col overflow-hidden">               
                <el-scrollbar class="flex-1 overflow-hidden">
                  <div class="p-4">
                    <!-- 添加加载状态 -->
                    <div v-if="isLoadingPatterns" class="flex flex-col items-center justify-center py-8">
                      <div class="loading-spinner mb-2"></div>
                      <div class="text-center text-[#8367F8]">Processing...</div>
                    </div>
                    
                    <div v-else-if="generatePatterns.length === 0" class="text-center py-8 text-gray-500">
                      Please select one time series to removal
                    </div>
                    
                    <div v-else class="space-y-4">
                      <div 
                        v-for="pattern in generatePatterns" 
                        :key="`${pattern.start}-${pattern.end}`"
                        class="border rounded-lg p-4 cursor-pointer transition-all duration-200"
                        :class="{
                          'border-[#8367F8] bg-[#8367F8]/10': selectedPattern === pattern,
                          'border-gray-200 hover:border-[#8367F8]': selectedPattern !== pattern
                        }"
                        @click="handleGenerateSelect(pattern)"
                      >
                        <div class="flex justify-between items-center mb-2">
                          <div class="text-sm text-gray-600">
                            <span class="mr-2">Source: {{ pattern.sourceName }}</span>
                          </div>
                          <div class="text-sm font-semibold" 
                               :style="{ color: getSimilarityColor(pattern.similarity) }">
                            Similarity: {{ (pattern.similarity * 100).toFixed(1) }}%
                          </div>
                        </div>
                        <div class="text-sm text-gray-600 mb-2">
                          Time range: {{ formatTime(pattern.start) }} - {{ formatTime(pattern.end) }}
                        </div>
                        <div class="h-[90px]">
                          <PatternChart
                            :pattern="pattern"
                            :height="90"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </el-scrollbar>
                
                <div class="flex-none border-t border-gray-200 p-2 flex justify-end gap-2">
                  <button
                    @click="handleGenerateReset"
                    class="p-0.5 rounded-full border border-gray-200 bg-white flex items-center justify-center w-7 h-7 hover:border-red-300"
                    title="Cancel"
                  >
                    <img src="/src/assets/cancel.svg" alt="Cancel" class="w-5 h-5" />
                  </button>
                  
                  <button
                    @click="handleGenerateApply"
                    class="p-0.5 rounded-full border border-gray-200 bg-white flex items-center justify-center w-7 h-7 hover:border-green-300"
                    :disabled="!selectedPattern"
                    title="Apply"
                  >
                    <img src="/src/assets/apply.svg" alt="Apply" class="w-5 h-5" />
                  </button>
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>

      <!-- Bottom section with series list -->
      <div class="h-[52.9%] flex flex-col">
        <!-- Fixed time axis -->
        <div class="flex-none pt-[4px]"
             :style="{
               borderBottomWidth: `${BORDER_WIDTH}px`,
               borderColor: BORDER_COLOR
             }">
          <div class="flex items-center">
            <!-- View label -->
            <div class="w-[65px] flex justify-center">
              <span class="text-large font-bold text-black ml-2">View</span>
            </div>
            <!-- Time axis -->
            <div class="flex-1 px-6">
              <TimeSeriesChart
                :series="[]"
                :height="20"
                :showGrid="false"
                :isMainChart="false"
                :timeAxisConfig="timeAxisConfig"
                class="time-axis-only"
              />
            </div>
          </div>
        </div>

        <!-- Scrollable series list -->
        <el-scrollbar class="flex-1 pt-0 pb-4">
          <!-- 当没有序列时显示提示信息 -->
          <div v-if="!store.series.length" class="flex justify-center items-center h-full">
            <div class="border-2 border-dashed rounded-2xl p-10 mx-auto my-4 w-[82%] h-[300px] flex items-center justify-center text-center mt-[70px]"
              :style="{ 
                borderColor: THEME_COLOR, 
                backgroundColor: `${THEME_COLOR}10`,
                borderStyle: 'dashed',
                borderWidth: '2px'
              }"
            >
              <p class="text-2xl text-black font-bold tracking-wide">
                Please drag data in matrix view here to add time series for editing
              </p>
            </div>
          </div>
          
          <!-- 有序列时显示序列列表 -->
          <template v-else>
            <!-- 使用计算属性对序列进行分组，将子序列显示在原序列下方 -->
            <template v-for="parentSeries in organizedSeries" :key="parentSeries.id">
              <!-- 父序列 -->
              <TimeSeriesView
                :series="parentSeries"
                :isSelected="selectedSeriesId === parentSeries.id"
                :hoverTime="hoverTime"
                :timeAxisConfig="timeAxisConfig"
                @click="handleSeriesClick(parentSeries.id)"
                @hover="(isHovering) => handleSeriesHover(parentSeries.id, isHovering)"
              />
              
              <!-- 子序列 - 显式按 lf, mf, hf 顺序渲染 -->
              <template v-for="type in ['lf', 'mf', 'hf']">
                <TimeSeriesView
                  v-for="childSeries in getChildSeriesByType(parentSeries.id, type)"
                  :key="childSeries.id"
                  :series="childSeries"
                  :isSelected="selectedSeriesId === childSeries.id"
                  :hoverTime="hoverTime"
                  :timeAxisConfig="timeAxisConfig"
                  @click="handleSeriesClick(childSeries.id)"
                  @hover="(isHovering) => handleSeriesHover(childSeries.id, isHovering)"
                />
              </template>
            </template>
          </template>
          <div class="h-20"></div>
        </el-scrollbar>
      </div>
    </div>
  </div>
</template>

<style scoped>
[style*="border"] {
  border-style: solid;
}

/* 添加禁用拖拽的样式 */
.no-drag {
  -webkit-user-drag: none;
  -khtml-user-drag: none;
  -moz-user-drag: none;
  -o-user-drag: none;
}

.no-drag * {
  -webkit-user-drag: none;
  -khtml-user-drag: none;
  -moz-user-drag: none;
  -o-user-drag: none;
}

.toolbar {
  /* 调整工具栏布局 */
  padding-top: 8px;  /* 减少顶部间距 */
  justify-content: flex-start;
}

.toolbar button {
  transform-origin: center;
}

.toolbar button:hover {
  transform: scale(1.05);
}

.toolbar button:active {
  transform: scale(0.95);
}

.time-axis-only {
  height: 20px;
  overflow: visible;
  margin-bottom: 0;
  margin-right: 20px;
}

/* 调整滚动区域样式 */
:deep(.el-scrollbar__wrap) {
  overflow-x: hidden !important;
}

:deep(.el-scrollbar__view) {
  padding-bottom: 20px;
}

/* 添加到现有样式中 */
.pattern-list-item {
  border-radius: 8px;
  transition: all 0.2s ease;
}

.pattern-list-item:hover {
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
}

.pattern-list-item.selected {
  border-color: #8367F8;
  background-color: rgba(131, 103, 248, 0.05);
}

.similarity-badge {
  font-weight: 600;
  color: #8367F8;
}

.time-range {
  color: #6B7280;
  font-size: 0.875rem;
}

.source-name {
  font-weight: 500;
}

/* 添加 Element Plus 滚动条样式 */
:deep(.el-scrollbar__bar) {
  z-index: 3;
}

:deep(.el-scrollbar__wrap) {
  overflow-x: hidden !important;
}

:deep(.el-scrollbar__thumb) {
  background-color: #C0C4CC;
  opacity: 0.3;
}

:deep(.el-scrollbar__thumb:hover) {
  opacity: 0.5;
}

:deep(.el-scrollbar__bar.is-vertical) {
  width: 6px;
}

:deep(.el-scrollbar__bar.is-horizontal) {
  height: 6px;
}

/* 加载动画 */
.loading-spinner {
  display: inline-block;
  width: 30px;
  height: 30px;
  border: 3px solid rgba(131, 103, 248, 0.2);
  border-radius: 50%;
  border-top-color: #8367F8;
  animation: spin 1s ease-in-out infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>