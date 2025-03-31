import axios from 'axios'

// Create axios instance with base URL
const instance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:1022/api',
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json'
  }
})

export const api = {
  get: (url, params) => instance.get(url, { params }),
  post: (url, data) => instance.post(url, data),
  put: (url, data) => instance.put(url, data),
  delete: (url) => instance.delete(url),
  
  // Add decomposition-specific method
  decomposeSeries: (values, options) => {
    return instance.post('/decompose', {
      values: values.map(point => point.value),
      decomp_number: options.decompositionNumber || 2,
      model: options.model ,
      level: options.level ,
      method: options.method 
    })
    .catch(error => {
      console.error('分解请求出错:', error);
      // 返回一个已解决的promise，防止未捕获的错误
      return Promise.resolve({
        data: null,
        error: error.message || '分解处理失败'
      });
    });
  }
}