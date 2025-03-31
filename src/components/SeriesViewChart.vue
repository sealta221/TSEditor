<script setup>
import { ref, onMounted, watch, computed } from 'vue'
import * as d3 from 'd3'

const props = defineProps({
  series: Object,
  height: {
    type: Number,
    default: 70
  },
  hoverTime: Number,
  isSelected: Boolean,
  timeAxisConfig: Object
})

const chartRef = ref(null)
const svg = ref(null)

// 处理数据，确保数据有效并按时间排序
const processSeriesData = (series) => {
  if (!series || !series.data || series.data.length === 0) {
    return []
  }
  
  // 复制数据进行处理
  let seriesData = [...series.data]
  
  // 确保数据按时间排序
  seriesData.sort((a, b) => a.time - b.time)
  
  return seriesData
}

// 初始化图表
const initChart = () => {
  if (!chartRef.value) return

  // 清除现有内容
  d3.select(chartRef.value).selectAll('*').remove()

  const container = chartRef.value
  const containerWidth = container.clientWidth
  const containerHeight = props.height || 70

  // 创建SVG
  svg.value = d3.select(chartRef.value)
    .append('svg')
    .attr('width', '100%')
    .attr('height', '100%')
    .attr('viewBox', `0 0 ${containerWidth} ${containerHeight}`)
    .attr('preserveAspectRatio', 'xMidYMid meet')

  // 定义图表区域，使用与时间轴相同的右边距（从timeAxisConfig获取）
  const margin = { 
    top: 5, 
    right: props.timeAxisConfig?.marginRight || 20, // 使用与时间轴相同的右边距
    bottom: 5, 
    left: 0 
  }
  
  const g = svg.value.append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`)

  const width = containerWidth - margin.left - margin.right
  const height = containerHeight - margin.top - margin.bottom

  // 设置X轴比例，从0到24小时
  const xScale = d3.scaleLinear()
    .domain([0, 24])
    .range([0, width])

  // 计算Y轴范围
  const allValues = []
  if (props.series && props.series.data) {
    props.series.data.forEach(d => {
      if (d && typeof d.value === 'number' && !isNaN(d.value)) {
        allValues.push(d.value)
      }
    })
  }
  
  // 确保有数据
  if (allValues.length === 0) {
    allValues.push(0)
  }
  
  // 计算数据范围并添加一些边距
  const minValue = Math.min(...allValues)
  const maxValue = Math.max(...allValues)
  
  const valueRange = maxValue - minValue
  const padding = Math.max(valueRange * 0.1, 1)
  
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

  // 创建线条生成器
  const line = d3.line()
    .x(d => xScale(d.time))
    .y(d => yScale(d.value))
    .curve(d3.curveBasis)

  // 绘制线条
  const seriesColor = props.isSelected ? '#D4A554' : '#000000'
  
  g.append('path')
    .datum(processSeriesData(props.series))
    .attr('class', 'line')
    .attr('fill', 'none')
    .attr('stroke', seriesColor)
    .attr('stroke-width', 2)
    .attr('d', line)

  // 添加悬停线
  if (props.hoverTime !== undefined && props.hoverTime !== null) {
    const x = xScale(props.hoverTime)
    g.append('line')
      .attr('class', 'hover-line')
      .attr('x1', x)
      .attr('x2', x)
      .attr('y1', 0)
      .attr('y2', height)
      .attr('stroke', 'rgb(147, 51, 234)')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '4,4')
  }
}

// 监听属性变化重绘图表
watch(() => props.series, initChart, { deep: true })
watch(() => props.hoverTime, initChart)
watch(() => props.isSelected, initChart)

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

  return () => {
    if (chartRef.value) observer.unobserve(chartRef.value)
  }
})
</script>

<template>
  <div ref="chartRef" class="w-full h-full bg-white"></div>
</template>

<style scoped>
.hover-line {
  pointer-events: none;
  stroke-width: 1;
  stroke-dasharray: 4,4;
}
</style>