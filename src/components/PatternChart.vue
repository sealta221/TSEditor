<script setup>
import { ref, onMounted, watch, nextTick } from 'vue'
import * as d3 from 'd3'

const props = defineProps({
  pattern: Object,
  height: {
    type: Number,
    default: 90
  },
  width: {
    type: Number,
    default: 0 // 0表示自适应容器宽度
  }
})

const chartRef = ref(null)
const svg = ref(null)

// 归一化数据，使曲线填满整个图表
const normalizeData = (data) => {
  if (!data || data.length < 2) return [];
  
  // 找出时间和值的范围
  const timeExtent = d3.extent(data, d => d.time);
  const valueExtent = d3.extent(data, d => d.value);
  
  // 创建归一化函数
  const timeScale = d3.scaleLinear()
    .domain(timeExtent)
    .range([0, 1]);
    
  const valueScale = d3.scaleLinear()
    .domain(valueExtent)
    .range([0, 1]);
  
  // 返回归一化后的数据
  return data.map(d => ({
    time: timeScale(d.time),
    value: valueScale(d.value)
  }));
}

const initChart = () => {
  if (!chartRef.value || !props.pattern || !props.pattern.data) return;
  
  // 清除现有图表
  d3.select(chartRef.value).selectAll("*").remove();
  
  // 获取容器尺寸
  const containerWidth = props.width || chartRef.value.clientWidth;
  const containerHeight = props.height;
  
  // 设置边距
  const margin = { top: 5, right: 5, bottom: 5, left: 5 };
  const width = containerWidth - margin.left - margin.right;
  const height = containerHeight - margin.top - margin.bottom;
  
  // 归一化数据
  const normalizedData = normalizeData(props.pattern.data);
  
  // 创建SVG
  svg.value = d3.select(chartRef.value)
    .append("svg")
    .attr("width", containerWidth)
    .attr("height", containerHeight)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);
  
  // 创建比例尺
  const x = d3.scaleLinear()
    .domain([0, 1])
    .range([0, width]);
    
  const y = d3.scaleLinear()
    .domain([0, 1])
    .range([height, 0]);
  
  // 创建线条生成器
  const line = d3.line()
    .x(d => x(d.time))
    .y(d => y(d.value))
    .curve(d3.curveBasis); // 使用更平滑的曲线
  
  // 绘制线条
  svg.value.append("path")
    .datum(normalizedData)
    .attr("fill", "none")
    .attr("stroke", props.pattern.color || "#6548C7")
    .attr("stroke-width", 2)
    .attr("d", line);
  
  // 添加面积填充
  const area = d3.area()
    .x(d => x(d.time))
    .y0(height)
    .y1(d => y(d.value))
    .curve(d3.curveBasis); // 保持与线条相同的曲线类型
    
  svg.value.append("path")
    .datum(normalizedData)
    .attr("fill", props.pattern.color || "#6548C7")
    .attr("fill-opacity", 0.2) // 稍微增加不透明度
    .attr("d", area);
}

// 监听模式变化，重绘图表
watch(() => props.pattern, () => {
  nextTick(() => initChart());
}, { deep: true });

// 组件挂载时绘制图表
onMounted(() => {
  initChart();
  
  // 添加窗口大小变化监听
  const resizeObserver = new ResizeObserver(() => {
    initChart();
  });
  
  if (chartRef.value) {
    resizeObserver.observe(chartRef.value);
  }
  
  // 组件卸载时清理
  return () => {
    if (chartRef.value) {
      resizeObserver.unobserve(chartRef.value);
    }
  };
});
</script>

<template>
  <div ref="chartRef" class="w-full h-full"></div>
</template>

<style scoped>
/* 确保容器正确显示 */
div {
  overflow: hidden;
}
</style> 