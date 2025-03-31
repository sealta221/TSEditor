<script setup>
import { ref, onMounted, watch, computed } from 'vue'
import * as d3 from 'd3'
import { formatTime } from '../utils/csvUtils'

const props = defineProps({
  series: Array,
  height: Number,
  showGrid: Boolean,
  selection: Object,
  multiSelect: Boolean,
  activeTool: String,
  isMainChart: Boolean,
  hoveredSeriesId: String,
  selectedSeriesId: String,
  selectedSeries: {
    type: Array,
    default: () => []
  },
  hoverTime: Number,
  isGeneratePreview: {
    type: Boolean,
    default: false
  },
  showTimeAxis: {
    type: Boolean,
    default: true
  },
  timeAxisConfig: {
    type: Object,
    default: () => ({
      marginLeft: 60,
      marginRight: 20,
      width: null
    })
  },
  showAxisLabels: {
    type: Boolean,
    default: false
  },
  gridDensity: {
    type: String,
    default: 'normal',
    validator: value => ['sparse', 'normal', 'dense'].includes(value)
  },
  cloneHighlightArea: {
    type: Object,
    default: null
  },
  isSelected: {
    type: Boolean,
    default: false
  },
  showConfirmButtons: {
    type: Boolean,
    default: false
  },
  confirmButtonsPos: {
    type: Object,
    default: () => ({ x: 0, y: 0 })
  }
})

const emit = defineEmits([
  'click',
  'drag',
  'dragStart',
  'dragEnd',
  'selectionComplete',
  'seriesClick',
  'hover'
])

const chartRef = ref()
const svg = ref()
const margin = { top: 20, right: 20, bottom: 0, left: 45 }
const isDragging = ref(false)
const dragStartX = ref(null)
const dragStartY = ref(null)
const selections = ref([])

const colors = ['#2563eb', '#dc2626', '#16a34a']

const getSeriesSelector = (id) => {
  return `series-${id.replace(/[\s.]/g, '_')}`
}

const downsampleData = (data, threshold = 300) => {
  if (!data || data.length <= threshold) return data;
  
  // 使用LTTB算法进行降采样，保留数据特征
  const factor = Math.ceil(data.length / threshold);
  const sampled = [];
  
  for (let i = 0; i < data.length; i += factor) {
    // 在每个区间内找到最大和最小值点
    let minValue = Infinity;
    let maxValue = -Infinity;
    let minIndex = i;
    let maxIndex = i;
    
    for (let j = i; j < Math.min(i + factor, data.length); j++) {
      if (data[j].value < minValue) {
        minValue = data[j].value;
        minIndex = j;
      }
      if (data[j].value > maxValue) {
        maxValue = data[j].value;
        maxIndex = j;
      }
    }
    
    // 按原始顺序添加极值点
    if (minIndex <= maxIndex) {
      sampled.push(data[minIndex]);
      if (minIndex !== maxIndex) {
        sampled.push(data[maxIndex]);
      }
    } else {
      sampled.push(data[maxIndex]);
      sampled.push(data[minIndex]);
    }
  }
  
  // 确保包含第一个和最后一个点
  if (sampled[0] !== data[0]) sampled.unshift(data[0]);
  if (sampled[sampled.length - 1] !== data[data.length - 1]) sampled.push(data[data.length - 1]);
  
  return sampled;
};

const processSeriesData = (series) => {
  if (!series || !series.data || series.data.length === 0) {
    return []
  }
  
  // 复制数据进行处理
  let seriesData = [...series.data]
  
  // 确保数据按时间排序
  seriesData.sort((a, b) => a.time - b.time)
  
  // 检查是否有空隙需要填补
  const result = []
  const timeGapThreshold = 0.05 // 认为大于这个值的时间差需要插入过渡点
  
  // 为空数组或单个数据点的情况处理
  if (seriesData.length <= 1) {
    return seriesData
  }
  
  // 检测并填补时间间隔
  for (let i = 0; i < seriesData.length - 1; i++) {
    const current = seriesData[i]
    const next = seriesData[i + 1]
    
    // 确保数据点有效
    if (!current || !next || typeof current.time !== 'number' || typeof next.time !== 'number') {
      continue
    }
    
    result.push(current)
    const gap = next.time - current.time
    
    // 如果时间间隔过大，插入过渡点
    if (gap > timeGapThreshold) {
      // 根据间隔大小决定插入点的数量
      const steps = Math.min(Math.ceil(gap / 0.01), 20) // 最多插入20个点，避免过多
      
      for (let j = 1; j < steps; j++) {
        const ratio = j / steps
        const interpolatedTime = current.time + gap * ratio
        // 线性插值计算值
        const interpolatedValue = current.value + (next.value - current.value) * ratio
        
        result.push({
          time: interpolatedTime,
          value: interpolatedValue
        })
      }
    }
  }
  
  // 添加最后一个点
  result.push(seriesData[seriesData.length - 1])
  
  // 对于大数据集进行降采样
  return result.length > 1000 ? downsampleData(result, 1000) : result
}

const initChart = () => {
  if (!chartRef.value) return

  d3.select(chartRef.value).selectAll('*').remove()

  const container = chartRef.value
  const containerWidth = container.clientWidth
  const containerHeight = props.height || container.clientHeight || 400

  svg.value = d3.select(chartRef.value)
    .append('svg')
    .attr('width', '100%')
    .attr('height', '100%')
    .attr('viewBox', `0 0 ${containerWidth} ${containerHeight}`)
    .attr('preserveAspectRatio', 'xMidYMid meet')

  const timeAxisHeight = props.isMainChart ? 30 : 20
  margin.top = props.showTimeAxis ? timeAxisHeight : 5

  const g = svg.value.append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`)

  const width = containerWidth - margin.left - margin.right
  const height = containerHeight - margin.top - margin.bottom

  const xScale = d3.scaleLinear()
    .domain([0, 24])
    .range([0, width])

  // 使用实际数据计算y轴范围
  const allValues = []
  props.series.forEach(s => {
    if (s.visible && s.data && s.data.length > 0) {
      s.data.forEach(d => {
        if (d && typeof d.value === 'number' && !isNaN(d.value)) {
          allValues.push(d.value)
        }
      })
    }
  })
  
  // 确保有数据
  if (allValues.length === 0) {
    allValues.push(0)
  }
  
  // 计算数据范围并添加一些边距
  const minValue = Math.min(...allValues)
  const maxValue = Math.max(...allValues)
  
  // 计算合适的上下边界，确保负值正确显示
  const valueRange = maxValue - minValue
  const padding = Math.max(valueRange * 0.1, 1) // 至少1的边距或10%的数据范围
  
  let yMin = minValue - padding
  let yMax = maxValue + padding
  
  // 如果最小值和最大值都是0，提供默认范围
  if (yMin === yMax) {
    yMin = -1
    yMax = 1
  }

  const yScale = d3.scaleLinear()
    .domain([yMin, yMax])
    .range([height, 0])

  // Add background and grid for main chart
  if (props.isMainChart) {
    // Add subtle background
    g.append('rect')
      .attr('width', width)
      .attr('height', height)
      .attr('fill', '#fafafa')

    // Add alternating background stripes
    g.selectAll('rect.time-stripe')
      .data(d3.range(0, 24, 2))
      .enter()
      .append('rect')
      .attr('class', 'time-stripe')
      .attr('x', d => xScale(d))
      .attr('y', 0)
      .attr('width', xScale(2))
      .attr('height', height)
      .attr('fill', (d, i) => i % 2 === 0 ? '#ffffff' : '#fafafa')

    // Major vertical grid lines (every 2 hours)
    g.selectAll('line.vertical-grid-major')
      .data(d3.range(0, 25, 2))
      .enter()
      .append('line')
      .attr('class', 'vertical-grid-major')
      .attr('x1', d => xScale(d))
      .attr('x2', d => xScale(d))
      .attr('y1', 0)
      .attr('y2', height)
      .attr('stroke', '#e5e7eb')
      .attr('stroke-width', 1)

    // Minor vertical grid lines (every 15 minutes)
    g.selectAll('line.vertical-grid-minor')
      .data(d3.range(0, 24, 0.25))
      .enter()
      .append('line')
      .attr('class', 'vertical-grid-minor')
      .attr('x1', d => xScale(d))
      .attr('x2', d => xScale(d))
      .attr('y1', 0)
      .attr('y2', height)
      .attr('stroke', '#f3f4f6')
      .attr('stroke-width', 0.5)

    // Major horizontal grid lines (dynamically spaced)
    const majorTickCount = 5;
    const majorTicks = yScale.ticks(majorTickCount);
    g.selectAll('line.horizontal-grid-major')
      .data(majorTicks)
      .enter()
      .append('line')
      .attr('class', 'horizontal-grid-major')
      .attr('x1', 0)
      .attr('x2', width)
      .attr('y1', d => yScale(d))
      .attr('y2', d => yScale(d))
      .attr('stroke', '#e5e7eb')
      .attr('stroke-width', 1)

    // Minor horizontal grid lines (finer granularity)
    const minorTickCount = majorTickCount * 2;
    const minorTicks = yScale.ticks(minorTickCount)
      .filter(d => !majorTicks.includes(d));
    g.selectAll('line.horizontal-grid-minor')
      .data(minorTicks)
      .enter()
      .append('line')
      .attr('class', 'horizontal-grid-minor')
      .attr('x1', 0)
      .attr('x2', width)
      .attr('y1', d => yScale(d))
      .attr('y2', d => yScale(d))
      .attr('stroke', '#f3f4f6')
      .attr('stroke-width', 0.5)
  }

  // Create time axis container
  if (props.showTimeAxis) {
    const timeAxisContainer = svg.value.append('g')
      .attr('class', 'time-axis-container')
      .attr('transform', `translate(${margin.left},0)`)

    // Add striped background for time intervals
    for (let hour = 0; hour < 24; hour += 2) {
      timeAxisContainer.append('rect')
        .attr('x', xScale(hour))
        .attr('y', 0)
        .attr('width', xScale(2))
        .attr('height', timeAxisHeight)
        .attr('fill', hour % 2 === 0 ? '#ffffff' : '#fafafa')
        .attr('stroke', 'none')
    }

    // Add hour ticks and labels every 2 hours
    for (let hour = 0; hour <= 24; hour += 2) {
      timeAxisContainer.append('line')
        .attr('x1', xScale(hour))
        .attr('x2', xScale(hour))
        .attr('y1', timeAxisHeight - 12)
        .attr('y2', timeAxisHeight)
        .attr('stroke', '#6b7280')
        .attr('stroke-width', 1.5)

      timeAxisContainer.append('text')
        .attr('x', xScale(hour))
        .attr('y', timeAxisHeight - 14)
        .attr('text-anchor', 'middle')
        .attr('font-size', props.isMainChart ? '10px' : '8px')
        .attr('fill', '#4b5563')
        .text(formatTime(hour))
    }

    // Add medium ticks every 30 minutes
    for (let hour = 0; hour < 24; hour++) {
      timeAxisContainer.append('line')
        .attr('x1', xScale(hour + 0.5))
        .attr('x2', xScale(hour + 0.5))
        .attr('y1', timeAxisHeight - 8)
        .attr('y2', timeAxisHeight)
        .attr('stroke', '#9ca3af')
        .attr('stroke-width', 1)
    }

    // Add small ticks every 15 minutes
    for (let hour = 0; hour < 24; hour++) {
      for (let minute of [0.25, 0.75]) {
        timeAxisContainer.append('line')
          .attr('x1', xScale(hour + minute))
          .attr('x2', xScale(hour + minute))
          .attr('y1', timeAxisHeight - 5)
          .attr('y2', timeAxisHeight)
          .attr('stroke', '#d1d5db')
          .attr('stroke-width', 0.75)
      }
    }
  }

  // Create line generator
  const line = d3.line()
    .x(d => xScale(d.time))
    .y(d => yScale(d.value))
    .curve(d3.curveBasis)

  // Draw lines
  props.series.forEach((s, i) => {
    if (!s.visible) return
    
    // 创建线条组
    const seriesGroup = g.append('g')
      .attr('class', `series ${getSeriesSelector(s.id)}`)
    
    // 改进颜色逻辑
    let seriesColor = '#ABABAB'; // 默认灰色
    
    // 在主视图中检查是否是选定的系列
    if (props.isMainChart && (s.id === props.selectedSeriesId || props.selectedSeries.includes(s.id))) {
      seriesColor = '#D4A554'; // 选中时显示金色
    } else if (props.isSelected) {
      // TimeSeriesView 中显示的系列且是被选中的状态
      seriesColor = '#D4A554'; // 金色
    } else if (!props.isMainChart) {
      // 非主视图且未选中时为黑色
      seriesColor = '#000000';
    }
    
    // 如果是悬停状态，优先级高于选中状态
    if (props.isMainChart && s.id === props.hoveredSeriesId) {
      seriesColor = '#D4A554'; // 悬停时也是金色，但我们会增加线宽区分
    }
    
    // 绘制线条
    seriesGroup.append('path')
      .datum(processSeriesData(s))
      .attr('class', 'line')
      .attr('fill', 'none')
      .attr('stroke', seriesColor)
      .attr('stroke-width', s.id === props.hoveredSeriesId ? 3 : 2)
      .attr('d', line)
      .attr('clip-path', 'url(#clip)')
    
    if (props.isMainChart) {
      seriesGroup.append('path')
        .datum(processSeriesData(s))
        .attr('class', 'line-hover-area')
        .attr('fill', 'none')
        .attr('stroke', 'transparent')
        .attr('stroke-width', 20)
        .attr('d', line)
        .attr('data-series-id', s.id)
        .style('cursor', 'pointer')
        .on('click', (event) => {
          event.stopPropagation()
          emit('seriesClick', s.id)
        })
    }
    
    if ((s.id === props.hoveredSeriesId || s.id === props.selectedSeriesId) && props.isMainChart) {
      seriesGroup.raise()
    }
  })

  // Add selection highlights
  if (props.multiSelect && selections.value.length > 0) {
    selections.value.forEach((selection, i) => {
      g.append('rect')
        .attr('class', 'selection')
        .attr('x', xScale(selection.start))
        .attr('y', 0)
        .attr('width', xScale(selection.end) - xScale(selection.start))
        .attr('height', height)
        .attr('fill', 'rgba(147, 51, 234, 0.2)')
        .attr('stroke', 'rgb(147, 51, 234)')
        .attr('stroke-width', 1)
    })
  } else if (props.selection) {
    g.append('rect')
      .attr('class', 'selection')
      .attr('x', xScale(props.selection.start))
      .attr('y', 0)
      .attr('width', xScale(props.selection.end) - xScale(props.selection.start))
      .attr('height', height)
      .attr('fill', 'rgba(147, 51, 234, 0.2)')
      .attr('stroke', 'rgb(147, 51, 234)')
      .attr('stroke-width', 1)
  }

  // Create hover group
  const hoverGroup = svg.value.append('g')
    .attr('class', 'hover-group')
    .attr('transform', `translate(${margin.left},${margin.top})`)

  // Add hover elements
  const hoverLine = hoverGroup.append('line')
    .attr('class', 'hover-line')
    .attr('y1', 0)
    .attr('y2', height)
    .attr('stroke', 'rgb(147, 51, 234)')
    .attr('stroke-width', 1)
    .style('display', 'none')

  const hoverLabel = hoverGroup.append('text')
    .attr('class', 'hover-label')
    .attr('y', -5)
    .attr('text-anchor', 'middle')
    .attr('fill', 'rgb(147, 51, 234)')
    .style('display', 'none')
    .style('background', 'white')
    .style('padding', '2px 4px')

  const hoverValue = hoverGroup.append('text')
    .attr('class', 'hover-value')
    .attr('x', -5)
    .attr('text-anchor', 'end')
    .attr('fill', 'rgb(147, 51, 234)')
    .style('display', 'none')

  // Add interaction overlay
  const overlay = g.append('rect')
    .attr('class', 'overlay')
    .attr('width', width)
    .attr('height', height)
    .attr('fill', 'none')
    .style('pointer-events', 'all')

  // Handle mouse events
  overlay
    .on('mousemove', (event) => {
      const [x, y] = d3.pointer(event)
      const time = xScale.invert(x)
      const value = yScale.invert(y)
      
      if (props.selection && (props.activeTool === 'move-x' || props.activeTool === 'move-y')) {
        const isInSelection = time >= props.selection.start && time <= props.selection.end
        overlay.style('cursor', isInSelection ? (props.activeTool === 'move-x' ? 'ew-resize' : 'ns-resize') : 'default')
      } else {
        overlay.style('cursor', 'default')
      }

      hoverLine
        .attr('x1', x)
        .attr('x2', x)
        .style('display', null)

      hoverLabel
        .attr('x', x)
        .text(formatTime(time))
        .style('display', null)

      if (props.isMainChart) {
        hoverValue
          .attr('y', y)
          .text(value.toFixed(2))
          .style('display', null)
      }

      if (props.isMainChart) {
        emit('hover', time)
      }

      if (isDragging.value && dragStartX.value !== null) {
        const startTime = xScale.invert(dragStartX.value)
        const startValue = dragStartY.value ? yScale.invert(dragStartY.value) : 0
        emit('drag', {
          start: Math.min(startTime, time),
          end: Math.max(startTime, time)
        }, {
          start: Math.min(startValue, value),
          end: Math.max(startValue, value)
        }, { x, y })
      }
    })
    .on('mouseleave', () => {
      hoverLine.style('display', 'none')
      hoverLabel.style('display', 'none')
      hoverValue.style('display', 'none')
      if (props.isMainChart) {
        emit('hover', null)
      }
    })
    .on('mousedown', (event) => {
      const [x, y] = d3.pointer(event)
      dragStartX.value = x
      dragStartY.value = y
      isDragging.value = true
      emit('dragStart', { x, y })
      event.preventDefault()
    })
    .on('mouseup', (event) => {
      if (dragStartX.value !== null) {
        const [x, y] = d3.pointer(event)
        const time = xScale.invert(x)
        const value = yScale.invert(y)
        
        if (props.multiSelect) {
          const startTime = xScale.invert(dragStartX.value)
          selections.value.push({
            start: Math.min(startTime, time),
            end: Math.max(startTime, time)
          })
          selections.value.sort((a, b) => a.start - b.start)
          initChart()
          emit('selectionComplete', selections.value)
        }
        
        emit('click', time, value)
      }
      dragStartX.value = null
      dragStartY.value = null
      isDragging.value = false
      emit('dragEnd', event)
    })

  // Update hover line position if hoverTime prop is provided
  if (props.hoverTime !== undefined && props.hoverTime !== null) {
    const x = xScale(props.hoverTime)
    hoverLine
      .attr('x1', x)
      .attr('x2', x)
      .style('display', null)
  }

  // 更新网格线
  if (props.showGrid) {
    const yTicks = yScale.ticks(10)  // 让 D3 自动计算合适的刻度数量
    
    // 添加水平网格线
    g.append('g')
      .attr('class', 'grid')
      .selectAll('line.horizontal')
      .data(yTicks)
      .enter()
      .append('line')
      .attr('class', 'horizontal')
      .attr('x1', 0)
      .attr('x2', width)
      .attr('y1', d => yScale(d))
      .attr('y2', d => yScale(d))
      .attr('stroke', '#E5E7EB')
      .attr('stroke-width', 0.5)
      .attr('stroke-dasharray', '2,2')
  }

  // 更新 Y 轴
  if (props.isMainChart) {
    g.append('g')
      .attr('class', 'y-axis')
      .attr('transform', `translate(0,0)`)
      .call(d3.axisLeft(yScale)
        .ticks(5)
        .tickFormat(d => d.toFixed(1))
      )
      .selectAll('text')
      .style('font-size', '9px')
      .style('fill', '#666')
      .attr('dx', '-5')
      .attr('dy', '0.3em')
      .style('text-anchor', 'end');
      
    g.select('.y-axis').select('path.domain')
      .style('stroke', '#aaa')
      .style('stroke-width', '1px');
  }

  // 绘制克隆高亮区域（如果有）
  if (props.cloneHighlightArea && props.isMainChart) {
    const { seriesId, start, end } = props.cloneHighlightArea
    
    // 检查要高亮的系列是否存在
    const targetSeries = props.series.find(s => s.id === seriesId)
    if (targetSeries) {
      // 创建高亮矩形
      g.append('rect')
        .attr('class', 'clone-highlight')
        .attr('x', xScale(start))
        .attr('y', 0)
        .attr('width', xScale(end) - xScale(start))
        .attr('height', height)
        .attr('fill', 'rgba(124, 58, 237, 0.2)') // 紫色带透明度
        .attr('stroke', '#7C3AED')  // 紫色边框
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '4,4') // 虚线边框
        .attr('rx', 4) // 圆角
        .transition()
        .duration(200)
        .style('opacity', 0.8)
        .transition()
        .delay(2000) // 延长高亮时间到2秒
        .duration(200)
        .style('opacity', 0)
    }
  }

  // 为多序列编辑添加高亮效果
  if (props.multiSelect && props.selection && props.isMainChart && props.selectedSeries && props.selectedSeries.length > 1) {
    const { start, end } = props.selection
    
    // 创建多序列高亮矩形
    g.append('rect')
      .attr('class', 'multi-series-highlight')
      .attr('x', xScale(start))
      .attr('y', 0)
      .attr('width', xScale(end) - xScale(start))
      .attr('height', height)
      .attr('fill', 'rgba(124, 58, 237, 0.1)') // 更淡的紫色
      .attr('stroke', '#7C3AED')  // 紫色边框
      .attr('stroke-width', 1.5)
      .attr('stroke-dasharray', '4,4') // 虚线边框
      .attr('rx', 4) // 圆角
      .style('pointer-events', 'none') // 确保不会阻挡鼠标事件
  }
}

// Watch for hover time changes
watch(() => props.hoverTime, (newTime) => {
  if (!svg.value) return
  
  const width = chartRef.value.clientWidth - margin.left - margin.right
  const xScale = d3.scaleLinear()
    .domain([0, 24])
    .range([0, width])
    
  const hoverLine = svg.value.select('.hover-line')
  
  if (newTime !== null) {
    const x = xScale(newTime)
    hoverLine
      .attr('x1', x)
      .attr('x2', x)
      .style('display', null)
  } else {
    hoverLine.style('display', 'none')
  }
}, { immediate: true })

// Add a new watch for selectedSeriesId to update colors when selection changes
watch(() => props.selectedSeriesId, (newId, oldId) => {
  if (!svg.value || !props.isMainChart) return
  
  props.series.forEach(s => {
    if (!s.visible) return
    
    const isSelected = newId === s.id
    const wasSelected = oldId === s.id
    const selector = getSeriesSelector(s.id)
    const seriesGroup = svg.value.select(`.${selector}`)
    
    if (!seriesGroup.empty()) {
      seriesGroup.select('.line')
        .attr('stroke', isSelected ? '#D4A554' : '#ABABAB')
      
      if (isSelected) {
        seriesGroup.raise()
      }
    }
    
    // If selection changed, we need to redraw to ensure proper coloring
    if (isSelected !== wasSelected) {
      // Schedule a refresh to ensure color changes stick
      setTimeout(() => {
        const currentStroke = seriesGroup.select('.line').attr('stroke')
        seriesGroup.select('.line').attr('stroke', currentStroke)
      }, 10)
    }
  })
}, { immediate: true })

// Modify existing hoveredSeriesId watch to respect selection state
watch(() => props.hoveredSeriesId, (newId) => {
  if (!svg.value || !props.isMainChart) return
  
  props.series.forEach(s => {
    if (!s.visible) return
    
    const isHovered = newId === s.id
    const isSelected = s.id === props.selectedSeriesId || props.selectedSeries.includes(s.id)
    const selector = getSeriesSelector(s.id)
    const seriesGroup = svg.value.select(`.${selector}`)
    
    if (!seriesGroup.empty()) {
      seriesGroup.select('.line')
        .attr('stroke-width', isHovered ? 3 : 2)
        .attr('stroke', isHovered || isSelected ? '#D4A554' : '#ABABAB')
      
      if (isHovered) {
        seriesGroup.raise()
      }
    }
  })
}, { immediate: true })

// Add new watch for selectedSeries array (for multi-select cases)
watch(() => props.selectedSeries, (newSelectedSeries) => {
  if (!svg.value || !props.isMainChart) return
  
  props.series.forEach(s => {
    if (!s.visible) return
    
    const isSelected = newSelectedSeries.includes(s.id)
    const selector = getSeriesSelector(s.id)
    const seriesGroup = svg.value.select(`.${selector}`)
    
    if (!seriesGroup.empty()) {
      seriesGroup.select('.line')
        .attr('stroke', isSelected ? '#D4A554' : '#ABABAB')
      
      if (isSelected) {
        seriesGroup.raise()
      }
    }
  })
}, { deep: true, immediate: true })

watch(() => props.series, initChart, { deep: true })
watch(() => props.selection, initChart)
watch(() => props.multiSelect, (newValue) => {
  if (!newValue) {
    selections.value = []
  }
  initChart()
})
watch(() => props.activeTool, initChart)
watch(() => props.cloneHighlightArea, initChart)

onMounted(() => {
  initChart()
  
  const observer = new ResizeObserver(() => {
    requestAnimationFrame(() => {
      initChart()
    })
  })
  
  if (chartRef.value) {
    observer.observe(chartRef.value)
  }
})

const handleConfirmSelection = () => {
  // Implementation of handleConfirmSelection
}

const handleCancelSelection = () => {
  // Implementation of handleCancelSelection
}
</script>

<template>
  <div ref="chartRef" class="w-full h-full bg-white relative">
    <!-- 添加确认/取消按钮 -->
    <div 
      v-if="showConfirmButtons"
      class="absolute flex flex-col gap-2 z-10"
      :style="{
        top: `${confirmButtonsPos.y}px`,
        left: `${confirmButtonsPos.x}px`
      }"
    >
      <button
        @click="handleConfirmSelection"
        class="p-1 rounded-full border border-gray-200 bg-white flex items-center justify-center w-8 h-8 hover:border-green-300 shadow-sm"
        title="Confirm"
      >
        <img src="/src/assets/apply.svg" alt="Confirm" class="w-6 h-6" />
      </button>
      
      <button
        @click="handleCancelSelection"
        class="p-1 rounded-full border border-gray-200 bg-white flex items-center justify-center w-8 h-8 hover:border-red-300 shadow-sm"
        title="Cancel"
      >
        <img src="/src/assets/cancel.svg" alt="Cancel" class="w-6 h-6" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.hover-line {
  pointer-events: none;
  stroke-width: 1;
  stroke-dasharray: 4,4;
}

.hover-label,
.hover-value {
  pointer-events: none;
  font-size: 10px;
  fill: #6B7280;
}

.hover-label {
  background: white;
  padding: 2px 4px;
}

.selection {
  fill: rgba(124, 58, 237, 0.1);
  stroke: #7C3AED;
  stroke-width: 1;
  stroke-dasharray: 4,4;
}

.time-divider {
  pointer-events: none;
}

.time-axis-container text {
  font-family: 'Inter', sans-serif;
  font-weight: 500;
}

.y-axis text {
  font-family: 'Inter', sans-serif;
}

.y-axis line {
  stroke: #E5E7EB;
  stroke-width: 1;
}

.y-axis path {
  stroke: none;
}

.line-hover-area {
  cursor: pointer;
}

.clone-highlight {
  pointer-events: none;
}

.temp-selection {
  pointer-events: none;
}
</style>