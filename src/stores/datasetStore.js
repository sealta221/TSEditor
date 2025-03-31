import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { ElMessage } from 'element-plus';

export const useDatasetStore = defineStore('dataset', () => {
  const currentDataset = ref('');
  const aggregationLevel = ref('day');
  const selectedVariable = ref('x'); // 添加选中的变量状态
  const showWeekday = ref(true); // 添加工作日显示状态
  const showWeekend = ref(true); // 添加周末显示状态
  const selectedUserId = ref(null); // 添加当前选中的用户ID
  const selectedView = ref(null); // 添加当前选中的视图
  const originalData = ref([]); // 原始完整数据集
  const editedData = ref([]); // 编辑后的完整数据集
  const transData = ref([]); // 当前正在编辑的部分时间序列数据

  // 计算属性
  const getCurrentDataset = computed(() => currentDataset.value);
  const getShowWeekday = computed(() => showWeekday.value);
  const getShowWeekend = computed(() => showWeekend.value);
  const getSelectedUserId = computed(() => selectedUserId.value);
  const getSelectedView = computed(() => selectedView.value);
  const getOriginalData = computed(() => originalData.value);
  const getEditedData = computed(() => editedData.value);
  const getTransData = computed(() => transData.value);

  // 方法
  function setDataset(dataset) {
    currentDataset.value = dataset;
  }

  function setAggregationLevel(level) {
    aggregationLevel.value = level;
  }

  // 添加设置选中变量的方法
  function setSelectedVariable(variable) {
    selectedVariable.value = variable;
  }

  // 添加设置工作日/周末显示状态的方法
  function setShowWeekday(show) {
    showWeekday.value = show;
    if (!showWeekday.value && !showWeekend.value) {
      showWeekend.value = true;
      showWeekday.value = true;
    }
  }

  function setShowWeekend(show) {
    showWeekend.value = show;
    if (!showWeekday.value && !showWeekend.value) {
      showWeekend.value = true;
      showWeekday.value = true;
    }
  }

  // 添加设置选中用户的方法
  function setSelectedUserId(userId) {
    selectedUserId.value = userId;
  }

  function setSelectedView(view) {
    selectedView.value = view;
  }

  // 设置原始数据，同时初始化编辑数据
  function setOriginalData(data) {
    // 设置原始数据
    originalData.value = data;
    // 初始化编辑数据为原始数据的深拷贝
    editedData.value = JSON.parse(JSON.stringify(data));
  }

  // 设置传输数据（部分时间序列）
  function setTransData(data) {
    transData.value = data;
  }

  // 根据传输数据更新编辑后的数据
  function updateEditedDataFromTrans() {
    console.time('updateEditedDataFromTrans');
    
    // 注意：不再在这里触发loading状态，由NavBar的handleSyncClick负责
    
    if (!transData.value || !transData.value.length) {
      console.warn('No trans data to update edited data');
      
      // 仍在没有数据时关闭loading状态
      window.dispatchEvent(new CustomEvent('matrix-loading-changed', {
        detail: { loading: false }
      }));
      
      return;
    }

    try {
      // 创建一个新的引用而不是深拷贝
      const newEditedData = editedData.value;
      
      // 创建用户索引映射
      const userIndexMap = new Map();
      newEditedData.forEach((user, index) => {
        userIndexMap.set(user.id, index);
      });

      // 遍历每条传输数据
      transData.value.forEach(transSeries => {
        const { id, date, data } = transSeries;
        
        // 使用Map快速查找用户索引
        const userIndex = userIndexMap.get(id);
        
        if (userIndex === undefined) {
          console.warn(`User ${id} not found in edited data`);
          return;
        }

        // 获取该用户的数据引用
        const userData = newEditedData[userIndex].data;
        
        // 解析日期范围
        const [targetDate] = date.split(' '); // 提取日期部分
        
        // 创建时间索引映射，使用日期+时间作为键
        const timeIndexMap = new Map();
        userData.forEach((point, index) => {
          const [pointDate] = point.time.split(' '); // 提取数据点的日期部分
          if (pointDate === targetDate) {
            timeIndexMap.set(point.time, index);
          }
        });

        // 批量收集新数据点
        const newPoints = [];
        const updatedIndices = new Set();
        
        // 更新数据点
        data.forEach(transPoint => {
          // 确保时间格式包含日期
          const timeKey = transPoint.time.includes(' ') ? 
            transPoint.time : 
            `${targetDate} ${transPoint.time}`;
          
          const existingIndex = timeIndexMap.get(timeKey);
          
          if (existingIndex !== undefined) {
            // 直接更新现有数据点的值
            userData[existingIndex].value = transPoint.value;
            updatedIndices.add(existingIndex);
          } else {
            // 收集新数据点
            newPoints.push({
              time: timeKey,
              value: transPoint.value
            });
          }
        });

        // 一次性添加所有新数据点
        if (newPoints.length > 0) {
          userData.push(...newPoints);
          
          // 只在有新数据点时才进行排序
          userData.sort((a, b) => a.time.localeCompare(b.time));
        }
      });

      // 触发数据更新事件
      window.dispatchEvent(new CustomEvent('data-updated', {
        detail: {
          editedData: newEditedData
        }
      }));
      
      
      // 不在这里关闭loading状态，由MatrixChart的handleDataUpdate来关闭
    } catch (error) {
      console.error('Error updating edited data:', error);
      ElMessage.error('Error updating data');
      
      // 出错时关闭loading状态
      window.dispatchEvent(new CustomEvent('matrix-loading-changed', {
        detail: { loading: false }
      }));
    }
    // 不使用finally块，让handleDataUpdate处理关闭loading状态
  }
  

  return {
    currentDataset,
    aggregationLevel,
    selectedVariable,
    showWeekday,
    showWeekend,
    selectedUserId,
    originalData,
    editedData,
    transData,
    getCurrentDataset,
    getShowWeekday,
    getShowWeekend,
    getSelectedUserId,
    getSelectedView,
    getOriginalData,
    getEditedData,
    getTransData,
    setDataset,
    setAggregationLevel,
    setSelectedVariable,
    setShowWeekday,
    setShowWeekend,
    setSelectedUserId,
    setSelectedView,
    setOriginalData,
    setTransData,
    updateEditedDataFromTrans,
  };
}); 