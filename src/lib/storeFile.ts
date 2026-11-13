import { db, uid, type FileKind } from '../db'
import { today } from './dates'
import { extractText } from './extract'

export interface FileMeta {
  subjectId?: string
  topic?: string
  kind: FileKind
  date: string
  tags: string[]
  text?: string
}

/** Guarda un archivo en el dispositivo y devuelve su id. */
export async function storeFile(file: File, meta: Partial<FileMeta> = {}): Promise<string> {
  const id = uid()
  const text = meta.text ?? (await extractText(file, file.type, file.name))
  await db.files.add({
    id,
    name: file.name,
    mime: file.type || 'application/octet-stream',
    size: file.size,
    blob: file,
    subjectId: meta.subjectId,
    topic: meta.topic,
    kind: meta.kind ?? 'otro',
    date: meta.date ?? today(),
    tags: meta.tags ?? [],
    text,
    createdAt: Date.now(),
  })
  return id
}
