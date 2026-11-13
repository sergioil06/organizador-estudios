import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { db, type CalEvent, type Task } from '../db'
import { EventSheet } from '../components/events'
import { Icon } from '../components/Icon'
import { TaskSheet } from '../components/tasks'
import { Dot, Empty } from '../components/ui'
import { useSubjects, useToday } from '../hooks'
import { buildAgenda, type AgendaItem } from '../lib/agenda'
import { addDays, formatShort, fromISO, MONTHS, minutes, startOfWeek, toISO, WEEKDAYS_SHORT } from '../lib/dates'

type View = 'day' | 'week' | 'month'
const HOUR_H = 52

export default function CalendarPage() {
  const day = useToday()
  const subjects = useSubjects()
  const navigate = useNavigate()
  const [view, setView] = useState<View>(() => (window.innerWidth < 600 ? 'week' : 'week'))
  const [cursor, setCursor] = useState(day)
  const [eventOpen, setEventOpen] = useState<CalEvent | 'new' | null>(null)
  const [taskOpen, setTaskOpen] = useState<Task | null>(null)
  const [newDate, setNewDate] = useState<string | undefined>()
  const [showWeekend, setShowWeekend] = useState(false)

  const classes = useLiveQuery(() => db.classes.toArray(), [], [])
  const events = useLiveQuery(() => db.events.toArray(), [], [] as CalEvent[])
  const tasks = useLiveQuery(() => db.tasks.toArray(), [], [] as Task[])

  let from: string
  let to: string
  if (view === 'day') {
    from = to = cursor
  } else if (view === 'week') {
    from = startOfWeek(cursor)
    to = addDays(from, 6)
  } else {
    const d = fromISO(cursor)
    const first = toISO(new Date(d.getFullYear(), d.getMonth(), 1))
    from = startOfWeek(first)
    to = addDays(from, 41)
  }
  const items = buildAgenda(from, to, classes, events, tasks, subjects)

  const move = (dir: number) => {
    if (view === 'day') setCursor(addDays(cursor, dir))
    else if (view === 'week') setCursor(addDays(cursor, 7 * dir))
    else {
      const d = fromISO(cursor)
      setCursor(toISO(new Date(d.getFullYear(), d.getMonth() + dir, 1)))
    }
  }

  const open = (a: AgendaItem) => {
    if (a.source === 'event') setEventOpen(events.find((e) => e.id === a.refId) ?? null)
    else if (a.source === 'task') setTaskOpen(tasks.find((t) => t.id === a.refId) ?? null)
    else {
      const c = classes.find((x) => x.id === a.refId)
      if (c) navigate(`/asignaturas/${c.subjectId}`)
    }
  }

  const title = (() => {
    if (view === 'day') return formatShort(cursor)
    if (view === 'week') {
      const a = fromISO(from)
      const b = fromISO(addDays(from, 6))
      return a.getMonth() === b.getMonth()
        ? `${a.getDate()}–${b.getDate()} ${MONTHS[a.getMonth()].slice(0, 3)}`
        : `${a.getDate()} ${MONTHS[a.getMonth()].slice(0, 3)} – ${b.getDate()} ${MONTHS[b.getMonth()].slice(0, 3)}`
    }
    const d = fromISO(cursor)
    return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
  })()

  return (
    <div className="page">
      <div className="page-head">
        <h1 style={{ textTransform: view === 'month' ? 'capitalize' : undefined }}>{title}</h1>
        <div className="row">
          <button className="btn icon" onClick={() => move(-1)} aria-label="Anterior">
            <Icon name="left" />
          </button>
          <button className="btn sm" onClick={() => setCursor(day)}>
            Hoy
          </button>
          <button className="btn icon" onClick={() => move(1)} aria-label="Siguiente">
            <Icon name="right" />
          </button>
        </div>
      </div>

      <div className="segmented" role="tablist" aria-label="Vista">
        {(
          [
            ['day', 'Día'],
            ['week', 'Semana'],
            ['month', 'Mes'],
          ] as [View, string][]
        ).map(([v, l]) => (
          <button key={v} role="tab" aria-selected={view === v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>
            {l}
          </button>
        ))}
      </div>

      {view === 'week' && <WeekGrid from={from} days={showWeekend ? 7 : 5} items={items} today={day} onOpen={open} />}
      {view === 'week' && (
        <label className="row small muted" style={{ gap: 8 }}>
          <input type="checkbox" className="check" checked={showWeekend} onChange={(e) => setShowWeekend(e.target.checked)} />
          Mostrar fin de semana
        </label>
      )}
      {view === 'day' && <DayList items={items.filter((i) => i.date === cursor)} onOpen={open} />}
      {view === 'month' && (
        <MonthGrid
          from={from}
          month={fromISO(cursor).getMonth()}
          items={items}
          today={day}
          onPick={(d) => {
            setCursor(d)
            setView('day')
          }}
        />
      )}

      <div className="row wrap">
        <button
          className="btn primary"
          onClick={() => {
            setNewDate(view === 'day' ? cursor : undefined)
            setEventOpen('new')
          }}
        >
          <Icon name="plus" size={18} /> Examen o entrega
        </button>
      </div>

      {eventOpen && (
        <EventSheet event={eventOpen === 'new' ? undefined : eventOpen} defaultDate={newDate} subjects={subjects} onClose={() => setEventOpen(null)} />
      )}
      {taskOpen && <TaskSheet task={taskOpen} subjects={subjects} onClose={() => setTaskOpen(null)} />}
    </div>
  )
}

function blockStyle(a: AgendaItem, startHour: number): CSSProperties {
  const top = ((minutes(a.start ?? '08:00') - startHour * 60) / 60) * HOUR_H
  const h = a.end ? ((minutes(a.end) - minutes(a.start ?? a.end)) / 60) * HOUR_H : 22
  const isEvent = a.source === 'event'
  return {
    top: top + 1,
    height: Math.max(h - 2, 20),
    borderLeftColor: a.color,
    background: isEvent ? '#3b2226' : `${a.color}26`,
    color: isEvent ? '#ffd0c8' : 'var(--text)',
  }
}

function WeekGrid({ from, days, items, today, onOpen }: { from: string; days: number; items: AgendaItem[]; today: string; onOpen: (a: AgendaItem) => void }) {
  const dates = Array.from({ length: days }, (_, i) => addDays(from, i))
  const timed = items.filter((i) => i.start)
  const allDay = items.filter((i) => !i.start)
  const startHour = Math.min(8, ...timed.map((i) => Math.floor(minutes(i.start!) / 60)))
  const endHour = Math.max(16, ...timed.map((i) => Math.ceil(minutes(i.end ?? i.start!) / 60)))
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i)
  const cols = { gridTemplateColumns: `repeat(${days}, minmax(0, 1fr))` }

  return (
    <div className="card" style={{ padding: '8px 8px 12px', overflowX: 'auto' }}>
      <div className="cal-head" style={cols}>
        {dates.map((d) => (
          <div key={d} className={d === today ? 'today' : ''}>
            {WEEKDAYS_SHORT[(fromISO(d).getDay() + 6) % 7]} {fromISO(d).getDate()}
          </div>
        ))}
      </div>
      {allDay.length > 0 && (
        <div className="cal-head" style={{ ...cols, paddingBottom: 6 }}>
          {dates.map((d) => (
            <div key={d} style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: 0 }}>
              {allDay
                .filter((a) => a.date === d)
                .map((a) => (
                  <button key={a.key} className="month-ev" onClick={() => onOpen(a)} style={{ background: a.source === 'event' ? '#3b2226' : `${a.color}33`, color: a.source === 'event' ? '#ffd0c8' : 'var(--text)', border: 0, cursor: 'pointer', textAlign: 'left' }}>
                    {a.title}
                  </button>
                ))}
            </div>
          ))}
        </div>
      )}
      <div className="cal-grid">
        <div className="cal-hours">
          {hours.map((h) => (
            <div key={h} style={{ height: HOUR_H }}>
              {h}:00
            </div>
          ))}
        </div>
        <div
          className="cal-cols"
          style={{
            ...cols,
            height: hours.length * HOUR_H,
            backgroundImage: `repeating-linear-gradient(to bottom, var(--line) 0, var(--line) 1px, transparent 1px, transparent ${HOUR_H}px)`,
          }}
        >
          {dates.map((d) => (
            <div key={d} className={`cal-col ${d === today ? 'today' : ''}`}>
              {timed
                .filter((a) => a.date === d)
                .map((a) => (
                  <button key={a.key} className="cal-block" style={blockStyle(a, startHour)} onClick={() => onOpen(a)} title={`${a.title} · ${a.detail} · ${a.start}–${a.end ?? ''}`}>
                    <strong>{a.title}</strong>
                    <br />
                    {a.detail}
                  </button>
                ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function DayList({ items, onOpen }: { items: AgendaItem[]; onOpen: (a: AgendaItem) => void }) {
  if (items.length === 0)
    return (
      <div className="card">
        <Empty>Día libre: no hay clases, exámenes ni tareas.</Empty>
      </div>
    )
  return (
    <div className="card list">
      {items.map((a) => (
        <button key={a.key} className="list-item" onClick={() => onOpen(a)}>
          <span className="tnum small muted" style={{ width: 92, flex: 'none' }}>
            {a.start ? `${a.start}${a.end ? `–${a.end}` : ''}` : 'Todo el día'}
          </span>
          <span className="bar" style={{ background: a.color }} />
          <span className="stack grow" style={{ gap: 2 }}>
            <span style={{ fontWeight: 600 }}>{a.title}</span>
            <span className="xs muted">{a.detail}</span>
          </span>
          {a.source === 'event' && <span className={`pill ${a.kind}`}>{a.kind === 'exam' ? 'Examen' : a.kind === 'delivery' ? 'Entrega' : 'Evento'}</span>}
        </button>
      ))}
    </div>
  )
}

function MonthGrid({ from, month, items, today, onPick }: { from: string; month: number; items: AgendaItem[]; today: string; onPick: (d: string) => void }) {
  const dates = Array.from({ length: 42 }, (_, i) => addDays(from, i))
  return (
    <div className="stack" style={{ gap: 4 }}>
      <div className="month">
        {WEEKDAYS_SHORT.map((w) => (
          <span key={w} className="xs muted" style={{ textAlign: 'center' }}>
            {w}
          </span>
        ))}
      </div>
      <div className="month">
        {dates.map((d) => {
          const di = items.filter((i) => i.date === d)
          const special = di.filter((i) => i.source !== 'class')
          const classColors = [...new Set(di.filter((i) => i.source === 'class').map((i) => i.color))]
          return (
            <button key={d} className={`month-cell ${fromISO(d).getMonth() !== month ? 'out' : ''} ${d === today ? 'today' : ''}`} onClick={() => onPick(d)} aria-label={formatShort(d)}>
              <span className="n">{fromISO(d).getDate()}</span>
              {special.slice(0, 2).map((i) => (
                <span key={i.key} className="month-ev" style={{ background: i.source === 'event' ? '#3b2226' : `${i.color}33`, color: i.source === 'event' ? '#ffd0c8' : 'var(--text)' }}>
                  {i.title}
                </span>
              ))}
              {special.length > 2 && <span className="xs muted">+{special.length - 2}</span>}
              <span className="row" style={{ gap: 3, marginTop: 'auto' }}>
                {classColors.map((c) => (
                  <Dot key={c} color={c} />
                ))}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
