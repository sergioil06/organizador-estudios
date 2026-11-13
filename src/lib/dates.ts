/** Utilidades de fechas en hora local, con fechas como texto YYYY-MM-DD. */

export const WEEKDAYS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']
export const WEEKDAYS_SHORT = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
export const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

const pad = (n: number) => String(n).padStart(2, '0')

export function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function fromISO(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function today(): string {
  return toISO(new Date())
}

export function addDays(iso: string, n: number): string {
  const d = fromISO(iso)
  d.setDate(d.getDate() + n)
  return toISO(d)
}

/** 1 = lunes … 7 = domingo */
export function weekday(iso: string): number {
  const w = fromISO(iso).getDay()
  return w === 0 ? 7 : w
}

export function startOfWeek(iso: string): string {
  return addDays(iso, 1 - weekday(iso))
}

export function daysBetween(a: string, b: string): number {
  return Math.round((fromISO(b).getTime() - fromISO(a).getTime()) / 86_400_000)
}

export function nowHHMM(): string {
  const d = new Date()
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/** "lunes 16 nov" */
export function formatShort(iso: string): string {
  const d = fromISO(iso)
  return `${WEEKDAYS[weekday(iso) - 1]} ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`
}

/** "16 de noviembre de 2026" */
export function formatLong(iso: string): string {
  const d = fromISO(iso)
  return `${d.getDate()} de ${MONTHS[d.getMonth()]} de ${d.getFullYear()}`
}

/** "hoy", "mañana", "ayer", "en 5 días", "hace 3 días" */
export function relative(iso: string, from = today()): string {
  const n = daysBetween(from, iso)
  if (n === 0) return 'hoy'
  if (n === 1) return 'mañana'
  if (n === -1) return 'ayer'
  return n > 0 ? `en ${n} días` : `hace ${-n} días`
}
