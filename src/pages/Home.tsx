import { useLiveQuery } from 'dexie-react-hooks'
import { Fragment, useState } from 'react'
import { Link } from 'react-router-dom'
import { db, uid, EVENT_KIND_LABEL, type CalEvent, type StudyPlan, type StudySession, type Subject, type Task } from '../db'
import { EventSheet } from '../components/events'
import { TodayStudy } from '../features/planner'
import { Icon } from '../components/Icon'
import { TopBar } from '../components/shell'
import { TaskItem, TaskSheet } from '../components/tasks'
import { Dot, useToast } from '../components/ui'
import { useMinuteTick, useSubjects, useToday } from '../hooks'
import { buildAgenda, type AgendaItem } from '../lib/agenda'
import { addDays, daysBetween, formatShort, minutes, nowHHMM, relative, startOfWeek, weekday, WEEKDAYS, WEEKDAYS_SHORT } from '../lib/dates'
import { parseQuickTask } from './Tasks'

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function greeting() {
  const h = new Date().getHours()
  return h < 6 ? 'Buenas noches' : h < 14 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches'
}

export default function Home() {
  const day = useToday()
  useMinuteTick()
  const subjects = useSubjects()
  const byId = new Map(subjects.map((s) => [s.id, s]))
  const name = useLiveQuery(() => db.settings.get('name'), [])?.value as string | undefined
  const classes = useLiveQuery(() => db.classes.toArray(), [], [])
  const events = useLiveQuery(() => db.events.where('date').aboveOrEqual(day).sortBy('date'), [day], [] as CalEvent[])
  const tasks = useLiveQuery(() => db.tasks.filter((t) => !t.done).toArray(), [], [] as Task[])
  const plans = useLiveQuery(() => db.plans.toArray(), [], [] as StudyPlan[])
  const [taskOpen, setTaskOpen] = useState<Task | 'new' | null>(null)
  const [eventOpen, setEventOpen] = useState<CalEvent | 'new' | null>(null)

  const agenda = buildAgenda(day, addDays(day, 13), classes, [], [], subjects)
  const todays = agenda.filter((a) => a.date === day)
  const now = nowHHMM()
  const nextClass = agenda.find((a) => a.date > day || (a.end && a.end > now))

  const deadlines = events.filter((e) => e.kind !== 'other')
  const exam = deadlines.find((e) => e.kind === 'exam') ?? deadlines[0]
  const others = deadlines.filter((e) => e !== exam).slice(0, 4)

  const urgent = tasks
    .filter((t) => (t.due && t.due <= addDays(day, 2)) || t.priority === 'high')
    .sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999'))
    .slice(0, 6)

  const studyToday = plans.flatMap((p) => p.days.find((d) => d.date === day)?.items ?? [])
  const studyMin = studyToday.reduce((a, i) => a + i.minutes, 0)
  const studyDone = studyToday.filter((i) => i.done).length
  const dueToday = tasks.filter((t) => t.due && t.due <= day).length

  const summary = [
    todays.length ? `${todays.length} ${todays.length === 1 ? 'clase' : 'clases'}` : 'ninguna clase',
    studyToday.length ? `${Math.round((studyMin / 60) * 10) / 10} h de estudio planificado` : null,
    dueToday ? `${dueToday} ${dueToday === 1 ? 'tarea pendiente' : 'tareas pendientes'}` : null,
  ].filter(Boolean) as string[]

  return (
    <div className="page">
      <TopBar />
      <header className="page-head">
        <div>
          <span className="label eyebrow">{cap(formatShort(day))}</span>
          <h1>
            {greeting()}
            {name ? `, ${name}` : ''}
          </h1>
          <p className="muted" style={{ margin: '6px 0 0' }}>
            Hoy: {summary.length > 1 ? `${summary.slice(0, -1).join(', ')} y ${summary.at(-1)}` : summary[0]}.
          </p>
        </div>
      </header>

      <div className="dash">
        <div className="dash-col">
          <ExamHero exam={exam} subject={exam?.subjectId ? byId.get(exam.subjectId) : undefined} plans={plans} day={day} onOpen={() => exam && setEventOpen(exam)} onNew={() => setEventOpen('new')} />

          {others.length > 0 && (
            <div className="grid-auto" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}>
              {others.map((e) => (
                <MiniCountdown key={e.id} event={e} subject={e.subjectId ? byId.get(e.subjectId) : undefined} day={day} onOpen={() => setEventOpen(e)} />
              ))}
            </div>
          )}

          <section className="card pad stack" aria-label="Agenda de hoy">
            <div className="section-head">
              <h2>Clases de hoy</h2>
              <Link to="/calendario" className="link">
                Calendario <Icon name="chevron" size={14} />
              </Link>
            </div>
            {todays.length > 0 ? <Timeline items={todays} now={now} /> : <NoClasses next={nextClass} day={day} />}
          </section>

          {studyToday.length > 0 && (
            <section className="stack">
              <div className="section-head">
                <h2>Hoy toca estudiar</h2>
                <span className="small muted mono">
                  {studyDone}/{studyToday.length} · {studyMin} min
                </span>
                <Link to="/estudiar?tab=pomodoro" className="btn sm">
                  <Icon name="play" size={14} /> Pomodoro
                </Link>
              </div>
              <TodayStudy />
            </section>
          )}
        </div>

        <div className="dash-col">
          <section className="stack" aria-label="Tareas">
            <div className="section-head">
              <h2>Tareas urgentes</h2>
              <Link to="/tareas" className="link">
                Ver todas <Icon name="chevron" size={14} />
              </Link>
            </div>
            <div className="card list">
              <QuickTask subjects={subjects} day={day} />
              {urgent.length === 0 ? (
                <div className="empty" style={{ padding: '20px 16px' }}>
                  Nada urgente para los próximos dos días.
                </div>
              ) : (
                urgent.map((t) => <TaskItem key={t.id} task={t} subject={t.subjectId ? byId.get(t.subjectId) : undefined} onOpen={() => setTaskOpen(t)} />)
              )}
            </div>
          </section>

          <WeekCard day={day} agenda={agenda} events={events} />
          <StudyWeek day={day} />
        </div>
      </div>

      {taskOpen && <TaskSheet task={taskOpen === 'new' ? undefined : taskOpen} subjects={subjects} onClose={() => setTaskOpen(null)} />}
      {eventOpen && <EventSheet event={eventOpen === 'new' ? undefined : eventOpen} subjects={subjects} onClose={() => setEventOpen(null)} />}
    </div>
  )
}

/* ---------- Próximo examen: lo primero que se ve ---------- */
function ExamHero({ exam, subject, plans, day, onOpen, onNew }: { exam?: CalEvent; subject?: Subject; plans: StudyPlan[]; day: string; onOpen: () => void; onNew: () => void }) {
  if (!exam)
    return (
      <section className="card hero-exam">
        <div className="stack" style={{ gap: 6 }}>
          <span className="label">Próximo examen</span>
          <h2 style={{ fontSize: 22 }}>Aún no hay exámenes apuntados</h2>
          <p className="muted" style={{ margin: 0 }}>
            Apunta la fecha y te preparo un plan de estudio repartido por días.
          </p>
        </div>
        <div className="row">
          <button className="btn primary" onClick={onNew}>
            <Icon name="plus" size={16} /> Añadir examen
          </button>
        </div>
      </section>
    )

  const n = daysBetween(day, exam.date)
  const plan = plans.find((p) => p.eventId === exam.id) ?? plans.find((p) => p.subjectId === exam.subjectId && p.examDate === exam.date)
  const items = plan?.days.flatMap((d) => d.items) ?? []
  const done = items.filter((i) => i.done).length
  const pct = items.length ? Math.round((done / items.length) * 100) : 0
  const color = subject?.color ?? 'var(--accent)'

  return (
    <section className="card hero-exam" style={{ ['--tint' as string]: color }} aria-label="Próximo examen">
      <button onClick={onOpen} className="stack" style={{ gap: 4, background: 'none', border: 0, padding: 0, textAlign: 'left', cursor: 'pointer', color: 'var(--text)' }}>
        <span className="label row" style={{ gap: 6, color }}>
          <Dot color={color} /> {exam.kind === 'exam' ? 'Próximo examen' : `Próxima ${EVENT_KIND_LABEL[exam.kind].toLowerCase()}`}
        </span>
        <span className="big-count">
          {n === 0 ? 'Hoy' : n === 1 ? 'Mañana' : n}
          {n > 1 && <small>días</small>}
        </span>
      </button>
      <div className="stack" style={{ gap: 12 }}>
        <div className="stack" style={{ gap: 3 }}>
          <h2 style={{ fontSize: 20 }}>{exam.title}</h2>
          <span className="muted small">
            {cap(formatShort(exam.date))}
            {exam.start ? ` · ${exam.start}` : ''}
            {exam.place ? ` · ${exam.place}` : ''}
            {exam.topics ? ` · ${exam.topics}` : ''}
          </span>
        </div>
        {plan ? (
          <div className="stack" style={{ gap: 8 }}>
            <div className="row small">
              <span className="grow muted">Plan de estudio</span>
              <span className="mono">{pct}%</span>
            </div>
            <div className="progress">
              <span style={{ width: `${pct}%`, background: color }} />
            </div>
            <div className="row wrap" style={{ gap: 8 }}>
              <Link to="/estudiar?tab=plan" className="btn sm primary">
                Ver el plan <Icon name="arrow" size={14} />
              </Link>
              <span className="xs muted">
                {done} de {items.length} bloques hechos
              </span>
            </div>
          </div>
        ) : exam.kind === 'exam' ? (
          <div className="row wrap" style={{ gap: 8 }}>
            <Link to="/estudiar?tab=plan" className="btn sm primary">
              <Icon name="sparkle" size={14} /> Crear plan de estudio
            </Link>
            <span className="xs muted">Reparte los temas entre los {n} días que quedan.</span>
          </div>
        ) : null}
      </div>
    </section>
  )
}

function MiniCountdown({ event, subject, day, onOpen }: { event: CalEvent; subject?: Subject; day: string; onOpen: () => void }) {
  const n = daysBetween(day, event.date)
  return (
    <button className="card pad row" style={{ textAlign: 'left', cursor: 'pointer', color: 'var(--text)', gap: 12, padding: '12px 14px' }} onClick={onOpen}>
      <span className="stack" style={{ gap: 0, alignItems: 'center', minWidth: 36 }}>
        <span className="mono" style={{ fontSize: 22, fontWeight: 600, lineHeight: 1.1 }}>{n}</span>
        <span className="xs faint">{n === 1 ? 'día' : 'días'}</span>
      </span>
      <span className="stack grow" style={{ gap: 3 }}>
        <span className="small" style={{ fontWeight: 550, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{event.title}</span>
        <span className="row xs muted" style={{ gap: 6 }}>
          <span className={`pill ${event.kind}`}>{EVENT_KIND_LABEL[event.kind]}</span>
          {subject?.short}
        </span>
      </span>
    </button>
  )
}

/* ---------- Clases de hoy en línea de tiempo ---------- */
function Timeline({ items, now }: { items: AgendaItem[]; now: string }) {
  const nowMin = minutes(now)
  const nowIdx = items.findIndex((a) => a.start && minutes(a.start) > nowMin)
  const inside = items.some((a) => a.start && a.end && a.start <= now && a.end > now)
  return (
    <div className="timeline">
      {items.map((a, i) => {
        const past = !!a.end && a.end <= now
        const live = !!a.start && !!a.end && a.start <= now && a.end > now
        const [type, room] = a.detail.split(' · ')
        return (
          <Fragment key={a.key}>
            {!inside && i === nowIdx && i > 0 && (
              <div className="tl-now" aria-label={`Ahora, ${now}`}>
                <span>{now}</span>
                <b />
              </div>
            )}
            <div className={`tl-item ${past ? 'past' : ''} ${live ? 'now' : ''}`}>
              <span className="tl-time">{a.start}</span>
              <span className="tl-rail">
                <i style={{ background: a.color }} />
              </span>
              <span className="tl-body">
                <span className="row" style={{ gap: 8 }}>
                  <span style={{ fontWeight: 600 }}>{a.title}</span>
                  <span className="tag">{type}</span>
                  {live && <span className="pill accent">Ahora</span>}
                </span>
                <span className="small muted">
                  {a.start}–{a.end} · {room}
                </span>
              </span>
            </div>
          </Fragment>
        )
      })}
    </div>
  )
}

function NoClasses({ next, day }: { next?: AgendaItem; day: string }) {
  if (!next) return <span className="muted small">No hay clases en las próximas dos semanas.</span>
  const [type, room] = next.detail.split(' · ')
  return (
    <div className="row" style={{ gap: 12 }}>
      <span className="bar" style={{ background: next.color, minHeight: 40 }} />
      <span className="stack grow" style={{ gap: 2 }}>
        <span className="small muted">Hoy no tienes clase. La próxima es {relative(next.date, day) === 'mañana' ? 'mañana' : `el ${formatShort(next.date)}`}:</span>
        <span style={{ fontWeight: 600 }}>
          {next.title} · {type} <span className="muted" style={{ fontWeight: 400 }}>· {next.start}–{next.end} · {room}</span>
        </span>
      </span>
    </div>
  )
}

/* ---------- Añadir tarea escribiendo (como Todoist) ---------- */
function QuickTask({ subjects, day }: { subjects: Subject[]; day: string }) {
  const toast = useToast()
  const [text, setText] = useState('')
  const add = async () => {
    const p = parseQuickTask(text, day, subjects)
    if (!p.title) return
    await db.tasks.add({ id: uid(), title: p.title, due: p.due, subjectId: p.subjectId, priority: 'medium', done: false, subtasks: [], createdAt: Date.now() })
    setText('')
    toast(`Tarea añadida${p.due ? ` para ${relative(p.due, day)}` : ''}`)
  }
  return (
    <form
      className="quick-add"
      onSubmit={(e) => {
        e.preventDefault()
        add()
      }}
    >
      <Icon name="plus" size={18} />
      <label className="sr-only" htmlFor="home-quick">Nueva tarea</label>
      <input id="home-quick" value={text} onChange={(e) => setText(e.target.value)} placeholder="Nueva tarea: «hoja 6 el viernes #álgebra»" />
      {text.trim() && <button className="btn sm primary">Añadir</button>}
    </form>
  )
}

/* ---------- La semana de un vistazo ---------- */
function WeekCard({ day, agenda, events }: { day: string; agenda: AgendaItem[]; events: CalEvent[] }) {
  const start = startOfWeek(day)
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
  const weekEnd = days[6]
  const weekEvents = events.filter((e) => e.date <= weekEnd && e.kind !== 'other')
  return (
    <section className="card pad stack" aria-label="Esta semana">
      <div className="section-head">
        <h2>Esta semana</h2>
        <span className="small muted">{weekEvents.length ? `${weekEvents.length} ${weekEvents.length === 1 ? 'fecha clave' : 'fechas clave'}` : 'Sin exámenes'}</span>
      </div>
      <div className="week-strip">
        {days.map((d, i) => {
          const colors = [...new Set(agenda.filter((a) => a.date === d).map((a) => a.color))]
          const hasExam = weekEvents.some((e) => e.date === d)
          return (
            <Link key={d} to="/calendario" className={`week-day ${d === day ? 'today' : ''}`} aria-label={`${WEEKDAYS[weekday(d) - 1]} ${d.slice(8)}`}>
              <span>{WEEKDAYS_SHORT[i]}</span>
              <b>{Number(d.slice(8))}</b>
              <span className="marks">
                {colors.slice(0, 3).map((c) => (
                  <i key={c} style={{ background: c }} />
                ))}
                {hasExam && <i style={{ background: 'var(--exam)', borderRadius: 1 }} />}
              </span>
            </Link>
          )
        })}
      </div>
    </section>
  )
}

/* ---------- Tiempo de estudio de la semana ---------- */
function StudyWeek({ day }: { day: string }) {
  const start = startOfWeek(day)
  const sessions = useLiveQuery(() => db.sessions.where('date').aboveOrEqual(addDays(day, -60)).toArray(), [day], [] as StudySession[])
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
  const per = days.map((d) => sessions.filter((s) => s.date === d).reduce((a, s) => a + s.minutes, 0))
  const total = per.reduce((a, b) => a + b, 0)
  const max = Math.max(60, ...per)
  let streak = 0
  for (let d = day; sessions.some((s) => s.date === d); d = addDays(d, -1)) streak++
  if (streak === 0) for (let d = addDays(day, -1); sessions.some((s) => s.date === d); d = addDays(d, -1)) streak++

  return (
    <section className="card pad stack" aria-label="Tiempo de estudio">
      <div className="section-head">
        <h2>Tiempo de estudio</h2>
        <Link to="/estudiar?tab=pomodoro" className="link">
          Pomodoro <Icon name="chevron" size={14} />
        </Link>
      </div>
      <div className="row" style={{ alignItems: 'baseline', gap: 16 }}>
        <span style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.03em' }} className="tnum">
          {Math.floor(total / 60)}
          <span className="muted" style={{ fontSize: 15, fontWeight: 500 }}> h </span>
          {total % 60}
          <span className="muted" style={{ fontSize: 15, fontWeight: 500 }}> min</span>
        </span>
        <span className="small muted">
          Racha de {streak} {streak === 1 ? 'día' : 'días'}
        </span>
      </div>
      <div className="bars" role="img" aria-label="Minutos estudiados cada día de esta semana">
        {per.map((m, i) => (
          <div key={i}>
            <i className={days[i] === day ? 'today' : ''} style={{ height: `${(m / max) * 52}px` }} />
            <span>{WEEKDAYS_SHORT[i]}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
