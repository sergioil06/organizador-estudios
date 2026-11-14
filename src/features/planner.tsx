import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db, uid, type CalEvent, type PlanItem, type StudyPlan, type Subject } from '../db'
import { Icon } from '../components/Icon'
import { ConfirmButton, Dot, Empty, Sheet, useToast } from '../components/ui'
import { useSubjects, useToday } from '../hooks'
import { aiAvailable, aiStudyPlan, type PlanDay } from '../lib/ai'
import { addDays, daysBetween, formatShort, minutes, weekday, WEEKDAYS } from '../lib/dates'

async function dailyBudget(): Promise<{ weekday: number; weekend: number }> {
  const v = (await db.settings.get('studyMinutes'))?.value as { weekday: number; weekend: number } | undefined
  return v ?? { weekday: 150, weekend: 210 }
}

/** Minutos libres para estudiar cada día (tu objetivo diario menos lo que ya tengas planificado de otros exámenes). */
async function availability(from: string, to: string, excludePlan?: string) {
  const budget = await dailyBudget()
  const plans = (await db.plans.toArray()).filter((p) => p.id !== excludePlan)
  const classes = await db.classes.toArray()
  const out: { date: string; freeMinutes: number }[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const wd = weekday(d)
    let free = wd >= 6 ? budget.weekend : budget.weekday
    // un día con muchas clases deja menos energía: quitamos un tercio de las horas de clase
    const classMin = classes.filter((c) => c.weekday === wd && d >= c.from && d <= c.until).reduce((a, c) => a + minutes(c.end) - minutes(c.start), 0)
    free -= Math.round(classMin / 3)
    for (const p of plans) for (const day of p.days) if (day.date === d) free -= day.items.reduce((a, i) => a + i.minutes, 0)
    out.push({ date: d, freeMinutes: Math.max(0, free) })
  }
  return out
}

/** Reparto sencillo sin IA: teoría y luego ejercicios de cada tema, y repaso al final. */
function fallbackPlan(topics: string[], avail: { date: string; freeMinutes: number }[]): PlanDay[] {
  const days = avail.filter((a) => a.freeMinutes >= 25)
  if (days.length === 0) return []
  const review = days.slice(-2)
  const work = days.length > 3 ? days.slice(0, -2) : days
  const blocks: { topic: string; activity: string; minutes: number }[] = []
  for (const t of topics) {
    blocks.push({ topic: t, activity: 'Teoría: definiciones, teoremas y propiedades', minutes: 50 })
    blocks.push({ topic: t, activity: 'Ejercicios', minutes: 50 })
    blocks.push({ topic: t, activity: 'Flashcards y dudas', minutes: 25 })
  }
  const plan: PlanDay[] = work.map((d) => ({ date: d.date, items: [] }))
  // Reparte los bloques a lo largo de todos los días (no los amontona al principio).
  blocks.forEach((b, k) => {
    const start = Math.floor((k * plan.length) / blocks.length)
    for (let tries = 0; tries < plan.length; tries++) {
      const idx = (start + tries) % plan.length
      const used = plan[idx].items.reduce((a, x) => a + x.minutes, 0)
      if (used + b.minutes <= work[idx].freeMinutes) {
        plan[idx].items.push(b)
        break
      }
    }
  })
  plan.sort((a, b) => a.date.localeCompare(b.date))
  if (days.length > 3)
    for (const d of review)
      plan.push({ date: d.date, items: [{ topic: 'Todo', activity: d === review[0] ? 'Repaso general de teoría + flashcards' : 'Examen antiguo cronometrado y repaso de fallos', minutes: Math.min(120, d.freeMinutes) }] })
  return plan.filter((d) => d.items.length)
}

function toPlanDays(p: PlanDay[]): StudyPlan['days'] {
  return p
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.date))
    .map((d) => ({ date: d.date, items: d.items.map((i) => ({ id: uid(), topic: i.topic, activity: i.activity, minutes: Math.max(10, Math.round(i.minutes)), done: false })) }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

export async function buildPlan(subject: Subject, examDate: string, topics: string[], notes: string, from: string, excludePlan?: string) {
  const avail = await availability(from, addDays(examDate, -1), excludePlan)
  let days: PlanDay[] | null = null
  let usedAi = false
  if (await aiAvailable()) {
    try {
      days = await aiStudyPlan({ subject, examDate, topics, startDate: from, availability: avail, notes })
      usedAi = true
    } catch (err) {
      console.warn(err)
    }
  }
  if (!days || days.length === 0) days = fallbackPlan(topics, avail)
  return { days: toPlanDays(days), usedAi }
}

export function TodayStudy() {
  const day = useToday()
  const subjects = useSubjects()
  const plans = useLiveQuery(() => db.plans.toArray(), [], [] as StudyPlan[])
  const items = plans.flatMap((p) => (p.days.find((d) => d.date === day)?.items ?? []).map((i) => ({ plan: p, item: i })))
  if (items.length === 0) return null
  return (
    <div className="card list">
      {items.map(({ plan, item }) => {
        const s = subjects.find((x) => x.id === plan.subjectId)
        return <PlanRow key={item.id} plan={plan} date={day} item={item} subject={s} />
      })}
    </div>
  )
}

function PlanRow({ plan, date, item, subject }: { plan: StudyPlan; date: string; item: PlanItem; subject?: Subject }) {
  const toggle = async () => {
    const days = plan.days.map((d) => (d.date === date ? { ...d, items: d.items.map((i) => (i.id === item.id ? { ...i, done: !i.done } : i)) } : d))
    await db.plans.update(plan.id, { days, updatedAt: Date.now() })
  }
  return (
    <label className="list-item" style={{ cursor: 'pointer' }}>
      <input type="checkbox" className="check square" style={subject ? { ['--check' as string]: subject.color } : undefined} checked={item.done} onChange={toggle} aria-label={`${item.topic}: ${item.activity}`} />
      <span className="stack grow" style={{ gap: 2 }}>
        <span className={item.done ? 'done-text' : ''} style={{ fontWeight: 500 }}>
          {item.topic !== 'Todo' ? `${item.topic}: ` : ''}
          {item.activity}
        </span>
        <span className="row xs muted" style={{ gap: 5 }}>
          {subject && <Dot color={subject.color} />}
          {subject?.short} · {item.minutes} min
        </span>
      </span>
    </label>
  )
}

export function PlannerView() {
  const day = useToday()
  const subjects = useSubjects()
  const toast = useToast()
  const plans = useLiveQuery(() => db.plans.orderBy('examDate').toArray(), [], [] as StudyPlan[])
  const exams = useLiveQuery(() => db.events.where('date').above(day).filter((e) => e.kind === 'exam').sortBy('date'), [day], [] as CalEvent[])
  const [creating, setCreating] = useState<CalEvent | 'new' | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const active = plans.filter((p) => p.examDate >= day)
  const without = exams.filter((e) => !plans.some((p) => p.eventId === e.id))

  const replan = async (p: StudyPlan) => {
    const s = subjects.find((x) => x.id === p.subjectId)
    if (!s) return
    setBusy(p.id)
    try {
      // lo hecho se queda; lo pendiente (incluido lo atrasado) se vuelve a repartir desde hoy
      const keep = p.days.filter((d) => d.date < day).map((d) => ({ ...d, items: d.items.filter((i) => i.done) })).filter((d) => d.items.length)
      const pendingTopics = [...new Set(p.days.flatMap((d) => d.items.filter((i) => !i.done && i.topic !== 'Todo').map((i) => i.topic)))]
      const { days } = await buildPlan(s, p.examDate, pendingTopics.length ? pendingTopics : p.topics, `${p.notes ?? ''}\nYa ha hecho: ${p.days.flatMap((d) => d.items.filter((i) => i.done).map((i) => `${i.topic} (${i.activity})`)).join('; ') || 'nada'}`, day, p.id)
      await db.plans.update(p.id, { days: [...keep, ...days], updatedAt: Date.now() })
      toast('Plan reajustado')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="stack lg">
      {active.length === 0 && without.length === 0 && (
        <div className="card">
          <Empty>
            <span>Apunta un examen en el calendario y aquí te reparto los temas entre los días que tienes.</span>
            <button className="btn sm" onClick={() => setCreating('new')}>
              <Icon name="plus" size={16} /> Crear plan
            </button>
          </Empty>
        </div>
      )}
      {without.length > 0 && (
        <div className="card accent pad stack">
          <span className="label" style={{ color: 'var(--accent)' }}>Exámenes sin plan</span>
          {without.map((e) => {
            const s = subjects.find((x) => x.id === e.subjectId)
            return (
              <div key={e.id} className="row">
                {s && <Dot color={s.color} />}
                <span className="grow">
                  {e.title} · {formatShort(e.date)} ({daysBetween(day, e.date)} días)
                </span>
                <button className="btn sm primary" onClick={() => setCreating(e)}>
                  Planificar
                </button>
              </div>
            )
          })}
        </div>
      )}
      {active.map((p) => (
        <PlanCard key={p.id} plan={p} subject={subjects.find((x) => x.id === p.subjectId)} day={day} busy={busy === p.id} onReplan={() => replan(p)} />
      ))}
      {(active.length > 0 || without.length > 0) && (
        <button className="btn" onClick={() => setCreating('new')}>
          <Icon name="plus" size={16} /> Nuevo plan
        </button>
      )}
      {creating && <PlanSheet exam={creating === 'new' ? undefined : creating} subjects={subjects} onClose={() => setCreating(null)} />}
    </div>
  )
}

function PlanCard({ plan: p, subject: s, day, busy, onReplan }: { plan: StudyPlan; subject?: Subject; day: string; busy: boolean; onReplan: () => void }) {
  const [all, setAll] = useState(false)
  const items = p.days.flatMap((d) => d.items)
  const done = items.filter((i) => i.done).length
  const late = p.days.filter((d) => d.date < day).flatMap((d) => d.items).filter((i) => !i.done).length
  const pct = items.length ? Math.round((done / items.length) * 100) : 0
  const left = daysBetween(day, p.examDate)
  // Por defecto: lo atrasado, hoy y los 3 días siguientes. El resto, plegado.
  const upcoming = p.days.filter((d) => d.date >= day || d.items.some((i) => !i.done))
  const shown = all ? p.days : upcoming.slice(0, 4)
  const hidden = p.days.length - shown.length
  const color = s?.color ?? 'var(--accent)'
  return (
    <section className="card stack" style={{ gap: 0, overflow: 'hidden' }}>
      <div className="row" style={{ padding: '16px 18px', gap: 14, borderBottom: '1px solid var(--line)' }}>
        <span className="ring" style={{ ['--p' as string]: pct, ['--c' as string]: color }}>
          <span>{pct}%</span>
        </span>
        <span className="stack grow" style={{ gap: 2 }}>
          <span className="row" style={{ gap: 8 }}>
            <h3>{s?.name ?? 'Plan'}</h3>
            <span className="pill exam">{left === 0 ? 'Hoy' : left === 1 ? 'Mañana' : `En ${left} días`}</span>
          </span>
          <span className="xs muted">
            Examen el {formatShort(p.examDate)} · {done} de {items.length} bloques hechos{late > 0 ? ` · ${late} atrasados` : ''}
          </span>
        </span>
      </div>
      {late > 0 && (
        <div className="row wrap small" style={{ padding: '10px 18px', background: 'var(--danger-soft)', color: 'var(--danger)' }}>
          <span className="grow">Te has quedado atrás. Puedo repartir lo pendiente entre los días que quedan.</span>
          <button className="btn sm" disabled={busy} onClick={onReplan}>
            {busy ? 'Reajustando…' : 'Reajustar plan'}
          </button>
        </div>
      )}
      <div style={{ padding: '4px 18px' }}>
        {shown.map((d) => {
          const mins = d.items.reduce((a, i) => a + i.minutes, 0)
          const dd = Number(d.date.slice(8))
          const wd = WEEKDAYS[weekday(d.date) - 1].slice(0, 3)
          return (
            <div key={d.date} className={`plan-day ${d.date < day ? 'past' : ''}`}>
              <span className={`plan-date ${d.date === day ? 'today' : ''}`}>
                {d.date === day ? 'Hoy' : wd}
                <b>{dd}</b>
                <span className="mono" style={{ textTransform: 'none', letterSpacing: 0 }}>{mins}′</span>
              </span>
              <div className="list">
                {d.items.map((i) => (
                  <PlanRow key={i.id} plan={p} date={d.date} item={i} subject={s} />
                ))}
              </div>
            </div>
          )
        })}
      </div>
      <div className="row wrap" style={{ padding: '10px 18px 14px', borderTop: '1px solid var(--line)' }}>
        {(hidden > 0 || all) && (
          <button className="btn sm ghost" onClick={() => setAll(!all)}>
            {all ? 'Ver solo los próximos días' : `Ver el plan completo (${hidden} días más)`}
          </button>
        )}
        <span className="grow" />
        <button className="btn sm" disabled={busy} onClick={onReplan}>
          Rehacer desde hoy
        </button>
        <ConfirmButton small label="Borrar plan" onConfirm={() => db.plans.delete(p.id)} />
      </div>
    </section>
  )
}

function PlanSheet({ exam, subjects, onClose }: { exam?: CalEvent; subjects: Subject[]; onClose: () => void }) {
  const day = useToday()
  const toast = useToast()
  const [subjectId, setSubjectId] = useState(exam?.subjectId ?? subjects.find((s) => s.status === 'active')?.id ?? '')
  const subject = subjects.find((s) => s.id === subjectId)
  const [examDate, setExamDate] = useState(exam?.date ?? addDays(day, 14))
  const [topicsText, setTopicsText] = useState(exam?.topics ? exam.topics : (subject?.topics ?? []).join('\n'))
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)

  const create = async () => {
    if (!subject) return
    const topics = topicsText.split(/\n|;|,/).map((t) => t.trim()).filter(Boolean)
    if (topics.length === 0) return toast('Escribe al menos un tema')
    setBusy(true)
    try {
      const { days, usedAi } = await buildPlan(subject, examDate, topics, notes, day)
      if (days.length === 0) {
        toast('No hay días libres antes del examen')
        return
      }
      await db.plans.add({ id: uid(), subjectId: subject.id, eventId: exam?.id, examDate, topics, notes, days, createdAt: Date.now(), updatedAt: Date.now() })
      toast(usedAi ? 'Plan creado con IA' : 'Plan creado')
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet title="Plan de estudio" onClose={onClose}>
      <div className="grid-2">
        <label className="field">
          Asignatura
          <select id="p-subject" className="select" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
            {subjects
              .filter((s) => s.status === 'active' || s.id === subjectId)
              .map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
          </select>
        </label>
        <label className="field">
          Fecha del examen
          <input id="p-date" type="date" className="input" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
        </label>
      </div>
      <label className="field">
        Temas que entran (uno por línea)
        <textarea id="p-topics" className="textarea" value={topicsText} onChange={(e) => setTopicsText(e.target.value)} placeholder={'Tema 1 · Números reales\nTema 2 · Sucesiones\nTema 3 · Límites'} />
      </label>
      <label className="field">
        ¿Algo a tener en cuenta? (opcional)
        <input id="p-notes" className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ej. el tema 3 me cuesta más; los domingos no estudio" />
      </label>
      <p className="xs muted" style={{ margin: 0 }}>
        Cuento con unas {Math.round(150 / 60 * 10) / 10} h al día entre semana y algo más el fin de semana (lo puedes cambiar en Ajustes), y resto lo de otros planes.
      </p>
      <button className="btn primary" disabled={busy || !subject} onClick={create}>
        {busy ? 'Repartiendo los temas…' : 'Crear plan'}
      </button>
    </Sheet>
  )
}
