<!-- 导航栏组件 -->
<template>
  <!-- 导航栏 -->
  <nav class="h-[6.0vh] bg-white shadow-md flex items-center px-4 gap-6" 
    :style="{
      borderBottomWidth: `${BORDER_WIDTH}px`,
      borderColor: BORDER_COLOR
    }"
  >
    <!-- Logo -->
    <img 
      src="../assets/TimeSeries Editor.svg" 
      alt="Time Series Editor" 
      class="h-[2vh] w-auto"
    />
    
    <!-- 数据集选择下拉框 -->
    <div class="flex items-center gap-2 h-full ml-6">
      <div class="relative h-[80%] flex">
        <button 
          @click="isOpen = !isOpen"
          :style="{
            borderColor: THEME_COLOR,
            color: THEME_COLOR
          }"
          class="flex items-center justify-between w-[150px] pb-0 hover:text-purple-600 transition-colors duration-200 border-b-2"
        >
          <span class="text-base font-semibold flex-1 text-center">{{ datasetStore.getCurrentDataset || 'Select Dataset' }}</span>
          <!-- 下拉箭头 -->
          <svg 
            :style="{ color: THEME_COLOR }"
            class="h-5 w-5 transition-transform duration-200 flex-shrink-0"
            :class="{ 'rotate-180': isOpen }"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" />
          </svg>
        </button>

        <!-- 下拉菜单 -->
        <div 
          v-if="isOpen"
          class="absolute top-full left-0 mt-1 w-[150px] bg-white rounded-lg shadow-lg py-1 z-10"
        >
          <button 
            v-for="option in datasets" 
            :key="option"
            @click="selectDataset(option)"
            :style="{
              '--hover-color': THEME_COLOR
            }"
            class="w-full px-4 py-2 text-center text-sm hover:text-[var(--hover-color)] text-gray-700 font-semibold"
          >
            {{ option }}
          </button>
        </div>
      </div>
    </div>
    <!-- 变量选择下拉框 (仅在 capture 数据集时显示) -->
    <div class="flex items-center gap-2 h-full" v-if="datasetStore.getCurrentDataset === 'capture'">
      <div class="relative h-[80%] flex">
        <button 
          @click="isVariableOpen = !isVariableOpen"
          :style="{
            borderColor: THEME_COLOR,
            color: THEME_COLOR
          }"
          class="flex items-center justify-between w-[60px] pb-0 hover:text-purple-600 transition-colors duration-200 border-b-2"
        >
          <span class="text-base font-semibold flex-1 text-center">{{ selectedVariable || 'x' }}</span>
          <!-- 下拉箭头 -->
          <svg 
            :style="{ color: THEME_COLOR }"
            class="h-5 w-5 transition-transform duration-200 flex-shrink-0"
            :class="{ 'rotate-180': isVariableOpen }"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" />
          </svg>
        </button>

        <!-- 变量下拉菜单 -->
        <div 
          v-if="isVariableOpen"
          class="absolute top-full left-0 mt-1 w-[60px] bg-white rounded-lg shadow-lg py-1 z-10"
        >
          <button 
            v-for="option in variables" 
            :key="option"
            @click="selectVariable(option)"
            :style="{
              '--hover-color': THEME_COLOR
            }"
            class="w-full px-4 py-2 text-center text-sm hover:text-[var(--hover-color)] text-gray-700 font-semibold"
          >
            {{ option }}
          </button>
        </div>
      </div>
    </div>

    <!-- 聚合方式切换 Tab -->
    <div class="flex bg-gray-100 p-1 rounded-full" v-if="datasetStore.getCurrentDataset !== 'capture'">
      <button
        v-for="option in aggregationOptions"
        :key="option.value"
        @click="selectAggregation(option.value)"
        :style="{
          '--text-color': THEME_COLOR
        }"
        class="px-4 py-1.5 text-sm font-semibold rounded-full transition-colors duration-200"
        :class="[
          currentAggregation === option.value
            ? 'bg-white text-[var(--text-color)] shadow-sm'
            : 'text-gray-600 hover:text-[var(--text-color)]'
        ]"
      >
        {{ option.label }}
      </button>
    </div>

    <!-- 工作日/周末筛选 -->
    <div class="flex items-center gap-4">
      <button
        @click="datasetStore.setShowWeekday(!datasetStore.getShowWeekday)"
        :style="{
          borderColor: getWeekdayButtonColor(),
          color: getWeekdayButtonColor(),
        }"
        class="px-4 py-1.5 rounded-full text-base font-semibold transition-all duration-200 hover:opacity-90 border-2"
        :disabled="datasetStore.getCurrentDataset === 'capture'"
      >
        Weekday
      </button>
      <button
        @click="datasetStore.setShowWeekend(!datasetStore.getShowWeekend)"
        :style="{
          borderColor: getWeekendButtonColor(),
          color: getWeekendButtonColor(),
        }"
        class="px-4 py-1.5 rounded-full text-base font-semibold transition-all duration-200 hover:opacity-90 border-2"
        :disabled="datasetStore.getCurrentDataset === 'capture'"
      >
        Weekend
      </button>
    </div>

    <!-- Spacer -->
    <div class="flex-1"></div>

    <!-- Action buttons -->
    <div class="flex gap-6 mr-6">
      <!-- 添加同步按钮 -->
      <el-tooltip
        content="Sync"
        placement="bottom"
        :show-after="100"
        :hide-after="0"
      >
        <button
          @click="handleSyncClick"
          :disabled="isUpdating"
          class="w-10 h-10 rounded-lg flex items-center justify-center bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-all duration-200 hover:scale-105 hover:shadow-sm no-drag"
        >
          <img src="@/assets/sync.svg" alt="Sync" class="w-10 h-10 no-drag" />
        </button>
      </el-tooltip>

      <el-tooltip
        content="Undo"
        placement="bottom"
        :show-after="100"
        :hide-after="0"
      >
        <button
          class="w-10 h-10 rounded-lg flex items-center justify-center bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-all duration-200 hover:scale-105 hover:shadow-sm no-drag"
          :disabled="!timeSeriesStore.canUndo"
          @click="timeSeriesStore.undo"
        >
          <img src="@/assets/undo.svg" alt="Undo" class="w-10 h-10 no-drag" />
        </button>
      </el-tooltip>

      <el-tooltip
        content="Redo"
        placement="bottom"
        :show-after="100"
        :hide-after="0"
      >
        <button
          class="w-10 h-10 rounded-lg flex items-center justify-center bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-all duration-200 hover:scale-105 hover:shadow-sm no-drag"
          :disabled="!timeSeriesStore.canRedo"
          @click="timeSeriesStore.redo"
        >
          <img src="@/assets/redo.svg" alt="Redo" class="w-10 h-10 no-drag" />
        </button>
      </el-tooltip>

      <!-- 修改导出按钮，添加下拉菜单 -->
      <el-dropdown @command="handleExportCommand" trigger="click">
        <button
          class="w-10 h-10 rounded-lg flex items-center justify-center bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-all duration-200 hover:scale-105 hover:shadow-sm no-drag"
        >
          <img src="@/assets/export.svg" alt="Export" class="w-10 h-10 no-drag" />
        </button>
        
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="history">Export Edit History</el-dropdown-item>
            <el-dropdown-item command="data">Export Edited Data</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
  </nav>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { BORDER_WIDTH, BORDER_COLOR, THEME_COLOR, WEEKDAY_COLOR, WEEKEND_COLOR } from '../utils/constants';
import { useDatasetStore } from '../stores/datasetStore';
import { useTimeSeriesStore } from '../stores/timeSeriesStore';
import { ElMessage } from 'element-plus';
import { downloadCSV } from '../utils/csvUtils';

const datasetStore = useDatasetStore();
const timeSeriesStore = useTimeSeriesStore();
const isOpen = ref(false);
const isVariableOpen = ref(false);
const datasets = ['step', 'electricity', 'capture'];
const variables = ['x', 'y', 'z'];
const selectedVariable = ref('x');
const isUpdating = ref(false);

// 聚合方式选项
const aggregationOptions = [
  { label: 'Day', value: 'day' },
  { label: 'Week', value: 'week' },
  { label: 'Month', value: 'month' },
  { label: 'Year', value: 'year' }
];

// 当前选中的聚合方式
const currentAggregation = ref('day');

// 切换聚合方式 (仅更新UI状态，不触发实际功能)
const selectAggregation = (value) => {
  currentAggregation.value = value;
  // 不触发任何实际的聚合功能
};

const selectDataset = (dataset) => {
  // 如果切换到非 capture 数据集，重置变量选择
  if (dataset !== 'capture') {
    selectedVariable.value = 'x';
  }
  else{
    datasetStore.setShowWeekday(true);
    datasetStore.setShowWeekend(true);
  }
  datasetStore.setDataset(dataset);
  isOpen.value = false;
  

};

// 选择变量
const selectVariable = (variable) => {
  selectedVariable.value = variable;
  isVariableOpen.value = false;
  // 触发事件，通知相关组件变量已更改
  datasetStore.setSelectedVariable(variable);
};

// 点击外部关闭下拉框
const handleClickOutside = (event) => {
  if (isOpen.value && !event.target.closest('.relative')) {
    isOpen.value = false;
  }
  
  // 添加变量下拉框的点击外部关闭逻辑
  if (isVariableOpen.value && !event.target.closest('.relative')) {
    isVariableOpen.value = false;
  }
};

// 添加和移除全局点击事件监听器
onMounted(() => {
  document.addEventListener('click', handleClickOutside);
  window.addEventListener('matrix-loading-changed', handleLoadingChanged);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
  window.removeEventListener('matrix-loading-changed', handleLoadingChanged);
});

// 处理loading状态变化
const handleLoadingChanged = (event) => {
  const { loading } = event.detail;
  if (loading === false) {
    isUpdating.value = false;
  }
};

// 工作日按钮颜色
const getWeekdayButtonColor = () => {
  if (datasetStore.getShowWeekday) {
      return WEEKDAY_COLOR;
  }
  // 未选中时使用灰色
  return '#E5E5E5';
};

// 周末按钮颜色
const getWeekendButtonColor = () => {
  if (datasetStore.getShowWeekend) {
    return WEEKEND_COLOR;
  }
  // 未选中时使用灰色
  return '#E5E5E5';
};

// 获取所有 origin 类型的曲线数据
const getOriginSeriesData = () => {
  return timeSeriesStore.series.filter(s => s.type === 'original');
};

// 修改 handleSyncClick 函数，添加变量信息
const handleSyncClick = async () => {
  if (isUpdating.value) return;
  isUpdating.value = true;
  
  try {
    // 开始加载状态
    window.dispatchEvent(new CustomEvent('matrix-loading-changed', {
      detail: { loading: true }
    }));

    // 从时间序列存储获取所有数据
    const allSeries = timeSeriesStore.series;
    
    if (!allSeries || allSeries.length === 0) {
      ElMessage.warning('No data to sync');
      isUpdating.value = false;
      return;
    }

    // 按用户和日期分组数据
    const groupedData = {};
    
    // 遍历所有序列
    allSeries.forEach(series => {
      // 跳过隐藏的系列和子系列
      if (series.parentId) return;
      
      // 提取用户ID
      const match = series.id.match(/user[_]?(\d+)/);
      if (!match) return;
      
      const userId = parseInt(match[1]);
      if (isNaN(userId)) return;
      
      // 确定日期
      let date = series.date || '';
      if (!date && datasetStore.getCurrentDataset !== 'capture') {
        // 对于非capture数据集，如果没有日期则跳过
        return;
      }
      
      // 提取变量信息
      let variable = null;
      if (datasetStore.getCurrentDataset === 'capture') {
        // 如果是capture数据集，直接使用序列的variable属性
        variable = series.variable || 'x'; // 默认为x
      }
      
      // 创建用户+日期+变量的唯一键
      const key = `${userId}_${date}_${variable || ''}`;
      if (!groupedData[key]) {
        groupedData[key] = {
          id: userId,
          date: date,
          data: []
        };
        
        // 只有capture数据集才添加变量属性
        if (datasetStore.getCurrentDataset === 'capture' && variable) {
          groupedData[key].variable = variable;
        }
      }
      
      // 处理数据点，确保有正确的格式
      series.data.forEach(point => {
        // 确保时间格式为 HH:MM
        let timeStr;
        if (typeof point.time === 'number') {
          const hours = Math.floor(point.time);
          const minutes = Math.round((point.time - hours) * 60);
          timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
        } else {
          timeStr = point.time;
        }
        
        // 添加到分组数据中
        groupedData[key].data.push({
          time: timeStr,
          value: point.value
        });
      });
    });
    
    // 转换为数组格式
    const transData = Object.values(groupedData);
    
    // 在控制台输出传递的数据
    console.log('同步传递的数据:', transData);
    
    // 更新数据存储
    datasetStore.setTransData(transData);
    datasetStore.updateEditedDataFromTrans();
    
    ElMessage.success('Data synced successfully');
  } catch (error) {
    console.error('Sync error:', error);
    ElMessage.error('Failed to sync data');
  } finally {
    isUpdating.value = false;
  }
};

// 修改辅助函数：将小数形式的小时转换为HH:MM格式（不包含秒）
const convertDecimalHoursToHHMM = (decimalHours) => {
  if (decimalHours === null || decimalHours === undefined || isNaN(decimalHours)) {
    return "00:00";
  }
  
  // 确保输入在0-24小时范围内
  decimalHours = Math.max(0, Math.min(24, decimalHours));
  
  const hours = Math.floor(decimalHours);
  const minutes = Math.floor((decimalHours - hours) * 60);
  
  // 格式化为两位数
  const formattedHours = String(hours).padStart(2, '0');
  const formattedMinutes = String(minutes).padStart(2, '0');
  
  return `${formattedHours}:${formattedMinutes}`;
};

// 修改导出编辑历史函数，使用新的时间格式函数和更好的日期处理
const exportEditHistory = () => {
  // 获取编辑历史的副本，而不是直接使用原始历史
  const history = JSON.parse(JSON.stringify(timeSeriesStore.exportEditHistory()));
  
  // 格式化为新的数据结构
  const formattedOperations = history.operations.map(op => {
    // 收集所有被编辑序列的数据
    const allSeriesData = [];
    
    // 处理每个被编辑的序列
    if (op.seriesIds && op.seriesIds.length > 0) {
      op.seriesIds.forEach(seriesId => {
        // 查找存储中的实际序列对象，以获取日期和其他属性
        const seriesObj = timeSeriesStore.series.find(s => s.id === seriesId);
        
        // 从seriesId中提取用户ID和日期
        const fullMatch = seriesId.match(/^user[_]?(\d+)[_]?(\d{4}[-]?\d{1,2}[-]?\d{1,2})$/);
        const userOnlyMatch = seriesId.match(/^user[_]?(\d+)$/);
        
        let userId = '';
        let dateStr = '';
        
        // 优先使用序列对象中的日期
        if (seriesObj && seriesObj.date) {
          dateStr = seriesObj.date;
          
          // 从ID提取用户ID
          const idMatch = seriesId.match(/user[_]?(\d+)/);
          userId = idMatch ? idMatch[1] : seriesId;
        } else if (fullMatch) {
          userId = fullMatch[1];
          dateStr = fullMatch[2];
        } else if (userOnlyMatch) {
          userId = userOnlyMatch[1];
          // 如果没有日期信息，使用当前日期作为默认值
          dateStr = new Date().toISOString().split('T')[0];
        } else {
          userId = seriesId;
          dateStr = new Date().toISOString().split('T')[0];
        }
        
        // 获取该序列的操作前后数据
        let valuesBefore = [];
        let valuesAfter = [];
        
        if (op.beforeData && op.afterData) {
          // 确保序列数据存在并正确处理
          const beforeSeriesData = op.beforeData[seriesId] || [];
          const afterSeriesData = op.afterData[seriesId] || [];
          
          if (op.timeRange) {
            // 获取操作影响的时间范围内的数据点
            valuesBefore = beforeSeriesData
              .filter(point => point && point.time >= op.timeRange.start && point.time <= op.timeRange.end)
              .map(point => point.value);
            
            valuesAfter = afterSeriesData
              .filter(point => point && point.time >= op.timeRange.start && point.time <= op.timeRange.end)
              .map(point => point.value);
          }
        }
        
        // 添加变量信息（针对capture数据集）
        let variable = null;
        if (seriesObj && seriesObj.variable) {
          variable = seriesObj.variable;
        }
        
        // 添加到序列数据集合中
        const seriesData = {
          id: userId,
          date: dateStr,
          valuesBefore,
          valuesAfter
        };
        
        // 仅在变量存在时添加此属性
        if (variable) {
          seriesData.variable = variable;
        }
        
        allSeriesData.push(seriesData);
      });
    }
    
    // 构建时间范围
    let rangeBefore = [];
    let rangeAfter = [];
    
    if (op.timeRange) {
      if (op.type === 'move-x') {
        // 对于move-x操作，使用初始状态的时间范围
        if (op.params && op.params.initialState && op.params.initialState.timeRange) {
          rangeBefore = [[
            convertDecimalHoursToHHMM(op.params.initialState.timeRange.start),
            convertDecimalHoursToHHMM(op.params.initialState.timeRange.end)
          ]];
          
          rangeAfter = [[
            convertDecimalHoursToHHMM(op.timeRange.start),
            convertDecimalHoursToHHMM(op.timeRange.end)
          ]];
        } else {
          // 如果没有初始状态，使用标准时间范围
          const timeRange = [
            convertDecimalHoursToHHMM(op.timeRange.start),
            convertDecimalHoursToHHMM(op.timeRange.end)
          ];
          rangeBefore = [timeRange];
          rangeAfter = [timeRange];
        }
      } else if (op.type === 'move-y' || op.type === 'move-xy') {
        // 对于move-y和move-xy操作，使用相同的时间范围
        const timeRange = [
          convertDecimalHoursToHHMM(op.timeRange.start),
          convertDecimalHoursToHHMM(op.timeRange.end)
        ];
        rangeBefore = [timeRange];
        rangeAfter = [timeRange];
      } else if (op.type === 'clone') {
        // 添加对克隆操作的特殊处理
        // 源范围作为rangeBefore
        rangeBefore = [[
          convertDecimalHoursToHHMM(op.timeRange.start),
          convertDecimalHoursToHHMM(op.timeRange.end)
        ]];
        
        // 目标范围作为rangeAfter，从params中获取
        if (op.params && op.params.targetTimeRange) {
          rangeAfter = [[
            convertDecimalHoursToHHMM(op.params.targetTimeRange.start),
            convertDecimalHoursToHHMM(op.params.targetTimeRange.end)
          ]];
        } else if (op.params && op.params.sourceRange && op.params.targetRange) {
          // 使用更新的参数格式，这是在TimeSeriesEditor.vue中使用的格式
          rangeAfter = [[
            convertDecimalHoursToHHMM(op.params.targetRange.start),
            convertDecimalHoursToHHMM(op.params.targetRange.end)
          ]];
        } else {
          // 如果没有目标范围参数，则使用与源相同的范围
          rangeAfter = [...rangeBefore];
          console.warn('Clone operation missing target range information');
        }
      } else if (op.type === 'expand' && op.params && op.params.selections) {
        // 对于expand操作，包含所有选择的范围
        rangeBefore = op.params.selections.map(sel => [
          convertDecimalHoursToHHMM(sel.start),
          convertDecimalHoursToHHMM(sel.end)
        ]);
        rangeAfter = [...rangeBefore];
      } else {
        // 其他操作使用标准时间范围
        const timeRange = [
          convertDecimalHoursToHHMM(op.timeRange.start),
          convertDecimalHoursToHHMM(op.timeRange.end)
        ];
        rangeBefore = [timeRange];
        rangeAfter = [timeRange];
      }
    }
    
    // 构建最终的操作记录
    return {
      operation: op.type === 'replace' ? 'removal' : op.type,
      series: allSeriesData.map(seriesData => {
        const result = {
          id: seriesData.id,
          date: seriesData.date,
          range_before: rangeBefore,
          range_after: rangeAfter,
          value_before_edit: seriesData.valuesBefore,
          value_after_edit: seriesData.valuesAfter
        };
        
        // 仅当变量存在时才添加
        if (seriesData.variable) {
          result.variable = seriesData.variable;
        }
        
        return result;
      })
    };
  });
  
  // 过滤掉没有有效数据的操作记录
  const validOperations = formattedOperations.filter(
    op => op.series && op.series.length > 0 && 
    op.series.some(s => 
      (s.value_before_edit && s.value_before_edit.length > 0) || 
      (s.value_after_edit && s.value_after_edit.length > 0)
    )
  );
  
  // 转换为JSON字符串并下载
  const historyJson = JSON.stringify(validOperations, null, 2);
  const blob = new Blob([historyJson], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `time-series-edit-history-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
  
  ElMessage.success('export successfully');
};

// 添加处理导出命令的函数
const handleExportCommand = (command) => {
  if (command === 'history') {
    exportEditHistory();
  } else if (command === 'data') {
    exportEditedData();
  }
};

// 修改导出编辑数据的函数
const exportEditedData = () => {
  const editedData = datasetStore.getEditedData;
  const dataset = datasetStore.getCurrentDataset;
  
  if (!editedData || editedData.length === 0) {
    ElMessage.warning('No data to export');
    return;
  }
  
  // 将数据转换为CSV格式
  let csvContent = [];
  
  // 根据数据集类型设置不同的CSV头
  let headers;
  if (dataset === 'capture') {
    headers = ['Id', 'Time', 'x', 'y', 'z', 'annotation'];
  } else {
    headers = ['Id', 'Time', 'Value'];
  }
  csvContent.push(headers.join(','));
  
  // 添加数据行
  editedData.forEach(user => {
    // 创建一个映射，按时间组织数据点
    const timeMap = {};
    
    user.data.forEach(point => {
      // 确保有完整的时间格式 (日期 + 时间)
      let fullTime = point.time;
      if (!fullTime.includes(' ') && user.date) {
        fullTime = `${user.date} ${point.time}`;
      }
      
      // 初始化时间点数据
      if (!timeMap[fullTime]) {
        if (dataset === 'capture') {
          timeMap[fullTime] = {
            x: null,
            y: null,
            z: null,
            annotation: point.annotation || ''
          };
        } else {
          timeMap[fullTime] = {
            value: point.value
          };
        }
      }
      
      // capture数据集需要处理多个变量
      if (dataset === 'capture') {
        const variable = point.variable || datasetStore.selectedVariable;
        if (variable && ['x', 'y', 'z'].includes(variable)) {
          timeMap[fullTime][variable] = point.value;
        }
      }
    });
    
    // 将数据点转换为CSV行
    Object.entries(timeMap).forEach(([time, data]) => {
      if (dataset === 'capture') {
        csvContent.push([
          user.id,
          time,
          data.x !== null ? data.x : '',
          data.y !== null ? data.y : '',
          data.z !== null ? data.z : '',
          data.annotation || ''
        ].join(','));
      } else {
        csvContent.push([
          user.id,
          time,
          data.value
        ].join(','));
      }
    });
  });
  
  // 下载CSV文件
  const blob = new Blob([csvContent.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `edited_data_${dataset}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
  
  ElMessage.success('Data exported successfully');
};
</script> 

<style scoped>
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
</style>

