import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { db, uid, type StudySession } from '../db'
import { Dot } from '../components/ui'
import { useSubjects, useToday } from '../hooks'
import { addDays, startOfWeek, today, WEEKDAYS_SHORT } from '../lib/dates'

/* ---------- Estado del temporizador (sobrevive a cambiar de pantalla y a recargar) ---------- */
interface TimerState {
  phase: 'idle' | 'work' | 'break'
  endAt: number // ms
  pausedLeft?: number // ms si está en pausa
  subjectId?: string
  workMin: number
  breakMin: number
  round: number
}
const KEY = 'pomodoro'
const initial: TimerState = { phase: 'idle', endAt: 0, workMin: 25, breakMin: 5, round: 0 }
let st: TimerState = (() => {
  try {
    return { ...initial, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    return initial
  }
})()
const subs = new Set<() => void>()
function set(next: Partial<TimerState>) {
  st = { ...st, ...next }
  try {
    localStorage.setItem(KEY, JSON.stringify(st))
  } catch {
    /* sin almacenamiento */
  }
  subs.forEach((f) => f())
}
const subscribe = (f: () => void) => (subs.add(f), () => subs.delete(f))
export const useTimer = () => useSyncExternalStore(subscribe, () => st)

function beep() {
  try {
    const ctx = new AudioContext()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.connect(g)
    g.connect(ctx.destination)
    o.frequency.value = 880
    g.gain.setValueAtTime(0.15, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8)
    o.start()
    o.stop(ctx.currentTime + 0.8)
  } catch {
    /* sin sonido */
  }
}

function notify(text: string) {
  beep()
  navigator.vibrate?.([200, 100, 200])
  if ('Notification' in window && Notification.permission === 'granted') {
    navigator.serviceWorker?.ready.then((r) => r.showNotification('Pomodoro', { body: text, icon: '/pwa-192.png', tag: 'pomodoro' })).catch(() => new Notification('Pomodoro', { body: text }))
  }
}

/** Comprueba cada segundo si ha terminado la fase (montado una vez en la app). */
export function PomodoroTicker() {
  useEffect(() => {
    const t = setInterval(async () => {
      if (st.phase === 'idle' || st.pausedLeft != null || Date.now() < st.endAt) return
      if (st.phase === 'work') {
        await db.sessions.add({ id: uid(), subjectId: st.subjectId, date: today(), minutes: st.workMin, kind: 'pomodoro', createdAt: Date.now() })
        const long = (st.round + 1) % 4 === 0
        const b = long ? st.breakMin * 3 : st.breakMin
        set({ phase: 'break', endAt: Date.now() + b * 60_000, round: st.round + 1 })
        notify(long ? `¡Bien! Descanso largo de ${b} min.` : `¡Pomodoro hecho! Descansa ${b} min.`)
      } else {
        set({ phase: 'idle', endAt: 0 })
        notify('Descanso terminado. ¿Otro pomodoro?')
      }
    }, 1000)
    return () => clearInterval(t)
  }, [])
  return null
}

function useNow() {
  const [n, setN] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setN(Date.now()), 500)
    return () => clearInterval(t)
  }, [])
  return n
}

const fmt = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export function PomodoroView() {
  const t = useTimer()
  const now = useNow()
  const subjects = useSubjects().filter((s) => s.status === 'active')
  const [focus, setFocus] = useState(false)
  const left = t.pausedLeft ?? (t.phase === 'idle' ? t.workMin * 60_000 : t.endAt - now)
  const total = (t.phase === 'break' ? t.breakMin * ((t.round % 4 === 0) ? 3 : 1) : t.workMin) * 60_000
  const progress = t.phase === 'idle' ? 0 : 1 - left / total
  const subject = subjects.find((s) => s.id === t.subjectId)

  const start = () => {
    if ('Notification' in window && Notification.permission === 'default') void Notification.requestPermission()
    set({ phase: 'work', endAt: Date.now() + t.workMin * 60_000, pausedLeft: undefined })
  }
  const pause = () => set(t.pausedLeft != null ? { endAt: Date.now() + t.pausedLeft, pausedLeft: undefined } : { pausedLeft: t.endAt - Date.now() })
  const stop = () => set({ phase: 'idle', endAt: 0, pausedLeft: undefined })

  const R = 92
  const C = 2 * Math.PI * R
  const ring = (
    <svg width="220" height="220" viewBox="0 0 220 220" role="img" aria-label={`Quedan ${fmt(left)}`}>
      <circle cx="110" cy="110" r={R} fill="none" stroke="var(--border)" strokeWidth="10" />
      <circle cx="110" cy="110" r={R} fill="none" stroke={t.phase === 'break' ? 'var(--ok)' : subject?.color ?? 'var(--accent)'} strokeWidth="10" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - progress)} transform="rotate(-90 110 110)" />
      <text x="110" y="112" textAnchor="middle" dominantBaseline="middle" fill="var(--text)" style={{ fontFamily: 'var(--display)', fontSize: 44, fontWeight: 600 }}>
        {fmt(left)}
      </text>
      <text x="110" y="150" textAnchor="middle" fill="var(--muted)" style={{ fontSize: 13 }}>
        {t.phase === 'work' ? (t.pausedLeft != null ? 'En pausa' : 'Concentración') : t.phase === 'break' ? 'Descanso' : 'Listo'}
      </text>
    </svg>
  )

  const controls = (
    <div className="row wrap" style={{ justifyContent: 'center' }}>
      {t.phase === 'idle' ? (
        <button className="btn primary" onClick={start}>
          Empezar
        </button>
      ) : (
        <>
          <button className="btn" onClick={pause}>
            {t.pausedLeft != null ? 'Seguir' : 'Pausa'}
          </button>
          <button className="btn ghost" onClick={stop}>
            Parar
          </button>
        </>
      )}
      <button className="btn ghost" onClick={() => setFocus(!focus)}>
        {focus ? 'Salir del modo concentración' : 'Modo concentración'}
      </button>
    </div>
  )

  if (focus)
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, padding: 24 }}>
        {subject && (
          <span className="row" style={{ gap: 8 }}>
            <Dot color={subject.color} /> {subject.name}
          </span>
        )}
        {ring}
        {controls}
        <span className="small muted">Deja el móvil boca abajo. Ya te aviso yo.</span>
      </div>
    )

  return (
    <div className="stack lg">
      <div className="card pad stack" style={{ alignItems: 'center' }}>
        {ring}
        <div className="row wrap" style={{ justifyContent: 'center' }}>
          <label className="sr-only" htmlFor="pomo-subject">Asignatura</label>
          <select id="pomo-subject" className="select" style={{ width: 'auto' }} value={t.subjectId ?? ''} onChange={(e) => set({ subjectId: e.target.value || undefined })}>
            <option value="">Sin asignatura</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>{s.short}</option>
            ))}
          </select>
          <label className="sr-only" htmlFor="pomo-len">Duración</label>
          <select id="pomo-len" className="select" style={{ width: 'auto' }} value={`${t.workMin}/${t.breakMin}`} disabled={t.phase !== 'idle'} onChange={(e) => {
            const [w, b] = e.target.value.split('/').map(Number)
            set({ workMin: w, breakMin: b })
          }}>
            <option value="25/5">25 + 5 min</option>
            <option value="40/8">40 + 8 min</option>
            <option value="50/10">50 + 10 min</option>
            <option value="15/3">15 + 3 min</option>
          </select>
        </div>
        {controls}
      </div>
      <StudyStats />
    </div>
  )
}

export function StudyStats() {
  const day = useToday()
  const subjects = useSubjects()
  const sessions = useLiveQuery(() => db.sessions.where('date').aboveOrEqual(addDays(day, -60)).toArray(), [day], [] as StudySession[])
  const week = startOfWeek(day)
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i))
  const weekSessions = sessions.filter((s) => s.date >= week)
  const total = weekSessions.reduce((a, s) => a + s.minutes, 0)
  const perDay = days.map((d) => weekSessions.filter((s) => s.date === d))
  const max = Math.max(60, ...perDay.map((l) => l.reduce((a, s) => a + s.minutes, 0)))
  const bySubject = new Map<string, number>()
  for (const s of weekSessions) bySubject.set(s.subjectId ?? '', (bySubject.get(s.subjectId ?? '') ?? 0) + s.minutes)
  let streak = 0
  for (let d = day; sessions.some((s) => s.date === d); d = addDays(d, -1)) streak++
  if (streak === 0) for (let d = addDays(day, -1); sessions.some((s) => s.date === d); d = addDays(d, -1)) streak++
  const color = (id?: string) => subjects.find((s) => s.id === id)?.color ?? 'var(--faint)'
  const h = (m: number) => `${Math.floor(m / 60)} h ${m % 60} min`

  return (
    <section className="card pad stack">
      <div className="row">
        <h3 className="grow">Esta semana</h3>
        <span className="small muted">Racha: {streak} {streak === 1 ? 'día' : 'días'}</span>
      </div>
      <span style={{ fontFamily: 'var(--display)', fontSize: 28, fontWeight: 600 }}>{h(total)}</span>
      <div className="row" style={{ alignItems: 'flex-end', height: 90, gap: 6 }} role="img" aria-label="Minutos estudiados por día">
        {perDay.map((list, i) => {
          const sum = list.reduce((a, s) => a + s.minutes, 0)
          return (
            <div key={i} className="stack grow" style={{ alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' }}>
              <div style={{ width: '100%', maxWidth: 34, display: 'flex', flexDirection: 'column-reverse', borderRadius: 4, overflow: 'hidden', height: `${(sum / max) * 70}px`, background: 'var(--surface-2)' }}>
                {list.map((s) => (
                  <div key={s.id} style={{ height: `${(s.minutes / Math.max(sum, 1)) * 100}%`, background: color(s.subjectId) }} />
                ))}
              </div>
              <span className="xs muted" style={days[i] === day ? { color: 'var(--accent)', fontWeight: 700 } : undefined}>{WEEKDAYS_SHORT[i]}</span>
            </div>
          )
        })}
      </div>
      <div className="row wrap small" style={{ gap: 12 }}>
        {[...bySubject.entries()].map(([id, m]) => (
          <span key={id} className="row" style={{ gap: 6 }}>
            <Dot color={color(id)} /> {subjects.find((s) => s.id === id)?.short ?? 'Otras'}: {h(m)}
          </span>
        ))}
      </div>
      <ManualSession />
    </section>
  )
}

function ManualSession() {
  const subjects = useSubjects().filter((s) => s.status === 'active')
  const [open, setOpen] = useState(false)
  const [subjectId, setSubjectId] = useState('')
  const [mins, setMins] = useState('60')
  if (!open)
    return (
      <button className="btn sm ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setOpen(true)}>
        + Apuntar estudio sin temporizador
      </button>
    )
  return (
    <form
      className="row wrap"
      onSubmit={async (e) => {
        e.preventDefault()
        await db.sessions.add({ id: uid(), subjectId: subjectId || undefined, date: today(), minutes: Number(mins) || 0, kind: 'manual', createdAt: Date.now() })
        setOpen(false)
      }}
    >
      <label className="sr-only" htmlFor="ms-subject">Asignatura</label>
      <select id="ms-subject" className="select" style={{ width: 'auto' }} value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
        <option value="">Sin asignatura</option>
        {subjects.map((s) => (
          <option key={s.id} value={s.id}>{s.short}</option>
        ))}
      </select>
      <label className="sr-only" htmlFor="ms-min">Minutos</label>
      <input id="ms-min" className="input" style={{ width: 90 }} inputMode="numeric" value={mins} onChange={(e) => setMins(e.target.value)} />
      <span className="small muted">min hoy</span>
      <button className="btn sm primary">Guardar</button>
    </form>
  )
}
