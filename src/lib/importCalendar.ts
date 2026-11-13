import { db, uid, type ClassSlot, type ClassType, type Subject } from '../db'
import { listCalendarEvents } from './google'
import { toISO, weekday } from './dates'

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

function typeFromGroup(g: string): ClassType {
  const n = norm(g)
  if (n.includes('expositiva') || n.includes('teoria')) return 'CE'
  if (n.includes('laboratorio')) return 'PL'
  if (n.includes('aula') || n.includes('semin')) return 'PA'
  if (n.includes('tutoria')) return 'TG'
  return 'Otro'
}

/**
 * Lee las clases de tu Google Calendar (formato de Uniovi: "Cálculo - Grupo: Prácticas de Laboratorio-01")
 * y las convierte en clases semanales de las asignaturas que estás cursando.
 */
export async function previewCalendarImport(from: string, until: string, subjects: Subject[]): Promise<ClassSlot[]> {
  const events = await listCalendarEvents(new Date(`${from}T00:00:00`).toISOString(), new Date(`${until}T23:59:59`).toISOString())
  const active = subjects.filter((s) => s.status === 'active')
  const groups = new Map<string, ClassSlot>()
  for (const e of events) {
    if (!e.start?.dateTime || !e.end?.dateTime) continue
    const m = e.summary?.match(/^(.+?)\s+-\s+Grupo:\s*(.+)$/)
    const name = m ? m[1] : e.summary ?? ''
    const subject = active.find((s) => norm(s.name) === norm(name) || norm(s.short) === norm(name) || norm(name).startsWith(norm(s.name)))
    if (!subject) continue
    const start = new Date(e.start.dateTime)
    const end = new Date(e.end.dateTime)
    const date = toISO(start)
    const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    const type = typeFromGroup(m ? m[2] : '')
    const key = [subject.id, type, weekday(date), hhmm(start), hhmm(end), e.location ?? ''].join('|')
    const g = groups.get(key)
    if (g) {
      if (date < g.from) g.from = date
      if (date > g.until) g.until = date
    } else {
      groups.set(key, { id: uid(), subjectId: subject.id, type, weekday: weekday(date), start: hhmm(start), end: hhmm(end), room: e.location ?? '', from: date, until: date })
    }
  }
  return [...groups.values()].sort((a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start))
}

/** Sustituye el horario de esas asignaturas por el importado. */
export async function applyCalendarImport(slots: ClassSlot[]): Promise<void> {
  const ids = [...new Set(slots.map((s) => s.subjectId))]
  await db.transaction('rw', db.classes, async () => {
    for (const id of ids) await db.classes.where('subjectId').equals(id).delete()
    await db.classes.bulkAdd(slots)
  })
}
