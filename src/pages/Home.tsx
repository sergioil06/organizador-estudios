import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { db, type CalEvent, type Task } from '../db'
import { Countdown, EventSheet } from '../components/events'
import { TodayStudy } from '../features/planner'
import { Icon } from '../components/Icon'
import { TaskItem, TaskSheet } from '../components/tasks'
import { Dot, Empty } from '../components/ui'
import { useMinuteTick, useSubjects, useToday } from '../hooks'
import { buildAgenda, type AgendaItem } from '../lib/agenda'
import { addDays, formatShort, minutes, nowHHMM, relative } from '../lib/dates'

export default function Home() {
  const day = useToday()
  useMinuteTick()
  const subjects = useSubjects()
  const byId = new Map(subjects.map((s) => [s.id, s]))
  const name = useLiveQuery(() => db.settings.get('name'), [])?.value as string | undefined
  const classes = useLiveQuery(() => db.classes.toArray(), [], [])
  const events = useLiveQuery(() => db.events.where('date').aboveOrEqual(day).sortBy('date'), [day], [] as CalEvent[])
  const tasks = useLiveQuery(() => db.tasks.filter((t) => !t.done).toArray(), [], [] as Task[])
  const [taskOpen, setTaskOpen] = useState<Task | 'new' | null>(null)
  const [eventOpen, setEventOpen] = useState<CalEvent | null>(null)

  const agenda = buildAgenda(day, addDays(day, 13), classes, [], [], subjects)
  const now = nowHHMM()
  const todays = agenda.filter((a) => a.date === day)
  const next: AgendaItem | undefined = agenda.find((a) => a.date > day || (a.end && a.end > now))
  const inProgress = next && next.date === day && next.start && next.start <= now

  const urgent = tasks
    .filter((t) => (t.due && t.due <= addDays(day, 2)) || t.priority === 'high')
    .sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999'))
    .slice(0, 6)
  const upcoming = events.filter((e) => e.kind !== 'other').slice(0, 4)

  const nextLabel = () => {
    if (!next?.start) return ''
    if (inProgress) return 'Ahora'
    if (next.date === day) {
      const m = minutes(next.start) - minutes(now)
      return m < 60 ? `En ${m} min` : `Hoy a las ${next.start}`
    }
    return `${relative(next.date, day).replace(/^./, (c) => c.toUpperCase())} · ${formatShort(next.date)}`
  }

  return (
    <div className="page">
      <div className="page-head">
        <div className="stack" style={{ gap: 2 }}>
          <span className="label">{formatShort(day)}</span>
          <h1>Hola{name ? `, ${name}` : ''}</h1>
        </div>
        <div className="row hide-desktop">
          <Link to="/buscar" className="btn icon" aria-label="Buscar">
            <Icon name="search" size={20} />
          </Link>
          <Link to="/ajustes" className="btn icon" aria-label="Ajustes">
            <Icon name="settings" size={20} />
          </Link>
          <Link to="/subir" className="btn icon primary" aria-label="Subir archivo">
            <Icon name="upload" size={20} />
          </Link>
        </div>
      </div>

      <section className="card pad stack" aria-label="Próxima clase">
        {next ? (
          <>
            <span className="label">Próxima clase · {nextLabel()}</span>
            <div className="row" style={{ alignItems: 'stretch', gap: 12 }}>
              <span className="bar" style={{ background: next.color }} />
              <div className="stack" style={{ gap: 2 }}>
                <span style={{ fontSize: 18, fontWeight: 600 }}>
                  {next.title} · {next.detail.split(' · ')[0]}
                </span>
                <span className="muted">
                  {next.start}–{next.end} · {next.detail.split(' · ').slice(1).join(' · ')}
                </span>
              </div>
            </div>
          </>
        ) : (
          <span className="muted">No hay clases en las próximas dos semanas.</span>
        )}
        {todays.length > 0 && (
          <div className="row wrap small muted" style={{ gap: 6 }}>
            <span>Hoy:</span>
            {todays.map((a) => (
              <span key={a.key} className="row" style={{ gap: 5 }}>
                <Dot color={a.color} />
                {a.title} {a.detail.split(' · ')[0]} {a.start}
              </span>
            ))}
          </div>
        )}
      </section>

      <TodayStudySection />

      <section className="stack">
        <div className="row">
          <h2 className="grow">Tareas urgentes</h2>
          <Link to="/tareas" className="small">Ver todas</Link>
        </div>
        <div className="card list">
          {urgent.length === 0 ? (
            <Empty>
              <span>Nada urgente. ¡Bien!</span>
              <button className="btn sm" onClick={() => setTaskOpen('new')}>
                <Icon name="plus" size={16} /> Añadir tarea
              </button>
            </Empty>
          ) : (
            urgent.map((t) => <TaskItem key={t.id} task={t} subject={t.subjectId ? byId.get(t.subjectId) : undefined} onOpen={() => setTaskOpen(t)} />)
          )}
        </div>
      </section>

      <section className="stack">
        <div className="row">
          <h2 className="grow">Exámenes y entregas</h2>
          <Link to="/calendario" className="small">Calendario</Link>
        </div>
        {upcoming.length === 0 ? (
          <div className="card">
            <Empty>
              <span>Aún no has apuntado exámenes ni entregas.</span>
              <Link to="/calendario" className="btn sm">
                <Icon name="plus" size={16} /> Añadir examen
              </Link>
            </Empty>
          </div>
        ) : (
          <div className="grid-auto" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
            {upcoming.map((e) => (
              <Countdown key={e.id} event={e} subject={e.subjectId ? byId.get(e.subjectId) : undefined} onOpen={() => setEventOpen(e)} />
            ))}
          </div>
        )}
      </section>

      {taskOpen && <TaskSheet task={taskOpen === 'new' ? undefined : taskOpen} subjects={subjects} onClose={() => setTaskOpen(null)} />}
      {eventOpen && <EventSheet event={eventOpen} subjects={subjects} onClose={() => setEventOpen(null)} />}
    </div>
  )
}

function TodayStudySection() {
  const day = useToday()
  const has = useLiveQuery(async () => (await db.plans.toArray()).some((p) => p.days.some((d) => d.date === day && d.items.length)), [day], false)
  if (!has) return null
  return (
    <section className="stack">
      <div className="row">
        <h2 className="grow">Hoy toca estudiar</h2>
        <Link to="/estudiar?tab=pomodoro" className="small">Pomodoro</Link>
      </div>
      <TodayStudy />
    </section>
  )
}
