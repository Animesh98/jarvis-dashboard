'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { Plus, Trash2, Film, Tv, GripVertical, ChevronLeft, ChevronRight, Calendar, ClipboardCopy, Pencil, Check, X, Copy } from 'lucide-react'
import { api } from '@/lib/api'
import { toast } from '@/lib/toast'
import styles from './page.module.scss'

interface Entity { name: string; type: string; tmdb_id: string }
interface Task {
  id: string; title: string; column: string; order: number
  entities: Entity[]; date: string; created_at: string
}

const COLUMNS = [
  { id: 'todo', label: 'To Do', dot: styles.dotTodo },
  { id: 'in_progress', label: 'In Progress', dot: styles.dotProgress },
  { id: 'done', label: 'Done', dot: styles.dotDone },
]

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

function toLocalDate(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function toDateStr(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatDateLabel(dateStr: string): string {
  const today = toLocalDate()
  const yesterday = shiftDate(today, -1)
  const tomorrow = shiftDate(today, 1)
  if (dateStr === today) return 'Today'
  if (dateStr === yesterday) return 'Yesterday'
  if (dateStr === tomorrow) return 'Tomorrow'
  const d = new Date(dateStr + 'T12:00:00')
  const weekday = d.toLocaleDateString('en-GB', { weekday: 'short' })
  const day = d.getDate()
  const month = d.toLocaleDateString('en-GB', { month: 'short' })
  return `${weekday}, ${day} ${month}`
}

/** Strip {{entity}} markers for plain-text export */
function plainTitle(title: string): string {
  return title.replace(/\{\{(.+?)\}\}/g, '$1')
}

/** Copy text to clipboard — works on non-HTTPS (LAN IP) too */
function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text)
  }
  // Fallback for HTTP / LAN access
  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.position = 'fixed'
  ta.style.left = '-9999px'
  document.body.appendChild(ta)
  ta.select()
  document.execCommand('copy')
  document.body.removeChild(ta)
  return Promise.resolve()
}

function CalendarPicker({ value, onChange, onClose }: {
  value: string; onChange: (d: string) => void; onClose: () => void
}) {
  const parsed = new Date(value + 'T12:00:00')
  const [viewYear, setViewYear] = useState(parsed.getFullYear())
  const [viewMonth, setViewMonth] = useState(parsed.getMonth())
  const ref = useRef<HTMLDivElement>(null)
  const today = toLocalDate()

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) }
    else setViewMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) }
    else setViewMonth(m => m + 1)
  }

  const firstDay = new Date(viewYear, viewMonth, 1)
  const startOffset = (firstDay.getDay() + 6) % 7
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const daysInPrev = new Date(viewYear, viewMonth, 0).getDate()

  const cells: { day: number; dateStr: string; inMonth: boolean }[] = []
  for (let i = startOffset - 1; i >= 0; i--) {
    const d = daysInPrev - i
    const pm = viewMonth === 0 ? 11 : viewMonth - 1
    const py = viewMonth === 0 ? viewYear - 1 : viewYear
    cells.push({ day: d, dateStr: toDateStr(py, pm, d), inMonth: false })
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, dateStr: toDateStr(viewYear, viewMonth, d), inMonth: true })
  }
  const remaining = 7 - (cells.length % 7)
  if (remaining < 7) {
    const nm = viewMonth === 11 ? 0 : viewMonth + 1
    const ny = viewMonth === 11 ? viewYear + 1 : viewYear
    for (let d = 1; d <= remaining; d++) {
      cells.push({ day: d, dateStr: toDateStr(ny, nm, d), inMonth: false })
    }
  }

  const monthLabel = new Date(viewYear, viewMonth, 1)
    .toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  return (
    <div ref={ref} className={styles.calendarDropdown}>
      <div className={styles.calendarHeader}>
        <button className={styles.calendarNav} onClick={prevMonth}><ChevronLeft size={14} /></button>
        <span className={styles.calendarMonth}>{monthLabel}</span>
        <button className={styles.calendarNav} onClick={nextMonth}><ChevronRight size={14} /></button>
      </div>
      <div className={styles.calendarWeekdays}>
        {WEEKDAYS.map(w => <span key={w} className={styles.calendarWeekday}>{w}</span>)}
      </div>
      <div className={styles.calendarGrid}>
        {cells.map((cell, i) => {
          const isSelected = cell.dateStr === value
          const isToday = cell.dateStr === today
          return (
            <button
              key={i}
              className={[
                styles.calendarDay,
                !cell.inMonth ? styles.calendarDayOutside : '',
                isSelected ? styles.calendarDaySelected : '',
                isToday && !isSelected ? styles.calendarDayToday : '',
              ].filter(Boolean).join(' ')}
              onClick={() => { onChange(cell.dateStr); onClose() }}
            >
              {cell.day}
            </button>
          )
        })}
      </div>
      <div className={styles.calendarFooter}>
        <button
          className={styles.calendarTodayBtn}
          onClick={() => { onChange(today); onClose() }}
        >
          Today
        </button>
      </div>
    </div>
  )
}

function renderTitle(title: string, entities: Entity[]) {
  const entityMap = new Map(entities.map(e => [e.name.toLowerCase(), e]))
  const parts: React.ReactNode[] = []
  const regex = /\{\{(.+?)\}\}/g
  let last = 0
  let match
  let i = 0

  while ((match = regex.exec(title)) !== null) {
    if (match.index > last) parts.push(title.slice(last, match.index))
    const name = match[1]
    const entity = entityMap.get(name.toLowerCase())
    if (entity?.tmdb_id) {
      const eType = entity.type === 'series' || entity.type === 'tv' ? 'tv' : 'movie'
      parts.push(
        <Link key={i++} href={`/discover/${eType}/${entity.tmdb_id}`} className={styles.entityChip} onClick={e => e.stopPropagation()}>
          {eType === 'tv' ? <Tv size={10} /> : <Film size={10} />} {entity.name}
        </Link>
      )
    } else {
      parts.push(<span key={i++} className={styles.entityChip}>{name}</span>)
    }
    last = regex.lastIndex
  }
  if (last < title.length) parts.push(title.slice(last))
  return parts
}

/* ── Inline Edit Form ──────────────────────────────────────── */

function EditTaskForm({ task, onSave, onCancel }: {
  task: Task; onSave: (id: string, title: string, entities: Entity[]) => void; onCancel: () => void
}) {
  const [value, setValue] = useState(task.title)
  const [suggestions, setSuggestions] = useState<any[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)
  const [entities, setEntities] = useState<Entity[]>([...task.entities])
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    const el = inputRef.current
    if (el) { el.focus(); el.selectionStart = el.selectionEnd = el.value.length }
  }, [])

  const handleChange = (text: string) => {
    setValue(text)
    const cursor = inputRef.current?.selectionStart ?? text.length
    const before = text.slice(0, cursor)
    const openIdx = before.lastIndexOf('{{')
    const closeIdx = before.lastIndexOf('}}')

    if (openIdx > closeIdx) {
      const query = before.slice(openIdx + 2)
      if (query.length >= 2) {
        clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(async () => {
          const r = await api<{ results: any[] }>(`/api/recommendations/autocomplete?q=${encodeURIComponent(query)}`)
          if (r.data?.results) {
            setSuggestions(r.data.results)
            setShowSuggestions(true)
            setActiveIdx(0)
          }
        }, 250)
      } else {
        setShowSuggestions(false)
      }
    } else {
      setShowSuggestions(false)
    }
  }

  const insertEntity = (item: any) => {
    const cursor = inputRef.current?.selectionStart ?? value.length
    const before = value.slice(0, cursor)
    const after = value.slice(cursor)
    const openIdx = before.lastIndexOf('{{')
    const newText = before.slice(0, openIdx) + `{{${item.title}}}` + after
    setValue(newText)
    setShowSuggestions(false)
    setEntities(prev => [...prev, { name: item.title, type: item.type || 'movie', tmdb_id: item.tmdb_id || '' }])
    setTimeout(() => inputRef.current?.focus(), 10)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, suggestions.length - 1)) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)) }
      else if (e.key === 'Enter') { e.preventDefault(); insertEntity(suggestions[activeIdx]) }
      else if (e.key === 'Escape') { setShowSuggestions(false) }
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (value.trim()) onSave(task.id, value.trim(), entities) }
    if (e.key === 'Escape') onCancel()
  }

  return (
    <div className={styles.editForm} onClick={e => e.stopPropagation()}>
      {showSuggestions && suggestions.length > 0 && (
        <div className={`${styles.autocomplete} ${styles.autocompleteUp}`}>
          {suggestions.map((s, i) => (
            <div
              key={s.tmdb_id || i}
              className={styles.autocompleteItem}
              data-active={i === activeIdx ? 'true' : undefined}
              onMouseDown={() => insertEntity(s)}
              onMouseEnter={() => setActiveIdx(i)}
            >
              <span className={styles.autocompleteType}>
                {s.type === 'series' || s.type === 'tv' ? 'TV' : 'Movie'}
              </span>
              <span>{s.title}</span>
              {s.year && <span className={styles.autocompleteYear}>{s.year}</span>}
            </div>
          ))}
        </div>
      )}
      <textarea
        ref={inputRef}
        className={styles.editInput}
        value={value}
        onChange={e => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={1}
      />
      <div className={styles.editActions}>
        <button className={styles.editActionBtn} onClick={onCancel} title="Cancel">
          <X size={13} />
        </button>
        <button className={`${styles.editActionBtn} ${styles.editActionSave}`} onClick={() => { if (value.trim()) onSave(task.id, value.trim(), entities) }} title="Save">
          <Check size={13} />
        </button>
      </div>
    </div>
  )
}

/* ── Task Card (native HTML5 drag) ─────────────────────────── */

function TaskCard({ task, onDelete, onEdit, onCopy, onDragStart, onDragEnd, editingId, onEditSave, onEditCancel }: {
  task: Task
  onDelete: (id: string) => void
  onEdit: (id: string) => void
  onCopy: (task: Task) => void
  onDragStart: (e: React.DragEvent, task: Task) => void
  onDragEnd: () => void
  editingId: string | null
  onEditSave: (id: string, title: string, entities: Entity[]) => void
  onEditCancel: () => void
}) {
  const isEditing = editingId === task.id

  return (
    <div
      className={`${styles.task} ${task.column === 'done' ? styles.taskDone : ''}`}
      draggable={!isEditing}
      onDragStart={e => onDragStart(e, task)}
      onDragEnd={onDragEnd}
    >
      <div className={styles.taskBody}>
        <div className={styles.dragHandle}>
          <GripVertical size={14} />
        </div>
        <div className={styles.taskMain}>
          {isEditing ? (
            <EditTaskForm task={task} onSave={onEditSave} onCancel={onEditCancel} />
          ) : (
            <>
              <div className={styles.taskContent}>{renderTitle(task.title, task.entities)}</div>
              <div className={styles.taskFooter}>
                <span className={styles.taskDate}>
                  {new Date(task.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })}
                </span>
                <div className={styles.taskActions}>
                  <button className={styles.taskActionBtn} onClick={(e) => { e.stopPropagation(); onCopy(task) }} title="Copy">
                    <Copy size={13} />
                  </button>
                  <button className={styles.taskActionBtn} onClick={(e) => { e.stopPropagation(); onEdit(task.id) }} title="Edit">
                    <Pencil size={13} />
                  </button>
                  <button className={`${styles.taskActionBtn} ${styles.taskActionDelete}`} onClick={(e) => { e.stopPropagation(); onDelete(task.id) }} title="Delete">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Add Task Form ─────────────────────────────────────────── */

function AddTaskForm({ column, onAdd, onCancel }: {
  column: string; onAdd: (title: string, entities: Entity[]) => void; onCancel: () => void
}) {
  const [value, setValue] = useState('')
  const [suggestions, setSuggestions] = useState<any[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)
  const [entities, setEntities] = useState<Entity[]>([])
  const [dropUp, setDropUp] = useState(true)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const formRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    if (showSuggestions && formRef.current) {
      const rect = formRef.current.getBoundingClientRect()
      const spaceAbove = rect.top
      const spaceBelow = window.innerHeight - rect.bottom
      setDropUp(spaceAbove > spaceBelow)
    }
  }, [showSuggestions])

  const handleChange = (text: string) => {
    setValue(text)
    const cursor = inputRef.current?.selectionStart ?? text.length
    const before = text.slice(0, cursor)
    const openIdx = before.lastIndexOf('{{')
    const closeIdx = before.lastIndexOf('}}')

    if (openIdx > closeIdx) {
      const query = before.slice(openIdx + 2)
      if (query.length >= 2) {
        clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(async () => {
          const r = await api<{ results: any[] }>(`/api/recommendations/autocomplete?q=${encodeURIComponent(query)}`)
          if (r.data?.results) {
            setSuggestions(r.data.results)
            setShowSuggestions(true)
            setActiveIdx(0)
          }
        }, 250)
      } else {
        setShowSuggestions(false)
      }
    } else {
      setShowSuggestions(false)
    }
  }

  const insertEntity = (item: any) => {
    const cursor = inputRef.current?.selectionStart ?? value.length
    const before = value.slice(0, cursor)
    const after = value.slice(cursor)
    const openIdx = before.lastIndexOf('{{')
    const newText = before.slice(0, openIdx) + `{{${item.title}}}` + after
    setValue(newText)
    setShowSuggestions(false)
    setEntities(prev => [...prev, { name: item.title, type: item.type || 'movie', tmdb_id: item.tmdb_id || '' }])
    setTimeout(() => inputRef.current?.focus(), 10)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, suggestions.length - 1)) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)) }
      else if (e.key === 'Enter') { e.preventDefault(); insertEntity(suggestions[activeIdx]) }
      else if (e.key === 'Escape') { setShowSuggestions(false) }
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (value.trim()) onAdd(value.trim(), entities) }
    if (e.key === 'Escape') onCancel()
  }

  return (
    <div className={styles.addForm} ref={formRef}>
      {showSuggestions && suggestions.length > 0 && (
        <div className={`${styles.autocomplete} ${dropUp ? styles.autocompleteUp : styles.autocompleteDown}`}>
          {suggestions.map((s, i) => (
            <div
              key={s.tmdb_id || i}
              className={styles.autocompleteItem}
              data-active={i === activeIdx ? 'true' : undefined}
              onMouseDown={() => insertEntity(s)}
              onMouseEnter={() => setActiveIdx(i)}
            >
              <span className={styles.autocompleteType}>
                {s.type === 'series' || s.type === 'tv' ? 'TV' : 'Movie'}
              </span>
              <span>{s.title}</span>
              {s.year && <span className={styles.autocompleteYear}>{s.year}</span>}
            </div>
          ))}
        </div>
      )}
      <textarea
        ref={inputRef}
        className={styles.addInput}
        placeholder='Task title... type {{ to link movies'
        value={value}
        onChange={e => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={1}
      />
      <div className={styles.addFormActions}>
        <button className={`btn btn-ghost btn-sm ${styles.addFormBtn}`} onClick={onCancel}>Cancel</button>
        <button className={`btn btn-primary btn-sm ${styles.addFormBtn}`} onClick={() => { if (value.trim()) onAdd(value.trim(), entities) }}>Add</button>
      </div>
    </div>
  )
}

/* ── Main Page ─────────────────────────────────────────────── */

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [selectedDate, setSelectedDate] = useState(toLocalDate)
  const [addingTo, setAddingTo] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [migratedCount, setMigratedCount] = useState(0)
  const [calendarOpen, setCalendarOpen] = useState(false)

  // Native DnD state
  const [dragTaskId, setDragTaskId] = useState<string | null>(null)
  const [dragOverCol, setDragOverCol] = useState<string | null>(null)

  const migratedRef = useRef(false)

  // Auto-migrate old incomplete tasks to today on first load
  useEffect(() => {
    if (migratedRef.current) return
    migratedRef.current = true
    const today = toLocalDate()
    api<{ migrated: number }>(`/api/tasks/migrate?date=${today}`, { method: 'POST' })
      .then(r => { if (r.data?.migrated) setMigratedCount(r.data.migrated) })
  }, [])

  // Fetch tasks for selected date
  useEffect(() => {
    api<Task[]>(`/api/tasks?date=${selectedDate}`).then(r => {
      if (Array.isArray(r.data)) setTasks(r.data)
    })
  }, [selectedDate, migratedCount])

  const tasksInColumn = useCallback((col: string) =>
    tasks.filter(t => t.column === col).sort((a, b) => a.order - b.order)
  , [tasks])

  const handleAdd = async (column: string, title: string, entities: Entity[]) => {
    setAddingTo(null)
    const r = await api<Task>('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, column, entities, date: selectedDate }),
    })
    if (r.data) setTasks(prev => [...prev, r.data!])
  }

  const handleDelete = async (id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id))
    await api(`/api/tasks/${id}`, { method: 'DELETE' })
  }

  const handleEditSave = async (id: string, title: string, entities: Entity[]) => {
    setEditingId(null)
    // Optimistic update
    setTasks(prev => prev.map(t => t.id === id ? { ...t, title, entities } : t))
    await api(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, entities }),
    })
  }

  const handleCopyTask = (task: Task) => {
    copyToClipboard(plainTitle(task.title)).then(() => {
      toast('Copied to clipboard')
    }).catch(() => {
      toast('Failed to copy', 'error')
    })
  }

  const handleCopyColumn = (colId: string, colLabel: string) => {
    const colTasks = tasksInColumn(colId)
    if (colTasks.length === 0) {
      toast('No tasks to copy', 'error')
      return
    }
    const text = colTasks.map(t => `- ${plainTitle(t.title)}`).join('\n')
    copyToClipboard(text).then(() => {
      toast(`Copied ${colTasks.length} ${colLabel} tasks`)
    }).catch(() => {
      toast('Failed to copy', 'error')
    })
  }

  /* ── Native HTML5 Drag & Drop ────────────────────────────── */

  const handleDragStart = (e: React.DragEvent, task: Task) => {
    setDragTaskId(task.id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', task.id)
    // Make the ghost slightly transparent
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.4'
    }
  }

  const handleDragEnd = () => {
    setDragTaskId(null)
    setDragOverCol(null)
    // Reset opacity on all task cards
    document.querySelectorAll(`.${styles.task}`).forEach(el => {
      ;(el as HTMLElement).style.opacity = ''
    })
  }

  const handleColumnDragOver = (e: React.DragEvent, colId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverCol(colId)
  }

  const handleColumnDragLeave = (e: React.DragEvent, colId: string) => {
    // Only clear if actually leaving the column (not entering a child)
    const related = e.relatedTarget as HTMLElement | null
    const currentTarget = e.currentTarget as HTMLElement
    if (!related || !currentTarget.contains(related)) {
      setDragOverCol(prev => prev === colId ? null : prev)
    }
  }

  const handleColumnDrop = async (e: React.DragEvent, targetCol: string) => {
    e.preventDefault()
    setDragOverCol(null)
    const taskId = e.dataTransfer.getData('text/plain')
    if (!taskId) return

    const task = tasks.find(t => t.id === taskId)
    if (!task) return

    // Get the drop target task (if dropping on a specific task)
    let dropTargetId: string | null = null
    const target = e.target as HTMLElement
    const taskEl = target.closest('[data-task-id]')
    if (taskEl) {
      dropTargetId = taskEl.getAttribute('data-task-id')
    }

    const colTasks = tasks
      .filter(t => t.column === targetCol && t.id !== taskId)
      .sort((a, b) => a.order - b.order)

    let insertIdx = colTasks.length // default: end
    if (dropTargetId && dropTargetId !== taskId) {
      const targetIdx = colTasks.findIndex(t => t.id === dropTargetId)
      if (targetIdx !== -1) {
        // Use cursor Y vs target card midpoint to decide before/after
        const rect = taskEl?.getBoundingClientRect()
        const midY = rect ? rect.top + rect.height / 2 : 0
        insertIdx = e.clientY < midY ? targetIdx : targetIdx + 1
      }
    }

    // Build new order
    const newColTasks = [...colTasks]
    newColTasks.splice(insertIdx, 0, { ...task, column: targetCol })

    const updates = newColTasks.map((t, i) => ({ id: t.id, column: targetCol, order: i }))

    // Also need to keep tasks from other columns unchanged
    setTasks(prev => {
      const others = prev.filter(t => t.column !== targetCol && t.id !== taskId)
      return [...others, ...newColTasks.map((t, i) => ({ ...t, column: targetCol, order: i }))]
    })

    const r = await api<{ ok: boolean }>('/api/tasks/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    if (!r.data?.ok) {
      const fresh = await api<Task[]>(`/api/tasks?date=${selectedDate}`)
      if (Array.isArray(fresh.data)) setTasks(fresh.data)
    }
  }

  const isToday = selectedDate === toLocalDate()

  return (
    <>
      <header className="page-header">
        <h2 className="page-title">Tasks</h2>
        <div className={styles.datePicker}>
          <button
            className={styles.dateArrow}
            onClick={() => setSelectedDate(d => shiftDate(d, -1))}
            title="Previous day"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            className={`${styles.dateLabel} ${isToday ? styles.dateLabelToday : ''}`}
            onClick={() => setCalendarOpen(v => !v)}
            title="Pick a date"
          >
            <Calendar size={13} />
            {formatDateLabel(selectedDate)}
          </button>
          {calendarOpen && (
            <CalendarPicker
              value={selectedDate}
              onChange={setSelectedDate}
              onClose={() => setCalendarOpen(false)}
            />
          )}
          <button
            className={styles.dateArrow}
            onClick={() => setSelectedDate(d => shiftDate(d, 1))}
            title="Next day"
          >
            <ChevronRight size={16} />
          </button>
          {!isToday && (
            <button
              className={styles.dateTodayBtn}
              onClick={() => setSelectedDate(toLocalDate())}
            >
              Today
            </button>
          )}
        </div>
      </header>

      {migratedCount > 0 && isToday && (
        <div className={styles.migrateBanner}>
          Carried over {migratedCount} incomplete {migratedCount === 1 ? 'task' : 'tasks'} from previous days
          <button className={styles.migrateDismiss} onClick={() => setMigratedCount(0)}>&times;</button>
        </div>
      )}

      <div className="page-body">
        <div className={styles.board}>
          {COLUMNS.map(col => {
            const colTasks = tasksInColumn(col.id)
            return (
              <div key={col.id} className={`${styles.column} ${styles[`col_${col.id}`]}`}>
                <div className={styles.columnHeader}>
                  <div className={styles.columnTitle}>
                    <span className={`${styles.columnDot} ${col.dot}`} />
                    {col.label}
                    <span className={styles.columnCount}>{colTasks.length}</span>
                  </div>
                  <div className={styles.columnActions}>
                    <button
                      className={styles.columnActionBtn}
                      onClick={() => handleCopyColumn(col.id, col.label)}
                      title="Copy tasks as list"
                    >
                      <ClipboardCopy size={14} />
                    </button>
                    <button
                      className={styles.columnActionBtn}
                      onClick={() => setAddingTo(addingTo === col.id ? null : col.id)}
                      title="Add task"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                </div>

                {addingTo === col.id && (
                  <AddTaskForm
                    column={col.id}
                    onAdd={(title, entities) => handleAdd(col.id, title, entities)}
                    onCancel={() => setAddingTo(null)}
                  />
                )}

                <div
                  className={`${styles.taskList} ${dragOverCol === col.id && dragTaskId ? styles.taskListOver : ''}`}
                  onDragOver={e => handleColumnDragOver(e, col.id)}
                  onDragLeave={e => handleColumnDragLeave(e, col.id)}
                  onDrop={e => handleColumnDrop(e, col.id)}
                >
                  {colTasks.map(task => (
                    <div key={task.id} data-task-id={task.id}>
                      <TaskCard
                        task={task}
                        onDelete={handleDelete}
                        onEdit={setEditingId}
                        onCopy={handleCopyTask}
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEnd}
                        editingId={editingId}
                        onEditSave={handleEditSave}
                        onEditCancel={() => setEditingId(null)}
                      />
                    </div>
                  ))}
                  {colTasks.length === 0 && addingTo !== col.id && (
                    <div className={styles.emptyColumn}>No tasks</div>
                  )}
                </div>

                {addingTo !== col.id && (
                  <button
                    className={styles.addBottomBtn}
                    onClick={() => setAddingTo(col.id)}
                  >
                    <Plus size={14} /> Add task
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
