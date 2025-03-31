/**
 * Parse CSV text into an array of TimePoint objects
 * @param {string} csvText The CSV text to parse
 * @param {object} options Parsing options
 * @returns {Array} Array of TimePoint objects
 */
export function parseCSV(csvText, options = {}) {
  const {
    timeFormat = 'hours',
    dateColumn = 0,
    valueColumn = 1,
    hasHeader = true
  } = options;
  
  const lines = csvText.split('\n')
  const data = []
  
  // Skip header row if specified
  const startRow = hasHeader ? 1 : 0
  
  for (let i = startRow; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    
    const parts = line.split(',')
    if (parts.length <= Math.max(dateColumn, valueColumn)) continue
    
    const timeStr = parts[dateColumn].trim()
    const valueStr = parts[valueColumn].trim()
    const value = parseFloat(valueStr)
    
    if (isNaN(value)) continue
    
    // Process time based on selected format
    let time;
    
    try {
      if (timeFormat === 'hours') {
        time = parseFloat(timeStr)
      } else if (timeFormat === 'minutes') {
        time = parseFloat(timeStr) / 60
      } else if (timeFormat === 'seconds') {
        time = parseFloat(timeStr) / 3600
      } else if (timeFormat === 'timestamp') {
        // Assuming timestamp is in milliseconds since epoch
        const date = new Date(parseInt(timeStr))
        time = date.getHours() + (date.getMinutes() / 60) + (date.getSeconds() / 3600)
      } else if (timeFormat === 'hhmm') {
        // Format like "0830" for 8:30 AM
        const timeNum = parseFloat(timeStr)
        const hours = Math.floor(timeNum / 100)
        const minutes = timeNum % 100
        time = hours + (minutes / 60)
      } else if (timeFormat === 'hhmmss') {
        // Format like "083045" for 8:30:45 AM
        const timeNum = parseFloat(timeStr)
        const hours = Math.floor(timeNum / 10000)
        const minutes = Math.floor((timeNum % 10000) / 100)
        const seconds = timeNum % 100
        time = hours + (minutes / 60) + (seconds / 3600)
      } else if (timeFormat === 'yyyy/m/d hh:mm') {
        // Format like "2015/2/1 0:00"
        const [datePart, timePart] = timeStr.split(' ')
        
        if (!datePart || !timePart) {
          throw new Error('Invalid date/time format')
        }
        
        const [hourStr, minuteStr] = timePart.split(':')
        const hours = parseInt(hourStr, 10)
        const minutes = parseInt(minuteStr, 10)
        
        if (isNaN(hours) || isNaN(minutes)) {
          throw new Error('Invalid time format')
        }
        
        time = hours + (minutes / 60)
      } else if (timeFormat === 'iso' || timeFormat === 'date') {
        // ISO date format or general date format
        const date = new Date(timeStr)
        if (isNaN(date.getTime())) throw new Error('Invalid date format')
        time = date.getHours() + (date.getMinutes() / 60) + (date.getSeconds() / 3600)
      } else if (timeFormat === 'yyyy-mm-dd' || timeFormat === 'mm/dd/yyyy' || timeFormat === 'dd/mm/yyyy') {
        // Date only formats - extract time from the date part
        let date;
        
        if (timeFormat === 'yyyy-mm-dd') {
          // YYYY-MM-DD format
          const [year, month, day] = timeStr.split('-').map(Number)
          date = new Date(year, month - 1, day)
        } else if (timeFormat === 'mm/dd/yyyy') {
          // MM/DD/YYYY format
          const [month, day, year] = timeStr.split('/').map(Number)
          date = new Date(year, month - 1, day)
        } else {
          // DD/MM/YYYY format
          const [day, month, year] = timeStr.split('/').map(Number)
          date = new Date(year, month - 1, day)
        }
        
        if (isNaN(date.getTime())) throw new Error('Invalid date format')
        
        // For date-only formats, use the day of month as the hour (1-31 → 1-24)
        // This allows visualizing monthly data in a 24-hour format
        const dayOfMonth = date.getDate()
        time = Math.min(dayOfMonth, 24) // Cap at 24 hours
      } else {
        // Default to treating as hours
        time = parseFloat(timeStr)
      }
      
      // Ensure time is within 0-24 range
      time = time % 24
      
      if (!isNaN(time)) {
        data.push({ time, value })
      }
    } catch (error) {
      console.warn(`Error parsing time value "${timeStr}" with format "${timeFormat}":`, error)
      continue
    }
  }
  
  // Sort data by time
  return data.sort((a, b) => a.time - b.time)
}

/**
 * Convert TimePoint array to CSV string
 * @param {Array} data Array of TimePoint objects
 * @returns {string} CSV string
 */
export function convertToCSV(data) {
  // Add header row
  let csv = 'time,value\n'
  
  // Add data rows
  data.forEach(point => {
    csv += `${point.time},${point.value}\n`
  })
  
  return csv
}

/**
 * Download data as a CSV file
 * @param {Array} data The data to download
 * @param {string} filename The name of the file
 */
export function downloadCSV(data, filename) {
  const csv = convertToCSV(data)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  
  const link = document.createElement('a')
  link.setAttribute('href', url)
  link.setAttribute('download', filename)
  link.style.visibility = 'hidden'
  
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

/**
 * Format time value for display
 * @param {number} time Time in hours (0-24)
 * @param {string} format Output format ('hh:mm', 'hh:mm:ss', etc.)
 * @returns {string} Formatted time string
 */
export function formatTime(time, format = 'hh:mm') {
  const hours = Math.floor(time);
  const minutes = Math.floor((time - hours) * 60);
  const seconds = Math.floor(((time - hours) * 60 - minutes) * 60);
  
  if (format === 'hh:mm') {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  } else if (format === 'hh:mm:ss') {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  } else {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  }
}

/**
 * Parse a date string into a Date object
 * @param {string} dateStr Date string in various formats
 * @returns {Date|null} Date object or null if parsing fails
 */
export function parseDate(dateStr) {
  // Try different date formats
  const formats = [
    // ISO format
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/,
    // YYYY-MM-DD
    /^(\d{4})-(\d{2})-(\d{2})$/,
    // MM/DD/YYYY
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
    // DD/MM/YYYY
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
    // YYYY/MM/DD
    /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/,
    // YYYY/M/D H:MM
    /^(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{1,2})$/
  ]
  
  // Try parsing with built-in Date
  const date = new Date(dateStr)
  if (!isNaN(date.getTime())) {
    return date
  }
  
  // Try manual parsing with regex
  for (const format of formats) {
    const match = dateStr.match(format)
    if (match) {
      if (format === formats[0]) {
        // ISO format - already handled by Date constructor
        continue
      } else if (format === formats[1]) {
        // YYYY-MM-DD
        const [_, year, month, day] = match
        return new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
      } else if (format === formats[2]) {
        // MM/DD/YYYY
        const [_, month, day, year] = match
        return new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
      } else if (format === formats[3]) {
        // DD/MM/YYYY
        const [_, day, month, year] = match
        return new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
      } else if (format === formats[4]) {
        // YYYY/MM/DD
        const [_, year, month, day] = match
        return new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
      } else if (format === formats[5]) {
        // YYYY/M/D H:MM
        const [_, year, month, day, hour, minute] = match
        return new Date(
          parseInt(year), 
          parseInt(month) - 1, 
          parseInt(day),
          parseInt(hour),
          parseInt(minute)
        )
      }
    }
  }
  
  return null
}