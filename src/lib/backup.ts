import { db, type StoredFile } from '../db'

const VERSION = 1

type SerializedFile = Omit<StoredFile, 'blob'> & { data: string }

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '')
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

function base64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

/** Crea un archivo .json con todos los datos de la app (archivos incluidos). */
export async function exportAll(): Promise<Blob> {
  const files = await db.files.toArray()
  const serialized: SerializedFile[] = []
  for (const f of files) {
    const { blob, ...rest } = f
    serialized.push({ ...rest, data: blob ? await blobToBase64(blob) : '' })
  }
  const payload = {
    app: 'organizador-estudios',
    version: VERSION,
    exportedAt: new Date().toISOString(),
    subjects: await db.subjects.toArray(),
    classes: await db.classes.toArray(),
    events: await db.events.toArray(),
    tasks: await db.tasks.toArray(),
    notes: await db.notes.toArray(),
    settings: await db.settings.toArray(),
    files: serialized,
  }
  return new Blob([JSON.stringify(payload)], { type: 'application/json' })
}

/** Sustituye todos los datos por los de una copia de seguridad. */
export async function importAll(file: Blob): Promise<void> {
  const data = JSON.parse(await file.text())
  if (data?.app !== 'organizador-estudios') throw new Error('Este archivo no es una copia de seguridad del organizador.')
  const files: StoredFile[] = (data.files as SerializedFile[]).map(({ data: b64, ...rest }) => ({
    ...rest,
    blob: b64 ? base64ToBlob(b64, rest.mime) : undefined,
  }))
  await db.transaction('rw', [db.subjects, db.classes, db.events, db.tasks, db.notes, db.files, db.settings], async () => {
    await Promise.all([
      db.subjects.clear(), db.classes.clear(), db.events.clear(), db.tasks.clear(),
      db.notes.clear(), db.files.clear(), db.settings.clear(),
    ])
    await db.subjects.bulkAdd(data.subjects)
    await db.classes.bulkAdd(data.classes)
    await db.events.bulkAdd(data.events)
    await db.tasks.bulkAdd(data.tasks)
    await db.notes.bulkAdd(data.notes)
    await db.settings.bulkAdd(data.settings)
    await db.files.bulkAdd(files)
  })
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
