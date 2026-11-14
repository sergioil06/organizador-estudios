import { db, FILE_KIND_LABEL, type FileKind, type StoredFile, type Subject } from '../db'
import { formatShort } from '../lib/dates'
import { fileBadge, humanSize } from '../lib/extract'
import { Dot } from './ui'

const BADGE_COLORS: Record<string, [string, string]> = {
  PDF: ['#2b2420', '#f2b266'],
  IMG: ['#1f2a2e', '#59d3c2'],
  AUD: ['#1d2230', '#8fb8ff'],
  VID: ['#1d2230', '#8fb8ff'],
}

/** Abre el archivo en el visor de la app (ver FileViewer). */
export function openFile(f: StoredFile) {
  window.dispatchEvent(new CustomEvent('open-file', { detail: f }))
}

export function FileItem({ file, subject, onEdit }: { file: StoredFile; subject?: Subject; onEdit?: () => void }) {
  const badge = fileBadge(file.mime, file.name)
  const [bg, fg] = BADGE_COLORS[badge] ?? ['#22252c', '#c3c5cc']
  return (
    <div className="list-item">
      <span className="badge" style={{ background: bg, color: fg }}>{badge}</span>
      <button className="grow" onClick={() => openFile(file)} style={{ background: 'none', border: 0, padding: 0, textAlign: 'left', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
        <span className="row wrap xs muted" style={{ gap: 5 }}>
          {subject && (
            <>
              <Dot color={subject.color} /> {subject.short} ·
            </>
          )}
          {FILE_KIND_LABEL[file.kind]}
          {file.topic ? ` · ${file.topic}` : ''} · {formatShort(file.date)} · {humanSize(file.size)}
        </span>
      </button>
      {onEdit && (
        <button className="btn sm ghost" onClick={onEdit}>
          Editar
        </button>
      )}
    </div>
  )
}

/** Adivina asignatura, tema y tipo a partir del nombre y el texto (la IA lo hará mejor en la fase 2). */
export function guessClassification(name: string, text: string, subjects: Subject[]) {
  const hay = `${name} ${text.slice(0, 4000)}`.toLowerCase()
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const nh = norm(hay)

  let subjectId: string | undefined
  let best = 0
  for (const s of subjects.filter((x) => x.status === 'active')) {
    const words = [s.name, s.short].map(norm)
    const score = words.reduce((acc, w) => acc + (nh.split(w).length - 1), 0)
    if (score > best) {
      best = score
      subjectId = s.id
    }
  }
  if (!subjectId) {
    // pistas típicas de cada asignatura de 1º
    const hints: Record<string, string[]> = {
      algebra: ['matriz', 'matrices', 'determinante', 'espacio vectorial', 'subespacio', 'autovalor', 'sistema de ecuaciones', 'lineal'],
      calculo: ['derivada', 'integral', 'limite', 'continuidad', 'sucesion', 'serie', 'taylor', 'funcion real'],
    }
    for (const s of subjects.filter((x) => x.status === 'active')) {
      const key = norm(s.short)
      const list = hints[key]
      if (list && list.some((h) => nh.includes(h))) {
        subjectId = s.id
        break
      }
    }
  }

  const topicMatch = nh.match(/\b(?:tema|t|unidad|capitulo)[\s_-]*(\d{1,2})\b/)
  const topic = topicMatch ? `Tema ${topicMatch[1]}` : undefined

  let kind: FileKind = 'apuntes'
  if (/examen|parcial|final|convocatoria|enero|junio|julio/.test(nh)) kind = 'examen'
  else if (/solucion|soluciones|resuelto/.test(nh)) kind = 'solucion'
  else if (/ejercicio|hoja|boletin|problema|practica/.test(nh)) kind = 'ejercicios'
  else if (/diapositiva|slides|presentacion|\.pptx?$/.test(nh)) kind = 'diapositivas'

  return { subjectId, topic, kind }
}

export async function deleteFile(id: string) {
  await db.files.delete(id)
  const notes = await db.notes.filter((n) => n.fileIds.includes(id)).toArray()
  for (const n of notes) await db.notes.update(n.id, { fileIds: n.fileIds.filter((x) => x !== id) })
}
