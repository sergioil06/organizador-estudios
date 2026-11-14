import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { db, FILE_KIND_LABEL, type FileKind, type Note, type StoredFile, type Task } from '../db'
import { openFile } from '../components/files'
import { Icon } from '../components/Icon'
import { Dot, Empty } from '../components/ui'
import { useSubjects } from '../hooks'
import { formatShort } from '../lib/dates'

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

function snippet(text: string, q: string): { before: string; hit: string; after: string } | null {
  if (!q) return null
  const i = norm(text).indexOf(norm(q))
  if (i < 0) return null
  const start = Math.max(0, i - 60)
  return {
    before: (start > 0 ? '…' : '') + text.slice(start, i).replace(/\s+/g, ' '),
    hit: text.slice(i, i + q.length),
    after: text.slice(i + q.length, i + q.length + 90).replace(/\s+/g, ' ') + '…',
  }
}

function Snip({ text, q }: { text: string; q: string }) {
  const s = snippet(text, q)
  if (!s) return null
  return (
    <span className="small" style={{ color: 'var(--text-2)' }}>
      {s.before}
      <mark>{s.hit}</mark>
      {s.after}
    </span>
  )
}

type Result =
  | { type: 'file'; item: StoredFile; where: string }
  | { type: 'note'; item: Note; where: string }
  | { type: 'task'; item: Task; where: string }

export default function Search() {
  const subjects = useSubjects()
  const byId = new Map(subjects.map((s) => [s.id, s]))
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [q, setQ] = useState(() => params.get('q') ?? '')
  const [subject, setSubject] = useState('')
  const [kind, setKind] = useState<FileKind | 'nota' | 'tarea' | ''>('')
  const [tag, setTag] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const files = useLiveQuery(() => db.files.toArray(), [], [] as StoredFile[])
  const notes = useLiveQuery(() => db.notes.toArray(), [], [] as Note[])
  const tasks = useLiveQuery(() => db.tasks.toArray(), [], [] as Task[])

  const allTags = useMemo(() => [...new Set([...files.flatMap((f) => f.tags), ...notes.flatMap((n) => n.tags)])].sort(), [files, notes])

  const results = useMemo(() => {
    const nq = norm(q.trim())
    const out: Result[] = []
    const okCommon = (subjectId?: string, tags: string[] = [], date?: string) =>
      (!subject || subjectId === subject) && (!tag || tags.includes(tag)) && (!fromDate || (date && date >= fromDate)) && (!toDate || (date && date <= toDate))
    const anyFilter = subject || kind || tag || fromDate || toDate
    if (!nq && !anyFilter) return out

    if (!kind || (kind !== 'nota' && kind !== 'tarea')) {
      for (const f of files) {
        if (kind && f.kind !== kind) continue
        if (!okCommon(f.subjectId, f.tags, f.date)) continue
        const inName = norm(`${f.name} ${f.topic ?? ''} ${f.tags.join(' ')}`).includes(nq)
        const inText = nq && norm(f.text).includes(nq)
        if (!nq || inName || inText) out.push({ type: 'file', item: f, where: inText ? f.text : '' })
      }
    }
    if (!kind || kind === 'nota') {
      for (const n of notes) {
        const d = new Date(n.updatedAt).toISOString().slice(0, 10)
        if (!okCommon(n.subjectId, n.tags, d)) continue
        const hay = `${n.title} ${n.topic ?? ''} ${n.tags.join(' ')} ${n.body}`
        if (!nq || norm(hay).includes(nq)) out.push({ type: 'note', item: n, where: n.body })
      }
    }
    if ((!kind || kind === 'tarea') && !tag) {
      for (const t of tasks) {
        if (!okCommon(t.subjectId, [], t.due)) continue
        if (!nq || norm(`${t.title} ${t.notes ?? ''}`).includes(nq)) out.push({ type: 'task', item: t, where: t.notes ?? '' })
      }
    }
    return out.slice(0, 200)
  }, [q, subject, kind, tag, fromDate, toDate, files, notes, tasks])

  const hasQuery = q.trim() || subject || kind || tag || fromDate || toDate

  return (
    <div className="page narrow">
      <div className="row">
        <button className="btn icon ghost" onClick={() => navigate(-1)} aria-label="Volver">
          <Icon name="back" />
        </button>
        <label htmlFor="q" className="sr-only">Buscar</label>
        <input id="q" className="input" style={{ minHeight: 48 }} autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar en apuntes, PDFs, fotos, notas y tareas" />
      </div>

      <div className="row wrap" style={{ gap: 8 }}>
        <label className="sr-only" htmlFor="s-subj">Asignatura</label>
        <select id="s-subj" className="select" style={{ width: 'auto', minHeight: 38 }} value={subject} onChange={(e) => setSubject(e.target.value)}>
          <option value="">Todas las asignaturas</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>{s.short}</option>
          ))}
        </select>
        <label className="sr-only" htmlFor="s-kind">Tipo</label>
        <select id="s-kind" className="select" style={{ width: 'auto', minHeight: 38 }} value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
          <option value="">Todo</option>
          <option value="nota">Notas</option>
          <option value="tarea">Tareas</option>
          {(Object.keys(FILE_KIND_LABEL) as FileKind[]).map((k) => (
            <option key={k} value={k}>{FILE_KIND_LABEL[k]}</option>
          ))}
        </select>
        {allTags.length > 0 && (
          <>
            <label className="sr-only" htmlFor="s-tag">Etiqueta</label>
            <select id="s-tag" className="select" style={{ width: 'auto', minHeight: 38 }} value={tag} onChange={(e) => setTag(e.target.value)}>
              <option value="">Cualquier etiqueta</option>
              {allTags.map((t) => (
                <option key={t} value={t}>#{t}</option>
              ))}
            </select>
          </>
        )}
        <label className="row small muted" style={{ gap: 6 }}>
          Desde
          <input id="s-from" type="date" className="input" style={{ width: 'auto', minHeight: 38 }} value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </label>
        <label className="row small muted" style={{ gap: 6 }}>
          Hasta
          <input id="s-to" type="date" className="input" style={{ width: 'auto', minHeight: 38 }} value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </label>
      </div>

      {!hasQuery ? (
        <Empty>Escribe algo o elige un filtro. La búsqueda mira dentro de los PDF y del texto leído de tus fotos de apuntes.</Empty>
      ) : results.length === 0 ? (
        <Empty>Sin resultados.</Empty>
      ) : (
        <>
          <span className="xs muted">{results.length} resultados</span>
          <div className="card list">
            {results.map((r) => {
              const s = r.item.subjectId ? byId.get(r.item.subjectId) : undefined
              const meta = (
                <span className="row wrap xs muted" style={{ gap: 5 }}>
                  {s && (
                    <>
                      <Dot color={s.color} />
                      {s.short} ·
                    </>
                  )}
                  {r.type === 'file' && `${FILE_KIND_LABEL[r.item.kind]}${r.item.topic ? ` · ${r.item.topic}` : ''} · ${formatShort(r.item.date)}`}
                  {r.type === 'note' && `Nota${r.item.topic ? ` · ${r.item.topic}` : ''}`}
                  {r.type === 'task' && `Tarea${r.item.due ? ` · ${formatShort(r.item.due)}` : ''}${r.item.done ? ' · hecha' : ''}`}
                </span>
              )
              const title = r.type === 'file' ? r.item.name : r.type === 'note' ? r.item.title || 'Sin título' : r.item.title
              const inner = (
                <span className="stack grow" style={{ gap: 3, minWidth: 0 }}>
                  <span style={{ fontWeight: 600 }}>{title}</span>
                  {meta}
                  {r.where && <Snip text={r.where} q={q.trim()} />}
                </span>
              )
              if (r.type === 'note')
                return (
                  <Link key={r.item.id} to={`/notas/${r.item.id}`} className="list-item">
                    <Icon name="note" size={20} />
                    {inner}
                  </Link>
                )
              if (r.type === 'file')
                return (
                  <button key={r.item.id} className="list-item" onClick={() => openFile(r.item)}>
                    <Icon name="book" size={20} />
                    {inner}
                  </button>
                )
              return (
                <Link key={r.item.id} to="/tareas" className="list-item">
                  <Icon name="tasks" size={20} />
                  {inner}
                </Link>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
