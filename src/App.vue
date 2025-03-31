<script setup>
import ProjectionView from './components/ProjectionView.vue';
import EditView from './components/EditView.vue';
import { BORDER_WIDTH, BORDER_COLOR } from './utils/constants';
import MatrixChart from './components/MatrixChart.vue';
import NavBar from './components/NavBar.vue';
import RadialView from './components/RadialView.vue';
import { THEME_COLOR, THEME_COLOR_LIGHT } from '@/utils/constants';
import { ref, onMounted, onUnmounted } from 'vue';
import { useDatasetStore } from './stores/datasetStore';

// 添加loading状态
const datasetStore = useDatasetStore();
const isLeftSideLoading = ref(false);

// 组件挂载后添加事件监听
onMounted(() => {
  // 监听MatrixChart组件的loading状态变化事件
  window.addEventListener('matrix-loading-changed', handleMatrixLoadingChanged);
});

// 组件卸载前移除事件监听
onUnmounted(() => {
  window.removeEventListener('matrix-loading-changed', handleMatrixLoadingChanged);
});

// 处理MatrixChart组件loading状态变化的函数
const handleMatrixLoadingChanged = (event) => {
  const { loading } = event.detail;
  
  // 直接设置loading状态
  isLeftSideLoading.value = loading;
};
</script>

<template>
  <div class="h-screen flex flex-col overflow-hidden">
    <NavBar />

    <div class="flex flex-1 overflow-hidden">
      <aside class="w-[40%] flex flex-col relative" 
            :style="{
              borderRightWidth: `${BORDER_WIDTH}px`,
              borderColor: BORDER_COLOR
            }">
        
        <!-- 统一的loading遮罩 -->
        <div v-show="isLeftSideLoading" class="absolute inset-0 bg-white/80 flex items-center justify-center z-[100]">
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
        
        <div class="flex-1 bg-white" 
            :style="{
              borderBottomWidth: `${BORDER_WIDTH}px`,
              borderColor: BORDER_COLOR
            }">
          <MatrixChart />
        </div>
        <div class="flex flex-1">
          <!-- 左右结构1:1 -->
          <div class="w-[55%] bg-white" 
              :style="{
                borderRightWidth: `${BORDER_WIDTH}px`,
                borderColor: BORDER_COLOR
              }">
            <RadialView />
          </div>
          <div class="w-[45%] bg-white" 
              :style="{
                borderColor: BORDER_COLOR
              }">
            <ProjectionView />
          </div>
        </div>
      </aside>

      <!-- 右侧区域 - 66.67% -->
      <main class="w-[60%] bg-gray-100 flex flex-col">
        <!-- 上部区域 -->
        <div class="h-full bg-white" 
            :style="{
              // borderBottomWidth: `${BORDER_WIDTH}px`,
              borderColor: BORDER_COLOR
            }">
          <EditView />
        </div>
      </main>
    </div>
  </div>
</template>

<style scoped>
[style*="border"] {
  border-style: solid;
}

/* 添加全局文字不可选中样式 */
:global(*) {
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
}
</style>