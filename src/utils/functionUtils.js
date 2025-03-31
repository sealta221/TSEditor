/**
 * 返回函数的防抖版本
 * @param {Function} fn - 要防抖的函数
 * @param {number} delay - 延迟时间(毫秒)
 * @returns {Function} 防抖后的函数
 */
export function debounce(fn, delay = 300) {
  let timer = null;
  return function(...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      fn.apply(this, args);
    }, delay);
  };
}

/**
 * 返回函数的节流版本
 * @param {Function} fn - 要节流的函数
 * @param {number} threshold - 时间阈值(毫秒)
 * @returns {Function} 节流后的函数
 */
export function throttle(fn, threshold = 300) {
  let last;
  let timer;
  return function(...args) {
    const now = Date.now();
    if (last && now < last + threshold) {
      clearTimeout(timer);
      timer = setTimeout(() => {
        last = now;
        fn.apply(this, args);
      }, threshold);
    } else {
      last = now;
      fn.apply(this, args);
    }
  };
} 