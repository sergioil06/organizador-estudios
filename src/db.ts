import Dexie, { type EntityTable } from 'dexie'

/** Una asignatura de la carrera. */
export interface Subject {
  id: string
  name: string
  short: string
  color: string
  credits: number
  year: number // curso (1, 2, 3, 4)
  term: 1 | 2 // cuatrimestre
  professor?: string
  status: 'active' | 'upcoming' | 'passed' | 'dropped'
  finalGrade?: number
  /** Temas de la asignatura, en orden. */
  topics: string[]
}

export type ClassType = 'CE' | 'PA' | 'PL' | 'TG' | 'Otro'

export const CLASS_TYPE_LABEL: Record<ClassType, string> = {
  CE: 'Teoría (clase expositiva)',
  PA: 'Prácticas de aula / seminario',
  PL: 'Prácticas de laboratorio',
  TG: 'Tutoría grupal',
  Otro: 'Otra',
}

/** Clase que se repite cada semana dentro de un periodo. */
export interface ClassSlot {
  id: string
  subjectId: string
  type: ClassType
  weekday: number // 1 = lunes … 7 = domingo
  start: string // HH:MM
  end: string // HH:MM
  room: string
  from: string // YYYY-MM-DD
  until: string // YYYY-MM-DD
}

export type EventKind = 'exam' | 'delivery' | 'other'

export const EVENT_KIND_LABEL: Record<EventKind, string> = {
  exam: 'Examen',
  delivery: 'Entrega',
  other: 'Evento',
}

/** Evento puntual: examen, entrega u otro. */
export interface CalEvent {
  id: string
  title: string
  kind: EventKind
  subjectId?: string
  date: string // YYYY-MM-DD
  start?: string // HH:MM (vacío = todo el día)
  end?: string
  place?: string
  topics?: string
  notes?: string
  reminderDays: number[] // avisar N días antes
  gcalId?: string // evento en Google Calendar
}

export type Priority = 'high' | 'medium' | 'low'

export const PRIORITY_LABEL: Record<Priority, string> = {
  high: 'Alta',
  medium: 'Media',
  low: 'Baja',
}

export interface Subtask {
  id: string
  title: string
  done: boolean
}

export interface Task {
  id: string
  title: string
  subjectId?: string
  priority: Priority
  due?: string // YYYY-MM-DD
  done: boolean
  doneAt?: number
  subtasks: Subtask[]
  notes?: string
  createdAt: number
  gcalId?: string
}

export interface Note {
  id: string
  title: string
  subjectId?: string
  topic?: string
  body: string // markdown
  tags: string[]
  fileIds: string[]
  createdAt: number
  updatedAt: number
}

export type FileKind = 'apuntes' | 'diapositivas' | 'ejercicios' | 'examen' | 'solucion' | 'bibliografia' | 'otro'

export const FILE_KIND_LABEL: Record<FileKind, string> = {
  apuntes: 'Apuntes',
  diapositivas: 'Diapositivas',
  ejercicios: 'Ejercicios',
  examen: 'Examen antiguo',
  solucion: 'Soluciones',
  bibliografia: 'Bibliografía',
  otro: 'Otro',
}

export interface StoredFile {
  id: string
  name: string
  mime: string
  size: number
  /** El archivo en este dispositivo (puede faltar si se subió desde otro y aún no se ha descargado). */
  blob?: Blob
  /** Id del archivo en tu Google Drive. */
  driveId?: string
  subjectId?: string
  topic?: string
  kind: FileKind
  date: string // YYYY-MM-DD (fecha del material)
  tags: string[]
  /** Texto extraído para la búsqueda (PDF ahora, fotos con IA en la fase 2). */
  text: string
  createdAt: number
}

export interface Setting {
  key: string
  value: unknown
}

/* ---------- Extras ---------- */

/** Parte de la evaluación (examen final, prácticas, parcial…). */
export interface GradeItem {
  id: string
  subjectId: string
  name: string
  weight: number // porcentaje 0-100
  grade?: number // 0-10
  minGrade?: number // nota mínima para que haga media
  order: number
}

export interface Flashcard {
  id: string
  subjectId: string
  topic?: string
  front: string
  back: string
  // repetición espaciada (SM-2)
  ease: number
  interval: number // días
  reps: number
  due: string // YYYY-MM-DD
  createdAt: number
}

export interface StudySession {
  id: string
  subjectId?: string
  date: string
  minutes: number
  kind: 'pomodoro' | 'manual'
  createdAt: number
}

export interface PlanItem {
  id: string
  topic: string
  activity: string
  minutes: number
  done: boolean
}

export interface StudyPlan {
  id: string
  subjectId: string
  eventId?: string
  examDate: string
  topics: string[]
  notes?: string
  days: { date: string; items: PlanItem[] }[]
  createdAt: number
  updatedAt: number
}

export interface Attendance {
  id: string // `${classId}_${date}`
  classId: string
  subjectId: string
  date: string
  present: boolean
}

export interface BiblioEntry {
  id: string
  subjectId: string
  title: string
  authors?: string
  kind: 'basica' | 'complementaria' | 'web'
  url?: string
  fileId?: string
  notes?: string
}

export interface ChatMessage {
  id: string
  subjectId: string
  role: 'user' | 'model'
  text: string
  createdAt: number
}

export interface Summary {
  id: string
  subjectId: string
  topic?: string
  style: 'resumen' | 'esquema'
  body: string
  createdAt: number
}

/** Registro de borrados, para que la sincronización sepa qué quitar en otros dispositivos. */
export interface Tombstone {
  key: string // `${tabla}:${id}`
  table: string
  id: string
  at: number
}

class OrganizadorDB extends Dexie {
  subjects!: EntityTable<Subject, 'id'>
  classes!: EntityTable<ClassSlot, 'id'>
  events!: EntityTable<CalEvent, 'id'>
  tasks!: EntityTable<Task, 'id'>
  notes!: EntityTable<Note, 'id'>
  files!: EntityTable<StoredFile, 'id'>
  settings!: EntityTable<Setting, 'key'>
  grades!: EntityTable<GradeItem, 'id'>
  cards!: EntityTable<Flashcard, 'id'>
  sessions!: EntityTable<StudySession, 'id'>
  plans!: EntityTable<StudyPlan, 'id'>
  attendance!: EntityTable<Attendance, 'id'>
  biblio!: EntityTable<BiblioEntry, 'id'>
  chats!: EntityTable<ChatMessage, 'id'>
  summaries!: EntityTable<Summary, 'id'>
  tombstones!: EntityTable<Tombstone, 'key'>

  constructor() {
    super('organizador-estudios')
    this.version(1).stores({
      subjects: 'id, status, year, term',
      classes: 'id, subjectId, weekday',
      events: 'id, date, kind, subjectId',
      tasks: 'id, due, done, subjectId, priority',
      notes: 'id, subjectId, updatedAt, *tags',
      files: 'id, subjectId, kind, date, createdAt, *tags',
      settings: 'key',
    })
    this.version(2).stores({
      grades: 'id, subjectId',
      cards: 'id, subjectId, due',
      sessions: 'id, subjectId, date',
      plans: 'id, subjectId, examDate',
      attendance: 'id, subjectId, classId, date',
      biblio: 'id, subjectId',
      chats: 'id, subjectId, createdAt',
      summaries: 'id, subjectId, createdAt',
      tombstones: 'key, at',
    })
  }
}

/** Tablas que se sincronizan entre dispositivos (los archivos van aparte, a Google Drive). */
export const SYNC_TABLES = [
  'subjects', 'classes', 'events', 'tasks', 'notes', 'grades', 'cards', 'sessions', 'plans', 'attendance', 'biblio', 'chats', 'summaries',
] as const
export type SyncTable = (typeof SYNC_TABLES)[number]

export const db = new OrganizadorDB()

export function uid(): string {
  return crypto.randomUUID()
}
