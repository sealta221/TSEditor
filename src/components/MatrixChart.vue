<template>
  <div ref="container" class="w-full h-full relative">
    <!-- 固定在顶部的概览区域 -->
    <div class="w-full h-[200px] border-gray-300">
      <div ref="overviewChart" class="w-full h-full"></div>
    </div>
    
    <!-- 可滚动的用户数据区域 -->
    <div class="absolute top-[200px] bottom-0 left-0 right-0">
      <el-scrollbar class="h-full">
        <div ref="chartContainer" class="w-full" :style="{ height: `${allUserData.length * userStripHeight}px`, minWidth: '100%' }">
          <div ref="lineChart" class="w-full h-full"></div>
        </div>
      </el-scrollbar>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick, provide } from 'vue';
import * as d3 from 'd3';
import { pointer } from 'd3-selection';
import { reqDataDay, reqDataOriginal, reqDataAllUserWeek, reqDataDayMultiple, reqDataOriginalMultiple, reqDataMix } from '@/api';
import { useDatasetStore } from '../stores/datasetStore';
import { ElMessage } from 'element-plus';
import { MATRIX_CHART, THEME_COLOR, THEME_COLOR_LIGHT } from '@/utils/constants';

d3.pointer = pointer; // 兼容性补丁

const container = ref(null);
const overviewChart = ref(null);
const chartContainer = ref(null);
const lineChart = ref(null);
const allUserData = ref([]);
const allUserDataByWeek = ref([]);
const originalData = ref([]);
const datasetStore = useDatasetStore();

// 修改用户条带高度的定义
const userStripHeight = MATRIX_CHART.USER_STRIP_HEIGHT;

// 恢复loading状态管理
const isLoading = ref(false);

// 将loading状态提供给父组件
provide('matrixLoading', isLoading);

// 监控loading状态变化并发送事件
watch(isLoading, (newValue) => {
  // 发送自定义事件，App.vue可以监听此事件
  window.dispatchEvent(new CustomEvent('matrix-loading-changed', {
    detail: { loading: newValue }
  }));
});

// 创建概览图表 - 使用box plot展示所有用户和天数的数据分布
const createOverviewChart = (data, container) => {
  // 添加数据检查
  if (!data || !data.length) {
    console.warn('No original data received for overview');
    return;
  }

  // 清除已有的图表
  d3.select(container).selectAll('*').remove();

  const containerWidth = container.clientWidth;
  const containerHeight = container.clientHeight;
  
  // 创建 SVG
  const svg = d3.select(container)
    .append('svg')
    .attr('width', containerWidth)
    .attr('height', containerHeight);

  // 创建一个组用于显示临时的详细数据线图
  const detailGroup = svg.append('g')
    .attr('class', 'detail-view')
    .style('display', 'none');
  
  // 计算每30分钟一个box plot，一天共48个，加1是为了显示24h
  const boxPlotCount = 49; // 24小时 * 2 (每小时2个30分钟) + 1
  const boxWidth = (containerWidth - 50) / (boxPlotCount - 1);
  
  // 准备数据 - 按30分钟聚合
  const aggregatedData = [];
  
  // 初始化49个时间点的数组
  for (let i = 0; i < boxPlotCount; i++) {
    aggregatedData.push([]);
  }
  
  // 每天的分钟数
  const minutesPerDay = 1440;
  // 每个时间段的分钟数
  const minutesPerSlot = 30;
  // 每天的时间段数
  const slotsPerDay = minutesPerDay / minutesPerSlot; // 48
  
  // 创建一个对象来存储所有用户的聚合数据
  const userWeekdayData = {};
  
  // 遍历所有用户的数据
  data.forEach(user => {
    if (!user.data || !Array.isArray(user.data)) return;
    
    const userId = user.id || 'unknown';
    userWeekdayData[userId] = {
      0: Array(slotsPerDay).fill(null), // 周日
      1: Array(slotsPerDay).fill(null), // 周一
      2: Array(slotsPerDay).fill(null), // 周二
      3: Array(slotsPerDay).fill(null), // 周三
      4: Array(slotsPerDay).fill(null), // 周四
      5: Array(slotsPerDay).fill(null), // 周五
      6: Array(slotsPerDay).fill(null)  // 周六
    };
    
    // 假设数据是连续的31天，每天1440分钟
    const daysCount = Math.floor(user.data.length / minutesPerDay);
    
    // 创建一个对象来存储每个工作日的数据
    const weekdayData = {
      0: [], // 周日
      1: [], // 周一
      2: [], // 周二
      3: [], // 周三
      4: [], // 周四
      5: [], // 周五
      6: []  // 周六
    };
    // 对于每一天
    for (let day = 0; day < daysCount; day++) {
      // 获取这一天的日期
      const dayStartMinute = day * minutesPerDay;
      const dayDate = new Date(user.data[dayStartMinute].time);
      const weekday = dayDate.getDay(); // 0-6，0是周日
      
      // 对于每个30分钟时间段
      for (let slot = 0; slot < slotsPerDay; slot++) {
        // 计算这个时间段在这一天的起始和结束分钟索引
        const startMinute = day * minutesPerDay + slot * minutesPerSlot;
        const endMinute = startMinute + minutesPerSlot;
        
        // 收集这个时间段的所有有效数据点
        const slotValues = [];
        const slotAnnotations = new Set(); // 收集该时间段的所有 annotation
        
        for (let i = startMinute; i < endMinute && i < user.data.length; i++) {
          const point = user.data[i];
          if (point && typeof point.value === 'number') {
            slotValues.push(point.value);
            // 如果存在 annotation，添加到集合中
            if (point.annotation) {
              // 先对字符串进行处理，;拆分后再加入集合
              const annotations = point.annotation.split(';');
              annotations.forEach(anno => {
                slotAnnotations.add(anno);
              });
            }
          }
        }
        
        // 如果有有效数据，计算这个时间段的平均值
        if (slotValues.length > 0) {
          const avgValue = slotValues.reduce((sum, val) => sum + val, 0) / slotValues.length;
          // 将数据添加到对应工作日的数组中
          if (!weekdayData[weekday][slot]) {
            weekdayData[weekday][slot] = {
              values: [],
              annotations: new Set()
            };
          }
          weekdayData[weekday][slot].values.push(avgValue);
          // 合并 annotation
          slotAnnotations.forEach(anno => {
            weekdayData[weekday][slot].annotations.add(anno);
          });
        }
      }
    }
    
    // 计算每个工作日每个时间段的平均值
    for (let weekday = 0; weekday < 7; weekday++) {
      for (let slot = 0; slot < slotsPerDay; slot++) {
        const slotData = weekdayData[weekday][slot];
        if (slotData && slotData.values.length > 0) {
          const weekdayAvg = slotData.values.reduce((sum, val) => sum + val, 0) / slotData.values.length;
          // 保存到用户的周数据中
          userWeekdayData[userId][weekday][slot] = {
            value: weekdayAvg,
            annotations: Array.from(slotData.annotations)
          };
          // 添加到聚合数据中
          aggregatedData[slot].push({
            value: weekdayAvg,
            userId: userId,
            weekday: weekday,
            weekdayName: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][weekday],
            annotations: Array.from(slotData.annotations)
          });
        }
      }
    }
  });
  
  // 检查是否有数据
  const hasData = aggregatedData.some(slot => slot.length > 0);
  if (!hasData) {
    console.warn('No valid data points found for box plots');
    
    // 添加错误信息
    svg.append('text')
      .attr('x', containerWidth / 2)
      .attr('y', containerHeight / 2)
      .attr('text-anchor', 'middle')
      .attr('font-size', '14px')
      .attr('fill', 'red')
      .text('无法处理数据，请检查数据结构');
    
    return;
  }
  
  // 计算所有数据的值范围，用于Y轴比例尺
  const allValues = aggregatedData.flat().map(item => item.value);
  const minValue = d3.min(allValues) || 0;
  const maxValue = d3.max(allValues) || 1;
  
  // 获取所有唯一的用户ID
  const uniqueUserIds = [...new Set(aggregatedData.flat().map(item => item.userId))];
  
  // 创建颜色比例尺，为每个用户分配一个颜色
  const colorScale = d3.scaleOrdinal()
    .domain(uniqueUserIds)
    .range(d3.schemeCategory10);
  
  // 创建比例尺
  const xScale = d3.scaleLinear()
    .domain([0, boxPlotCount - 1])
    .range([40, containerWidth - 20]);
  
  const yScale = d3.scaleLinear()
    .domain([minValue, maxValue])
    .range([containerHeight - 40, 40]);
  
  // 计算每分钟对应的像素宽度
  const totalMinutes = 24 * 60;
  const pixelsPerMinute = (containerWidth - 60) / totalMinutes;  // 60 = 左右边距总和
  
  // 添加一个函数来计算偏移后的x坐标
  const getOffsetX = (index) => {
    const baseX = xScale(index);
    const offsetMinutes = 15;
    return baseX + (pixelsPerMinute * offsetMinutes);
  };
  
  // 添加X轴
  const xAxis = d3.axisBottom(xScale)
    .tickFormat(d => {
      const hour = Math.floor((d * 30) / 60);
      return `${hour.toString().padStart(2, '0')}:00`;
    })
    .tickValues(d3.range(0, boxPlotCount, 8)); // 每2小时显示一个刻度
  
  svg.append('g')
    .attr('transform', `translate(0, ${containerHeight - 40})`)  // 移除了 pixelsPerMinute * 15 的偏移
    .call(xAxis);
  
  // 添加Y轴
  const yAxis = d3.axisLeft(yScale)
    .ticks(5);
  
  svg.append('g')
    .attr('transform', 'translate(40, 0)')
    .call(yAxis);
  
  // 修改异常值点的处理部分
  // 首先收集所有异常点，按用户和工作日分组
  const outliersByUserAndWeekday = {};

  // 收集所有异常点
  aggregatedData.forEach((values, timeSlot) => {
    if (values.length === 0) return;
    
    // 排序数据用于计算四分位数
    const sorted = [...values].sort((a, b) => a.value - b.value);
    const q1 = d3.quantile(sorted.map(d => d.value), 0.25);
    const median = d3.quantile(sorted.map(d => d.value), 0.5);
    const q3 = d3.quantile(sorted.map(d => d.value), 0.75);
    const iqr = q3 - q1;
    const min = Math.max(q1 - 1.5 * iqr, d3.min(sorted.map(d => d.value)));
    const max = Math.min(q3 + 1.5 * iqr, d3.max(sorted.map(d => d.value)));
    
    // 找出异常点
    sorted.forEach(dataPoint => {
      if (dataPoint.value < min || dataPoint.value > max) {
        // 创建用户-工作日的键
        const key = `${dataPoint.userId}-${dataPoint.weekday}`;
        
        // 初始化该用户-工作日的数组（如果不存在）
        if (!outliersByUserAndWeekday[key]) {
          outliersByUserAndWeekday[key] = [];
        }
        
        // 添加异常点及其时间槽位置
        outliersByUserAndWeekday[key].push({
          ...dataPoint,
          timeSlot: timeSlot,
          x: getOffsetX(timeSlot),
          y: yScale(dataPoint.value)
        });
      }
    });
  });

  // 绘制每个时间点的box plot
  aggregatedData.forEach((values, i) => {
    if (values.length === 0) return;
    
    // 排序数据用于计算四分位数
    const sorted = [...values].sort((a, b) => a.value - b.value);
    const q1 = d3.quantile(sorted.map(d => d.value), 0.25);
    const median = d3.quantile(sorted.map(d => d.value), 0.5);
    const q3 = d3.quantile(sorted.map(d => d.value), 0.75);
    const iqr = q3 - q1;
    const min = Math.max(q1 - 1.5 * iqr, d3.min(sorted.map(d => d.value)));
    const max = Math.min(q3 + 1.5 * iqr, d3.max(sorted.map(d => d.value)));
    
    const x = getOffsetX(i);
    const boxGroup = svg.append('g')
      .attr('transform', `translate(${x}, 0)`);
    

    
    // 绘制box
    boxGroup.append('rect')
      .attr('x', -boxWidth * 0.3)
      .attr('y', yScale(q3))
      .attr('width', boxWidth * 0.6)
      .attr('height', yScale(q1) - yScale(q3))
      .attr('fill', MATRIX_CHART.COLORS.BOX_PLOT)
      .attr('stroke', THEME_COLOR);
    
      // 绘制中位线
    // boxGroup.append('line')
    //   .attr('x1', -boxWidth * 0.3)
    //   .attr('x2', boxWidth * 0.3)
    //   .attr('y1', yScale(median))
    //   .attr('y2', yScale(median))
    //   .attr('stroke', THEME_COLOR)
    //   .attr('stroke-width', 2);

    // 绘制上须线
    boxGroup.append('line')
      .attr('x1', 0)
      .attr('x2', 0)
      .attr('y1', yScale(q3))
      .attr('y2', yScale(max))
      .attr('stroke', THEME_COLOR);
    
    // 绘制下须线
    boxGroup.append('line')
      .attr('x1', 0)
      .attr('x2', 0)
      .attr('y1', yScale(q1))
      .attr('y2', yScale(min))
      .attr('stroke', THEME_COLOR);
    
    // 绘制上下横线
    boxGroup.append('line')
      .attr('x1', -boxWidth * 0.3)
      .attr('x2', boxWidth * 0.3)
      .attr('y1', yScale(max))
      .attr('y2', yScale(max))
      .attr('stroke', THEME_COLOR);
    
    boxGroup.append('line')
      .attr('x1', -boxWidth * 0.3)
      .attr('x2', boxWidth * 0.3)
      .attr('y1', yScale(min))
      .attr('y2', yScale(min))
      .attr('stroke', THEME_COLOR);
    
    // 绘制异常点
    sorted.forEach(dataPoint => {
      if (dataPoint.value < min || dataPoint.value > max) {
        // 根据工作日/周末筛选状态决定是否显示异常点
        const isWeekend = dataPoint.weekday === 0 || dataPoint.weekday === 6;
        if ((isWeekend && datasetStore.getShowWeekend) || (!isWeekend && datasetStore.getShowWeekday)) {
          const outlierGroup = boxGroup.append('g');
          
          // 添加异常值点，使用用户ID对应的颜色
          outlierGroup.append('circle')
            .attr('cx', 0)
            .attr('cy', yScale(dataPoint.value))
            .attr('r', 2)
            .attr('fill', colorScale(dataPoint.userId))
            .attr('class', `outlier-point user-${dataPoint.userId} weekday-${dataPoint.weekday}`)
            .attr('fill-opacity', () => {
              // 只对 capture 数据集进行检查
              if (datasetStore.getCurrentDataset === 'capture' && 
                  dataPoint.annotations && 
                  dataPoint.annotations.length === 1 && 
                  dataPoint.annotations[0] === 'nan') {
                return 0.2;
              }
              return 1;
            })
            .attr('data-tooltip-content', () => {
              let content = `
                <div class="tooltip-content">
                  <div class="tooltip-row">
                    <span class="label">User:</span>
                    <span class="value">${dataPoint.userId}</span>
                  </div>
                  <div class="tooltip-row">
                    <span class="label">Weekday:</span>
                    <span class="value">${dataPoint.weekdayName}</span>
                  </div>
                  <div class="tooltip-row">
                    <span class="label">Value:</span>
                    <span class="value">${dataPoint.value.toFixed(2)}</span>
                  </div>
                  ${dataPoint.annotations && dataPoint.annotations.length > 0 ? `
                    <div class="tooltip-row">
                      <span class="label">Annotations:</span>
                      <span class="value">${dataPoint.annotations.join(', ')}</span>
                    </div>
                  ` : ''}
                </div>
              `;
              return content;
            })
            .style('cursor', 'grab')
            .call(d3.drag()
              .on('start', function(event, d) {
                // 修改cursor样式为grabbing
                // d3.select(this).style('cursor', 'grabbing');
                document.body.style.cursor = 'grabbing';
                
                // 创建拖拽缩略图
                const dragImage = document.createElement('div');
                dragImage.className = 'drag-image';
                
                // 创建SVG元素
                const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                svg.setAttribute('width', '40');
                svg.setAttribute('height', '40');
                svg.setAttribute('viewBox', '0 0 40 40');
                
                // 创建圆形
                const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                circle.setAttribute('cx', '20');
                circle.setAttribute('cy', '20');
                circle.setAttribute('r', '8');
                circle.setAttribute('fill', colorScale(dataPoint.userId));
                
                // 添加动画效果
                circle.style.animation = 'pulse 1s infinite';
                
                svg.appendChild(circle);
                dragImage.appendChild(svg);
                
                document.body.appendChild(dragImage);

                // 设置初始位置
                const rect = this.getBoundingClientRect();
                dragImage.style.left = `${rect.left}px`;
                dragImage.style.top = `${rect.top}px`;

                // 存储拖拽缩略图引用
                this._dragImage = dragImage;

                const editView = document.querySelector('.edit-view');
                if (editView) {
                  // 手动触发 dragenter 事件
                  const dragEnterEvent = new DragEvent('dragenter', {
                    bubbles: true,
                    cancelable: true,
                    clientX: event.sourceEvent.clientX,
                    clientY: event.sourceEvent.clientY
                  });
                  editView.dispatchEvent(dragEnterEvent);
                }
              })
              .on('drag', function(event, d) {
                // 更新拖拽缩略图位置
                if (this._dragImage) {
                  this._dragImage.style.left = `${event.sourceEvent.clientX + 10}px`;
                  this._dragImage.style.top = `${event.sourceEvent.clientY + 10}px`;
                }

                const editView = document.querySelector('.edit-view');
                if (editView) {
                  const rect = editView.getBoundingClientRect();
                  const isOverEditView = 
                    event.sourceEvent.clientX >= rect.left && 
                    event.sourceEvent.clientX <= rect.right && 
                    event.sourceEvent.clientY >= rect.top && 
                    event.sourceEvent.clientY <= rect.bottom;

                  if (isOverEditView) {
                    // 手动触发 dragover 事件
                    const dragOverEvent = new DragEvent('dragover', {
                      bubbles: true,
                      cancelable: true,
                      clientX: event.sourceEvent.clientX,
                      clientY: event.sourceEvent.clientY
                    });
                    editView.dispatchEvent(dragOverEvent);
                  } else {
                    // 手动触发 dragleave 事件
                    const dragLeaveEvent = new DragEvent('dragleave', {
                      bubbles: true,
                      cancelable: true,
                      clientX: event.sourceEvent.clientX,
                      clientY: event.sourceEvent.clientY
                    });
                    editView.dispatchEvent(dragLeaveEvent);
                  }
                }
              })
              .on('end', function(event, d) {
                // 恢复cursor样式为grab
                // d3.select(this).style('cursor', 'grab');
                document.body.style.cursor = 'default';
                
                // 移除拖拽缩略图
                if (this._dragImage) {
                  this._dragImage.remove();
                  this._dragImage = null;
                }

                const editView = document.querySelector('.edit-view');
                
                // 创建并触发全局 dragend 事件
                const dragEndEvent = new DragEvent('dragend', {
                  bubbles: true,
                  cancelable: true,
                  clientX: event.sourceEvent.clientX,
                  clientY: event.sourceEvent.clientY
                });
                document.dispatchEvent(dragEndEvent);

                if (editView) {
                  const rect = editView.getBoundingClientRect();
                  const isOverEditView = 
                    event.sourceEvent.clientX >= rect.left && 
                    event.sourceEvent.clientX <= rect.right && 
                    event.sourceEvent.clientY >= rect.top && 
                    event.sourceEvent.clientY <= rect.bottom;

                  if (isOverEditView) {
                    // 将数据存储到全局变量
                    window.__draggedData = {
                      userId: dataPoint.userId,
                      weekday: dataPoint.weekday,
                      weekdayName: dataPoint.weekdayName
                    };
                    
                    // 手动触发 drop 事件
                    const dropEvent = new DragEvent('drop', {
                      bubbles: true,
                      cancelable: true,
                      clientX: event.sourceEvent.clientX,
                      clientY: event.sourceEvent.clientY
                    });
                    editView.dispatchEvent(dropEvent);
                  }
                }
              })
            )
            .on('mouseover', function() {
              // 放大异常点
              d3.select(this)
                .attr('r', 4)

              // 获取当前元素
              const circle = d3.select(this);
              
              // 创建或更新tooltip
              const tooltipContent = circle.attr('data-tooltip-content');
              const tooltip = document.createElement('div');
              tooltip.className = 'el-tooltip__popper is-dark';
              tooltip.innerHTML = tooltipContent;
              
              // 获取circle的位置
              const circleRect = this.getBoundingClientRect();
              
              // 设置tooltip位置
              tooltip.style.position = 'fixed';
              tooltip.style.left = `${circleRect.left + circleRect.width + 10}px`;
              tooltip.style.top = `${circleRect.top - 10}px`;
              
              // 存储tooltip引用
              this._tooltip = tooltip;
              
              // 添加延迟显示
              this._tooltipTimeout = setTimeout(() => {
                // 添加到body
                document.body.appendChild(tooltip);
              }, 300);

              // 清除之前的详细视图
              detailGroup.selectAll('*').remove();
              
              // 获取该用户该工作日的完整数据
              const userData = userWeekdayData[dataPoint.userId][dataPoint.weekday];
              
              // 创建折线图
              const detailLine = d3.line()
                .x((d, i) => getOffsetX(i))  // 使用 getOffsetX 来计算偏移后的位置
                .y(d => yScale(d.value))
                .defined(d => d !== null)
                .curve(d3.curveMonotoneX);
              
              // 绘制折线
              detailGroup.append('path')
                .datum(userData)
                .attr('class', 'detail-line')
                .attr('d', detailLine)
                .attr('fill', 'none')
                .attr('stroke', colorScale(dataPoint.userId))
                .attr('stroke-width', 2)
                .attr('stroke-opacity', 0.8);
              
              // 添加数据点和注释
              const points = detailGroup.selectAll('.detail-point-group')
                .data(userData)
                .enter()
                .filter(d => d !== null)
                .append('g')
                .attr('class', 'detail-point-group');

              points.append('circle')
                .attr('class', 'detail-point')
                .attr('cx', (d, i) => getOffsetX(i))  // 使用 getOffsetX 来计算偏移后的位置
                .attr('cy', d => yScale(d.value))
                .attr('r', 2)
                .attr('fill', colorScale(dataPoint.userId));
              
              // 显示详细视图
              detailGroup.style('display', null);
              
              // 滚动到对应用户视图并高亮数据
              scrollToUserAndHighlight(dataPoint.userId, dataPoint.weekday);
              // 更新 store 中的选中用户
              datasetStore.setSelectedUserId(dataPoint.userId);
              datasetStore.setSelectedView('matrix');
              
              // 高亮下方用户视图中的对应数据
              const userGroup = d3.select(lineChart.value).select(`.user-${dataPoint.userId}`);
              if (!userGroup.empty()) {
                // 清除之前的高亮背景（如果有）
                userGroup.selectAll('.highlight-background').remove();
                
                // 添加闪烁高亮背景
                const highlightBg = userGroup.append('rect')
                  .attr('class', 'highlight-background')
                  .attr('x', 0)
                  .attr('y', 0)
                  .attr('width', containerWidth)
                  .attr('height', userStripHeight)
                  .attr('fill', MATRIX_CHART.COLORS.HIGHLIGHT_BG)
                  .attr('opacity', MATRIX_CHART.OPACITY.HIGHLIGHT_BG);
                

                // 指定时间后移除高亮背景
                setTimeout(() => {
                  highlightBg.remove();
                }, MATRIX_CHART.ANIMATION.HIGHLIGHT_DURATION);

                // 高亮对应工作日的数据线
                const weekLines = userGroup.selectAll(`.week-line.day-${dataPoint.weekday}`);
                weekLines
                  .attr('stroke-width', MATRIX_CHART.LINE_STYLES.WEEK_LINE_HIGHLIGHT_WIDTH)
                  .attr('stroke-opacity', MATRIX_CHART.OPACITY.WEEK_LINE_NORMAL)
                  .attr('filter', 'drop-shadow(0 0 2px rgba(0,0,0,0.3))');
                

                // 高亮主数据线
                userGroup.select('.line')
                  .attr('stroke-width', MATRIX_CHART.LINE_STYLES.WEEK_LINE_HIGHLIGHT_WIDTH)
                  .attr('stroke-opacity', 1)
                  .attr('filter', 'drop-shadow(0 0 2px rgba(0,0,0,0.3))');

                // 其他工作日的数据线降低透明度
                userGroup.selectAll('.week-line')
                  .filter(function() {
                    return !this.classList.contains(`day-${dataPoint.weekday}`);
                  })
                  .attr('stroke-opacity', MATRIX_CHART.OPACITY.WEEK_LINE_DIMMED);
                  
                // 将用户组提升到最上层，确保高亮效果可见
                userGroup.raise();
              } else {
                console.warn('User group not found:', `.user-${dataPoint.userId}`);
              }
            })
            .on('mouseout', function() {
              // 恢复异常点大小
              d3.select(this)
                .attr('r', 2)
              
              // 清除延迟显示定时器
              if (this._tooltipTimeout) {
                clearTimeout(this._tooltipTimeout);
                this._tooltipTimeout = null;
              }
              
              // 移除tooltip
              if (this._tooltip) {
                this._tooltip.remove();
                this._tooltip = null;
              }
              
              // 隐藏详细视图
              detailGroup.style('display', 'none');
              
              // 恢复所有工作日数据线的样式
              const userGroup = d3.select(lineChart.value).select(`.user-${dataPoint.userId}`);
              if (!userGroup.empty()) {
                // 恢复周数据线样式
                userGroup.selectAll('.week-line')
                  .attr('stroke-width', MATRIX_CHART.LINE_STYLES.WEEK_LINE_WIDTH)
                  .attr('stroke-opacity', MATRIX_CHART.OPACITY.WEEK_LINE_NORMAL)
                  .attr('filter', null);
                
                // 恢复主数据线样式
                userGroup.select('.line')
                  .attr('stroke-width', MATRIX_CHART.LINE_STYLES.MAIN_LINE_WIDTH)
                  .attr('stroke-opacity', MATRIX_CHART.OPACITY.AVERAGE_LINE)
                  .attr('filter', null);
              }

              // 清除 store 中的选中用户
              datasetStore.setSelectedUserId(null);
              datasetStore.setSelectedView(null);
            });
          
          // // 修改鼠标悬停提示
          // outlierGroup.append('title')
          //   .text(d => {
          //     let text = `User: ${dataPoint.userId}\nWeekday: ${dataPoint.weekdayName}\nValue: ${dataPoint.value.toFixed(2)}`;
          //     if (dataPoint.annotations && dataPoint.annotations.length > 0) {
          //       text += `\nAnnotations: ${dataPoint.annotations.join(', ')}`;
          //     }
          //     return text;
          //   });
        }
      }
    });
  });

  // 为每个用户-工作日组合创建连接线
  Object.keys(outliersByUserAndWeekday).forEach(key => {
    const outliers = outliersByUserAndWeekday[key];
    
    // 按时间槽排序
    outliers.sort((a, b) => a.timeSlot - b.timeSlot);
    
    // 如果只有一个点，不需要连线
    if (outliers.length <= 1) return;
    
    // 提取用户ID和工作日
    const [userId, weekday] = key.split('-');
    
    // 根据工作日/周末筛选状态决定是否显示连接线
    const isWeekend = weekday === '0' || weekday === '6';
    if ((isWeekend && datasetStore.getShowWeekend) || (!isWeekend && datasetStore.getShowWeekday)) {
      // 将异常点分组为连续的序列
      const consecutiveGroups = [];
      let currentGroup = [outliers[0]];
      
      for (let i = 1; i < outliers.length; i++) {
        // 如果当前点与前一个点的时间槽相差为1，则认为是连续的
        if (outliers[i].timeSlot - outliers[i-1].timeSlot === 1) {
          currentGroup.push(outliers[i]);
        } else {
          // 否则开始一个新的组
          consecutiveGroups.push(currentGroup);
          currentGroup = [outliers[i]];
        }
      }
      
      // 添加最后一个组
      if (currentGroup.length > 0) {
        consecutiveGroups.push(currentGroup);
      }
      
      // 创建线生成器
      const outlierLine = d3.line()
        .x(d => d.x)
        .y(d => d.y)
        .curve(d3.curveMonotoneX);
      
      // 为每个连续组绘制连接线
      consecutiveGroups.forEach(group => {
        // 只有当组内有多个点时才绘制连线
        if (group.length > 1) {
          svg.append('path')
            .datum(group)
            .attr('class', `outlier-line user-${userId} weekday-${weekday}`)
            .attr('d', outlierLine)
            .attr('fill', 'none')
            .attr('stroke', colorScale(Number(userId))) // 使用与异常点相同的颜色
            .attr('stroke-width', 1)
            .attr('stroke-opacity', 0.5)
            .attr('stroke-dasharray', '2,2')
            .style('pointer-events', 'none'); // 避免线条干扰鼠标事件
        }
      });
    }
  });
};

// 显示用户某天的详细数据
const showUserDayDetail = (data, userId, day, detailGroup, width, height, aggregatedData) => {
  // 清除之前的线图
  detailGroup.selectAll('.detail-line, .detail-axis, .detail-point, .detail-outlier').remove();
  
  // 查找对应用户的数据
  const userData = data.find(user => user.id === userId || user.id === Number(userId));
  if (!userData || !userData.data) {
    detailGroup.append('text')
      .attr('class', 'detail-line')
      .attr('x', width / 2)
      .attr('y', height / 2)
      .attr('text-anchor', 'middle')
      .attr('fill', 'red')
      .text('The user data was not found');
    return;
  }
  
  // 提取该天的数据
  const minutesPerDay = 1440;
  const startIndex = day * minutesPerDay;
  const endIndex = (day + 1) * minutesPerDay;
  const dayData = userData.data.slice(startIndex, endIndex);
  
  if (dayData.length === 0) {
    return;
  }
  
  // 复用箱线图的X轴比例尺
  const xScale = d3.scaleLinear()
    .domain([0, 47]) // 48个时间点，索引从0到47
    .range([60, width - 20]);
  
  // 使用与箱线图相同的值范围
  const allValues = aggregatedData.flat().map(item => item.value);
  const minValue = d3.min(allValues) || 0;
  const maxValue = d3.max(allValues) || 1;
  
  const yScale = d3.scaleLinear()
    .domain([minValue, maxValue])
    .range([height - 40, 40]);
  
  // 将分钟数据聚合为30分钟间隔
  const dayAggregatedData = [];
  const minutesPerSlot = 30;
  const slotsPerDay = minutesPerDay / minutesPerSlot; // 48
  
  // 记录异常点所在的时间段和值
  const outlierSlot = Math.floor((startIndex % minutesPerDay) / minutesPerSlot);
  let outlierValue = null;
  
  for (let slot = 0; slot < slotsPerDay; slot++) {
    const startMinute = slot * minutesPerSlot;
    const endMinute = startMinute + minutesPerSlot;
    
    // 收集这个时间段的所有有效数据点
    const slotValues = [];
    for (let i = startMinute; i < endMinute && i < dayData.length; i++) {
      const point = dayData[i];
      if (point && typeof point.value === 'number') {
        slotValues.push(point.value);
      }
    }
    
    // 如果有有效数据，计算这个时间段的平均值
    if (slotValues.length > 0) {
      const avgValue = slotValues.reduce((sum, val) => sum + val, 0) / slotValues.length;
      dayAggregatedData.push({
        slot: slot,
        value: avgValue,
        rawValues: slotValues
      });
      
      // 如果是异常点所在的时间段，记录其值
      if (slot === outlierSlot) {
        outlierValue = avgValue;
      }
    } else {
      // 如果没有数据，添加一个null值，保持数组索引与时间段对应
      dayAggregatedData.push({
        slot: slot,
        value: null,
        rawValues: []
      });
    }
  }
  
  // 创建线生成器
  const line = d3.line()
    .x(d => xScale(d.slot))
    .y(d => yScale(d.value))
    .defined(d => d && d.value !== null)
    .curve(d3.curveMonotoneX);
  
  // 绘制线
  detailGroup.append('path')
    .attr('class', 'detail-line')
    .datum(dayAggregatedData)
    .attr('d', line)
    .attr('fill', 'none')
    .attr('stroke', '#2196F3')
    .attr('stroke-width', 4);
  
  // 添加点
  detailGroup.selectAll('.detail-point')
    .data(dayAggregatedData.filter(d => d && d.value !== null))
    .enter()
    .append('circle')
    .attr('class', 'detail-point')
    .attr('cx', d => xScale(d.slot))
    .attr('cy', d => yScale(d.value))
    .attr('r', 2)
    .attr('fill', '#2196F3');
  
  // 标记异常点所在的时间段
  const slotWithOutlier = Math.floor(day * minutesPerDay / minutesPerSlot);
  
  // 添加垂直参考线，标记异常点所在的时间段
  detailGroup.append('line')
    .attr('class', 'detail-line')
    .attr('x1', xScale(slotWithOutlier % 48))
    .attr('x2', xScale(slotWithOutlier % 48))
    .attr('y1', 40)
    .attr('y2', height - 40)
    .attr('stroke', 'red')
    .attr('stroke-width', 1)
    .attr('stroke-dasharray', '5,5');
};

// 创建折线图表
const createLineChart = (data, container, allUserDataByWeek) => {
  if (!data || !data.length) {
    console.warn('No data received');
    return;
  }

  // 检查数据结构
  if (!data[0] || !data[0].res || !Array.isArray(data[0].res) || !data[0].res.length) {
    console.warn('Invalid data structure', data);
    return;
  }
  
  // 清除已有的图表
  d3.select(container).selectAll('*').remove();

  const containerWidth = container.clientWidth;
  const totalHeight = data.length * userStripHeight;
  
  // 创建 SVG
  const svg = d3.select(container)
    .append('svg')
    .attr('width', containerWidth)
    .attr('height', totalHeight);

  // 计算所有数据的时间范围
  const timeRange = [0, data[0].res.length - 1]; // 修改为包含最后一个点
  // 计算所有用户的平均值
  const timePointCount = data[0].res.length;
  const avgValues = Array(timePointCount).fill(0);
  
  // 第一步：累加所有用户的值
  data.forEach(user => {
    if (user && user.res && Array.isArray(user.res)) {
      user.res.forEach((point, i) => {
        if (i < timePointCount && point && typeof point.value === 'number') {
          avgValues[i] += point.value;
        }
      });
    }
  });
  
  // 第二步：除以用户数量得到平均值
  const userCount = data.length;
  const avgData = avgValues.map((sum, i) => ({
    value: sum / userCount
  }));
  
  // 计算所有数据的全局值范围（包括主数据线和周数据线）
  let allValues = data.flatMap(user => user.res.map(point => point.value));
  
  // 添加周数据的值到全局值范围计算中
  if (allUserDataByWeek) {
    const weekValues = allUserDataByWeek.flatMap(user => 
      user.weekly_data.flatMap(weekData => 
        weekData.res ? weekData.res.map(point => point.value) : []
      )
    );
    allValues = allValues.concat(weekValues);
  }
  
  const minValue = d3.min(allValues) || 0;
  const maxValue = d3.max(allValues) || 1;
  
  // 创建全局比例尺
  const xScale = d3.scaleLinear()
    .domain(timeRange)
    .range([40, containerWidth - 20]);

  const yScale = d3.scaleLinear()
    .domain([minValue, maxValue])
    .range([userStripHeight - 20, 20]);

  // 创建折线生成器 - 用户数据
  const line = d3.line()
    .x((d, i) => xScale(i))
    .y(d => yScale(d.value))
    .curve(d3.curveMonotoneX);

  // 为每个用户创建一个组
  data.forEach((user, userIndex) => {
    // 检查用户数据
    if (!user || !user.res || !Array.isArray(user.res) || !user.res.length) {
      console.warn(`Invalid data for user at index ${userIndex}`, user);
      return; // 跳过这个用户
    }

    const userGroup = svg.append('g')
      .attr('class', `user-${user.id || userIndex}`)
      .attr('transform', `translate(0, ${userIndex * userStripHeight})`);

    // 添加用户背景和边框
    userGroup.append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', containerWidth)
      .attr('height', userStripHeight)
      .attr('fill', 'white')
      .attr('stroke', '#e5e7eb')
      .attr('stroke-width', 1);

    // 添加X轴网格线
    const xTicks = 12; // 每两小时一条线
    for (let i = 0; i <= xTicks; i++) {
      const xPos = xScale(timeRange[1] * (i / xTicks));
      userGroup.append('line')
        .attr('x1', xPos)
        .attr('x2', xPos)
        .attr('y1', 10)
        .attr('y2', userStripHeight - 10)
        .attr('stroke', MATRIX_CHART.COLORS.GRID_LINE)
        .attr('stroke-width', MATRIX_CHART.LINE_STYLES.GRID_LINE_WIDTH)
        .attr('stroke-dasharray', MATRIX_CHART.GRID.DASH_ARRAY);
    }

    // 添加Y轴网格线
    const yTicks = 5;
    for (let i = 0; i <= yTicks; i++) {
      const yPos = yScale(minValue + (maxValue - minValue) * (i / yTicks));
      userGroup.append('line')
        .attr('x1', 40)
        .attr('x2', containerWidth - 20)
        .attr('y1', yPos)
        .attr('y2', yPos)
        .attr('stroke', MATRIX_CHART.COLORS.GRID_LINE)
        .attr('stroke-width', MATRIX_CHART.LINE_STYLES.GRID_LINE_WIDTH)
        .attr('stroke-dasharray', MATRIX_CHART.GRID.DASH_ARRAY);
    }

    // 创建折线生成器 - 平均数据
    const avgLine = d3.line()
      .x((d, i) => xScale(i))
      .y(d => yScale(d.value))
      .curve(d3.curveMonotoneX);

    // 先绘制平均线（在下层）
    userGroup.append('path')
      .datum(avgData)
      .attr('class', 'avg-line')
      .attr('d', avgLine)
      .attr('fill', 'none')
      .attr('stroke', MATRIX_CHART.COLORS.AVERAGE_LINE)
      .attr('stroke-width', MATRIX_CHART.LINE_STYLES.AVERAGE_LINE_WIDTH)
      .attr('stroke-dasharray', '5,3')
      .attr('stroke-opacity', MATRIX_CHART.OPACITY.AVERAGE_LINE);

    // 绘制用户数据线（在上层）
    const mainLine = userGroup.append('path')
      .datum(user.res)
      .attr('class', 'line')
      .attr('d', line)
      .attr('fill', 'none')
      .attr('stroke', MATRIX_CHART.COLORS.MAIN_LINE)
      .attr('stroke-width', MATRIX_CHART.LINE_STYLES.MAIN_LINE_WIDTH)
      .attr('stroke-dasharray', MATRIX_CHART.LINE_STYLES.DASH_ARRAY)
      .attr('stroke-opacity', MATRIX_CHART.OPACITY.AVERAGE_LINE);
    
    // 添加一个透明的宽线区域用于捕获鼠标事件
    userGroup.append('path')
      .datum(user.res)
      .attr('class', 'line-hover-area')
      .attr('d', line)
      .attr('fill', 'none')
      .attr('stroke', 'transparent')
      .attr('stroke-width', 20) // 更宽的区域便于鼠标交互
      .style('cursor', 'pointer')
      .on('mouseover', function() {
        // 高亮主数据线
        mainLine
          .attr('stroke-width', MATRIX_CHART.LINE_STYLES.WEEK_LINE_HIGHLIGHT_WIDTH)
          .attr('stroke-opacity', 1)
          .attr('filter', 'drop-shadow(0 0 2px rgba(0,0,0,0.3))');
        
        // 将当前用户组提升到顶层
        userGroup.raise();
      })
      .on('mouseout', function() {
        // 恢复主数据线样式
        mainLine
          .attr('stroke-width', MATRIX_CHART.LINE_STYLES.MAIN_LINE_WIDTH)
          .attr('stroke-opacity', MATRIX_CHART.OPACITY.AVERAGE_LINE)
          .attr('filter', null);
      });

    // 如果聚合级别是day，绘制每周数据
    if (datasetStore.aggregationLevel === 'day' && allUserDataByWeek) {
      const userWeeklyData = allUserDataByWeek.find(u => u.id === user.id);
      if (userWeeklyData && userWeeklyData.weekly_data) {
        userWeeklyData.weekly_data.forEach((weekData, dayIndex) => {
          if (weekData && weekData.res && Array.isArray(weekData.res) && weekData.res.length > 0) {
            // 根据工作日/周末筛选状态决定是否显示该天的数据
            const isWeekend = MATRIX_CHART.WEEKDAYS.WEEKEND_INDICES.includes(weekData.weekday);
            if ((isWeekend && datasetStore.getShowWeekend) || (!isWeekend && datasetStore.getShowWeekday)) {
              // 创建时间比例尺，确保不同采样频率的数据能够在时间上对齐
              const weekDataLength = weekData.res.length;
              const weekDataPoints = weekData.res.map((d, i) => ({
                value: d.value,
                timePosition: timeRange[1] * (i / (weekDataLength - 1))
              }));
              
              // 使用时间位置而不是索引来绘制线条
              const weekLine = d3.line()
                .x(d => xScale(d.timePosition))
                .y(d => yScale(d.value))
                .curve(d3.curveMonotoneX);
              
              // 判断是工作日还是周末
              const lineColor = isWeekend ? 
                MATRIX_CHART.COLORS.WEEKEND_LINE : 
                MATRIX_CHART.COLORS.WEEKDAY_LINE;
              

              // weekData.res[0].value如果为null，就返回
              if (weekData.res[0].value == null) {
                return;
              }
              // 绘制周数据线
              const weekPath = userGroup.append('path')
                .datum(weekDataPoints)
                .attr('class', `week-line day-${weekData.weekday == 6 ? 0 : weekData.weekday + 1}`)
                .attr('d', weekLine)
                .attr('fill', 'none')
                .attr('stroke', lineColor)
                .attr('stroke-width', MATRIX_CHART.LINE_STYLES.WEEK_LINE_WIDTH)
                .attr('stroke-opacity', MATRIX_CHART.OPACITY.WEEK_LINE_NORMAL);
              
              // 添加周数据线的hover效果
              userGroup.append('path')
                .datum(weekDataPoints)
                .attr('class', `week-line-hover-area day-${weekData.weekday == 6 ? 0 : weekData.weekday + 1}`)
                .attr('d', weekLine)
                .attr('fill', 'none')
                .attr('stroke', 'transparent')
                .attr('stroke-width', 20) // 更宽的区域便于鼠标交互
                .style('cursor', 'grab')
                .attr('data-tooltip-content', () => {
                  // 获取周几名称
                  const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                  const weekdayName = weekdayNames[weekData.weekday == 6 ? 0 : weekData.weekday + 1];
                  
                  let content = `
                    <div class="tooltip-content">
                      <div class="tooltip-row">
                        <span class="label">User:</span>
                        <span class="value">${user.id}</span>
                      </div>
                      <div class="tooltip-row">
                        <span class="label">Weekday:</span>
                        <span class="value">${weekdayName}</span>
                      </div>
                    </div>
                  `;
                  return content;
                })
                .on('mouseover', function() {
                  // 高亮当前周数据线
                  weekPath
                    .attr('stroke-width', MATRIX_CHART.LINE_STYLES.WEEK_LINE_HIGHLIGHT_WIDTH)
                    .attr('stroke-opacity', 1)
                    .attr('filter', 'drop-shadow(0 0 2px rgba(0,0,0,0.3))');
                  
                  // 其他周数据线降低透明度
                  userGroup.selectAll('.week-line')
                    .filter(function() {
                      return this !== weekPath.node();
                    })
                    .attr('stroke-opacity', MATRIX_CHART.OPACITY.WEEK_LINE_DIMMED);
                  
                  // 将当前用户组提升到顶层
                  userGroup.raise();
                  
                  // 创建或更新tooltip
                  const path = d3.select(this);
                  const tooltipContent = path.attr('data-tooltip-content');
                  const tooltip = document.createElement('div');
                  tooltip.className = 'el-tooltip__popper is-dark';
                  tooltip.innerHTML = tooltipContent;
                  
                  // 获取鼠标位置
                  const mouseEvent = d3.event || window.event;
                  const mouseX = mouseEvent ? mouseEvent.clientX : d3.mouse(document.body)[0];
                  const mouseY = mouseEvent ? mouseEvent.clientY : d3.mouse(document.body)[1];
                  
                  // 设置tooltip位置
                  tooltip.style.position = 'fixed';
                  tooltip.style.left = `${mouseX + 10}px`;
                  tooltip.style.top = `${mouseY - 10}px`;
                  
                  // 存储tooltip引用
                  this._tooltip = tooltip;
                  
                  // 添加延迟显示
                  this._tooltipTimeout = setTimeout(() => {
                    // 添加到body
                    document.body.appendChild(tooltip);
                  }, 300);
                })
                .on('mousemove', function() {
                  // 更新tooltip位置随鼠标移动
                  if (this._tooltip) {
                    const mouseEvent = d3.event || window.event;
                    const mouseX = mouseEvent ? mouseEvent.clientX : d3.mouse(document.body)[0];
                    const mouseY = mouseEvent ? mouseEvent.clientY : d3.mouse(document.body)[1];
                    
                    this._tooltip.style.left = `${mouseX + 10}px`;
                    this._tooltip.style.top = `${mouseY - 10}px`;
                  }
                })
                .on('mouseout', function() {
                  // 恢复所有周数据线样式
                  userGroup.selectAll('.week-line')
                    .attr('stroke-width', MATRIX_CHART.LINE_STYLES.WEEK_LINE_WIDTH)
                    .attr('stroke-opacity', MATRIX_CHART.OPACITY.WEEK_LINE_NORMAL)
                    .attr('filter', null);
                  
                  // 清除延迟显示定时器
                  if (this._tooltipTimeout) {
                    clearTimeout(this._tooltipTimeout);
                    this._tooltipTimeout = null;
                  }
                  
                  // 移除tooltip
                  if (this._tooltip) {
                    this._tooltip.remove();
                    this._tooltip = null;
                  }
                })
                .call(d3.drag()
                  .on('start', function(event, d) {
                    // 修改cursor样式为grabbing
                    // d3.select(this).style('cursor', 'grabbing');
                    document.body.style.cursor = 'grabbing';
                    
                    // 创建拖拽缩略图
                    const dragImage = document.createElement('div');
                    dragImage.className = 'drag-image';
                    
                    // 创建SVG元素
                    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                    svg.setAttribute('width', '120');
                    svg.setAttribute('height', '40');
                    svg.setAttribute('viewBox', '0 0 120 40');
                    
                    // 创建路径
                    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                    
                    // 计算缩略图的比例尺
                    const xScale = d3.scaleLinear()
                      .domain([0, d.length - 1])
                      .range([10, 110]);
                    
                    const yScale = d3.scaleLinear()
                      .domain([d3.min(d, p => p.value), d3.max(d, p => p.value)])
                      .range([30, 10]);
                    
                    // 创建线生成器
                    const line = d3.line()
                      .x((d, i) => xScale(i))
                      .y(d => yScale(d.value))
                      .curve(d3.curveMonotoneX);
                    
                    // 设置路径数据
                    path.setAttribute('d', line(d));
                    path.setAttribute('fill', 'none');
                    path.setAttribute('stroke', isWeekend ? 
                      MATRIX_CHART.COLORS.WEEKEND_LINE : 
                      MATRIX_CHART.COLORS.WEEKDAY_LINE);
                    path.setAttribute('stroke-width', '2');
                    

                    
                    svg.appendChild(path);
                    dragImage.appendChild(svg);
                    
                    document.body.appendChild(dragImage);

                      // 设置初始位置为鼠标的当前位置
                    dragImage.style.position = 'absolute'; // 确保使用绝对定位
                    dragImage.style.left = `${event.sourceEvent.clientX + 10}px`;
                    dragImage.style.top = `${event.sourceEvent.clientY + 10}px`;

                    // 存储拖拽缩略图引用
                    this._dragImage = dragImage;

                    const editView = document.querySelector('.edit-view');
                    if (editView) {
                      // 手动触发 dragenter 事件
                      const dragEnterEvent = new DragEvent('dragenter', {
                        bubbles: true,
                        cancelable: true,
                        clientX: event.sourceEvent.clientX,
                        clientY: event.sourceEvent.clientY
                      });
                      editView.dispatchEvent(dragEnterEvent);
                    }
                  })
                  .on('drag', function(event, d) {
                    // 更新拖拽缩略图位置
                    if (this._dragImage) {
                      this._dragImage.style.left = `${event.sourceEvent.clientX + 10}px`;
                      this._dragImage.style.top = `${event.sourceEvent.clientY + 10}px`;
                    }

                    const editView = document.querySelector('.edit-view');
                    if (editView) {
                      const rect = editView.getBoundingClientRect();
                      const isOverEditView = 
                        event.sourceEvent.clientX >= rect.left && 
                        event.sourceEvent.clientX <= rect.right && 
                        event.sourceEvent.clientY >= rect.top && 
                        event.sourceEvent.clientY <= rect.bottom;

                      if (isOverEditView) {
                        // 手动触发 dragover 事件
                        const dragOverEvent = new DragEvent('dragover', {
                          bubbles: true,
                          cancelable: true,
                          clientX: event.sourceEvent.clientX,
                          clientY: event.sourceEvent.clientY
                        });
                        editView.dispatchEvent(dragOverEvent);
                      } else {
                        // 手动触发 dragleave 事件
                        const dragLeaveEvent = new DragEvent('dragleave', {
                          bubbles: true,
                          cancelable: true,
                          clientX: event.sourceEvent.clientX,
                          clientY: event.sourceEvent.clientY
                        });
                        editView.dispatchEvent(dragLeaveEvent);
                      }
                    }
                  })
                  .on('end', function(event, d) {
                    // 恢复cursor样式为grab
                    // d3.select(this).style('cursor', 'grab');
                    document.body.style.cursor = 'default';
                    
                    // 移除拖拽缩略图
                    if (this._dragImage) {
                      this._dragImage.remove();
                      this._dragImage = null;
                    }

                    const editView = document.querySelector('.edit-view');
                    
                    // 创建并触发全局 dragend 事件
                    const dragEndEvent = new DragEvent('dragend', {
                      bubbles: true,
                      cancelable: true,
                      clientX: event.sourceEvent.clientX,
                      clientY: event.sourceEvent.clientY
                    });
                    document.dispatchEvent(dragEndEvent);

                    if (editView) {
                      const rect = editView.getBoundingClientRect();
                      const isOverEditView = 
                        event.sourceEvent.clientX >= rect.left && 
                        event.sourceEvent.clientX <= rect.right && 
                        event.sourceEvent.clientY >= rect.top && 
                        event.sourceEvent.clientY <= rect.bottom;

                      if (isOverEditView) {
                        // 将数据存储到全局变量
                        window.__draggedData = {
                          // type: 'anomaly',
                          userId: user.id,
                          weekday: weekData.weekday == 6 ? 0 : weekData.weekday + 1
                        };
                        
                        // 手动触发 drop 事件
                        const dropEvent = new DragEvent('drop', {
                          bubbles: true,
                          cancelable: true,
                          clientX: event.sourceEvent.clientX,
                          clientY: event.sourceEvent.clientY
                        });
                        editView.dispatchEvent(dropEvent);
                      }
                    }
                  })
                );
            }
          }
        });
      }
    }

    // 添加用户标签
    userGroup.append('text')
      .attr('x', 35)  // 调整到左边界和图表左边界(30px)的中间位置
      .attr('y', userStripHeight / 2 + 5)
      .attr('dy', '0.35em')
      .text(`User ${user.id}`)
      .attr('font-size', MATRIX_CHART.FONTS.USER_LABEL_SIZE)
      .attr('font-weight', MATRIX_CHART.FONTS.USER_LABEL_WEIGHT)
      .attr('fill', MATRIX_CHART.COLORS.USER_LABEL)
      .attr('transform', `rotate(-90, 15, ${userStripHeight / 2})`)  // 旋转中心点也相应调整
      .attr('text-anchor', 'end');

    // // 添加时间刻度
    // for (let i = 0; i <= 24; i += 4) {  // 保持4小时的间隔
    //   const hourIndex = Math.floor(timeRange[1] * (i / 24));
    //   userGroup.append('text')
    //     .attr('x', xScale(hourIndex) + 3)
    //     .attr('y', userStripHeight - 5)
    //     .attr('text-anchor', 'middle')
    //     .text(`${i.toString().padStart(2, '0')}:00`)
    //     .attr('font-size', MATRIX_CHART.FONTS.TIME_LABEL_SIZE)
    //     .attr('fill', MATRIX_CHART.COLORS.TIME_LABEL);
    // }
  });
};

// 添加工具函数：将原始数据按工作日聚合，采用10分钟采样
const aggregateDataByWeekday = (originalData) => {
  if (!originalData || !Array.isArray(originalData)) return [];

  // 常量定义
  const SAMPLE_INTERVAL = 10; // 10分钟一个采样点
  const SAMPLES_PER_DAY = 24 * 60 / SAMPLE_INTERVAL; // 一天144个采样点

  return originalData.map(user => {
    if (!user.data || !Array.isArray(user.data)) return null;

    // 初始化每个工作日的数据结构
    const weekdayData = new Array(7).fill(null).map(() => {
      return Array(SAMPLES_PER_DAY).fill(null).map(() => ({
        values: [],
        times: []
      }));
    });

    // 遍历用户的每个数据点
    user.data.forEach(point => {
      if (!point.time || point.value === undefined) return;

      // 解析时间
      const date = new Date(point.time);
      const weekday = date.getDay() === 0 ? 6 : date.getDay() - 1; // 0-6，0是周日
      const hours = date.getHours();
      const minutes = date.getMinutes();

      // 计算当前时间点属于哪个10分钟采样区间
      const sampleIndex = Math.floor((hours * 60 + minutes) / SAMPLE_INTERVAL);
      
      if (sampleIndex < SAMPLES_PER_DAY) {
        weekdayData[weekday][sampleIndex].values.push(point.value);
        weekdayData[weekday][sampleIndex].times.push(point.time);
      }
    });

    // 构造最终的周数据格式
    const weekly_data = weekdayData.map((dayData, weekday) => {
      // 生成所有时间点的数据，包括没有值的时间点
      const res = dayData.map((sample, index) => {
        const hours = Math.floor((index * SAMPLE_INTERVAL) / 60);
        const minutes = (index * SAMPLE_INTERVAL) % 60;
        const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
        
        if (sample.values.length > 0) {
          const avgValue = sample.values.reduce((sum, val) => sum + val, 0) / sample.values.length;
          return {
            time: timeStr,
            value: avgValue
          };
        }
        
        // 对于没有数据的时间点，返回 null 值
        return {
          time: timeStr,
          value: null
        };
      });

      return {
        weekday,
        res
      };
    });

    return {
      id: user.id,
      weekly_data
    };
  }).filter(Boolean); // 过滤掉无效的用户数据
};

// 添加新的聚合函数来处理用户数据
const aggregateUserData = (originalData) => {
  if (!originalData || !Array.isArray(originalData)) return [];

  // 常量定义
  const SAMPLE_INTERVAL = 10; // 10分钟一个采样点
  const MINUTES_PER_DAY = 24 * 60;
  const SAMPLES_PER_DAY = MINUTES_PER_DAY / SAMPLE_INTERVAL; // 一天144个采样点

  return originalData.map(user => {
    if (!user.data || !Array.isArray(user.data)) return null;

    // 初始化采样点数组
    const sampledData = Array(SAMPLES_PER_DAY).fill(null).map(() => ({
      values: [],
      times: []
    }));

    // 遍历用户的每个数据点
    user.data.forEach(point => {
      if (!point.time || point.value === undefined) return;

      // 解析时间
      const date = new Date(point.time);
      const hours = date.getHours();
      const minutes = date.getMinutes();

      // 计算当前时间点属于哪个10分钟采样区间
      const sampleIndex = Math.floor((hours * 60 + minutes) / SAMPLE_INTERVAL);
      
      if (sampleIndex < SAMPLES_PER_DAY) {
        sampledData[sampleIndex].values.push(point.value);
        sampledData[sampleIndex].times.push(point.time);
      }
    });

    // 生成最终的聚合数据
    const res = sampledData.map((sample, index) => {
      const hours = Math.floor((index * SAMPLE_INTERVAL) / 60);
      const minutes = (index * SAMPLE_INTERVAL) % 60;
      const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;

      if (sample.values.length > 0) {
        // 计算这个时间窗口内所有值的平均值
        const avgValue = sample.values.reduce((sum, val) => sum + val, 0) / sample.values.length;
        return {
          time: timeStr,
          value: avgValue
        };
      }

      // 对于没有数据的时间点，返回 null 值
      return {
        time: timeStr,
        value: null
      };
    });

    return {
      id: user.id,
      res
    };
  }).filter(Boolean); // 过滤掉无效的用户数据
};

// 获取数据
const fetchData = async () => {
  // 如果没有选择数据集，直接返回
  if (!datasetStore.getCurrentDataset) {
    // 清空现有数据
    allUserData.value = [];
    originalData.value = [];
    datasetStore.setOriginalData([]); // 清空 store 中的数据
    return;
  }

  try {
    // 设置loading状态
    isLoading.value = true;

    if (datasetStore.getCurrentDataset === 'capture') {
      const [dayRes, weeklyRes, originalRes] = await Promise.all([
        reqDataDayMultiple(datasetStore.getCurrentDataset, datasetStore.selectedVariable),
        null,
        reqDataOriginalMultiple(datasetStore.getCurrentDataset, datasetStore.selectedVariable)
      ]);
      // 更新数据
      allUserData.value = dayRes;
      // allUserDataByWeek.value = weeklyRes;
      originalData.value = originalRes;
      allUserData.value = aggregateUserData(originalRes);
      allUserDataByWeek.value = aggregateDataByWeekday(originalRes);
      datasetStore.setOriginalData(originalRes); // 存储到 store
    }
    else {
      const res = await reqDataOriginal(datasetStore.getCurrentDataset);
      originalData.value = res;
      allUserData.value = aggregateUserData(res);
      allUserDataByWeek.value = aggregateDataByWeekday(res);
      datasetStore.setOriginalData(res); // 存储到 store
    }

    // 等待下一个渲染周期，确保 DOM 更新完成
    await nextTick();
    // 更新图表，使用 editedData 而不是 originalData
    if (lineChart.value) {
      createLineChart(allUserData.value, lineChart.value, allUserDataByWeek.value);
    }
    
    // 更新概览图表，使用 editedData
    if (overviewChart.value) {
      createOverviewChart(datasetStore.getEditedData, overviewChart.value);
    }
  } catch (error) {
    ElMessage.error('Failed to fetch data');
  } finally {
    // 关闭loading状态
    isLoading.value = false;
  }
};

// 监听容器大小变化
const resizeObserver = new ResizeObserver(() => {
  if (allUserData.value.length && lineChart.value) {
    createLineChart(allUserData.value, lineChart.value, allUserDataByWeek.value);
  }
  if (datasetStore.getEditedData.length && overviewChart.value) {
    createOverviewChart(datasetStore.getEditedData, overviewChart.value);
  }
});

onMounted(() => {
  setTimeout(() => {
    if (lineChart.value) {
      resizeObserver.observe(lineChart.value);
    }
    if (overviewChart.value) {
      resizeObserver.observe(overviewChart.value);
    }
    
    // 添加数据更新事件监听
    window.addEventListener('data-updated', handleDataUpdate);
  }, 0);
});

onUnmounted(() => {
  if (lineChart.value) {
    resizeObserver.unobserve(lineChart.value);
  }
  if (overviewChart.value) {
    resizeObserver.unobserve(overviewChart.value);
  }
  
  // 移除事件监听
  window.removeEventListener('data-updated', handleDataUpdate);
});

// 添加数据更新处理函数
const handleDataUpdate = (event) => {
  // 设置loading状态
  isLoading.value = true;
  
  try {
    const { editedData } = event.detail;
    
    if (!editedData || !editedData.length) {
      return;
    }
    
    // 聚合数据
    allUserData.value = aggregateUserData(editedData);
    allUserDataByWeek.value = aggregateDataByWeekday(editedData);
    
    // 更新图表
    if (overviewChart.value) {
      createOverviewChart(editedData, overviewChart.value);
    }
    
    if (lineChart.value) {
      createLineChart(allUserData.value, lineChart.value, allUserDataByWeek.value);
    }
    
  } catch (error) {
    console.error('Error in handleDataUpdate:', error);
    ElMessage.error('Failed to update view');
  } finally {
    // 关闭loading状态
    setTimeout(() => {
      isLoading.value = false;
      // 发送成功消息
    }, 500); // 添加小延迟以确保UI渲染完成
  }
};

// 监听数据集变化
watch(() => datasetStore.getCurrentDataset, (newDataset) => {
  // 只有当数据集有值时才获取数据
  if (newDataset) {
    fetchData();
  } else {
    // 当数据集被清空时，清空现有数据
    allUserData.value = [];
    originalData.value = [];
    datasetStore.setOriginalData([]); // 清空 store 中的数据
  }
}, { immediate: true });

watch(() => datasetStore.selectedVariable, (newVariable) => {
  if (datasetStore.getCurrentDataset === 'capture' && newVariable) {
    fetchData();
  }
}, { immediate: true });

// 添加一个函数用于滚动到指定用户并高亮数据
const scrollToUserAndHighlight = (userId, weekday) => {
  // 找到用户在数组中的索引
  const userIndex = allUserData.value.findIndex(user => user.id === userId);
  if (userIndex === -1) return;

  // 计算滚动位置
  const scrollPosition = userIndex * userStripHeight;
  
  // 获取可滚动容器
  const scrollContainer = document.querySelector('.el-scrollbar__wrap');
  if (!scrollContainer) return;

  // 平滑滚动到用户位置
  scrollContainer.scrollTo({
    top: scrollPosition,
    behavior: MATRIX_CHART.ANIMATION.SCROLL_BEHAVIOR
  });
};

// 修改监听器，使用 store 中的状态
watch(
  [
    () => datasetStore.getShowWeekday,
    () => datasetStore.getShowWeekend
  ],
  () => {
    // 重新创建图表以应用筛选
    if (datasetStore.getCurrentDataset !== 'capture') {
      if (lineChart.value) {
        createLineChart(allUserData.value, lineChart.value, allUserDataByWeek.value);
      }
      if (overviewChart.value) {
        createOverviewChart(datasetStore.getEditedData, overviewChart.value);
      }
    }
  }
);

watch(() => datasetStore.getSelectedUserId, (newUserId) => {
  d3.select('.highlight-background').remove();

  
  if (newUserId && datasetStore.getSelectedView !== 'matrix') {
    scrollToUserAndHighlight(newUserId, datasetStore.selectedWeekday);
    const userGroup = d3.select(lineChart.value).select(`.user-${newUserId}`);
    if (!userGroup.empty()) {
      // 清除之前的高亮背景（如果有）
      userGroup.selectAll('.highlight-background').remove();
      
      // 获取 lineChart 的宽度
      const containerWidth = lineChart.value ? lineChart.value.clientWidth : 0;

      // 添加闪烁高亮背景
      const highlightBg = userGroup.append('rect')
        .attr('class', 'highlight-background')
        .attr('x', 0)
        .attr('y', 0)
        .attr('width', containerWidth)
        .attr('height', userStripHeight)
        .attr('fill', MATRIX_CHART.COLORS.HIGHLIGHT_BG)
        .attr('opacity', MATRIX_CHART.OPACITY.HIGHLIGHT_BG);
      

      // 指定时间后移除高亮背景
      setTimeout(() => {
        highlightBg.remove();
      }, MATRIX_CHART.ANIMATION.HIGHLIGHT_DURATION);

      
      // 将用户组提升到最上层，确保高亮效果可见
      userGroup.raise();
    } else {
      console.warn('User group not found:', `.user-${newUserId}`);
    }
  }
}, { immediate: true });
</script>

<style>
/* 添加tooltip样式 */
.tooltip-content {
  background-color: #F5F2FE;
  padding: 8px 12px;
  border-radius: 6px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
  max-width: 300px;
  z-index: 9999;
  position: fixed;
  pointer-events: none;
  font-size: 12px;
  line-height: 1.4;
}

.tooltip-row {
  display: flex;
  gap: 8px;
  margin: 4px 0;
}

.tooltip-row .label {
  color: #666;
  white-space: nowrap;
}

.tooltip-row .value {
  color: #333;
  font-weight: 500;
  word-break: break-word;
}

/* 修改拖拽缩略图样式 */
.drag-image {
  position: fixed;
  pointer-events: none;
  z-index: 10000;
  width: 40px;
  height: 40px;
  transform: translate(-50%, -50%);
  transition: transform 0.1s ease;
}

@keyframes pulse {
  0% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.2);
    opacity: 0.8;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}
</style>