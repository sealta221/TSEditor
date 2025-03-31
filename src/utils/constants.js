// example
export const TABLE_WIDTH = 20;
export const ORIGINAL_HEIGHT = 40;
export const BORDER_WIDTH = 3;
export const BORDER_COLOR = "#EAEAEA";

// 主题色配置
export const THEME_COLOR = "#8B5FFF";
export const THEME_COLOR_HOVER = "#9D79FF";
export const THEME_COLOR_LIGHT = "#F5F2FE";

// 投影视图配置
export const PROJECTION_VIEW = {
  CLUSTER_COLOR: "#141B41",  // 簇的颜色
};

// 环形图的绿色渐变色数组
export const GREEN_GRADIENT_COLORS = [
  '#f7fcf5',
  '#e5f5e0',
  '#c7e9c0',
  '#a1d99b',
  '#74c476',
  '#41ab5d',
  '#238b45',
  '#006d2c',
  '#00441b'
];
export const WEEKDAY_COLOR = "#D4A554";
export const WEEKEND_COLOR = "#70AAB5";
// MatrixChart 配置
export const MATRIX_CHART = {
  // 用户条带高度(像素)
  USER_STRIP_HEIGHT: 150,
  
  // 颜色配置
  COLORS: {
    WEEKDAY_LINE: WEEKDAY_COLOR,     // 工作日线条颜色
    WEEKEND_LINE: WEEKEND_COLOR,     // 周末线条颜色
    MAIN_LINE: '#666666',        // 主数据线颜色
    AVERAGE_LINE: '#666666',     // 平均值线条颜色
    BOX_PLOT: '#F5F2FE',         // 箱线图填充颜色
    GRID_LINE: '#e5e7eb',        // 网格线颜色
    USER_LABEL: '#374151',       // 用户标签文字颜色
    TIME_LABEL: '#6b7280',       // 时间标签文字颜色
    HIGHLIGHT_BG: 'yellow',      // 高亮背景颜色
  },

  // 线条样式
  LINE_STYLES: {
    MAIN_LINE_WIDTH: 1.5,          // 主数据线宽度
    WEEK_LINE_WIDTH: 1.5,        // 周数据线宽度
    WEEK_LINE_HIGHLIGHT_WIDTH: 3, // 周数据线高亮宽度
    AVERAGE_LINE_WIDTH: 1.5,     // 平均值线宽度
    BOX_PLOT_LINE_WIDTH: 2,      // 箱线图线条宽度
    GRID_LINE_WIDTH: 0.5,        // 网格线宽度
    DASH_ARRAY: '5,3',          // 虚线样式配置
  },

  // 透明度
  OPACITY: {
    WEEK_LINE_NORMAL: 1,         // 周数据线正常透明度
    WEEK_LINE_DIMMED: 0.2,       // 周数据线暗淡透明度
    AVERAGE_LINE: 0.6,           // 平均值线透明度
    HIGHLIGHT_BG: 0.1,           // 高亮背景透明度
  },

  // 动画时间
  ANIMATION: {
    HIGHLIGHT_DURATION: 800,     // 高亮动画持续时间(ms)
    SCROLL_BEHAVIOR: 'smooth',   // 滚动行为
  },

  // 布局相关
  LAYOUT: {
    MARGIN_LEFT: 60,            // 左边距
    MARGIN_RIGHT: 20,           // 右边距
    MARGIN_TOP: 10,             // 上边距
    MARGIN_BOTTOM: 10,          // 下边距
    BOX_WIDTH_RATIO: 0.3,       // 箱线图宽度比例
  },

  // 网格配置
  GRID: {
    X_TICKS: 12,               // X轴网格线数量（每两小时一条）
    Y_TICKS: 5,                // Y轴网格线数量
    DASH_ARRAY: '3,3',         // 网格线虚线样式
  },

  // 字体配置
  FONTS: {
    USER_LABEL_SIZE: '14px',   // 用户标签字体大小
    TIME_LABEL_SIZE: '10px',   // 时间标签字体大小
    USER_LABEL_WEIGHT: 'bold', // 用户标签字体粗细
  },

  // 工作日配置
  WEEKDAYS: {
    NAMES: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'],
    WEEKEND_INDICES: [5, 6],   // 周末的索引（周六和周日）
  }
};
