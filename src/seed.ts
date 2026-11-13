import { db, type ClassSlot, type Subject } from './db'
import { silently } from './lib/sync'

/** Colores que la app reparte sola entre asignaturas (se ven bien sobre fondo oscuro). */
export const SUBJECT_COLORS = ['#59D3C2', '#F2B266', '#B79CFF', '#FF8FB1', '#8BD17C', '#6FB6FF', '#FF9B7A', '#E3D36B']

export function nextColor(used: string[]): string {
  return SUBJECT_COLORS.find((c) => !used.includes(c)) ?? SUBJECT_COLORS[used.length % SUBJECT_COLORS.length]
}

/** Primer cuatrimestre 2026-27 (fechas aproximadas, se pueden cambiar en Ajustes > Horario). */
const TERM1_FROM = '2026-09-07'
const TERM1_UNTIL = '2026-12-22'

/**
 * Datos iniciales: plan de 1º del Grado en Ingeniería Informática en Tecnologías de la
 * Información (Uniovi, EPI Gijón) y el horario de Álgebra y Cálculo sacado de Google Calendar.
 */
export async function seedIfEmpty(): Promise<void> {
  const seeded = await db.settings.get('seeded')
  if (seeded) return

  // Ids fijos y "fecha de cambio" 1: así, si instalas la app en otro dispositivo, no se duplican
  // las asignaturas y cualquier cambio tuyo siempre gana a estos datos iniciales.
  const mk = (id: string, name: string, short: string, color: string, term: 1 | 2, status: Subject['status']): Subject & { _u: number } => ({
    id,
    _u: 1,
    name,
    short,
    color,
    credits: 6,
    year: 1,
    term,
    status,
    topics: [],
  })

  const algebra = mk('giitin-1-algebra', 'Álgebra Lineal', 'Álgebra', SUBJECT_COLORS[0], 1, 'active')
  const calculo = mk('giitin-1-calculo', 'Cálculo', 'Cálculo', SUBJECT_COLORS[1], 1, 'active')
  const second: Subject[] = [
    mk('giitin-1-estadistica', 'Estadística', 'Estadística', SUBJECT_COLORS[2], 2, 'upcoming'),
    mk('giitin-1-fcr', 'Fundamentos de Computadores y Redes', 'FCR', SUBJECT_COLORS[3], 2, 'upcoming'),
    mk('giitin-1-automatas', 'Autómatas y Matemáticas Discretas', 'Autómatas', SUBJECT_COLORS[4], 2, 'upcoming'),
    mk('giitin-1-mp', 'Metodología de la Programación', 'MP', SUBJECT_COLORS[5], 2, 'upcoming'),
    mk('giitin-1-ondas', 'Ondas y Electromagnetismo', 'Ondas', SUBJECT_COLORS[6], 2, 'upcoming'),
  ]

  let n = 0
  const slot = (
    subjectId: string,
    type: ClassSlot['type'],
    weekday: number,
    start: string,
    end: string,
    room: string,
  ): ClassSlot => ({ id: `seed-clase-${++n}`, _u: 1, subjectId, type, weekday, start, end, room, from: TERM1_FROM, until: TERM1_UNTIL }) as ClassSlot

  const classes: ClassSlot[] = [
    // Álgebra Lineal
    slot(algebra.id, 'CE', 1, '12:00', '13:00', 'Aula A'),
    slot(algebra.id, 'PA', 1, '13:00', '14:00', 'Aula A'),
    slot(algebra.id, 'CE', 4, '09:00', '10:00', 'Aula A'),
    slot(algebra.id, 'PA', 4, '13:00', '14:00', 'Aula E'),
    // Cálculo
    slot(calculo.id, 'PL', 1, '09:00', '11:00', 'Aula de Informática B1'),
    slot(calculo.id, 'PA', 1, '14:00', '15:00', 'Aula A'),
    slot(calculo.id, 'CE', 2, '14:00', '15:00', 'Aula A'),
    slot(calculo.id, 'PA', 4, '14:00', '15:00', 'Aula E'),
    slot(calculo.id, 'CE', 5, '12:00', '13:00', 'Aula A'),
  ]

  await silently(() =>
    db.transaction('rw', [db.subjects, db.classes, db.settings], async () => {
      await db.subjects.bulkPut([algebra, calculo, ...second])
      await db.classes.bulkPut(classes)
      await db.settings.put({ key: 'seeded', value: true })
      await db.settings.put({ key: 'name', value: 'Sergio', _u: 1 } as never)
    }),
  )
}
