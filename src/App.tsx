import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  Download,
  Flower2,
  GraduationCap,
  LayoutDashboard,
  LibraryBig,
  Mic,
  Pencil,
  Plus,
  Repeat2,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { parseQuickTask } from './parser'

type ItemType = 'assignment' | 'quiz' | 'exam' | 'project' | 'reading'
type Priority = 'low' | 'medium' | 'high'
type Recurrence = 'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly'
type StatusFilter = 'open' | 'completed' | 'assessments'

type Task = {
  id: string
  title: string
  course: string
  type: ItemType
  priority: Priority
  dueDate: string
  dueTime: string
  notes: string
  recurrence: Recurrence
  recurrenceDays: number[]
  completed: boolean
  createdAt: string
  color: string
}

type ClassGroup = { id: string; name: string; color: string }

type TaskDraft = Omit<Task, 'id' | 'completed' | 'createdAt'>

type SpeechResultEvent = { results: { length: number; [index: number]: { [index: number]: { transcript: string } } } }
type SpeechRecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: SpeechResultEvent) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
  start: () => void
  stop: () => void
}
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike
type SpeechWindow = Window & { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor }

const STORAGE_KEY = 'petal-plan.tasks.v1'
const CLASSES_KEY = 'petal-plan.classes.v1'
const pastelColors = ['#9b8bd3', '#75b798', '#e49a86', '#dfbd58', '#6fa9cf', '#d783ab', '#8aa6a1', '#c687db']
const emptyDraft: TaskDraft = {
  title: '', course: '', type: 'assignment', priority: 'medium',
  dueDate: '', dueTime: '', notes: '', recurrence: 'none', recurrenceDays: [], color: pastelColors[0],
}

const typeLabels: Record<ItemType, string> = {
  assignment: 'Assignment', quiz: 'Quiz', exam: 'Exam', project: 'Project', reading: 'Reading',
}
const recurrenceLabels: Record<Recurrence, string> = {
  none: 'Does not repeat', daily: 'Every day', weekly: 'Every week', biweekly: 'Every 2 weeks', monthly: 'Every month',
}
const shortWeekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function recurrenceText(task: Pick<Task, 'recurrence' | 'recurrenceDays'>) {
  if (task.recurrence === 'weekly' && task.recurrenceDays.length) {
    return task.recurrenceDays.map((day) => shortWeekdays[day]).join(' & ')
  }
  return recurrenceLabels[task.recurrence].replace('Every ', '')
}

function localDate(dateString: string) {
  if (!dateString) return null
  const [year, month, day] = dateString.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function todayAtMidnight() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

function dateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addRecurrence(dateString: string, recurrence: Recurrence, recurrenceDays: number[] = []) {
  if (!dateString || recurrence === 'none') return dateString
  const date = localDate(dateString)!
  if (recurrence === 'daily') date.setDate(date.getDate() + 1)
  if (recurrence === 'weekly' && recurrenceDays.length) {
    for (let daysAhead = 1; daysAhead <= 7; daysAhead += 1) {
      const candidate = new Date(date)
      candidate.setDate(candidate.getDate() + daysAhead)
      if (recurrenceDays.includes(candidate.getDay())) return dateKey(candidate)
    }
  }
  if (recurrence === 'weekly') date.setDate(date.getDate() + 7)
  if (recurrence === 'biweekly') date.setDate(date.getDate() + 14)
  if (recurrence === 'monthly') {
    const day = date.getDate()
    date.setDate(1)
    date.setMonth(date.getMonth() + 1)
    date.setDate(Math.min(day, new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()))
  }
  return dateKey(date)
}

function dueInfo(task: Task) {
  if (!task.dueDate) return { label: 'No due date', state: '' }
  const due = localDate(task.dueDate)!
  const diff = Math.round((due.getTime() - todayAtMidnight().getTime()) / 86_400_000)
  let label = due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const state = diff < 0 ? 'overdue' : diff === 0 ? 'today' : diff <= 3 ? 'soon' : ''
  if (diff === 0) label = 'Today'
  if (diff === 1) label = 'Tomorrow'
  if (diff === -1) label = 'Yesterday'
  if (diff < -1) label = `${Math.abs(diff)} days overdue`
  if (task.dueTime) {
    const [hours, minutes] = task.dueTime.split(':').map(Number)
    const time = new Date(2000, 0, 1, hours, minutes).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    label += ` · ${time}`
  }
  return { label, state }
}

function loadTasks(): Task[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    const parsed: Array<Task & { color?: string; recurrenceDays?: number[] }> = stored ? JSON.parse(stored) : []
    return parsed.map((task, index) => ({ ...task, color: task.color || pastelColors[index % pastelColors.length], recurrenceDays: task.recurrenceDays || [] }))
  } catch {
    return []
  }
}

function loadClasses(): ClassGroup[] {
  try {
    const stored = localStorage.getItem(CLASSES_KEY)
    if (stored) return JSON.parse(stored)
    const tasks = loadTasks()
    return [...new Set(tasks.map((task) => task.course).filter((course) => course && course !== 'General'))]
      .map((name, index) => ({ id: crypto.randomUUID(), name, color: tasks.find((task) => task.course === name)?.color || pastelColors[index % pastelColors.length] }))
  } catch {
    return []
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function normalizeTask(value: unknown, index: number): Task | null {
  if (!isRecord(value) || typeof value.title !== 'string' || !value.title.trim()) return null
  const allowedTypes: ItemType[] = ['assignment', 'quiz', 'exam', 'project', 'reading']
  const allowedPriorities: Priority[] = ['low', 'medium', 'high']
  const allowedRecurrences: Recurrence[] = ['none', 'daily', 'weekly', 'biweekly', 'monthly']
  const type = allowedTypes.includes(value.type as ItemType) ? value.type as ItemType : 'assignment'
  const priority = allowedPriorities.includes(value.priority as Priority) ? value.priority as Priority : 'medium'
  const recurrence = allowedRecurrences.includes(value.recurrence as Recurrence) ? value.recurrence as Recurrence : 'none'
  return {
    id: typeof value.id === 'string' ? value.id : crypto.randomUUID(),
    title: value.title.trim(),
    course: typeof value.course === 'string' && value.course.trim() ? value.course.trim() : 'General',
    type,
    priority,
    dueDate: typeof value.dueDate === 'string' ? value.dueDate : '',
    dueTime: typeof value.dueTime === 'string' ? value.dueTime : '',
    notes: typeof value.notes === 'string' ? value.notes : '',
    recurrence,
    recurrenceDays: Array.isArray(value.recurrenceDays) ? value.recurrenceDays.filter((day): day is number => typeof day === 'number' && day >= 0 && day <= 6) : [],
    completed: value.completed === true,
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : new Date().toISOString(),
    color: typeof value.color === 'string' ? value.color : pastelColors[index % pastelColors.length],
  }
}

function normalizeClass(value: unknown, index: number): ClassGroup | null {
  if (!isRecord(value) || typeof value.name !== 'string' || !value.name.trim()) return null
  return {
    id: typeof value.id === 'string' ? value.id : crypto.randomUUID(),
    name: value.name.trim(),
    color: typeof value.color === 'string' ? value.color : pastelColors[index % pastelColors.length],
  }
}

export default function App() {
  const [tasks, setTasks] = useState<Task[]>(loadTasks)
  const [classes, setClasses] = useState<ClassGroup[]>(loadClasses)
  const [status, setStatus] = useState<StatusFilter>('open')
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | ItemType>('all')
  const [courseFilter, setCourseFilter] = useState('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<TaskDraft>(emptyDraft)
  const [classModalOpen, setClassModalOpen] = useState(false)
  const [className, setClassName] = useState('')
  const [classColor, setClassColor] = useState(pastelColors[1])
  const [quickTitle, setQuickTitle] = useState('')
  const [quickCourse, setQuickCourse] = useState('General')
  const [quickType, setQuickType] = useState<ItemType>('assignment')
  const [quickDueDate, setQuickDueDate] = useState('')
  const [listening, setListening] = useState(false)
  const [dataModalOpen, setDataModalOpen] = useState(false)
  const [dataMessage, setDataMessage] = useState('')
  const quickInputRef = useRef<HTMLInputElement>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const importInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)), [tasks])
  useEffect(() => localStorage.setItem(CLASSES_KEY, JSON.stringify(classes)), [classes])
  useEffect(() => () => recognitionRef.current?.stop(), [])

  const today = dateKey(todayAtMidnight())
  const courses = useMemo(() => [...new Set([...classes.map((item) => item.name), ...tasks.map((task) => task.course)].filter(Boolean))].sort(), [tasks, classes])
  const openCount = tasks.filter((task) => !task.completed && task.type !== 'exam' && task.type !== 'quiz').length
  const todayCount = tasks.filter((task) => !task.completed && task.dueDate === today).length
  const parsedQuickTask = useMemo(() => parseQuickTask(quickTitle, classes.map((item) => item.name)), [quickTitle, classes])
  const inferredCourse = parsedQuickTask.course || quickCourse
  const inferredType = parsedQuickTask.type !== 'assignment' ? parsedQuickTask.type : quickType
  const inferredDate = parsedQuickTask.dueDate || quickDueDate
  const speechWindow = window as SpeechWindow
  const speechSupported = Boolean(speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition)
  const inferredDateLabel = inferredDate ? localDate(inferredDate)?.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''

  const visibleTasks = useMemo(() => tasks.filter((task) => {
    if (status === 'open' && (task.completed || task.type === 'exam' || task.type === 'quiz')) return false
    if (status === 'completed' && !task.completed) return false
    if (status === 'assessments' && (task.completed || !['exam', 'quiz'].includes(task.type))) return false
    if (typeFilter !== 'all' && task.type !== typeFilter) return false
    if (courseFilter !== 'all' && task.course !== courseFilter) return false
    const needle = search.trim().toLowerCase()
    return !needle || `${task.title} ${task.course} ${task.notes}`.toLowerCase().includes(needle)
  }).sort((a, b) => {
    if (a.completed !== b.completed) return Number(a.completed) - Number(b.completed)
    if (!a.dueDate) return 1
    if (!b.dueDate) return -1
    return `${a.dueDate}${a.dueTime}`.localeCompare(`${b.dueDate}${b.dueTime}`)
  }), [tasks, status, typeFilter, courseFilter, search])

  function openCreate() {
    const selectedClass = classes.find((item) => item.name === inferredCourse)
    setEditingId(null)
    setDraft({ ...emptyDraft, title: parsedQuickTask.title, course: inferredCourse === 'General' ? '' : inferredCourse, type: inferredType, priority: parsedQuickTask.priority, dueDate: inferredDate, dueTime: parsedQuickTask.dueTime, recurrence: parsedQuickTask.recurrence, recurrenceDays: parsedQuickTask.recurrenceDays, color: selectedClass?.color || emptyDraft.color })
    setModalOpen(true)
  }

  function quickAdd(item: ClassGroup) {
    setQuickCourse(item.name)
    setCourseFilter(item.name)
    setClassModalOpen(false)
    window.setTimeout(() => quickInputRef.current?.focus(), 0)
  }

  function addQuickTask(event: React.FormEvent) {
    event.preventDefault()
    const title = parsedQuickTask.title.trim()
    if (!title) return
    const matchingClass = classes.find((item) => item.name === inferredCourse)
    setTasks((current) => [...current, {
      ...emptyDraft,
      id: crypto.randomUUID(),
      title,
      course: inferredCourse,
      type: inferredType,
      priority: parsedQuickTask.priority,
      dueDate: inferredDate,
      dueTime: parsedQuickTask.dueTime,
      recurrence: parsedQuickTask.recurrence,
      recurrenceDays: parsedQuickTask.recurrenceDays,
      color: matchingClass?.color || emptyDraft.color,
      completed: false,
      createdAt: new Date().toISOString(),
    }])
    setQuickTitle('')
    setQuickDueDate('')
    setStatus('open')
    window.setTimeout(() => quickInputRef.current?.focus(), 0)
  }

  function toggleVoice() {
    if (listening) {
      recognitionRef.current?.stop()
      return
    }
    const Recognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition
    if (!Recognition) return
    const recognition = new Recognition()
    const startingText = quickTitle.trim()
    recognition.lang = 'en-US'
    recognition.continuous = false
    recognition.interimResults = true
    recognition.onresult = (event) => {
      let transcript = ''
      for (let index = 0; index < event.results.length; index += 1) transcript += event.results[index][0].transcript
      setQuickTitle(`${startingText} ${transcript}`.trim())
    }
    recognition.onend = () => { setListening(false); recognitionRef.current = null }
    recognition.onerror = () => { setListening(false); recognitionRef.current = null }
    recognitionRef.current = recognition
    setListening(true)
    recognition.start()
  }

  function exportBackup() {
    const backup = { version: 1, exportedAt: new Date().toISOString(), tasks, classes }
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `plany-backup-${dateKey(new Date())}.json`
    link.click()
    URL.revokeObjectURL(url)
    setDataMessage('Backup downloaded.')
  }

  async function importBackup(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const parsed: unknown = JSON.parse(await file.text())
      if (!isRecord(parsed) || !Array.isArray(parsed.tasks) || !Array.isArray(parsed.classes)) throw new Error('Invalid backup')
      const restoredTasks = parsed.tasks.map(normalizeTask).filter((task): task is Task => task !== null)
      const restoredClasses = parsed.classes.map(normalizeClass).filter((item): item is ClassGroup => item !== null)
      if (restoredTasks.length !== parsed.tasks.length || restoredClasses.length !== parsed.classes.length) throw new Error('Invalid backup')
      if ((tasks.length || classes.length) && !window.confirm('Replace the current local planner with this backup?')) return
      setTasks(restoredTasks)
      setClasses(restoredClasses)
      setCourseFilter('all')
      setStatus('open')
      setDataMessage(`Restored ${restoredTasks.length} task${restoredTasks.length === 1 ? '' : 's'}.`)
    } catch {
      setDataMessage('That file is not a valid plany backup.')
    }
  }

  function openEdit(task: Task) {
    const { id: _id, completed: _completed, createdAt: _createdAt, ...values } = task
    void _id; void _completed; void _createdAt
    setEditingId(task.id)
    setDraft(values)
    setModalOpen(true)
  }

  function saveTask(event: React.FormEvent) {
    event.preventDefault()
    if (!draft.title.trim()) return
    const course = draft.course.trim() || 'General'
    if (editingId) {
      setTasks((current) => current.map((task) => task.id === editingId ? { ...task, ...draft, title: draft.title.trim(), course } : task))
    } else {
      setTasks((current) => [...current, {
        ...draft, id: crypto.randomUUID(), title: draft.title.trim(), course, completed: false, createdAt: new Date().toISOString(),
      }])
    }
    if (course !== 'General' && !classes.some((item) => item.name.toLowerCase() === course.toLowerCase())) {
      setClasses((current) => [...current, { id: crypto.randomUUID(), name: course, color: draft.color }])
    }
    setModalOpen(false)
  }

  function selectCourse(course: string) {
    const matchingClass = classes.find((item) => item.name === course)
    setDraft((current) => ({ ...current, course, color: matchingClass?.color || current.color }))
  }

  function saveClass(event: React.FormEvent) {
    event.preventDefault()
    const name = className.trim()
    if (!name || classes.some((item) => item.name.toLowerCase() === name.toLowerCase())) return
    setClasses((current) => [...current, { id: crypto.randomUUID(), name, color: classColor }])
    setClassName('')
    setClassColor(pastelColors[(classes.length + 2) % pastelColors.length])
  }

  function deleteClass(id: string) {
    setClasses((current) => current.filter((item) => item.id !== id))
    setCourseFilter('all')
  }

  function filterClass(name: string) {
    setCourseFilter(name)
    setQuickCourse(name)
    setStatus('open')
  }

  function toggleTask(task: Task) {
    const completing = !task.completed
    setTasks((current) => {
      let next = current.map((item) => item.id === task.id ? { ...item, completed: completing } : item)
      if (completing && task.recurrence !== 'none') {
        const nextDate = addRecurrence(task.dueDate, task.recurrence, task.recurrenceDays)
        const duplicate = next.some((item) => !item.completed && item.title === task.title && item.course === task.course && item.dueDate === nextDate)
        if (!duplicate) next = [...next, { ...task, id: crypto.randomUUID(), dueDate: nextDate, completed: false, createdAt: new Date().toISOString() }]
      }
      return next
    })
  }

  function deleteTask(id: string) {
    if (window.confirm('Delete this item?')) setTasks((current) => current.filter((task) => task.id !== id))
  }

  function changeStatus(next: StatusFilter) {
    setStatus(next)
    if (next === 'assessments') setTypeFilter('all')
  }

  function goToPlanner() {
    setStatus('open')
    setCourseFilter('all')
    setTypeFilter('all')
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={goToPlanner} aria-label="plany home">
          <span className="brand-mark"><Flower2 size={20} /></span><span>plany</span>
        </button>
        <nav className="side-nav" aria-label="Planner navigation">
          <button className={status === 'open' ? 'active' : ''} onClick={goToPlanner}><LayoutDashboard /> <span>My planner</span></button>
          <button className={status === 'assessments' ? 'active' : ''} onClick={() => changeStatus('assessments')}><GraduationCap /> <span>Exams & quizzes</span></button>
          <button className={status === 'completed' ? 'active' : ''} onClick={() => changeStatus('completed')}><CheckCircle2 /> <span>Completed</span></button>
        </nav>
        <section className="class-menu" aria-label="Classes">
          <div className="class-menu-heading"><span>CLASSES</span><button onClick={() => setClassModalOpen(true)} aria-label="Manage classes"><Plus size={14} /></button></div>
          <div className="class-menu-list">
            {classes.map((item) => <div className={`class-menu-row ${courseFilter === item.name ? 'active' : ''}`} key={item.id}>
              <button className="class-filter" onClick={() => filterClass(item.name)}><i style={{ backgroundColor: item.color }} /><span>{item.name}</span></button>
              <button className="class-quick-add" onClick={() => quickAdd(item)} aria-label={`Add task for ${item.name}`}><Plus size={13} /></button>
            </div>)}
            {!classes.length && <button className="empty-classes" onClick={() => setClassModalOpen(true)}>+ Add your classes</button>}
          </div>
        </section>
        <button className="data-menu-button" onClick={() => { setDataMessage(''); setDataModalOpen(true) }}><LibraryBig size={16} /><span>Backup & restore</span></button>
      </aside>

      <main className="main-content">
        <header className="simple-header">
          <div><p className="eyebrow">PLANY</p><h1>{courseFilter !== 'all' ? courseFilter : 'My notes'}</h1></div>
          <p><strong>{openCount}</strong> to do <span>·</span> <strong>{todayCount}</strong> due today</p>
        </header>

        <form className="quick-capture" onSubmit={addQuickTask}>
          <div className="capture-line"><Plus size={21} /><input ref={quickInputRef} autoFocus maxLength={200} value={quickTitle} onChange={(event) => setQuickTitle(event.target.value)} placeholder={listening ? 'Listening…' : 'Try “Biology quiz next Friday, high priority”'} aria-label="New task title" /><button className={`voice-button ${listening ? 'listening' : ''}`} type="button" onClick={toggleVoice} disabled={!speechSupported} title={speechSupported ? 'Add by voice' : 'Voice input is not supported by this browser'} aria-label={listening ? 'Stop listening' : 'Add by voice'}><Mic size={17} /></button><button className="add-button" type="submit" disabled={!quickTitle.trim()}>Add</button></div>
          {quickTitle.trim() && <div className="smart-preview"><span>Will add <strong>{parsedQuickTask.title}</strong></span><i>{inferredCourse}</i><i>{typeLabels[inferredType]}</i><i>{inferredDateLabel || 'No date'}</i>{parsedQuickTask.recurrence !== 'none' && <i><Repeat2 size={10} /> {recurrenceText(parsedQuickTask)}</i>}<i className={`preview-priority ${parsedQuickTask.priority}`}>{parsedQuickTask.priority} priority</i></div>}
          <div className="capture-options">
            <label><span>Class</span><select value={quickCourse} onChange={(event) => setQuickCourse(event.target.value)}><option value="General">General</option>{courses.filter((course) => course !== 'General').map((course) => <option key={course}>{course}</option>)}</select></label>
            <label><span>Type</span><select value={quickType} onChange={(event) => setQuickType(event.target.value as ItemType)}>{Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="quick-date"><CalendarDays size={14} /><span>Due</span><input type="date" value={quickDueDate} onChange={(event) => setQuickDueDate(event.target.value)} /></label>
            <button className="more-details" type="button" onClick={openCreate}>More details</button>
          </div>
        </form>

        <section className="notes-section">
          <div className="notes-toolbar">
            <h2>{status === 'assessments' ? 'Exams & quizzes' : status === 'completed' ? 'Completed' : 'To do'}</h2>
          </div>

          <div className="simple-filters">
            <label className="search-box"><Search size={16} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search assignments or classes" /><span className="sr-only">Search</span></label>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as 'all' | ItemType)} aria-label="Filter by type"><option value="all">All types</option>{Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}s</option>)}</select>
          </div>

          <div className="task-list">
            {visibleTasks.map((task) => {
              const due = dueInfo(task)
              return <article className={`task-card priority-${task.priority} ${task.completed ? 'is-complete' : ''}`} style={{ borderLeftColor: task.color }} key={task.id}>
                <button className="check-button" onClick={() => toggleTask(task)} aria-label={`Mark ${task.title} ${task.completed ? 'incomplete' : 'complete'}`}>{task.completed && <Check size={13} strokeWidth={3} />}</button>
                <div className="task-main">
                  <div className="task-title-row"><h3>{task.title}</h3>{task.recurrence !== 'none' && <span className="recurring"><Repeat2 size={11} /> {recurrenceText(task)}</span>}</div>
                  <div className="task-meta"><span className="course-dot" style={{ backgroundColor: task.color }} /><span>{task.course}</span><i /><span>{typeLabels[task.type]}</span>{task.dueDate && <><i /><span className={`due ${due.state}`}><Clock3 size={12} /> {due.label}</span></>}</div>
                  {task.notes && <p className="task-notes">{task.notes}</p>}
                </div>
                <span className={`priority-badge ${task.priority}`}>{task.priority}</span>
                <div className="task-actions"><button onClick={() => openEdit(task)} aria-label={`Edit ${task.title}`}><Pencil /></button><button onClick={() => deleteTask(task.id)} aria-label={`Delete ${task.title}`}><Trash2 /></button></div>
              </article>
            })}
            {!visibleTasks.length && <div className="empty-state"><span><Flower2 /></span><h3>{tasks.length ? 'No matches found' : 'Nothing here yet'}</h3><p>{tasks.length ? 'Try another search or view.' : 'Type above and press Enter to add your first note.'}</p><button className="secondary-button" onClick={() => quickInputRef.current?.focus()}><Plus size={15} /> Start typing</button></div>}
          </div>
        </section>
      </main>

      {modalOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && setModalOpen(false)}>
        <section className="task-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <form onSubmit={saveTask} className="task-form">
            <div className="modal-header"><div><p className="eyebrow">{editingId ? 'UPDATE YOUR PLANNER' : 'NEW TO YOUR PLANNER'}</p><h2 id="modal-title">{editingId ? 'Edit item' : 'Add something'}</h2></div><button type="button" className="close-button" onClick={() => setModalOpen(false)} aria-label="Close"><X /></button></div>
            <div className="form-grid">
              <label className="full-field">What do you need to do?<input autoFocus required maxLength={200} placeholder="e.g. Finish chapter 6 problems" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></label>
              <label>Class or subject<input list="class-options" maxLength={80} placeholder="e.g. Calculus" value={draft.course} onChange={(e) => selectCourse(e.target.value)} /><datalist id="class-options">{classes.map((item) => <option key={item.id} value={item.name} />)}</datalist></label>
              <label>Type<select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as ItemType })}>{Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label>Due date<input type="date" value={draft.dueDate} onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })} /></label>
              <label>Due time<input type="time" value={draft.dueTime} onChange={(e) => setDraft({ ...draft, dueTime: e.target.value })} /></label>
              <label>Priority<select value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value as Priority })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
              <label>Repeat<select value={draft.recurrence} onChange={(e) => setDraft({ ...draft, recurrence: e.target.value as Recurrence, recurrenceDays: [] })}>{Object.entries(recurrenceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <fieldset className="color-field full-field"><legend>Task color</legend><div className="color-options">{pastelColors.map((color) => <button type="button" key={color} className={draft.color === color ? 'selected' : ''} style={{ backgroundColor: color }} onClick={() => setDraft({ ...draft, color })} aria-label={`Use color ${color}`}>{draft.color === color && <Check size={13} />}</button>)}</div></fieldset>
              <label className="full-field">Notes <small>(optional)</small><textarea rows={3} placeholder="Add details, chapters, links, or reminders…" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></label>
            </div>
            <div className="form-actions"><button type="button" className="text-button" onClick={() => setModalOpen(false)}>Cancel</button><button className="primary-button" type="submit">{editingId ? 'Save changes' : 'Add to planner'}</button></div>
          </form>
        </section>
      </div>}

      {classModalOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && setClassModalOpen(false)}>
        <section className="task-modal class-modal" role="dialog" aria-modal="true" aria-labelledby="class-modal-title">
          <div className="task-form">
            <div className="modal-header"><div><p className="eyebrow">ORGANIZE YOUR SEMESTER</p><h2 id="class-modal-title">Your classes</h2></div><button type="button" className="close-button" onClick={() => setClassModalOpen(false)} aria-label="Close"><X /></button></div>
            <form className="new-class-form" onSubmit={saveClass}>
              <label>Class name<input autoFocus required maxLength={80} placeholder="e.g. Biology 101" value={className} onChange={(e) => setClassName(e.target.value)} /></label>
              <fieldset className="color-field"><legend>Class color</legend><div className="color-options">{pastelColors.map((color) => <button type="button" key={color} className={classColor === color ? 'selected' : ''} style={{ backgroundColor: color }} onClick={() => setClassColor(color)} aria-label={`Use color ${color}`}>{classColor === color && <Check size={13} />}</button>)}</div></fieldset>
              <button className="primary-button" type="submit"><Plus size={16} /> Add class</button>
            </form>
            {!!classes.length && <div className="managed-classes"><p className="eyebrow">CURRENT CLASSES</p>{classes.map((item) => <div key={item.id}><i style={{ backgroundColor: item.color }} /><span>{item.name}</span><button onClick={() => quickAdd(item)}><Plus size={14} /> Quick add</button><button className="remove-class" onClick={() => deleteClass(item.id)} aria-label={`Remove ${item.name}`}><Trash2 size={14} /></button></div>)}</div>}
          </div>
        </section>
      </div>}

      {dataModalOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && setDataModalOpen(false)}>
        <section className="task-modal data-modal" role="dialog" aria-modal="true" aria-labelledby="data-modal-title">
          <div className="task-form">
            <div className="modal-header"><div><p className="eyebrow">LOCAL DATA</p><h2 id="data-modal-title">Backup & restore</h2></div><button type="button" className="close-button" onClick={() => setDataModalOpen(false)} aria-label="Close"><X /></button></div>
            <p className="data-description">Your {tasks.length} task{tasks.length === 1 ? '' : 's'} and {classes.length} class{classes.length === 1 ? '' : 'es'} live only in this browser. Download a backup before clearing browser data or moving to another computer.</p>
            <div className="data-actions">
              <button className="primary-button" onClick={exportBackup}><Download size={15} /> Download backup</button>
              <button className="secondary-button" onClick={() => importInputRef.current?.click()}><Upload size={15} /> Restore backup</button>
              <input ref={importInputRef} className="sr-only" type="file" accept="application/json,.json" onChange={importBackup} />
            </div>
            {dataMessage && <p className="data-message" role="status">{dataMessage}</p>}
          </div>
        </section>
      </div>}
    </div>
  )
}
