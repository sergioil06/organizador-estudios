import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { FileKind } from '../db'
import { ClassificationFields } from '../components/FileSheet'
import { fileBadge, humanSize } from '../lib/extract'
import { Icon } from '../components/Icon'
import { Empty, parseTags, useToast } from '../components/ui'
import { useSubjects } from '../hooks'
import { today } from '../lib/dates'
import { classifyUpload, type Classification } from '../lib/classify'
import { storeFile } from '../lib/storeFile'
import { extractText } from '../lib/extract'

interface Pending {
  key: string
  file: File
  status: 'reading' | 'ready' | 'saving'
  text: string
  c: Classification
  topic: string
  kind: FileKind
  subjectId?: string
  date: string
  tags: string
}

export default function Upload() {
  const subjects = useSubjects()
  const [params] = useSearchParams()
  const preset = params.get('asignatura') ?? undefined
  const navigate = useNavigate()
  const toast = useToast()
  const [queue, setQueue] = useState<Pending[]>([])
  const [drag, setDrag] = useState(false)

  const update = (key: string, patch: Partial<Pending>) => setQueue((q) => q.map((p) => (p.key === key ? { ...p, ...patch } : p)))

  const add = async (list: FileList | File[] | null) => {
    if (!list) return
    const files = Array.from(list)
    const items: Pending[] = files.map((file) => ({
      key: crypto.randomUUID(),
      file,
      status: 'reading',
      text: '',
      c: { subjectId: preset, kind: 'apuntes' },
      topic: '',
      kind: 'apuntes',
      subjectId: preset,
      date: today(),
      tags: '',
    }))
    setQueue((q) => [...q, ...items])
    for (const it of items) {
      const text = await extractText(it.file, it.file.type, it.file.name)
      const c = await classifyUpload(it.file, text, subjects, preset)
      update(it.key, {
        status: 'ready',
        text: c.text ?? text,
        c,
        subjectId: c.subjectId ?? preset,
        topic: c.topic ?? '',
        kind: c.kind,
        date: c.date ?? today(),
        tags: (c.tags ?? []).join(', '),
      })
    }
  }

  const save = async (p: Pending) => {
    update(p.key, { status: 'saving' })
    await storeFile(p.file, { subjectId: p.subjectId, topic: p.topic || undefined, kind: p.kind, date: p.date, tags: parseTags(p.tags), text: p.text })
    setQueue((q) => q.filter((x) => x.key !== p.key))
    const s = subjects.find((x) => x.id === p.subjectId)
    toast(`Guardado${s ? ` en ${s.short}` : ''}`)
  }

  const saveAll = async () => {
    for (const p of queue.filter((x) => x.status === 'ready')) await save(p)
  }

  return (
    <div className="page">
      <div className="row">
        <button className="btn icon ghost" onClick={() => navigate(-1)} aria-label="Volver">
          <Icon name="back" />
        </button>
        <h1 className="grow">Subir archivos</h1>
        {queue.filter((q) => q.status === 'ready').length > 1 && (
          <button className="btn sm primary" onClick={saveAll}>
            Guardar todos
          </button>
        )}
      </div>

      <label
        className="card stack"
        style={{ alignItems: 'center', textAlign: 'center', padding: '28px 16px', borderStyle: 'dashed', borderColor: drag ? 'var(--accent)' : 'var(--border)', cursor: 'pointer', gap: 8 }}
        onDragOver={(e) => {
          e.preventDefault()
          setDrag(true)
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDrag(false)
          add(e.dataTransfer.files)
        }}
      >
        <Icon name="upload" size={28} />
        <span style={{ fontWeight: 600 }}>Elige archivos o arrástralos aquí</span>
        <span className="small muted">PDF, fotos de apuntes, diapositivas, Word, audios… Puedes subir varios a la vez.</span>
        <input type="file" multiple hidden onChange={(e) => add(e.target.files)} />
        <span className="btn sm primary" aria-hidden="true">Elegir archivos</span>
      </label>
      <label className="btn hide-desktop" style={{ cursor: 'pointer' }}>
        <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => add(e.target.files)} />
        Hacer foto a unos apuntes
      </label>

      {queue.length === 0 && <Empty>Cuando subas algo, aquí te propongo la asignatura, el tema y el tipo para que lo confirmes.</Empty>}

      {queue.map((p) => {
        const subject = subjects.find((s) => s.id === p.subjectId)
        return (
          <section key={p.key} className="card pad stack">
            <div className="row">
              <span className="badge" style={{ background: 'var(--surface-3)', color: 'var(--text-2)' }}>
                {fileBadge(p.file.type, p.file.name)}
              </span>
              <span className="stack grow" style={{ gap: 2, minWidth: 0 }}>
                <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.file.name}</span>
                <span className="xs muted">
                  {humanSize(p.file.size)}
                  {p.status === 'reading' ? ' · leyendo…' : p.text ? ` · texto leído (${p.text.length.toLocaleString('es')} caracteres)` : ''}
                </span>
              </span>
              <button className="btn icon ghost" aria-label="Quitar" onClick={() => setQueue((q) => q.filter((x) => x.key !== p.key))}>
                <Icon name="close" size={18} />
              </button>
            </div>

            {p.status !== 'reading' && p.c.question && (
              <div className="card accent pad stack">
                <span className="label" style={{ color: 'var(--accent)' }}>Una duda</span>
                <span>{p.c.question}</span>
                {p.c.options && (
                  <div className="chips">
                    {p.c.options.map((o) => (
                      <button
                        key={o.label}
                        className="chip"
                        onClick={() =>
                          update(p.key, {
                            subjectId: o.subjectId ?? p.subjectId,
                            kind: o.kind ?? p.kind,
                            topic: o.topic ?? p.topic,
                            c: { ...p.c, question: undefined, options: undefined },
                          })
                        }
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {p.status !== 'reading' && p.c.summary && <p className="small muted" style={{ margin: 0 }}>{p.c.summary}</p>}

            {p.status === 'reading' ? (
              <span className="small muted">Analizando el archivo…</span>
            ) : (
              <>
                <ClassificationFields
                  idPrefix={`u-${p.key.slice(0, 6)}`}
                  subjects={subjects}
                  subject={subject}
                  subjectId={p.subjectId}
                  setSubjectId={(v) => update(p.key, { subjectId: v })}
                  topic={p.topic}
                  setTopic={(v) => update(p.key, { topic: v })}
                  kind={p.kind}
                  setKind={(v) => update(p.key, { kind: v })}
                  date={p.date}
                  setDate={(v) => update(p.key, { date: v })}
                  tags={p.tags}
                  setTags={(v) => update(p.key, { tags: v })}
                />
                <button className="btn primary" disabled={p.status === 'saving'} onClick={() => save(p)}>
                  {p.status === 'saving' ? 'Guardando…' : `Guardar${subject ? ` en ${subject.short}` : ''}`}
                </button>
              </>
            )}
          </section>
        )
      })}
    </div>
  )
}
