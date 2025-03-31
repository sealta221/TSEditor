<script setup>
import { ref, computed, watch } from 'vue'
import SeriesViewChart from './SeriesViewChart.vue'
import TimeSeriesChart from './TimeSeriesChart.vue'
import { downloadCSV } from '../utils/csvUtils'
import { api } from '../services/api'
import { useTimeSeriesStore } from '../stores/timeSeriesStore'
import { ElMessage, ElScrollbar, ElSlider } from 'element-plus'
import { getRandomColor, getColorByType } from '../utils/uiUtils'
import { useDatasetStore } from '../stores/datasetStore'
import { THEME_COLOR, THEME_COLOR_HOVER, THEME_COLOR_LIGHT } from '../utils/constants'

const props = defineProps({
  series: Object,
  isSelected: Boolean,
  hoverTime: Number,
  timeAxisConfig: Object
})

const emit = defineEmits(['click', 'hover'])
const store = useTimeSeriesStore()
const datasetStore = useDatasetStore()

const showDecomposition = ref(false)
const decompositionNumber = ref(2)
const model = ref('sym8')
const level = ref(3)
const isDecomposing = ref(false)
const decomposedSeries = ref([])
const isDecompNumberOpen = ref(false)
const isModelOpen = ref(false)

// 添加计算属性获取当前数据集类型
const datasetType = computed(() => datasetStore.getCurrentDataset)

// 监听子曲线可见性，控制父曲线可见性
watch(() => decomposedSeries.value, (newSeries) => {
  if (newSeries.length > 0) {
    const anyChildVisible = newSeries.some(s => s.visible)
    if (anyChildVisible && props.series.visible) {
      props.series.visible = false
    }
  }
}, { deep: true })

// 切换当前系列的可见性
const toggleVisibility = () => {
  props.series.visible = !props.series.visible
  
  // 如果当前序列变为不可见，取消其选中状态
  if (!props.series.visible && props.isSelected) {
    // 通知父组件或存储取消选中
    store.clearSelection()
    emit('click') // 通知父组件处理选中状态变化
  }
  
  // 如果当前是父系列且有子系列，切换父系列可见性时影响子系列
  if (props.series.visible && decomposedSeries.value.length > 0) {
    decomposedSeries.value.forEach(s => {
      s.visible = false
      
      // 从store中移除子曲线的可见性
      const seriesInStore = store.series.find(storeSeries => storeSeries.id === s.id)
      if (seriesInStore) {
        seriesInStore.visible = false
      }
    })
  }
}

// 切换子系列的可见性
const toggleChildVisibility = (childSeries) => {
  childSeries.visible = !childSeries.visible
  
  // 如果子序列变为不可见且当前被选中，取消选中
  if (!childSeries.visible && store.selectedSeries.includes(childSeries.id)) {
    store.setSelection(
      store.selectedTimeRange, 
      store.selectedSeries.filter(id => id !== childSeries.id)
    )
  }
  
  // 更新store中的系列或添加到store
  const seriesInStore = store.series.find(s => s.id === childSeries.id)
  if (seriesInStore) {
    seriesInStore.visible = childSeries.visible
  } else if (childSeries.visible) {
    // 如果在store中不存在且现在应该可见，则添加到store
    store.addSeries({...childSeries})
  }
  
  // 如果任何子系列可见，父系列应该不可见
  if (childSeries.visible && props.series.visible) {
    props.series.visible = false
  }
  
  // 如果所有子系列都不可见，父系列可以可见
  const anyChildVisible = decomposedSeries.value.some(s => s.visible)
  if (!anyChildVisible && !props.series.visible) {
    props.series.visible = true
    
    // 从store中移除所有子曲线
    decomposedSeries.value.forEach(s => {
      const index = store.series.findIndex(storeSeries => storeSeries.id === s.id)
      if (index !== -1) {
        store.series.splice(index, 1)
      }
    })
  }
}

const getTypeClass = (type) => {
  return `time-series-tag ${type.toLowerCase()}`
}

const handleClick = () => {
  // 如果序列不可见，则不触发点击事件
  if (!props.series.visible) {
    return;
  }
  emit('click');
}

const handleMouseEnter = () => {
  emit('hover', true)
}

const handleMouseLeave = () => {
  emit('hover', false)
}

const exportSeries = (event) => {
  event.stopPropagation()
  downloadCSV(props.series.data, `${props.series.id}_export.csv`)
}

const deleteSeries = (event) => {
  event.stopPropagation()
  
  // 如果要删除的是父曲线，也要同时删除子曲线
  if (decomposedSeries.value.length > 0) {
    decomposedSeries.value.forEach(s => {
      const index = store.series.findIndex(storeSeries => storeSeries.id === s.id)
      if (index !== -1) {
        store.series.splice(index, 1)
      }
    })
  }
  
  // 从store中删除当前曲线
  store.deleteSeries(props.series.id)
  ElMessage.success(`Series ${props.series.id} has been deleted`)
}

const toggleDecomposition = () => {
  // If decomposition is currently showing, close it
  if (showDecomposition.value) {
    showDecomposition.value = false;
    return;
  }
  
  // Check if the series already has child components
  const existingChildSeries = store.series.filter(s => 
    s.parentId === props.series.id && 
    (s.type === 'high_freq' || s.type === 'low_freq' || s.type === 'mid_freq' ||
     s.type === 'hf' || s.type === 'lf' || s.type === 'mf')
  );
  
  // If child series exist, remove them and restore original
  if (existingChildSeries.length > 0) {
    // 保存原始序列的ID和数据，以便后续恢复
    const originalSeriesId = props.series.id;
    const originalSeriesData = JSON.parse(JSON.stringify(props.series.data));
    
    // 物理删除子序列以确保它们从UI中消失
    existingChildSeries.forEach(childSeries => {
      store.deleteSeries(childSeries.id);
    });
    
    // 清空本地分解序列数组
    decomposedSeries.value = [];
    
    // 确保原始序列可见
    props.series.visible = true;
    
    // 重要：恢复原始序列数据，避免变成一条横线
    const originalSeriesIndex = store.series.findIndex(s => s.id === originalSeriesId);
    if (originalSeriesIndex !== -1) {
      store.series[originalSeriesIndex].data = originalSeriesData;
    }
    
    // 显示成功消息
    ElMessage.success('Decomposition components removed');
    
    return;
  }
  
  // Otherwise, show the decomposition panel for new decomposition
  showDecomposition.value = true;
}

const normalizeTimeSeries = (data) => {
  // Find min/max values
  const values = data.map(p => p.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min

  // Normalize values to be non-negative
  return data.map(point => ({
    time: point.time,
    value: range > 0 ? ((point.value - min) / range) * 10 : point.value
  }))
}

const applyDecomposition = async () => {
  if (!props.series || !props.series.data || isDecomposing.value) return;
  
  isDecomposing.value = true;
  
  try {
    // Extract values from series data
    const values = props.series.data.map(point => point.value);
    
    // Use the dedicated decomposition method
    const response = await api.decomposeSeries(props.series.data, {
      decompositionNumber: decompositionNumber.value,
      model: model.value,
      level: level.value,
      method: 'wavelet'
    });
    
    // Process response
    if (response.data) {
      // Clear any existing decomposed series
      decomposedSeries.value = [];
      
      // Create color palette for components
      const colors = {
        low_freq: '#8367F8',
        mid_freq: '#9B71F6',
        high_freq: '#6548C7',
        trend: '#8367F8',
        seasonal: '#9B71F6',
        residual: '#6548C7'
      };
      
      // Create component series
      const components = [];
      
      // Process each component from the response
      Object.entries(response.data).forEach(([key, values]) => {
        // Skip the original data
        if (key === 'original') return;
        
        // Create a unique ID for this component
        const componentId = `${props.series.id}_${key}`;
        
        // Create time-value pairs
        const componentData = values.map((value, index) => ({
          time: props.series.data[index].time,
          value: value
        }));
        
        // Add component to our local state
        components.push({
          id: componentId,
          parentId: props.series.id,
          label: key,
          type: key,
          data: componentData,
          visible: true,
          color: colors[key] || getRandomColor()
        });
      });
      
      // Update the decomposed series
      decomposedSeries.value = components;
      
      // Add visible components to the store
      components.forEach(component => {
        if (component.visible) {
          store.addSeries(component);
        }
      });
      
      // Hide the original series
      props.series.visible = false;
      
      ElMessage.success('Decomposition completed successfully');
      
      // Close the decomposition panel after successful decomposition
      showDecomposition.value = false;
    }
  } catch (error) {
    console.error('Decomposition error:', error);
    ElMessage.error('Failed to decompose the time series');
  } finally {
    isDecomposing.value = false;
  }
};

// 在 computed 属性中添加一个方法来对子序列进行排序
const getChildSeries = computed(() => {
  return (parentId) => {
    // 获取所有子序列
    const children = store.series.filter(s => {
      // 检查是否是分解的子序列
      return s.id.startsWith(parentId + '_') && (s.type === 'hf' || s.type === 'mf' || s.type === 'lf');
    });

    // 定义序列类型的排序顺序
    const typeOrder = {
      'lf': 1,  // LF 排在最前面
      'mf': 2,  // MF 排在中间
      'hf': 3   // HF 排在最后
    };

    // 根据类型排序
    return children.sort((a, b) => {
      return typeOrder[a.type] - typeOrder[b.type];
    });
  };
});

// 判断是否为子序列的计算属性
const isChildSeries = computed(() => {
  const childTypes = ['lf', 'mf', 'hf', 'low_freq', 'mid_freq', 'high_freq'];
  return props.series.parentId && childTypes.includes(props.series.type);
});

const extractUserId = (id) => {
  const match = id.match(/user[_]?(\d+)/);
  return match ? match[1] : id;
}

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  
  // 简化日期格式 yyyy.MM.dd
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[0]}.${parts[1]}.${parts[2]}`;
  }
  
  return dateStr;
}

const getVariableClass = (variable) => {
  switch(variable) {
    case 'x': return 'bg-blue-100 text-blue-700';
    case 'y': return 'bg-green-100 text-green-700';
    case 'z': return 'bg-orange-100 text-orange-700';
    default: return 'bg-gray-100 text-gray-700';
  }
}

// 在 script 部分添加两个计算属性
const seriesDate = computed(() => {
  // 如果序列自身有日期，直接使用
  if (props.series.date) {
    return props.series.date;
  }
  
  // 如果是子序列并且没有自己的日期，尝试从父序列获取
  if (props.series.parentId) {
    const parentSeries = store.series.find(s => s.id === props.series.parentId);
    return parentSeries?.date || '';
  }
  
  return '';
});

const seriesVariable = computed(() => {
  // 如果序列自身有变量，直接使用
  if (props.series.variable) {
    return props.series.variable;
  }
  
  // 如果是子序列并且没有自己的变量，尝试从父序列获取
  if (props.series.parentId) {
    const parentSeries = store.series.find(s => s.id === props.series.parentId);
    return parentSeries?.variable || '';
  }
  
  return '';
});

// 格式化类型显示
const getTypeDisplay = (type) => {
  if (!type || type === 'original') {
    return 'Original';
  }
  // 其他类型保持全大写
  return type.toUpperCase();
}
</script>

<template>
  <div 
    class="time-series-item p-4 cursor-pointer transition-all duration-200 relative"
    :class="{ 
      'border-l-4': isSelected,
      'cursor-not-allowed opacity-75': !series.visible // 降低透明度，从50%调整为75%
    }"
    :style="isSelected ? {
      backgroundColor: THEME_COLOR_LIGHT,
      borderLeftColor: THEME_COLOR
    } : {}"
    @click="handleClick"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
  >
    <div class="flex items-center gap-2 mb-2">
      <!-- 类型标签在左上角 -->
      <span :class="getTypeClass(series.type)" class="font-bold ml-[100px]">
        {{ getTypeDisplay(series.type) }}
      </span>
      
      <!-- 用户ID显示为标签 -->
      <span class="bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-sm font-bold">
        User {{ extractUserId(series.id) }}
      </span>
      
      <!-- 日期显示为标签 -->
      <span v-if="seriesDate" class="bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-sm font-bold">
        {{ formatDate(seriesDate) }}
      </span>
      
      <!-- 变量标签：仅在 capture 数据集且存在变量信息时显示 -->
      <span v-if="datasetType === 'capture' && seriesVariable" 
            :class="getVariableClass(seriesVariable)" 
            class="px-2 py-0.5 rounded text-sm font-bold">
        {{ seriesVariable }}
      </span>
      
      <!-- 只为非子序列显示删除和导出按钮 -->
      <template v-if="!isChildSeries">
        <button 
          @click.stop="deleteSeries"
          class="p-2 rounded hover:bg-gray-100"
          title="Delete series"
        >
          <img src="/src/assets/delete.svg" alt="Delete" class="w-4 h-4" />
        </button>
        
        <button 
          @click.stop="exportSeries"
          class="text-sm px-2 py-1  hover:bg-gray-100 flex items-center gap-1"
          title="Export as CSV"
        >
          <img src="/src/assets/Export_series.svg" alt="Export" class="w-4 h-4" />
        </button>
      </template>
    </div>
    
    <!-- 显示框中的控制按钮区域 -->
    <div class="flex relative h-[70px]">
      <!-- 左侧控件空间 -->
      <div class="w-[105px] flex-none flex flex-row items-center relative">
        <!-- 可视标记按钮 - 减少右边距，将其向左移动 -->
        <button 
          @click.stop="toggleVisibility" 
          class="p-2 rounded hover:bg-gray-100 mr-[20px] ml-[-10px]"
          title="Toggle visibility in main view"
        >
          <span v-if="series.visible" class="text-gray-800">
            <svg width="19" height="15" viewBox="0 0 19 15" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path fill-rule="evenodd" clip-rule="evenodd" d="M9.37047 5.33344C8.38867 5.33344 7.59272 6.12935 7.59272 7.11122C7.59272 8.09309 8.38867 8.889 9.37047 8.889C10.3524 8.889 11.1482 8.0931 11.1482 7.11122C11.1482 6.12934 10.3524 5.33344 9.37047 5.33344ZM5.81494 7.11122C5.81494 5.14749 7.40685 3.55566 9.37047 3.55566C11.3342 3.55566 12.926 5.1475 12.926 7.11122C12.926 9.07494 11.3342 10.6668 9.37047 10.6668C7.40685 10.6668 5.81494 9.07495 5.81494 7.11122Z" fill="currentColor"/>
              <path fill-rule="evenodd" clip-rule="evenodd" d="M0.0408457 6.84475C1.28655 2.8786 4.99136 0 9.37086 0C13.7503 0 17.4551 2.87863 18.7009 6.84475C18.7553 7.01815 18.7553 7.20407 18.7009 7.37747C17.4551 11.3436 13.7503 14.2222 9.37086 14.2222C4.99136 14.2222 1.28654 11.3436 0.040845 7.37747C-0.0136153 7.20407 -0.013615 7.01815 0.0408457 6.84475ZM1.8258 7.11111C2.92422 10.2192 5.88876 12.4444 9.37086 12.4444C12.8529 12.4444 15.8175 10.2192 16.9159 7.11111C15.8175 4.00306 12.8529 1.77778 9.37086 1.77778C5.88876 1.77778 2.92423 4.00304 1.8258 7.11111Z" fill="currentColor"/>
            </svg>
          </span>
          <span v-else class="text-gray-400">
            <svg width="19" height="18" viewBox="0 0 19 18" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M1.48177 1L17.4818 17M7.56557 7.14546C7.101 7.62542 6.8151 8.27929 6.8151 9C6.8151 10.4728 8.00904 11.6667 9.48175 11.6667C10.2129 11.6667 10.8753 11.3724 11.357 10.896M4.59288 4.24191C2.90461 5.35586 1.61868 7.03017 1 9C2.13267 12.6063 5.50183 15.2222 9.48193 15.2222C11.2498 15.2222 12.8972 14.7061 14.2816 13.8164M8.59286 2.82168C8.88531 2.79265 9.18193 2.77778 9.48193 2.77778C13.4621 2.77778 16.8313 5.3937 17.9639 9C17.7144 9.79467 17.3562 10.5412 16.9068 11.2222" stroke="currentColor" stroke-width="1.77778" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </span>
        </button>
        
        <!-- 分解按钮 - 只在原始曲线上显示 -->
        <button 
          v-if="series.type === 'original'"
          @click.stop="toggleDecomposition" 
          class="p-2 rounded hover:bg-gray-100"
          title="Decompose series"
        >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M0.432918 4.0408L0.183382 4.38749C0.0820015 4.53105 -0.0037871 4.73068 0.000129001 4.95479C0.000129001 5.18241 0.0820016 5.42053 0.24188 5.66216C0.475824 6.01234 0.893047 6.38353 1.54811 6.76174L7.0732 10.1235L7.00303 7.46562L0.432966 4.04078L0.432918 4.0408ZM16.4389 14.7635L16.4467 14.767C16.8366 14.9806 17.1915 15.1207 17.5697 15.1487C17.9479 15.1767 18.3105 15.0717 18.6224 14.9036C19.2073 14.5919 19.7337 14.1262 19.9247 13.4643C20.1158 12.8024 19.9481 12.025 19.3633 11.1461C19.3594 11.1356 19.3516 11.125 19.3477 11.1145C18.7628 10.2321 17.9752 9.76983 17.1524 9.68577C16.3258 9.59821 15.5343 9.83984 14.8013 10.148C14.2827 10.3721 13.9044 10.5402 13.6042 10.5963C13.304 10.6453 13.07 10.6348 12.645 10.4492L11.4597 9.82934L11.5143 11.934L16.4389 14.7635L16.4389 14.7635ZM17.1563 11.1951C18.1779 11.7519 18.5054 12.9425 17.8855 13.86L14.1891 11.8535C14.8052 10.936 16.1347 10.6418 17.1563 11.1951ZM8.31309 12.757C8.29359 13.1772 8.19223 13.3698 8.00117 13.5799C7.80232 13.79 7.4553 14.0071 6.98739 14.3083C6.33622 14.739 5.71626 15.2468 5.40434 15.9401C5.0885 16.637 5.17039 17.488 5.77087 18.3809C6.34795 19.2634 7.0264 19.7712 7.76722 19.9393C8.50416 20.1038 9.21382 19.9147 9.79479 19.6031C10.1145 19.435 10.3875 19.2004 10.5434 18.8887C10.6955 18.577 10.7306 18.2303 10.7111 17.8241L10.7072 17.8171L10.2783 12.1581L10.251 11.8219C10.2354 11.6503 10.3797 11.5033 10.5707 11.4892C10.598 11.4892 10.6214 11.4927 10.6487 11.4963H10.6604L10.5083 5.9423L10.0911 2.21631C10.0326 1.51593 9.87279 1.01168 9.63885 0.657979C9.48289 0.416349 9.28793 0.237764 9.06566 0.129193C8.84731 0.0206438 8.61337 -0.0108789 8.42231 0.00312395L7.9622 0.0311296L8.26243 10.8974L8.31312 12.7569L8.31309 12.757ZM8.98374 14.5989L9.13971 18.4755C7.94656 18.514 6.94448 17.6771 6.90549 16.609C6.86261 15.5374 7.79449 14.6374 8.98374 14.5989Z" fill="black"/>
          </svg>
        </button>
        
        <!-- 子序列箭头 - 保持水平箭头位置，进一步延长垂直线 -->
        <div v-if="['lf', 'mf', 'low_freq', 'mid_freq'].includes(series.type)" 
          class="ml-auto mr-4" style="position: absolute; right: 4px; z-index: 10;">
          
          <!-- 垂直线SVG - 从顶部到箭头位置 -->
          <svg width="24" height="40" viewBox="0 0 24 40" fill="none" xmlns="http://www.w3.org/2000/svg"
            style="position: absolute; top: -25px; right: 0;">
            <path d="M1.5 0L1.5 25" stroke="black" stroke-width="2"/>
          </svg>

          <!-- 向右箭头 (HF和MF) - 增加垂直线长度 -->
          <svg width="24" height="112" viewBox="0 0 24 112" fill="none" xmlns="http://www.w3.org/2000/svg">
            <!-- 将垂直线的起点进一步向上延伸 -->
            <path d="M1.5 -100L1.5 108" stroke="black" stroke-width="2"/>
            <path d="M23.7071 60.2071C24.0976 59.8166 24.0976 59.1834 23.7071 58.7929L17.3431 52.4289C16.9526 52.0384 16.3195 52.0384 15.9289 52.4289C15.5384 52.8195 15.5384 53.4526 15.9289 53.8431L21.5858 59.5L15.9289 65.1569C15.5384 65.5474 15.5384 66.1805 15.9289 66.5711C16.3195 66.9616 16.9526 66.9616 17.3431 66.5711L23.7071 60.2071ZM2 60.5H23V58.5H2V60.5Z" fill="black"/>
          </svg>
        </div>
        
        <div v-if="['hf', 'high_freq'].includes(series.type)" 
        class="ml-auto mr-4" style="position: absolute; right: 4px; z-index: 10;">
          
          <!-- 垂直线SVG - 从顶部到箭头位置 -->
          <svg width="24" height="54" viewBox="0 0 24 54" fill="none" xmlns="http://www.w3.org/2000/svg"
            style="position: absolute; top: -45px; right: 0;">
            <path d="M1.5 0L1.5 54" stroke="black" stroke-width="2"/>
          </svg>
          <!-- 向右下箭头 (LF) - 调整高度和位置 -->
          <svg width="24" height="75" viewBox="0 0 24 75" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M1.5 0L1.5 45.5" stroke="black" stroke-width="2"/>
            <path d="M1.5 44.5C0.947715 44.5 0.5 44.9477 0.5 45.5C0.5 46.0523 0.947715 46.5 1.5 46.5V44.5ZM23.2071 46.2071C23.5976 45.8166 23.5976 45.1834 23.2071 44.7929L16.8431 38.4289C16.4526 38.0384 15.8195 38.0384 15.4289 38.4289C15.0384 38.8195 15.0384 39.4526 15.4289 39.8431L21.0858 45.5L15.4289 51.1569C15.0384 51.5474 15.0384 52.1805 15.4289 52.5711C15.8195 52.9616 16.4526 52.9616 16.8431 52.5711L23.2071 46.2071ZM1.5 46.5H22.5V44.5H1.5V46.5Z" fill="black"/>
          </svg>
        </div>
      </div>
      
      <!-- 图表容器，使用新的SeriesViewChart组件 -->
      <div class="flex-1 relative" style="height: 70px">
        <!-- 替换为新组件 -->
        <SeriesViewChart
          :series="series"
          :height="70"
          :hoverTime="hoverTime"
          :isSelected="isSelected"
          :timeAxisConfig="timeAxisConfig"
        />
      </div>
      

    </div>

    <!-- 分解设置面板 -->
    <div v-if="showDecomposition" class="mt-4 p-2 bg-white rounded-lg" style="margin-left: 105px">
      <div class="flex flex-wrap items-center gap-8 px-2 py-1">
        <!-- 分解数量选择 -->
        <div class="relative">
          <div class="flex items-center gap-1">
            <span class="text-sm font-semibold text-gray-600">Decomposition number:</span>
            <button 
              @click="isDecompNumberOpen = !isDecompNumberOpen"
              :style="{ color: THEME_COLOR, borderBottomColor: THEME_COLOR }"
              class="flex items-center justify-between min-w-[45px] transition-colors duration-200 ml-1"
              :class="{ [`hover:text-[${THEME_COLOR_HOVER}]`]: true }"
            >
              <span class="text-sm font-semibold flex-1 text-center">{{ decompositionNumber }}</span>
              <!-- 下拉箭头 -->
              <svg 
                class="h-4 w-4 transition-transform duration-200 flex-shrink-0 ml-1"
                :class="{ 'rotate-180': isDecompNumberOpen }"
                viewBox="0 0 20 20"
                :style="{ color: THEME_COLOR }"
                fill="currentColor"
              >
                <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" />
              </svg>
            </button>
          </div>
          <div v-if="isDecompNumberOpen" 
            class="absolute top-full left-[175px] mt-1 w-[50px] bg-white rounded-lg shadow-lg py-1 z-20">
            <button
              v-for="num in [2, 3]"
              :key="num"
              @click="() => {
                decompositionNumber = num;
                isDecompNumberOpen = false;
              }"
              class="w-full px-3 py-1.5 text-center text-xs text-gray-700"
              :class="{ [`hover:text-[${THEME_COLOR}]`]: true }"
            >
              {{ num }}
            </button>
          </div>
        </div>
        
        <!-- 模型选择 -->
        <div class="relative">
          <div class="flex items-center gap-1">
            <span class="text-sm font-semibold text-gray-600">Model:</span>
            <button 
              @click="isModelOpen = !isModelOpen"
              :style="{ color: THEME_COLOR, borderBottom: `2px solid ${THEME_COLOR}`, height: '26px', lineHeight: '26px' }"
              class="flex items-center justify-between min-w-[80px] transition-colors duration-200 ml-2"
              :class="{ [`hover:text-[${THEME_COLOR_HOVER}]`]: true }"
            >
              <span class="text-sm font-semibold flex-1 text-center">{{ model }}</span>
              <!-- 下拉箭头 -->
              <svg 
                class="h-4 w-4 transition-transform duration-200 flex-shrink-0 ml-1"
                :class="{ 'rotate-180': isModelOpen }"
                viewBox="0 0 20 20"
                :style="{ color: THEME_COLOR }"
                fill="currentColor"
              >
                <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" />
              </svg>
            </button>
          </div>
          <div v-if="isModelOpen" 
            class="absolute top-full left-[52px] mt-1 w-[80px] bg-white rounded-lg shadow-lg py-1 z-20">
            <button
              v-for="option in ['sym8', 'db4']"
              :key="option"
              @click="() => {
                model = option;
                isModelOpen = false;
              }"
              class="w-full px-3 py-1.5 text-center text-xs text-gray-700"
              :class="{ [`hover:text-[${THEME_COLOR}]`]: true }"
            >
              {{ option }}
            </button>
          </div>
        </div>
        
        <!-- 级别滑块 -->
        <div class="flex items-center gap-1" style="width: 200px">
          <span class="text-sm font-semibold text-gray-600 mr-2">level:</span>
          <el-slider 
            v-model="level" 
            :min="3" 
            :max="10" 
            :step="1"
            :disabled="isDecomposing"
            class="compact-slider flex-1"
            :style="{
              '--el-slider-main-bg-color': THEME_COLOR_LIGHT,
              '--el-color-primary': THEME_COLOR
            }"
          />
          <span 
            class="text-sm font-semibold min-w-[20px] text-center ml-1"
            :style="{ color: THEME_COLOR }"
          >
            {{ level }}
          </span>
        </div>
        
        <!-- 操作按钮 -->
        <div class="flex items-center gap-2 ml-auto">
          <button
            @click="showDecomposition = false"
            class="p-0.5 rounded-full border border-gray-200 bg-white flex items-center justify-center w-7 h-7 hover:border-red-300"
            title="Cancel"
          >
            <img src="/src/assets/cancel.svg" alt="Cancel" class="w-5 h-5" />
          </button>
          <button
            @click="applyDecomposition"
            class="p-0.5 rounded-full border border-gray-200 bg-white flex items-center justify-center w-7 h-7 hover:border-green-300"
            :disabled="isDecomposing"
            title="Apply"
          >
            <img src="/src/assets/apply.svg" alt="Apply" class="w-5 h-5" />
          </button>
        </div>
      </div>
      <div v-if="isDecomposing" class="text-xs text-center mt-0.5" :style="{ color: THEME_COLOR }">Processing...</div>
    </div>

    <!-- 子序列框直接显示在原序列下方 -->

   
  </div>
</template>

<style scoped>
.time-series-tag {
  font-size: 14px;
  padding: 2px 8px;
  border-radius: 4px;
}

.time-series-tag.original {
  background-color: #F3F3F3;
  color: #707070;
}

.time-series-tag.lf {
  background-color: v-bind('THEME_COLOR_LIGHT');
  color: v-bind('THEME_COLOR');
}

.time-series-tag.mf {
  background-color: #F4ECFF;
  color: v-bind('THEME_COLOR');
}

.time-series-tag.hf {
  background-color: #E9DFFF;
  color: v-bind('THEME_COLOR');
}

.time-series-tag.low_freq {
  background-color: v-bind('THEME_COLOR_LIGHT');
  color: v-bind('THEME_COLOR');
}

.time-series-tag.mid_freq {
  background-color: #F4ECFF;
  color: v-bind('THEME_COLOR');
}

.time-series-tag.high_freq {
  background-color: #E9DFFF;
  color: v-bind('THEME_COLOR');
}

.time-series-item {
  border-left: 12px solid transparent;
  border-bottom: 1px solid #E5E7EB;
}

.time-series-item:hover {
  background-color: v-bind('THEME_COLOR_LIGHT');
  opacity: 0.85;
}

/* 添加滚动条样式 */
:deep(.el-scrollbar__bar) {
  opacity: 0.3;
}

:deep(.el-scrollbar__bar:hover) {
  opacity: 0.5;
}

:deep(.el-scrollbar__wrap) {
  overflow-x: hidden;
}

/* 修改滑块样式 */
.compact-slider :deep(.el-slider__runway) {
  height: 6px;
  margin: 12px 0;
  background-color: v-bind('THEME_COLOR_LIGHT');
  border-radius: 3px;
}

.compact-slider :deep(.el-slider__bar) {
  height: 6px;
  background-color: v-bind('THEME_COLOR');
  border-radius: 3px;
}

.compact-slider :deep(.el-slider__button-wrapper) {
  height: 20px;
  width: 20px;
  top: -8px;
}

.compact-slider :deep(.el-slider__button) {
  width: 14px;
  height: 14px;
  border: 2px solid v-bind('THEME_COLOR');
  background-color: white;
}

/* 添加下拉菜单的悬浮样式 */
.compact-slider :deep(.el-slider__button):hover {
  transform: scale(1.1);
}

/* 确保滑块在拖动时保持在顶部 */
.compact-slider :deep(.el-slider__button-wrapper) {
  z-index: 1;
}

/* 添加变量标签的样式 */
.variable-tag {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 4px;
}

/* 添加用户ID和日期标签样式 */
.user-tag, .date-tag {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 4px;
  background-color: #F3F3F3;
  color: #707070;
}

/* 变量标签样式 */
.variable-x {
  background-color: #E6F0FD;
  color: #1D4ED8;
}

.variable-y {
  background-color: #DCFCE7;
  color: #15803D;
}

.variable-z {
  background-color: #FEF3C7;
  color: #B45309;
}

/* 选中项的样式也可以使用v-bind */
.time-series-item.selected {
  background-color: v-bind('THEME_COLOR_LIGHT');
  border-left-color: v-bind('THEME_COLOR');
}

/* 为不可见序列添加特殊的hover样式 */
.time-series-item.cursor-not-allowed:hover {
  background-color: v-bind('THEME_COLOR_LIGHT');
  opacity: 0.85;
}
</style>