import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { db, type Note, type StoredFile } from '../db'
import { FileItem } from '../components/files'
import { Icon } from '../components/Icon'
import { ConfirmButton, Empty, SubjectSelect, parseTags, useToast } from '../components/ui'
import { useSubjects } from '../hooks'
import { renderMarkdown } from '../lib/markdown'
import { storeFile } from '../lib/storeFile'

export default function NoteEditor() {
  const { id = '' } = useParams()
  const note = useLiveQuery(() => db.notes.get(id), [id])
  if (note === undefined) return <div className="page"><Empty>Cargando…</Empty></div>
  return <Editor key={note.id} note={note} />
}

const TOOLS: { label: string; aria: string; before: string; after?: string; block?: boolean }[] = [
  { label: 'B', aria: 'Negrita', before: '**', after: '**' },
  { label: 'I', aria: 'Cursiva', before: '_', after: '_' },
  { label: 'H2', aria: 'Título', before: '## ', block: true },
  { label: '•', aria: 'Lista', before: '- ', block: true },
  { label: '1.', aria: 'Lista numerada', before: '1. ', block: true },
  { label: '☐', aria: 'Casilla', before: '- [ ] ', block: true },
  { label: '∑', aria: 'Fórmula', before: '$', after: '$' },
  { label: '❝', aria: 'Cita / definición', before: '> ', block: true },
]

function Editor({ note }: { note: Note }) {
  const navigate = useNavigate()
  const toast = useToast()
  const subjects = useSubjects()
  const [title, setTitle] = useState(note.title)
  const [body, setBody] = useState(note.body)
  const [subjectId, setSubjectId] = useState(note.subjectId)
  const [topic, setTopic] = useState(note.topic ?? '')
  const [tags, setTags] = useState(note.tags.join(', '))
  const [mode, setMode] = useState<'edit' | 'view'>(note.body ? 'view' : 'edit')
  const [saved, setSaved] = useState(true)
  const ta = useRef<HTMLTextAreaElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const files = useLiveQuery(() => db.files.bulkGet(note.fileIds), [note.fileIds.join()], [] as (StoredFile | undefined)[])
  const subject = subjects.find((s) => s.id === subjectId)

  // Guardado automático
  const firstRun = useRef(true)
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false
      return
    }
    setSaved(false)
    const t = window.setTimeout(async () => {
      await db.notes.update(note.id, { title, body, subjectId, topic: topic || undefined, tags: parseTags(tags), updatedAt: Date.now() })
      setSaved(true)
    }, 500)
    return () => clearTimeout(t)
  }, [title, body, subjectId, topic, tags, note.id])

  const apply = (tool: (typeof TOOLS)[number]) => {
    const el = ta.current
    if (!el) return
    const { selectionStart: s, selectionEnd: e } = el
    let next: string
    let cursor: number
    if (tool.block) {
      const lineStart = body.lastIndexOf('\n', s - 1) + 1
      next = body.slice(0, lineStart) + tool.before + body.slice(lineStart)
      cursor = e + tool.before.length
    } else {
      const sel = body.slice(s, e)
      next = body.slice(0, s) + tool.before + sel + (tool.after ?? '') + body.slice(e)
      cursor = sel ? e + tool.before.length + (tool.after ?? '').length : s + tool.before.length
    }
    setBody(next)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(cursor, cursor)
    })
  }

  const attach = async (list: FileList | null) => {
    if (!list?.length) return
    const ids: string[] = []
    for (const f of Array.from(list)) {
      ids.push(await storeFile(f, { subjectId, topic: topic || undefined, kind: f.type.startsWith('image/') ? 'apuntes' : 'otro' }))
    }
    await db.notes.update(note.id, { fileIds: [...note.fileIds, ...ids] })
    toast(ids.length === 1 ? 'Archivo adjuntado' : `${ids.length} archivos adjuntados`)
  }

  return (
    <div className="page">
      <div className="row">
        <button className="btn icon ghost" onClick={() => navigate(-1)} aria-label="Volver">
          <Icon name="back" />
        </button>
        <span className="grow small muted row" style={{ gap: 6 }}>
          {subject && <span className="dot" style={{ background: subject.color }} />}
          {subject?.short ?? 'Sin asignatura'}
          {topic ? ` › ${topic}` : ''}
        </span>
        <span className="xs faint">{saved ? 'Guardado ✓' : 'Guardando…'}</span>
      </div>

      <label htmlFor="n-title" className="sr-only">Título</label>
      <input
        id="n-title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Título de la nota"
        style={{ background: 'none', border: 0, fontFamily: 'var(--display)', fontSize: 26, fontWeight: 600, padding: 0, outline: 'none', width: '100%' }}
        autoFocus={!note.title}
      />

      <div className="grid-2">
        <label className="field">
          Asignatura
          <SubjectSelect id="n-subject" subjects={subjects} value={subjectId} onChange={setSubjectId} />
        </label>
        <label className="field">
          Tema
          <input id="n-topic" className="input" list="n-topics" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Ej. Tema 3" />
          <datalist id="n-topics">
            {(subject?.topics ?? []).map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </label>
      </div>
      <label className="field">
        Etiquetas
        <input id="n-tags" className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="teoría, definiciones, teorema" />
      </label>

      <div className="card row wrap" style={{ padding: 4, gap: 2 }}>
        {mode === 'edit' &&
          TOOLS.map((t) => (
            <button key={t.aria} className="btn sm ghost" style={{ minWidth: 40, padding: '0 8px' }} onClick={() => apply(t)} aria-label={t.aria} title={t.aria}>
              {t.label}
            </button>
          ))}
        <button className="btn sm ghost" onClick={() => fileInput.current?.click()} aria-label="Adjuntar archivo" title="Adjuntar archivo">
          <Icon name="clip" size={18} />
        </button>
        <span className="grow" />
        <button className="btn sm" onClick={() => setMode(mode === 'edit' ? 'view' : 'edit')}>
          <Icon name={mode === 'edit' ? 'eye' : 'edit'} size={16} /> {mode === 'edit' ? 'Ver' : 'Editar'}
        </button>
        <input ref={fileInput} type="file" multiple hidden onChange={(e) => attach(e.target.files)} />
      </div>

      {mode === 'edit' ? (
        <>
          <label htmlFor="n-body" className="sr-only">Contenido</label>
          <textarea
            id="n-body"
            ref={ta}
            className="textarea"
            style={{ minHeight: '46vh', fontSize: 15 }}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={'Escribe aquí. Formato markdown:\n## Título\n**negrita**, _cursiva_, - listas\nFórmulas: $x^2 + y^2$ o $$\\int_0^1 f(x)\\,dx$$'}
          />
        </>
      ) : body.trim() ? (
        <div className="md card pad" dangerouslySetInnerHTML={{ __html: renderMarkdown(body) }} onDoubleClick={() => setMode('edit')} />
      ) : (
        <div className="card">
          <Empty>
            <span>Nota vacía.</span>
            <button className="btn sm" onClick={() => setMode('edit')}>Empezar a escribir</button>
          </Empty>
        </div>
      )}

      {files.some(Boolean) && (
        <section className="stack" style={{ gap: 6 }}>
          <span className="label">Adjuntos</span>
          <div className="card list">
            {files.filter((f): f is StoredFile => !!f).map((f) => (
              <FileItem key={f.id} file={f} />
            ))}
          </div>
        </section>
      )}

      <div className="row">
        <ConfirmButton
          label="Borrar nota"
          onConfirm={async () => {
            await db.notes.delete(note.id)
            navigate(-1)
          }}
        />
      </div>
    </div>
  )
}
