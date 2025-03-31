<script setup>
import { ref, computed, onMounted, watch, onUnmounted } from 'vue'
import * as d3 from 'd3'
import { THEME_COLOR } from '../utils/constants'

const props = defineProps({
  visible: Boolean,
  timeRange: Object,
  seriesId: String
})

const emit = defineEmits(['change', 'cancel'])

const svgRef = ref(null)
const controlPoints = ref([
  { x: 0, y: 1 },
  { x: 0.33, y: 1 },
  { x: 0.67, y: 1 },
  { x: 1, y: 1 }
])
const isDragging = ref(false)
const activePointIndex = ref(null)

const margin = { top: 20, right: 30, bottom: 30, left: 40 }

// 修改为扩展范围到 200%
const yDomain = [0, 2] // 扩展到 200%

// 事件处理
const handleMouseDown = (event, d, index) => {
  console.log('开始拖动控制点:', index, d);
  isDragging.value = true;
  activePointIndex.value = index;
  
  // 阻止事件冒泡和默认行为
  event.stopPropagation();
  event.preventDefault();
};

// 鼠标移动事件
const handleMouseMove = (event) => {
  if (!isDragging.value || activePointIndex.value === null) return;
  
  const svg = svgRef.value
  const width = svg.clientWidth
  const height = svg.clientHeight
  const innerWidth = width - margin.left - margin.right
  const innerHeight = height - margin.top - margin.bottom

  const xScale = d3.scaleLinear()
    .domain([0, 1])
    .range([0, innerWidth])

  const yScale = d3.scaleLinear()
    .domain(yDomain)
    .range([innerHeight, 0])

  // 获取鼠标相对于SVG的坐标
  const svgRect = svg.getBoundingClientRect()
  const mouseX = event.clientX - svgRect.left - margin.left
  const mouseY = event.clientY - svgRect.top - margin.top

  // 转换为数据坐标
  const x = xScale.invert(mouseX)
  const y = yScale.invert(mouseY)

  // 限制x值的范围
  const limitedX = Math.max(0, Math.min(1, x))
  
  // 限制y值的范围
  const limitedY = Math.max(0, Math.min(2, y)) // 允许最高200%的值
  
  // 更新点位置
  controlPoints.value[activePointIndex.value] = {
    x: limitedX,
    y: limitedY
  }
  
  // 保持第一个和最后一个点的x坐标固定
  if (activePointIndex.value === 0) {
    controlPoints.value[0].x = 0
  } else if (activePointIndex.value === controlPoints.value.length - 1) {
    controlPoints.value[controlPoints.value.length - 1].x = 1
  }
  
  // 排序控制点 - 确保x坐标递增
  controlPoints.value.sort((a, b) => a.x - b.x);
  
  // 重绘图表
  initChart()
  
  // 触发变更事件
  emit('change', [...controlPoints.value])
}

// 鼠标释放事件
const handleMouseUp = () => {
  if (isDragging.value) {
    console.log('结束拖动');
  }
  isDragging.value = false;
  activePointIndex.value = null;
}

// 添加控制点
const addControlPoint = () => {
  if (controlPoints.value.length >= 8) return; // 限制最大控制点数量
  
  // 寻找当前两点之间最大间隔
  let maxGap = 0;
  let insertIndex = 1;
  
  for (let i = 0; i < controlPoints.value.length - 1; i++) {
    const gap = controlPoints.value[i+1].x - controlPoints.value[i].x;
    if (gap > maxGap) {
      maxGap = gap;
      insertIndex = i + 1;
    }
  }
  
  // 在最大间隔处插入新控制点
  const x1 = controlPoints.value[insertIndex-1].x;
  const x2 = controlPoints.value[insertIndex].x;
  const y1 = controlPoints.value[insertIndex-1].y;
  const y2 = controlPoints.value[insertIndex].y;
  
  // 新点位于两点中间位置，y值为线性插值
  const newX = (x1 + x2) / 2;
  const newY = (y1 + y2) / 2;
  
  // 插入新点
  controlPoints.value.splice(insertIndex, 0, { x: newX, y: newY });
  
  // 重绘图表
  initChart();
  
  // 触发变更事件
  emit('change', [...controlPoints.value]);
}

// 删除控制点
const removeControlPoint = () => {
  // 不删除第一个和最后一个点
  if (controlPoints.value.length <= 3) return;
  
  // 删除中间的一个点（倒数第二个，通常是用户自定义添加的点）
  controlPoints.value.splice(controlPoints.value.length - 2, 1);
  
  // 重绘图表
  initChart();
  
  // 触发变更事件
  emit('change', [...controlPoints.value]);
}

// 重置曲线到默认状态
const resetCurve = () => {
  controlPoints.value = [
    { x: 0, y: 1 },
    { x: 0.33, y: 1 },
    { x: 0.67, y: 1 },
    { x: 1, y: 1 }
  ];
  
  // 重绘图表
  initChart();
  
  // 触发变更事件
  emit('change', [...controlPoints.value]);
}

// 为了与TimeSeriesEditor兼容，提供resetToDefault方法作为resetCurve的别名
const resetToDefault = resetCurve;

const initChart = () => {
  if (!svgRef.value || !props.visible) return

  const svg = d3.select(svgRef.value)
  svg.selectAll('*').remove()

  const width = svgRef.value.clientWidth
  const height = svgRef.value.clientHeight
  const innerWidth = width - margin.left - margin.right
  const innerHeight = height - margin.top - margin.bottom

  const g = svg.append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`)

  const xScale = d3.scaleLinear()
    .domain([0, 1])
    .range([0, innerWidth])

  const yScale = d3.scaleLinear()
    .domain(yDomain)
    .range([innerHeight, 0])

  // 添加网格线
  g.append('g')
    .attr('class', 'grid')
    .selectAll('line.horizontal')
    .data(d3.range(0, 2.1, 0.5))
    .enter()
    .append('line')
    .attr('class', 'horizontal')
    .attr('x1', 0)
    .attr('x2', innerWidth)
    .attr('y1', d => yScale(d))
    .attr('y2', d => yScale(d))
    .attr('stroke', '#E5E7EB')
    .attr('stroke-width', 1)

  g.append('g')
    .attr('class', 'grid')
    .selectAll('line.vertical')
    .data(d3.range(0, 1.1, 0.2))
    .enter()
    .append('line')
    .attr('class', 'vertical')
    .attr('x1', d => xScale(d))
    .attr('x2', d => xScale(d))
    .attr('y1', 0)
    .attr('y2', innerHeight)
    .attr('stroke', '#E5E7EB')
    .attr('stroke-width', 1)

  // 添加说明文字
  g.append('text')
    .attr('x', innerWidth - 120)
    .attr('y', 15)
    .attr('text-anchor', 'start')
    .attr('font-size', 12)
    .attr('fill', '#9CA3AF')
    .text('200% = Double')

  g.append('text')
    .attr('x', innerWidth - 120)
    .attr('y', yScale(1) + 15)
    .attr('text-anchor', 'start')
    .attr('font-size', 12)
    .attr('fill', '#9CA3AF')
    .text('100% = Original')

  g.append('text')
    .attr('x', innerWidth - 120)
    .attr('y', innerHeight)
    .attr('text-anchor', 'start')
    .attr('font-size', 12)
    .attr('fill', '#9CA3AF')
    .text('0% = Zero')

  // 添加坐标轴
  g.append('g')
    .attr('class', 'x-axis')
    .attr('transform', `translate(0,${yScale(0)})`)
    .call(d3.axisBottom(xScale).ticks(5))

  g.append('g')
    .attr('class', 'y-axis')
    .call(d3.axisLeft(yScale).ticks(5))

  // 定义曲线生成器
  const line = d3.line()
    .x(d => xScale(d.x))
    .y(d => yScale(d.y))
    .curve(d3.curveCardinal) // 使用基数样条插值来创建平滑曲线

  // 使用更密集的插值点来绘制平滑曲线
  const smoothPoints = [];
  const numPoints = 100; // 插值点数量
  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    let y = 0;
    
    // 使用控制点进行插值
    for (let j = 0; j < controlPoints.value.length - 1; j++) {
      const p1 = controlPoints.value[j];
      const p2 = controlPoints.value[j + 1];
      
      if (t >= p1.x && t <= p2.x) {
        // 局部参数
        const localT = (t - p1.x) / (p2.x - p1.x);
        // 使用三次样条插值
        y = p1.y * (1 - localT) * (1 - localT) * (1 - localT) +
            3 * p1.y * localT * (1 - localT) * (1 - localT) +
            3 * p2.y * localT * localT * (1 - localT) +
            p2.y * localT * localT * localT;
        break;
      }
    }
    
    smoothPoints.push({x: t, y: y});
  }

  // 绘制曲线
  g.append('path')
    .datum(smoothPoints)
    .attr('class', 'curve')
    .attr('d', line)
    .attr('fill', 'none')
    .attr('stroke', THEME_COLOR)
    .attr('stroke-width', 3)
    .attr('stroke-linecap', 'round')

  // 绘制控制点容器
  const controlPointsGroup = g.append('g')
    .attr('class', 'control-points')

  // 添加可拖动的控制点
  controlPointsGroup.selectAll('circle.drag-area')
    .data(controlPoints.value)
    .enter()
    .append('circle')
    .attr('class', 'drag-area')
    .attr('cx', d => xScale(d.x))
    .attr('cy', d => yScale(d.y))
    .attr('r', 15)
    .attr('fill', 'transparent')
    .attr('cursor', 'grab')
    .on('mousedown', function(event, d) {
      // 获取当前元素的索引
      const index = controlPoints.value.findIndex(p => p.x === d.x && p.y === d.y);
      handleMouseDown(event, d, index);
    });

  // 绘制可见控制点
  controlPointsGroup.selectAll('circle.point')
    .data(controlPoints.value)
    .enter()
    .append('circle')
    .attr('class', 'point')
    .attr('cx', d => xScale(d.x))
    .attr('cy', d => yScale(d.y))
    .attr('r', 6)
    .attr('fill', THEME_COLOR)
    .attr('stroke', '#FFFFFF')
    .attr('stroke-width', 2);
    
  // 添加控制点数量按钮组
  const buttonGroup = g.append('g')
    .attr('class', 'control-buttons')
    .attr('transform', `translate(${innerWidth - 50}, 10)`)
  
  // 添加加号按钮
  buttonGroup.append('circle')
    .attr('cx', 12)
    .attr('cy', 12)
    .attr('r', 12)
    .attr('fill', THEME_COLOR)
    .attr('cursor', 'pointer')
    .on('click', addControlPoint)
  
  buttonGroup.append('text')
    .attr('x', 12)
    .attr('y', 16)
    .attr('text-anchor', 'middle')
    .attr('fill', 'white')
    .attr('font-size', '16px')
    .attr('font-weight', 'bold')
    .attr('pointer-events', 'none')
    .text('+')
  
  // 添加减号按钮
  buttonGroup.append('circle')
    .attr('cx', 40)
    .attr('cy', 12)
    .attr('r', 12)
    .attr('fill', THEME_COLOR)
    .attr('cursor', 'pointer')
    .on('click', removeControlPoint)
  
  buttonGroup.append('text')
    .attr('x', 40)
    .attr('y', 16)
    .attr('text-anchor', 'middle')
    .attr('fill', 'white')
    .attr('font-size', '16px')
    .attr('font-weight', 'bold')
    .attr('pointer-events', 'none')
    .text('-')
}

// 修改applyPreset函数，移除与TimeSeriesEditor重复的预设
const applyPreset = (preset) => {
  switch (preset) {
    case 'double':
      controlPoints.value = [
        { x: 0, y: 2 },
        { x: 0.33, y: 2 },
        { x: 0.67, y: 2 },
        { x: 1, y: 2 }
      ]
      break
    case 'half':
      controlPoints.value = [
        { x: 0, y: 0.5 },
        { x: 0.33, y: 0.5 },
        { x: 0.67, y: 0.5 },
        { x: 1, y: 0.5 }
      ]
      break
    case 'ease-in':
      controlPoints.value = [
        { x: 0, y: 0.2 },
        { x: 0.25, y: 0.4 },
        { x: 0.75, y: 1.6 },
        { x: 1, y: 2 }
      ]
      break
    case 'ease-out':
      controlPoints.value = [
        { x: 0, y: 2 },
        { x: 0.25, y: 1.6 },
        { x: 0.75, y: 0.4 },
        { x: 1, y: 0.2 }
      ]
      break
    case 'ease-in-out':
      controlPoints.value = [
        { x: 0, y: 0.2 },
        { x: 0.25, y: 0.4 },
        { x: 0.75, y: 1.6 },
        { x: 1, y: 1.8 }
      ]
      break
    case 's-curve':
      controlPoints.value = [
        { x: 0, y: 0.2 },
        { x: 0.25, y: 1.8 },
        { x: 0.75, y: 0.2 },
        { x: 1, y: 1.8 }
      ]
      break
    case 'step':
      controlPoints.value = [
        { x: 0, y: 0.5 },
        { x: 0.499, y: 0.5 },
        { x: 0.501, y: 1.5 },
        { x: 1, y: 1.5 }
      ]
      break
    default:
      resetCurve();
      return;
  }
  
  initChart()
  emit('change', [...controlPoints.value])
}

// 确保在组件卸载时清理事件监听器
onMounted(() => {
  if (props.visible) {
    initChart();
  }
  
  window.addEventListener('resize', initChart);
  window.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('mouseup', handleMouseUp);
});

onUnmounted(() => {
  window.removeEventListener('resize', initChart);
  window.removeEventListener('mousemove', handleMouseMove);
  window.removeEventListener('mouseup', handleMouseUp);
});

// 添加监听visible属性的变化
watch(() => props.visible, (newVisible) => {
  if (newVisible) {
    initChart();
  }
});

defineExpose({
  applyPreset,
  resetCurve,
  resetToDefault // 提供兼容方法
})
</script>

<template>
  <div class="curve-editor h-full flex flex-col">
    <!-- 图表区域 -->
    <div class="flex-1 overflow-hidden relative">
      <svg ref="svgRef" class="w-full h-full"></svg>
    </div>
  </div>
</template>

<style scoped>
.curve-editor {
  position: relative;
}

:deep(.x-axis path),
:deep(.y-axis path) {
  stroke: #E5E7EB;
}

:deep(.x-axis line),
:deep(.y-axis line) {
  stroke: #E5E7EB;
}

:deep(.control-points .point) {
  transition: r 0.1s ease, stroke-width 0.1s ease;
}

:deep(.control-buttons) {
  cursor: pointer;
}

:deep(.control-buttons circle:hover) {
  filter: brightness(1.1);
}

:deep(.curve) {
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.1));
}
</style>