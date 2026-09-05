export type ParsedTask = {
  title: string
  course: string | null
  type: 'assignment' | 'quiz' | 'exam' | 'project' | 'reading'
  priority: 'low' | 'medium' | 'high'
  dueDate: string
  dueTime: string
  recurrence: 'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly'
  recurrenceDays: number[]
}

const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const months: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
  may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7,
  sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10,
  dec: 11, december: 11,
}

function dateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addDays(now: Date, days: number) {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  date.setDate(date.getDate() + days)
  return dateKey(date)
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function parseQuickTask(input: string, classNames: string[], now = new Date()): ParsedTask {
  let cleaned = input.trim()
  const lower = cleaned.toLowerCase()

  let type: ParsedTask['type'] = 'assignment'
  if (/\b(quiz|test)\b/i.test(lower)) type = 'quiz'
  if (/\b(exam|midterm|final)\b/i.test(lower)) type = 'exam'
  if (/\b(project|presentation)\b/i.test(lower)) type = 'project'
  if (/\b(read|reading|chapter)\b/i.test(lower)) type = 'reading'

  let priority: ParsedTask['priority'] = 'medium'
  if (/\b(low\s+priority|not\s+urgent|whenever)\b/i.test(cleaned)) priority = 'low'
  if (/\b(high\s+priority|urgent|important|asap)\b/i.test(cleaned)) priority = 'high'
  cleaned = cleaned.replace(/\b(?:high|medium|low)\s+priority\b|\b(?:urgent|important|asap|not\s+urgent|whenever)\b/gi, ' ')

  let course: string | null = null
  for (const name of [...classNames].sort((a, b) => b.length - a.length)) {
    const escaped = escapeRegExp(name)
    const pattern = new RegExp(`(?:\\bfor\\s+)?\\b${escaped}\\b(?:\\s*[:,-])?`, 'i')
    if (pattern.test(cleaned)) {
      course = name
      cleaned = cleaned.replace(pattern, ' ')
      break
    }
  }

  let dueTime = ''
  cleaned = cleaned.replace(/\b(?:at\s+)?(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*(am|pm)\b/i, (_match, hourText: string, minuteText: string | undefined, meridiem: string) => {
    let hour = Number(hourText) % 12
    if (meridiem.toLowerCase() === 'pm') hour += 12
    dueTime = `${String(hour).padStart(2, '0')}:${minuteText || '00'}`
    return ' '
  })

  let dueDate = ''
  let recurrence: ParsedTask['recurrence'] = 'none'
  let recurrenceDays: number[] = []

  const repeatedDaysMatch = cleaned.match(/\b(?:every|each)\s+(?:(?:sun(?:day)?|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?)(?:\s*(?:,|and)\s*)?)+/i)
  if (repeatedDaysMatch) {
    const dayNames = repeatedDaysMatch[0].match(/sun(?:day)?|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?/gi) || []
    recurrenceDays = [...new Set(dayNames.map((name) => weekdays.findIndex((day) => day.startsWith(name.slice(0, 3).toLowerCase()))))].filter((day) => day >= 0).sort()
    recurrence = 'weekly'
    const nextDays = recurrenceDays.map((day) => (day - now.getDay() + 7) % 7)
    dueDate = addDays(now, Math.min(...nextDays))
    cleaned = cleaned.replace(repeatedDaysMatch[0], ' ')
  } else {
    const recurrencePatterns: Array<[RegExp, ParsedTask['recurrence']]> = [
      [/\b(?:every|each)\s+day\b|\bdaily\b/i, 'daily'],
      [/\b(?:every|each)\s+(?:other\s+week|two\s+weeks?)\b|\bbiweekly\b/i, 'biweekly'],
      [/\b(?:every|each)\s+week\b|\bweekly\b/i, 'weekly'],
      [/\b(?:every|each)\s+month\b|\bmonthly\b/i, 'monthly'],
    ]
    for (const [pattern, value] of recurrencePatterns) {
      if (!pattern.test(cleaned)) continue
      recurrence = value
      cleaned = cleaned.replace(pattern, ' ')
      break
    }
  }

  const setRelative = (pattern: RegExp, days: number) => {
    if (dueDate || !pattern.test(cleaned)) return
    dueDate = addDays(now, days)
    cleaned = cleaned.replace(pattern, ' ')
  }
  setRelative(/\b(?:due\s+|by\s+|on\s+)?day after tomorrow\b/i, 2)
  setRelative(/\b(?:due\s+|by\s+|on\s+)?tomorrow\b/i, 1)
  setRelative(/\b(?:due\s+|by\s+|on\s+)?(?:today|tonight)\b/i, 0)
  setRelative(/\b(?:due\s+|by\s+|on\s+)?next week\b/i, 7)

  if (!dueDate) {
    const weekdayMatch = cleaned.match(/\b(?:due\s+|by\s+|on\s+)?(?:next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i)
    if (weekdayMatch) {
      const targetDay = weekdays.indexOf(weekdayMatch[1].toLowerCase())
      let daysAhead = (targetDay - now.getDay() + 7) % 7
      if (daysAhead === 0) daysAhead = 7
      dueDate = addDays(now, daysAhead)
      cleaned = cleaned.replace(weekdayMatch[0], ' ')
    }
  }

  if (!dueDate) {
    const monthMatch = cleaned.match(/\b(?:due\s+|by\s+|on\s+)?(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/i)
    if (monthMatch) {
      const month = months[monthMatch[1].toLowerCase()]
      let year = monthMatch[3] ? Number(monthMatch[3]) : now.getFullYear()
      let date = new Date(year, month, Number(monthMatch[2]))
      if (!monthMatch[3] && date < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
        year += 1
        date = new Date(year, month, Number(monthMatch[2]))
      }
      dueDate = dateKey(date)
      cleaned = cleaned.replace(monthMatch[0], ' ')
    }
  }

  if (!dueDate) {
    const numericMatch = cleaned.match(/\b(?:due\s+|by\s+|on\s+)?(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/i)
    if (numericMatch) {
      let year = numericMatch[3] ? Number(numericMatch[3]) : now.getFullYear()
      if (year < 100) year += 2000
      let date = new Date(year, Number(numericMatch[1]) - 1, Number(numericMatch[2]))
      if (!numericMatch[3] && date < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
        date = new Date(year + 1, Number(numericMatch[1]) - 1, Number(numericMatch[2]))
      }
      dueDate = dateKey(date)
      cleaned = cleaned.replace(numericMatch[0], ' ')
    }
  }

  const title = cleaned
    .replace(/\b(?:due|by|on|at|for)\s*$/i, '')
    .replace(/\s+([,.:])/g, '$1')
    .replace(/^[\s,.:;-]+|[\s,.:;-]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()

  if (recurrence !== 'none' && !dueDate) dueDate = addDays(now, 0)

  return { title: title || input.trim(), course, type, priority, dueDate, dueTime, recurrence, recurrenceDays }
}
