import request from '@/utils/request'

const API = {
  GET_DATA_ORIGINAL_URL: '/data/original',
  GET_DATA_ORIGINAL_MULTIPLE_URL: '/data/original/multiple',
  GET_DATA_DAY_URL: '/data/day',
  GET_DATA_DAY_MULTIPLE_URL: '/data/day/multiple',
  GET_DATA_WEEK_URL: '/data/week',
  GET_DATA_ALL_USER_WEEK_URL: '/data/allUsers/week',
  GET_DATA_ALL_USER_WEEK_MULTIPLE_URL: '/data/allUsers/week/multiple',
  GET_DATA_DISTRIBUTION_URL: '/data/distribution',
  GET_DATA_PROJECTION_URL: '/data/projection',
  GET_DATA_CLUSTER_URL: '/data/cluster',
  // 复合接口
  GET_DATA_MIX_URL: '/data/mix',
}

export const reqDataOriginal = (dataset) => request.get(API.GET_DATA_ORIGINAL_URL + `?dataset=${dataset}`)  
export const reqDataOriginalMultiple = (dataset, variable) => request.get(API.GET_DATA_ORIGINAL_MULTIPLE_URL + `?dataset=${dataset}&variable=${variable}`)
export const reqDataDay = (dataset, dayType = 'day') => request.get(API.GET_DATA_DAY_URL + `?dataset=${dataset}&dayType=${dayType}`)  
export const reqDataDayMultiple = (dataset, variable) => request.get(API.GET_DATA_DAY_MULTIPLE_URL + `?dataset=${dataset}&variable=${variable}`)
export const reqDataWeek = (dataset) => request.get(API.GET_DATA_WEEK_URL + `?dataset=${dataset}`)
export const reqDataAllUserWeek = (dataset) => request.get(API.GET_DATA_ALL_USER_WEEK_URL + `?dataset=${dataset}`)  
export const reqDataAllUserWeekMultiple = (dataset, variable) => request.get(API.GET_DATA_ALL_USER_WEEK_MULTIPLE_URL + `?dataset=${dataset}&variable=${variable}`)
export const reqDataDistribution = (dataset) => request.get(API.GET_DATA_DISTRIBUTION_URL + `?dataset=${dataset}`)  
export const reqDataProjection = (dataset, model, aggregation) => request.get(API.GET_DATA_PROJECTION_URL + `?dataset=${dataset}&model=${model}&aggregation=${aggregation}`)  
export const reqDataCluster = (dataset, variable, model, aggregation, eps) => request.get(API.GET_DATA_CLUSTER_URL + `?dataset=${dataset}&variable=${variable}&model=${model}&aggregation=${aggregation}&eps=${eps}`)  
export const reqDataMix = (dataset, variable = 'null', dayType = 'day') => request.get(API.GET_DATA_MIX_URL + `?dataset=${dataset}&variable=${variable}&dayType=${dayType}`)  