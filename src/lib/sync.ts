/**
 * Sincronización entre dispositivos usando tu propio Google Drive:
 * - los datos (asignaturas, tareas, notas…) en un archivo de la carpeta oculta de la app;
 * - los archivos (PDF, fotos…) como archivos normales en "Mi unidad › Organizador de estudios";
 * - los exámenes, entregas y tareas con fecha, en tu Google Calendar.
 * Todo funciona sin conexión: los cambios se guardan en el dispositivo y se suben al volver internet.
 */
import { db, EVENT_KIND_LABEL, SYNC_TABLES, type CalEvent, type StoredFile, type Task } from '../db'
import { addDays } from './dates'
import {
  deleteCalendarEvent,
  downloadFromDrive,
  googleConfigured,
  isConnected,
  moveInDrive,
  readAppData,
  trashInDrive,
  uploadToDrive,
  upsertCalendarEvent,
  writeAppData,
  type GEvent,
} from './google'

const TABLES = [...SYNC_TABLES, 'files'] as const
const SYNC_SETTINGS = ['name', 'geminiKey', 'geminiModel', 'calendarTasks', 'studyMinutes']
const isSyncKey = (k: string) => SYNC_SETTINGS.includes(k) || k.startsWith('absences:')
const FILE_NAME = 'organizador-sync.json'

type Rec = Record<string, unknown> & { id: string; _u?: number; _g?: number }
type Snapshot = {
  v: 1
  at: number
  tables: Record<string, Record<string, Rec>>
  tombstones: Record<string, { at: number; extra?: Record<string, string> }>
  settings: Record<string, { value: unknown; _u: number }>
}

let quiet = 0
/** Ejecuta cambios sin marcarlos como "cambios del usuario" (para no crear bucles). */
export async function silently<R>(fn: () => Promise<R>): Promise<R> {
  quiet++
  try {
    return await fn()
  } finally {
    quiet--
  }
}

let timer: number | undefined
export function scheduleSync(delay = 4000) {
  if (!googleConfigured()) return
  clearTimeout(timer)
  timer = window.setTimeout(() => void syncNow().catch(() => {}), delay)
}

/** Marca cada cambio con su hora y apunta los borrados. Se llama una vez al arrancar. */
export function installSyncHooks() {
  for (const name of TABLES) {
    const table = db.table(name)
    table.hook('creating', (_pk, obj) => {
      if (quiet) return
      ;(obj as Rec)._u = Date.now()
      scheduleSync()
    })
    table.hook('updating', (mods) => {
      if (quiet) return
      const keys = Object.keys(mods)
      if (keys.every((k) => k === 'blob')) return
      scheduleSync()
      return { _u: Date.now() }
    })
    table.hook('deleting', (pk, obj) => {
      if (quiet) return
      const o = obj as Rec
      const extra: Record<string, string> = {}
      if (typeof o.gcalId === 'string') extra.gcalId = o.gcalId
      if (typeof o.driveId === 'string') extra.driveId = o.driveId
      setTimeout(() => {
        void db.tombstones.put({ key: `${name}:${pk}`, table: name, id: String(pk), at: Date.now(), ...(Object.keys(extra).length ? { extra } : {}) } as never)
        scheduleSync()
      })
    })
  }
  db.settings.hook('creating', (_pk, obj) => {
    if (quiet || !isSyncKey(obj.key)) return
    ;(obj as { _u?: number })._u = Date.now()
    scheduleSync()
  })
  db.settings.hook('updating', (_m, pk) => {
    if (quiet || !isSyncKey(String(pk))) return
    scheduleSync()
    return { _u: Date.now() }
  })
}

export type SyncState = { status: 'idle' | 'syncing' | 'error' | 'offline' | 'off'; at?: number; message?: string }
let state: SyncState = { status: 'off' }
const listeners = new Set<(s: SyncState) => void>()
export function onSyncState(fn: (s: SyncState) => void) {
  listeners.add(fn)
  fn(state)
  return () => listeners.delete(fn)
}
function setState(s: SyncState) {
  state = s
  listeners.forEach((l) => l(s))
}

let running: Promise<void> | null = null
export function syncNow(): Promise<void> {
  if (running) return running
  running = doSync().finally(() => (running = null))
  return running
}

async function doSync() {
  if (!googleConfigured() || !(await isConnected())) return setState({ status: 'off' })
  if (!navigator.onLine) return setState({ status: 'offline', at: state.at })
  setState({ status: 'syncing', at: state.at })
  try {
    await syncData()
    await syncFiles()
    await syncCalendar()
    const at = Date.now()
    await silently(() => db.settings.put({ key: 'lastSync', value: at }))
    setState({ status: 'idle', at })
  } catch (err) {
    console.warn('Error de sincronización', err)
    setState({ status: 'error', at: state.at, message: err instanceof Error ? err.message : String(err) })
  }
}

async function localSnapshot(): Promise<Snapshot> {
  const tables: Snapshot['tables'] = {}
  for (const name of TABLES) {
    const rows = (await db.table(name).toArray()) as Rec[]
    tables[name] = Object.fromEntries(
      rows.map((r) => {
        const { blob: _b, ...rest } = r as Rec & { blob?: Blob }
        void _b
        return [r.id, rest as Rec]
      }),
    )
  }
  const tombstones: Snapshot['tombstones'] = {}
  for (const t of await db.tombstones.toArray()) tombstones[t.key] = { at: t.at, ...((t as { extra?: Record<string, string> }).extra ? { extra: (t as { extra?: Record<string, string> }).extra } : {}) }
  const settings: Snapshot['settings'] = {}
  for (const s of await db.settings.filter((x) => isSyncKey(x.key)).toArray()) settings[s.key] = { value: s.value, _u: (s as { _u?: number })._u ?? 0 }
  return { v: 1, at: Date.now(), tables, tombstones, settings }
}

async function syncData() {
  const remoteFile = await readAppData(FILE_NAME)
  const remote = (remoteFile?.data as Snapshot | undefined) ?? null
  const local = await localSnapshot()
  if (!remote) {
    await writeAppData(FILE_NAME, local)
    return
  }

  const merged: Snapshot = { v: 1, at: Date.now(), tables: {}, tombstones: { ...remote.tombstones }, settings: { ...remote.settings } }
  for (const [k, t] of Object.entries(local.tombstones)) if (!merged.tombstones[k] || merged.tombstones[k].at < t.at) merged.tombstones[k] = t
  for (const [k, s] of Object.entries(local.settings)) if (!merged.settings[k] || merged.settings[k]._u < s._u) merged.settings[k] = s

  await silently(async () => {
    for (const name of TABLES) {
      const L = local.tables[name] ?? {}
      const R = remote.tables[name] ?? {}
      const out: Record<string, Rec> = {}
      const toPut: Rec[] = []
      const toDelete: string[] = []
      for (const id of new Set([...Object.keys(L), ...Object.keys(R)])) {
        const l = L[id]
        const r = R[id]
        let win = !l ? r : !r ? l : (r._u ?? 0) > (l._u ?? 0) ? r : l
        // conserva lo que solo sabe este dispositivo (ids de Calendar/Drive)
        if (win === r && l) win = { ...r, gcalId: r.gcalId ?? l.gcalId, driveId: r.driveId ?? l.driveId, _g: l._g }
        const tomb = merged.tombstones[`${name}:${id}`]
        if (tomb && tomb.at >= (win._u ?? 0)) {
          if (l) toDelete.push(id)
          continue
        }
        out[id] = win
        if (win !== l && (!l || JSON.stringify(win) !== JSON.stringify(l))) toPut.push(win)
      }
      merged.tables[name] = out
      const table = db.table(name)
      if (toDelete.length) await table.bulkDelete(toDelete)
      if (toPut.length) {
        if (name === 'files') {
          for (const rec of toPut) {
            const existing = (await db.files.get(rec.id)) as StoredFile | undefined
            await db.files.put({ ...(rec as unknown as StoredFile), blob: existing?.blob })
          }
        } else await table.bulkPut(toPut)
      }
    }
    for (const [k, s] of Object.entries(merged.settings)) {
      const cur = (await db.settings.get(k)) as { value: unknown; _u?: number } | undefined
      if (!cur || (cur._u ?? 0) < s._u) await db.settings.put({ key: k, value: s.value, _u: s._u } as never)
    }
    // guarda los borrados de otros dispositivos para no resucitar nada
    await db.tombstones.bulkPut(
      Object.entries(merged.tombstones).map(([key, t]) => ({ key, table: key.split(':')[0], id: key.split(':').slice(1).join(':'), at: t.at, ...(t.extra ? { extra: t.extra } : {}) }) as never),
    )
  })

  // limpia borrados de hace más de 90 días
  const cutoff = Date.now() - 90 * 86_400_000
  for (const [k, t] of Object.entries(merged.tombstones)) if (t.at < cutoff) delete merged.tombstones[k]

  await writeAppData(FILE_NAME, merged, remoteFile!.id)
}

async function drivePath(f: StoredFile): Promise<string[]> {
  const s = f.subjectId ? await db.subjects.get(f.subjectId) : undefined
  return [s?.name ?? 'Sin asignatura', ...(f.topic ? [f.topic] : [])]
}

async function syncFiles() {
  const files = await db.files.toArray()
  for (const f of files) {
    if (f.blob && !f.driveId) {
      const driveId = await uploadToDrive(f.blob, f.name, await drivePath(f))
      await silently(() => db.files.update(f.id, { driveId, _g: (f as unknown as Rec)._u ?? Date.now() } as never))
      scheduleSync(1000) // para que otros dispositivos reciban el driveId
    } else if (f.driveId && ((f as unknown as Rec)._u ?? 0) > ((f as unknown as Rec)._g ?? 0)) {
      // se cambió la asignatura, el tema o el nombre: lo recolocamos en Drive
      await moveInDrive(f.driveId, f.name, await drivePath(f)).catch(() => {})
      await silently(() => db.files.update(f.id, { _g: (f as unknown as Rec)._u } as never))
    }
  }
  for (const t of await db.tombstones.where('key').startsWith('files:').toArray()) {
    const extra = (t as { extra?: { driveId?: string; trashed?: string } }).extra
    if (extra?.driveId && !extra.trashed) {
      await trashInDrive(extra.driveId).catch(() => {})
      await silently(() => db.tombstones.update(t.key, { extra: { ...extra, trashed: '1' } } as never))
    }
  }
}

/** Descarga de Drive un archivo que se subió desde otro dispositivo. */
export async function ensureBlob(f: StoredFile): Promise<Blob> {
  if (f.blob) return f.blob
  if (!f.driveId) throw new Error('Este archivo no está en este dispositivo y aún no se ha subido a Drive desde el otro.')
  const blob = await downloadFromDrive(f.driveId)
  await silently(() => db.files.update(f.id, { blob }))
  return blob
}

/* ---------------- Google Calendar ---------------- */

function eventToGoogle(e: CalEvent, subjectName?: string): GEvent {
  const timed = !!e.start
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const reminders = (e.reminderDays ?? []).slice(0, 5).map((d) => ({ method: 'popup' as const, minutes: Math.max(d * 24 * 60 - (timed ? 0 : 9 * 60), 0) }))
  return {
    summary: `${e.kind === 'exam' ? '📝' : e.kind === 'delivery' ? '📤' : '📌'} ${e.title}`,
    description: [subjectName && `${EVENT_KIND_LABEL[e.kind]} · ${subjectName}`, e.topics && `Temas: ${e.topics}`, e.notes, 'Creado por tu Organizador de estudios'].filter(Boolean).join('\n'),
    location: e.place || undefined,
    start: timed ? { dateTime: `${e.date}T${e.start}:00`, timeZone: tz } : { date: e.date },
    end: timed ? { dateTime: `${e.date}T${e.end || e.start}:00`, timeZone: tz } : { date: addDays(e.date, 1) },
    reminders: { useDefault: false, overrides: reminders },
    colorId: e.kind === 'exam' ? '11' : '6',
    extendedProperties: { private: { organizador: e.id } },
  }
}

function taskToGoogle(t: Task, subjectName?: string): GEvent {
  return {
    summary: `✅ ${t.title}${subjectName ? ` (${subjectName})` : ''}`,
    description: 'Tarea de tu Organizador de estudios',
    start: { date: t.due! },
    end: { date: addDays(t.due!, 1) },
    reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 15 * 60 }] }, // el día anterior a las 9:00
    colorId: '2',
    extendedProperties: { private: { organizador: t.id } },
  }
}

async function syncCalendar() {
  const subjects = new Map((await db.subjects.toArray()).map((s) => [s.id, s]))
  for (const e of await db.events.toArray()) {
    const r = e as CalEvent & Rec
    if (e.gcalId && (r._g ?? 0) >= (r._u ?? 0)) continue
    const gcalId = await upsertCalendarEvent(eventToGoogle(e, e.subjectId ? subjects.get(e.subjectId)?.name : undefined), e.gcalId)
    await silently(() => db.events.update(e.id, { gcalId, _g: r._u ?? Date.now() } as never))
  }
  const withTasks = ((await db.settings.get('calendarTasks'))?.value ?? true) as boolean
  for (const t of await db.tasks.toArray()) {
    const r = t as Task & Rec
    const want = withTasks && !!t.due && !t.done
    if (!want) {
      if (t.gcalId) {
        await deleteCalendarEvent(t.gcalId)
        await silently(() => db.tasks.update(t.id, { gcalId: undefined, _g: r._u } as never))
      }
      continue
    }
    if (t.gcalId && (r._g ?? 0) >= (r._u ?? 0)) continue
    const gcalId = await upsertCalendarEvent(taskToGoogle(t, t.subjectId ? subjects.get(t.subjectId)?.short : undefined), t.gcalId)
    await silently(() => db.tasks.update(t.id, { gcalId, _g: r._u ?? Date.now() } as never))
  }
  for (const tomb of await db.tombstones.toArray()) {
    const extra = (tomb as { extra?: { gcalId?: string; gcalDeleted?: string } }).extra
    if ((tomb.table === 'events' || tomb.table === 'tasks') && extra?.gcalId && !extra.gcalDeleted) {
      await deleteCalendarEvent(extra.gcalId).catch(() => {})
      await silently(() => db.tombstones.update(tomb.key, { extra: { ...extra, gcalDeleted: '1' } } as never))
    }
  }
}
