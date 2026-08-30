import { useEffect, useMemo, useState } from 'react'
import {
  AlarmClock,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Clock3,
  Flower2,
  GraduationCap,
  LayoutDashboard,
  ListFilter,
  Pencil,
  Plus,
  Repeat2,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'

type ItemType = 'assignment' | 'quiz' | 'exam' | 'project' | 'reading'
type Priority = 'low' | 'medium' | 'high'
type Recurrence = 'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly'
type StatusFilter = 'open' | 'all' | 'completed' | 'today' | 'assessments'

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
  completed: boolean
  createdAt: string
}

type TaskDraft = Omit<Task, 'id' | 'completed' | 'createdAt'>

const STORAGE_KEY = 'petal-plan.tasks.v1'
const emptyDraft: TaskDraft = {
  title: '', course: '', type: 'assignment', priority: 'medium',
  dueDate: '', dueTime: '', notes: '', recurrence: 'none',
}

const typeLabels: Record<ItemType, string> = {
  assignment: 'Assignment', quiz: 'Quiz', exam: 'Exam', project: 'Project', reading: 'Reading',
}
const recurrenceLabels: Record<Recurrence, string> = {
  none: 'Does not repeat', daily: 'Every day', weekly: 'Every week', biweekly: 'Every 2 weeks', monthly: 'Every month',
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

function addRecurrence(dateString: string, recurrence: Recurrence) {
  if (!dateString || recurrence === 'none') return dateString
  const date = localDate(dateString)!
  if (recurrence === 'daily') date.setDate(date.getDate() + 1)
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
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

export default function App() {
  const [tasks, setTasks] = useState<Task[]>(loadTasks)
  const [status, setStatus] = useState<StatusFilter>('open')
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | ItemType>('all')
  const [courseFilter, setCourseFilter] = useState('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<TaskDraft>(emptyDraft)

  useEffect(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)), [tasks])

  const today = dateKey(todayAtMidnight())
  const courses = useMemo(() => [...new Set(tasks.map((task) => task.course).filter(Boolean))].sort(), [tasks])
  const stats = useMemo(() => ({
    open: tasks.filter((task) => !task.completed).length,
    today: tasks.filter((task) => !task.completed && task.dueDate === today).length,
    upcoming: tasks.filter((task) => {
      if (task.completed || !task.dueDate) return false
      const diff = (localDate(task.dueDate)!.getTime() - todayAtMidnight().getTime()) / 86_400_000
      return diff > 0 && diff <= 7
    }).length,
    done: tasks.filter((task) => task.completed).length,
  }), [tasks, today])

  const visibleTasks = useMemo(() => tasks.filter((task) => {
    if (status === 'open' && task.completed) return false
    if (status === 'completed' && !task.completed) return false
    if (status === 'today' && (task.completed || task.dueDate !== today)) return false
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
  }), [tasks, status, typeFilter, courseFilter, search, today])

  function openCreate() {
    setEditingId(null)
    setDraft(emptyDraft)
    setModalOpen(true)
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
    if (editingId) {
      setTasks((current) => current.map((task) => task.id === editingId ? { ...task, ...draft, title: draft.title.trim(), course: draft.course.trim() || 'General' } : task))
    } else {
      setTasks((current) => [...current, {
        ...draft, id: crypto.randomUUID(), title: draft.title.trim(), course: draft.course.trim() || 'General', completed: false, createdAt: new Date().toISOString(),
      }])
    }
    setModalOpen(false)
  }

  function toggleTask(task: Task) {
    const completing = !task.completed
    setTasks((current) => {
      let next = current.map((item) => item.id === task.id ? { ...item, completed: completing } : item)
      if (completing && task.recurrence !== 'none') {
        const nextDate = addRecurrence(task.dueDate, task.recurrence)
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

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => changeStatus('open')} aria-label="Petal Plan home">
          <span className="brand-mark"><Flower2 size={20} /></span><span>petal plan</span>
        </button>
        <nav className="side-nav" aria-label="Planner navigation">
          <button className={status === 'open' ? 'active' : ''} onClick={() => changeStatus('open')}><LayoutDashboard /> <span>My planner</span></button>
          <button className={status === 'today' ? 'active' : ''} onClick={() => changeStatus('today')}><CalendarDays /> <span>Due today</span></button>
          <button className={status === 'assessments' ? 'active' : ''} onClick={() => changeStatus('assessments')}><GraduationCap /> <span>Exams & quizzes</span></button>
          <button className={status === 'completed' ? 'active' : ''} onClick={() => changeStatus('completed')}><CheckCircle2 /> <span>Completed</span></button>
        </nav>
        <div className="side-note"><Sparkles size={18} /><p><strong>Small steps count.</strong><br />One task at a time.</p></div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div><p className="eyebrow">YOUR STUDY SPACE</p><h1>Let’s make a little progress.</h1><p className="subtitle">Everything you need to stay one step ahead.</p></div>
          <button className="primary-button" onClick={openCreate}><Plus size={17} /> <span>Add assignment</span></button>
        </header>

        <section className="stats-grid" aria-label="Task overview">
          <button className="stat-card lavender" onClick={() => changeStatus('open')}><span className="stat-icon"><ClipboardList /></span><span><strong>{stats.open}</strong><small>Open tasks</small></span></button>
          <button className="stat-card peach" onClick={() => changeStatus('today')}><span className="stat-icon"><AlarmClock /></span><span><strong>{stats.today}</strong><small>Due today</small></span></button>
          <div className="stat-card mint"><span className="stat-icon"><CalendarDays /></span><span><strong>{stats.upcoming}</strong><small>Next 7 days</small></span></div>
          <button className="stat-card yellow" onClick={() => changeStatus('completed')}><span className="stat-icon"><CheckCircle2 /></span><span><strong>{stats.done}</strong><small>Completed</small></span></button>
        </section>

        <section className="planner-panel">
          <div className="planner-heading">
            <div><p className="eyebrow">STAY ON TRACK</p><h2>{status === 'today' ? 'Due today' : status === 'assessments' ? 'Exams & quizzes' : 'Your assignments'}</h2></div>
            <div className="view-tabs" aria-label="Filter by completion status">
              <button className={status === 'open' ? 'active' : ''} onClick={() => changeStatus('open')}>To do</button>
              <button className={status === 'all' ? 'active' : ''} onClick={() => changeStatus('all')}>All</button>
              <button className={status === 'completed' ? 'active' : ''} onClick={() => changeStatus('completed')}>Done</button>
            </div>
          </div>

          <div className="filters">
            <label className="search-box"><Search size={16} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search assignments or classes" /><span className="sr-only">Search</span></label>
            <label className="select-wrap"><ListFilter size={14} /><select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as 'all' | ItemType)} aria-label="Filter by type"><option value="all">All types</option>{Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}s</option>)}</select><ChevronDown size={14} /></label>
            <label className="select-wrap"><BookOpen size={14} /><select value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)} aria-label="Filter by class"><option value="all">All classes</option>{courses.map((course) => <option key={course}>{course}</option>)}</select><ChevronDown size={14} /></label>
          </div>

          <div className="task-list">
            {visibleTasks.map((task, index) => {
              const due = dueInfo(task)
              return <article className={`task-card priority-${task.priority} ${task.completed ? 'is-complete' : ''}`} key={task.id}>
                <button className="check-button" onClick={() => toggleTask(task)} aria-label={`Mark ${task.title} ${task.completed ? 'incomplete' : 'complete'}`}>{task.completed && <Check size={13} strokeWidth={3} />}</button>
                <div className="task-main">
                  <div className="task-title-row"><h3>{task.title}</h3>{task.recurrence !== 'none' && <span className="recurring"><Repeat2 size={11} /> {recurrenceLabels[task.recurrence].replace('Every ', '')}</span>}</div>
                  <div className="task-meta"><span className={`course-dot color-${index % 4}`} /><span>{task.course}</span><i /><span>{typeLabels[task.type]}</span><i /><span className={`due ${due.state}`}><Clock3 size={12} /> {due.label}</span></div>
                  {task.notes && <p className="task-notes">{task.notes}</p>}
                </div>
                <span className={`priority-badge ${task.priority}`}>{task.priority}</span>
                <div className="task-actions"><button onClick={() => openEdit(task)} aria-label={`Edit ${task.title}`}><Pencil /></button><button onClick={() => deleteTask(task.id)} aria-label={`Delete ${task.title}`}><Trash2 /></button></div>
              </article>
            })}
            {!visibleTasks.length && <div className="empty-state"><span><Flower2 /></span><h3>{tasks.length ? 'No matches found' : 'A fresh page'}</h3><p>{tasks.length ? 'Try adjusting your filters or search.' : 'Your schedule has room to bloom. Add your first assignment when you’re ready.'}</p><button className="secondary-button" onClick={openCreate}><Plus size={15} /> Add a task</button></div>}
          </div>
        </section>
      </main>

      {modalOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && setModalOpen(false)}>
        <section className="task-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <form onSubmit={saveTask} className="task-form">
            <div className="modal-header"><div><p className="eyebrow">{editingId ? 'UPDATE YOUR PLANNER' : 'NEW TO YOUR PLANNER'}</p><h2 id="modal-title">{editingId ? 'Edit item' : 'Add something'}</h2></div><button type="button" className="close-button" onClick={() => setModalOpen(false)} aria-label="Close"><X /></button></div>
            <div className="form-grid">
              <label className="full-field">What do you need to do?<input autoFocus required maxLength={200} placeholder="e.g. Finish chapter 6 problems" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></label>
              <label>Class or subject<input maxLength={80} placeholder="e.g. Calculus" value={draft.course} onChange={(e) => setDraft({ ...draft, course: e.target.value })} /></label>
              <label>Type<select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as ItemType })}>{Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label>Due date<input type="date" value={draft.dueDate} onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })} /></label>
              <label>Due time<input type="time" value={draft.dueTime} onChange={(e) => setDraft({ ...draft, dueTime: e.target.value })} /></label>
              <label>Priority<select value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value as Priority })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
              <label>Repeat<select value={draft.recurrence} onChange={(e) => setDraft({ ...draft, recurrence: e.target.value as Recurrence })}>{Object.entries(recurrenceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className="full-field">Notes <small>(optional)</small><textarea rows={3} placeholder="Add details, chapters, links, or reminders…" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></label>
            </div>
            <div className="form-actions"><button type="button" className="text-button" onClick={() => setModalOpen(false)}>Cancel</button><button className="primary-button" type="submit">{editingId ? 'Save changes' : 'Add to planner'}</button></div>
          </form>
        </section>
      </div>}
    </div>
  )
}
