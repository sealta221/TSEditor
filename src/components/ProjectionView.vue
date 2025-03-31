<template>
  <div ref="container" class="w-full h-full relative">
    <!-- 加载动画 -->
    <div v-if="isLoading" class="absolute inset-0 bg-white/80 flex items-center justify-center z-50">
      <div class="flex flex-col items-center gap-2">
        <div 
          :style="{
            '--theme-color-light': THEME_COLOR_LIGHT,
            '--theme-color': THEME_COLOR
          }"
          class="w-8 h-8 border-4 border-[var(--theme-color-light)] border-t-[var(--theme-color)] rounded-full animate-spin"
        ></div>
        <span :style="{ color: THEME_COLOR }" class="text-sm font-semibold">loading...</span>
      </div>
    </div>

    <!-- 控制面板 -->
    <div 
      v-if="datasetStore.getCurrentDataset"
      class="control-header absolute top-2 w-full px-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-3 md:gap-4 z-10"
    >
      <!-- 左侧下拉选择框 -->
      <div class="flex gap-4">
        <!-- 模型选择 -->
        <div class="relative">
          <button 
            @click="isModelOpen = !isModelOpen"
            :style="{
              borderColor: THEME_COLOR,
              color: THEME_COLOR
            }"
            class="flex items-center justify-between w-[80px] pb-0 hover:text-purple-600 transition-colors duration-200 border-b-2"
          >
            <span class="text-sm font-semibold flex-1 text-center">{{ selectedModel }}</span>
            <!-- 下拉箭头 -->
            <svg 
              :style="{ color: THEME_COLOR }"
              class="h-4 w-4 transition-transform duration-200 flex-shrink-0"
              :class="{ 'rotate-180': isModelOpen }"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" />
            </svg>
          </button>
          <!-- 下拉菜单 -->
          <div 
            v-if="isModelOpen"
            class="absolute top-full left-0 mt-1 w-[80px] bg-white rounded-lg shadow-lg py-1 z-20"
          >
            <button
              v-for="model in ['umap', 'tsne', 'pca']"
              :key="model"
              @click="() => {
                selectedModel = model;
                isModelOpen = false;
                handleModelChange();
              }"
              :style="{
                '--hover-color': THEME_COLOR
              }"
              class="w-full px-3 py-1.5 text-center text-xs hover:text-[var(--hover-color)] text-gray-700 font-semibold"
            >
              {{ model }}
            </button>
          </div>
        </div>

        <!-- 聚合方式选择 -->
        <div class="relative">
          <button 
            @click="isAggregationOpen = !isAggregationOpen"
            :style="{
              borderColor: THEME_COLOR,
              color: THEME_COLOR
            }"
            class="flex items-center justify-between w-[80px] pb-0 hover:text-purple-600 transition-colors duration-200 border-b-2"
          >
            <span class="text-sm font-semibold flex-1 text-center">{{ selectedAggregation }}</span>
            <!-- 下拉箭头 -->
            <svg 
              :style="{ color: THEME_COLOR }"
              class="h-4 w-4 transition-transform duration-200 flex-shrink-0"
              :class="{ 'rotate-180': isAggregationOpen }"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" />
            </svg>
          </button>
          <!-- 下拉菜单 -->
          <div 
            v-if="isAggregationOpen"
            class="absolute top-full left-0 mt-1 w-[80px] bg-white rounded-lg shadow-lg py-1 z-20"
          >
            <button
              v-for="option in aggregationOptions"
              :key="option"
              @click="() => {
                selectedAggregation = option;
                isAggregationOpen = false;
                handleAggregationChange();
              }"
              :style="{
                '--hover-color': THEME_COLOR
              }"
              class="w-full px-3 py-1.5 text-center text-xs hover:text-[var(--hover-color)] text-gray-700 font-semibold"
            >
              {{ option }}
            </button>
          </div>
        </div>
      </div>

      <!-- 右侧eps参数调整滑块 -->
      <div class="w-full md:w-60 slider-container">
        <div class="flex items-center">
          <span 
            class="text-sm mr-3 min-w-[30px] text-right font-semibold" 
            :style="{ color: THEME_COLOR }"
          >eps:</span>
          <el-slider 
            v-model="epsValue" 
            :min="0.5" 
            :max="10" 
            :step="0.5"
            :disabled="isLoading"
            @change="handleEpsChange"
            class="compact-slider flex-1"
            :style="{
              '--el-slider-main-bg-color': THEME_COLOR,
              '--el-color-primary': THEME_COLOR
            }"
          />
          <span 
            class="text-sm ml-3 min-w-[30px] text-left font-semibold"
            :style="{ color: THEME_COLOR }"
          >{{ epsValue }}</span>
        </div>
      </div>
    </div>

    <canvas ref="canvas" class="absolute top-0 left-0"></canvas>
    <svg ref="svg" class="absolute top-0 left-0 pointer-events-none">
      <g class="axis-group"></g>
    </svg>
    <div ref="tooltip" class="absolute hidden bg-white p-2 rounded shadow-lg border text-sm"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, computed } from 'vue';
import * as d3 from 'd3';
import { useDatasetStore } from '../stores/datasetStore';
import { reqDataCluster } from '../api';
import { useDebounceFn } from '@vueuse/core';
import { THEME_COLOR, THEME_COLOR_LIGHT, PROJECTION_VIEW } from '@/utils/constants';
const container = ref(null);
const canvas = ref(null);
const svg = ref(null);
const tooltip = ref(null);
const datasetStore = useDatasetStore();

// 选择状态
const selectedModel = ref('umap');
const selectedAggregation = ref('day');
const showTransitions = ref(true); // 控制是否显示转移线
const epsValue = ref(1.0); // 添加eps参数
const isModelOpen = ref(false);
const isAggregationOpen = ref(false);
const isLoading = ref(false);

// 存储所有的点数据
const allPoints = ref([]);
const transform = ref(d3.zoomIdentity);

// 添加比例尺相关的响应式变量
const xScale = ref(null);
const yScale = ref(null);
const colorScale = ref(null);

// 用于存储当前绘制函数的引用
const currentDrawFunction = ref(null);

// 添加选中状态
const selectedClusterId = ref(null);

// 聚合方式选择
const aggregationOptions = computed(() => {
  return datasetStore.getCurrentDataset === 'capture' ? ['all'] : ['all', 'day', 'week'];
});

// 创建散点图
const createScatterPlot = (data) => {
  if (!data || !data.length) return;

  const width = container.value.clientWidth;
  const height = container.value.clientHeight;
  const margin = { top: 20, right: 20, bottom: 30, left: 40 };
  const ctx = canvas.value.getContext('2d');

  // 设置 Canvas 和 SVG 尺寸
  canvas.value.width = width;
  canvas.value.height = height;
  canvas.value.style.width = `${width}px`;
  canvas.value.style.height = `${height}px`;
  
  d3.select(svg.value)
    .attr('width', width)
    .attr('height', height);

  // 提取所有点并按用户和日期组织数据
  const points = [];
  const outlierPoints = []; // 存储离群点（cluster为-1的点）
  const trajectoryMap = new Map(); // 用于存储轨迹数据
  const clusterCenters = new Map(); // 存储所有簇的中心点
  const clusterCounts = new Map(); // 存储每个簇的点数量
  const transitionCounts = new Map(); // 存储簇之间的转移次数
  
  data.forEach(user => {
    // 处理全局聚类信息
    if (user.global_clustering && user.global_clustering.cluster_counts) {
      Object.entries(user.global_clustering.cluster_counts).forEach(([clusterId, count]) => {
        clusterCounts.set(clusterId, count);
      });
    }
    
    user.trajectories.forEach(trajectory => {
      const trajectoryKey = `${user.id}-${trajectory.date}`;
      const trajectoryPoints = [];
      
      // 处理轨迹点
      if (trajectory.points && trajectory.timestamps && trajectory.clusters) {
        // 计算簇之间的转移
        for (let i = 1; i < trajectory.points.length; i++) {
          const prevCluster = trajectory.clusters[i-1];
          const currCluster = trajectory.clusters[i];
          
          // 如果前后簇不同，记录一次转移
          if (prevCluster !== currCluster) {
            const transitionKey = `${prevCluster}-${currCluster}`;
            const count = transitionCounts.get(transitionKey) || 0;
            transitionCounts.set(transitionKey, count + 1);
          }
        }
        
        trajectory.points.forEach((point, index) => {
          const pointData = {
            x: point[0],
            y: point[1],
            userId: user.id,
            date: trajectory.date,
            timestamp: trajectory.timestamps[index],
            cluster: trajectory.clusters ? trajectory.clusters[index] : null
          };
          
          // 将离群点(cluster为-1的点)单独存储
          if (pointData.cluster === '-1' || pointData.cluster === -1) {
            outlierPoints.push(pointData);
          } else {
            points.push(pointData);
          }
          
          trajectoryPoints.push(pointData);
        });
      }
      
      // 处理簇中心点
      if (trajectory.cluster_centers) {
        Object.entries(trajectory.cluster_centers).forEach(([clusterId, center]) => {
          // 不将-1视为簇中心
          if (clusterId !== '-1') {
            clusterCenters.set(clusterId, {
              x: center[0],
              y: center[1],
              clusterId: clusterId
            });
          }
        });
      }
      
      // 按时间戳排序轨迹点
      trajectoryPoints.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      trajectoryMap.set(trajectoryKey, trajectoryPoints);
    });
  });

  // 计算x和y的范围 (使用所有点而不仅仅是簇中心点，以保持一致的视图)
  const allPointsForExtent = [...points, ...outlierPoints];
  const xExtent = d3.extent(allPointsForExtent, d => d.x);
  const yExtent = d3.extent(allPointsForExtent, d => d.y);

  // 更新比例尺
  xScale.value = d3.scaleLinear()
    .domain([xExtent[0], xExtent[1]])
    .range([margin.left, width - margin.right]);

  yScale.value = d3.scaleLinear()
    .domain([yExtent[0], yExtent[1]])
    .range([height - margin.bottom, margin.top]);

  // 更新颜色比例尺
  colorScale.value = d3.scaleOrdinal(d3.schemeCategory10);
  
  // 创建大小比例尺（基于簇中的点数量）
  const maxCount = Math.max(...clusterCounts.values());
  const sizeScale = d3.scaleSqrt()
    .domain([1, maxCount])
    .range([15, 40]);
    
  // 创建线宽比例尺（基于转移次数）
  const maxTransitionCount = Math.max(...transitionCounts.values(), 1);
  const lineWidthScale = d3.scaleLinear()
    .domain([1, maxTransitionCount])
    .range([2, 6]);

  // 绘制轨迹线的函数
  const drawTrajectory = (userId, date) => {
    const trajectoryKey = `${userId}-${date}`;
    const trajectoryPoints = trajectoryMap.get(trajectoryKey);
    
    if (!trajectoryPoints || trajectoryPoints.length === 0) return;
    
    // 绘制轨迹线
    ctx.save();
    const t = transform.value;
    ctx.translate(t.x, t.y);
    ctx.scale(t.k, t.k);
    
    ctx.beginPath();
    ctx.moveTo(xScale.value(trajectoryPoints[0].x), yScale.value(trajectoryPoints[0].y));
    
    for (let i = 1; i < trajectoryPoints.length; i++) {
      ctx.lineTo(xScale.value(trajectoryPoints[i].x), yScale.value(trajectoryPoints[i].y));
    }
    
    ctx.strokeStyle = colorScale.value(userId);
    ctx.lineWidth = 2 / t.k; // 根据缩放调整线宽
    ctx.stroke();
    
    // 在轨迹点上绘制小圆点，标记时间顺序
    trajectoryPoints.forEach((point, index) => {
      ctx.beginPath();
      ctx.arc(xScale.value(point.x), yScale.value(point.y), 2 / t.k, 0, 2 * Math.PI);
      ctx.fillStyle = colorScale.value(userId);
      ctx.fill();
      
      // 添加时间标记
      if (index === 0 || index === trajectoryPoints.length - 1) {
        ctx.fillStyle = 'black';
        ctx.font = `${12 / t.k}px Arial`;
        ctx.fillText(point.timestamp.split(' ')[1], 
          xScale.value(point.x) + 5 / t.k, 
          yScale.value(point.y) - 5 / t.k);
      }
    });
    
    ctx.restore();
  };

  // 定义绘制三角形的辅助函数
  const drawTriangle = (x, y, size, fillStyle, t) => {
    ctx.beginPath();
    ctx.moveTo(x, y - size);
    ctx.lineTo(x - size * 0.866, y + size * 0.5);
    ctx.lineTo(x + size * 0.866, y + size * 0.5);
    ctx.closePath();
    ctx.fillStyle = fillStyle;
    ctx.fill();
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 0.5 * t.k;
    ctx.stroke();
  };

  // 基本绘制函数
  const draw = () => {
    // 清除画布
    ctx.clearRect(0, 0, width, height);
    
    // 应用当前变换
    ctx.save();
    const t = transform.value;
    ctx.translate(t.x, t.y);
    ctx.scale(t.k, t.k);

    // 绘制簇中心点
    clusterCenters.forEach((center, clusterId) => {
      const count = clusterCounts.get(clusterId) || 1;
      const radius = sizeScale(count) * t.k;
      
      ctx.beginPath();
      ctx.arc(xScale.value(center.x), yScale.value(center.y), radius, 0, 2 * Math.PI);
      ctx.fillStyle = PROJECTION_VIEW.CLUSTER_COLOR;
      ctx.globalAlpha = 0.7;
      ctx.fill();
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 1 / t.k;
      ctx.stroke();
    });

    // 绘制离群点（标记为-1的点）为三角形
    outlierPoints.forEach(point => {
      // 三角形大小随缩放变化
      const size = 4 * t.k;
      const x = xScale.value(point.x);
      const y = yScale.value(point.y);
      drawTriangle(x, y, size, colorScale.value(point.userId), t);
    });

    // 如果启用了转移线显示，绘制转移线
    if (showTransitions.value) {
      // 绘制簇之间的转移线
      transitionCounts.forEach((count, transitionKey) => {
        const [sourceId, targetId] = transitionKey.split('-');
        const source = clusterCenters.get(sourceId);
        const target = clusterCenters.get(targetId);
        
        if (source && target) {
          // 计算线宽
          const lineWidth = lineWidthScale(count) * t.k;
          
          // 绘制从源到目标的箭头线
          const startX = xScale.value(source.x);
          const startY = yScale.value(source.y);
          const endX = xScale.value(target.x);
          const endY = yScale.value(target.y);
          
          // 计算方向向量
          const dx = endX - startX;
          const dy = endY - startY;
          const length = Math.sqrt(dx * dx + dy * dy);
          
          // 如果源和目标是同一个点，不绘制
          if (length < 0.001) return;
          
          // 单位向量
          const unitX = dx / length;
          const unitY = dy / length;
          
          // 计算源和目标簇的半径，考虑缩放因子
          const sourceRadius = sizeScale(clusterCounts.get(sourceId) || 1) * t.k;
          const targetRadius = sizeScale(clusterCounts.get(targetId) || 1) * t.k;
          
          // 调整起点和终点，使线条从簇边缘开始和结束
          const adjustedStartX = startX + unitX * sourceRadius;
          const adjustedStartY = startY + unitY * sourceRadius;
          const adjustedEndX = endX - unitX * targetRadius;
          const adjustedEndY = endY - unitY * targetRadius;
          
          // 绘制线条
          ctx.beginPath();
          ctx.moveTo(adjustedStartX, adjustedStartY);
          ctx.lineTo(adjustedEndX, adjustedEndY);
          
          // 设置线条样式
          ctx.strokeStyle = 'rgba(139, 95, 255, 0.4)';
          ctx.lineWidth = lineWidth;
          ctx.stroke();
        }
      });
    }

    // 如果有选中的簇，显示该簇的所有点
    if (selectedClusterId.value !== null) {
      // 从allPoints中查找属于选中簇的点
      allPoints.value.forEach(user => {
        user.trajectories.forEach(trajectory => {
          if (trajectory.points && trajectory.timestamps && trajectory.clusters) {
            trajectory.points.forEach((point, index) => {
              if (trajectory.clusters[index] == selectedClusterId.value) {
                ctx.beginPath();
                ctx.arc(xScale.value(point[0]), yScale.value(point[1]), 4 * t.k, 0, 2 * Math.PI);
                ctx.fillStyle = colorScale.value(user.id);
                ctx.globalAlpha = 0.8;
                ctx.fill();
              }
            });
          }
        });
      });
    }

    // 重置透明度
    ctx.globalAlpha = 1.0;

    ctx.restore();
  };

  // 保存当前绘制函数的引用，以便在其他地方调用
  currentDrawFunction.value = draw;

  // 缩放行为
  const zoom = d3.zoom()
    .scaleExtent([0.1, 15])
    .on('zoom', (event) => {
      transform.value = event.transform;
      if (currentDrawFunction.value) {
        currentDrawFunction.value();
      }
    });

  // 应用缩放行为到 Canvas
  d3.select(canvas.value).call(zoom);

  // 处理鼠标移动
  const handleMouseMove = (event) => {
    const rect = canvas.value.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    // 转换鼠标坐标到数据空间
    const t = transform.value;
    const dataX = xScale.value.invert((x - t.x) / t.k);
    const dataY = yScale.value.invert((y - t.y) / t.k);
    
    // 找到最近的簇中心点
    let nearestCenter = null;
    let minDistance = Infinity;
    
    clusterCenters.forEach((center, clusterId) => {
      const dx = center.x - dataX;
      const dy = center.y - dataY;
      const distance = dx * dx + dy * dy;
      
      if (distance < minDistance) {
        minDistance = distance;
        nearestCenter = { ...center, clusterId };
      }
    });

    // 如果找到足够近的簇中心点，高亮显示
    const threshold = 0.1 * (sizeScale(clusterCounts.get(nearestCenter?.clusterId) || 1) / t.k);
    if (nearestCenter && minDistance < threshold) {
      // 重绘基本图形
      if (currentDrawFunction.value) {
        currentDrawFunction.value();
      }
      
      // 高亮显示选中的簇
      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.scale(t.k, t.k);
      
      const count = clusterCounts.get(nearestCenter.clusterId) || 1;
      const radius = sizeScale(count) * t.k;
      
      // 绘制高亮边框
      ctx.beginPath();
      ctx.arc(xScale.value(nearestCenter.x), yScale.value(nearestCenter.y), radius + 2 * t.k, 0, 2 * Math.PI);
      ctx.strokeStyle = 'rgba(139, 95, 255, 0.7)';
      ctx.lineWidth = 2 * t.k;
      ctx.stroke();
      
      // 显示簇ID
      ctx.fillStyle = 'white';
      ctx.font = `${Math.min(12, radius * t.k)}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(nearestCenter.clusterId, xScale.value(nearestCenter.x), yScale.value(nearestCenter.y));
      
      // 从allPoints中查找并显示属于该簇的点
      allPoints.value.forEach(user => {
        user.trajectories.forEach(trajectory => {
          if (trajectory.points && trajectory.timestamps && trajectory.clusters) {
            trajectory.points.forEach((point, index) => {
              if (trajectory.clusters[index] == nearestCenter.clusterId) {
                ctx.beginPath();
                ctx.arc(xScale.value(point[0]), yScale.value(point[1]), 4 * t.k, 0, 2 * Math.PI);
                ctx.fillStyle = colorScale.value(user.id);
                ctx.fill();
                ctx.strokeStyle = 'white';
                ctx.lineWidth = 0.5 * t.k;
                ctx.stroke();
              }
            });
          }
        });
      });
      
      ctx.restore();
    } else {
      // 重绘基本散点图
      if (currentDrawFunction.value) {
        currentDrawFunction.value();
      }
    }
  };

  // 添加点击事件处理
  const handleClick = (event) => {
    const rect = canvas.value.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    // 转换鼠标坐标到数据空间
    const t = transform.value;
    const dataX = xScale.value.invert((x - t.x) / t.k);
    const dataY = yScale.value.invert((y - t.y) / t.k);
    
    // 找到最近的簇中心点
    let nearestCenter = null;
    let minDistance = Infinity;
    
    clusterCenters.forEach((center, clusterId) => {
      const dx = center.x - dataX;
      const dy = center.y - dataY;
      const distance = dx * dx + dy * dy;
      
      if (distance < minDistance) {
        minDistance = distance;
        nearestCenter = { ...center, clusterId };
      }
    });

    // 如果找到足够近的簇中心点，更新选中状态
    const threshold = 0.1 * (sizeScale(clusterCounts.get(nearestCenter?.clusterId) || 1) / t.k);
    if (nearestCenter && minDistance < threshold) {
      // 如果点击的是当前选中的簇，取消选中
      if (selectedClusterId.value === nearestCenter.clusterId) {
        selectedClusterId.value = null;
      } else {
        selectedClusterId.value = nearestCenter.clusterId;
      }
      // 重绘图表
      if (currentDrawFunction.value) {
        currentDrawFunction.value();
      }
    }
  };

  canvas.value.addEventListener('mousemove', handleMouseMove);
  canvas.value.addEventListener('click', handleClick);
  
  // 初始绘制
  draw();

  // 清理函数
  return () => {
    canvas.value.removeEventListener('mousemove', handleMouseMove);
    canvas.value.removeEventListener('click', handleClick);
  };
};

// 处理模型变化
const handleModelChange = () => {
  // 移除这里的fetchProjectionData调用，让watch来处理
};

// 处理聚合方式变化
const handleAggregationChange = () => {
  // 移除这里的fetchProjectionData调用，让watch来处理
};

// 处理eps参数变化（添加防抖）
const handleEpsChange = useDebounceFn(async () => {
  await fetchProjectionData();
}, 500); // 500ms的防抖延迟

// 暴露给组件的绘制函数
const draw = () => {
  if (currentDrawFunction.value) {
    currentDrawFunction.value();
  }
};

// 获取投影数据
const fetchProjectionData = async () => {
  if (!datasetStore.getCurrentDataset) {
    allPoints.value = [];
    return;
  }

  try {
    isLoading.value = true;
    // 将模型、聚合方式和eps参数作为参数传递给API
    const data = await reqDataCluster(
      datasetStore.getCurrentDataset,
      datasetStore.getCurrentDataset == 'capture' ? datasetStore.selectedVariable : 'null',
      selectedModel.value,
      datasetStore.getCurrentDataset == 'capture' ? 'all' : selectedAggregation.value,
      epsValue.value
    );
    allPoints.value = data;
    createScatterPlot(data);
  } catch (error) {
    console.error('Error fetching projection data:', error);
  } finally {
    isLoading.value = false;
  }
};

// 监听窗口大小变化
const resizeObserver = new ResizeObserver(() => {
  if (allPoints.value.length && container.value) {
    createScatterPlot(allPoints.value);
  }
});

onMounted(() => {
  if (container.value) {
    resizeObserver.observe(container.value);
  }
});

onUnmounted(() => {
  if (container.value) {
    resizeObserver.unobserve(container.value);
  }
});

// 监听数据集变化
watch(() => datasetStore.getCurrentDataset, (newDataset) => {
  if (newDataset) {
    fetchProjectionData();
  } else {
    allPoints.value = [];
  }
}, { immediate: true });

// 监听选择变化
watch([selectedModel, selectedAggregation], () => {
  if (datasetStore.getCurrentDataset) {
    fetchProjectionData();
  }
}, { immediate: true });

// 监听选中用户变化
watch(() => datasetStore.getSelectedUserId, (newUserId) => {
  if (!canvas.value || !currentDrawFunction.value || !xScale.value || !yScale.value || !colorScale.value) return;

  // 重绘图表以应用新的高亮效果
  currentDrawFunction.value();

  // 如果有选中的用户，高亮显示该用户的轨迹
  if (newUserId !== null) {
    const ctx = canvas.value.getContext('2d');
    const t = transform.value;
    
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.scale(t.k, t.k);

    // 高亮显示选中用户的轨迹
    allPoints.value.forEach(user => {
      if (user.id === newUserId) {
        user.trajectories.forEach(trajectory => {
          if (trajectory.points && trajectory.timestamps && trajectory.clusters) {
            // 绘制轨迹线
            ctx.beginPath();
            ctx.moveTo(xScale.value(trajectory.points[0][0]), yScale.value(trajectory.points[0][1]));
            
            for (let i = 1; i < trajectory.points.length; i++) {
              ctx.lineTo(xScale.value(trajectory.points[i][0]), yScale.value(trajectory.points[i][1]));
            }
            
            ctx.strokeStyle = colorScale.value(user.id);
            ctx.lineWidth = 3 / t.k;
            ctx.stroke();

            // 绘制轨迹点
            trajectory.points.forEach((point, index) => {
              ctx.beginPath();
              ctx.arc(xScale.value(point[0]), yScale.value(point[1]), 3 / t.k, 0, 2 * Math.PI);
              ctx.fillStyle = colorScale.value(user.id);
              ctx.fill();
              ctx.strokeStyle = 'white';
              ctx.lineWidth = 1 / t.k;
              ctx.stroke();
            });
          }
        });
      }
    });

    ctx.restore();
  }
});
</script>

<style scoped>
canvas {
  touch-action: none;
}
.control-header {
  background-color: rgba(255, 255, 255, 0.8);
}
/* 滑块样式定制 */
.slider-container :deep(.el-slider) {
  height: 28px;
}

.slider-container :deep(.el-slider__runway) {
  height: 5px;
  margin: 14px 0;
}

.slider-container :deep(.el-slider__bar) {
  height: 5px;
}

.slider-container :deep(.el-slider__button-wrapper) {
  height: 22px;
  width: 22px;
  top: -9px;
}

.slider-container :deep(.el-slider__button) {
  height: 14px;
  width: 14px;
  border-color: var(--el-color-primary);
}
</style> 