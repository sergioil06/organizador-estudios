import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState } from 'react'
import { db, uid, type ChatMessage, type Summary } from '../db'
import { Icon } from '../components/Icon'
import { ConfirmButton, Empty, useToast } from '../components/ui'
import { useSubjects } from '../hooks'
import { aiAvailable, aiChat, aiSummary, subjectContext } from '../lib/ai'
import { renderMarkdown } from '../lib/markdown'

export function ChatView({ subjectId }: { subjectId: string }) {
  const subjects = useSubjects()
  const subject = subjects.find((s) => s.id === subjectId)
  const toast = useToast()
  const msgs = useLiveQuery(() => db.chats.where('subjectId').equals(subjectId).sortBy('createdAt'), [subjectId], [] as ChatMessage[])
  const hasAi = useLiveQuery(() => aiAvailable(), [], false)
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => end.current?.scrollIntoView({ block: 'end' }), [msgs.length, busy])

  const send = async () => {
    const question = q.trim()
    if (!question || !subject) return
    setQ('')
    setBusy(true)
    await db.chats.add({ id: uid(), subjectId, role: 'user', text: question, createdAt: Date.now() })
    try {
      const ctx = await subjectContext(subjectId)
      const history = msgs.slice(-12).map((m) => ({ role: m.role, text: m.text }))
      const answer = await aiChat(subject, ctx.text, history, question)
      await db.chats.add({ id: uid(), subjectId, role: 'model', text: answer, createdAt: Date.now() })
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error de la IA')
    } finally {
      setBusy(false)
    }
  }

  if (!subject) return null
  return (
    <div className="stack">
      {msgs.length === 0 && (
        <div className="card">
          <Empty>
            <span>Pregúntame dudas de {subject.short}. Respondo usando tus apuntes y te digo de dónde lo saco.</span>
            <span className="xs">Ej. “¿Qué condiciones tiene que cumplir un subespacio?” o “Explícame el ejercicio 3 de la hoja 2”.</span>
          </Empty>
        </div>
      )}
      {msgs.map((m) => (
        <div key={m.id} className={m.role === 'user' ? 'card pad' : 'card accent pad'} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'stretch', maxWidth: m.role === 'user' ? '85%' : undefined }}>
          {m.role === 'user' ? <span>{m.text}</span> : <div className="md" dangerouslySetInnerHTML={{ __html: renderMarkdown(m.text) }} />}
        </div>
      ))}
      {busy && <span className="small muted">Pensando con tus apuntes…</span>}
      <div ref={end} />
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault()
          void send()
        }}
      >
        <label htmlFor="chat-q" className="sr-only">Tu pregunta</label>
        <input id="chat-q" className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={hasAi ? 'Escribe tu duda…' : 'Activa la IA en Ajustes'} disabled={!hasAi || busy} />
        <button className="btn icon primary" disabled={!hasAi || busy || !q.trim()} aria-label="Enviar">
          <Icon name="right" />
        </button>
      </form>
      {msgs.length > 0 && (
        <div className="row">
          <ConfirmButton label="Borrar conversación" onConfirm={() => db.chats.where('subjectId').equals(subjectId).delete()} />
        </div>
      )}
    </div>
  )
}

export function SummariesView({ subjectId }: { subjectId: string }) {
  const subjects = useSubjects()
  const subject = subjects.find((s) => s.id === subjectId)
  const toast = useToast()
  const list = useLiveQuery(() => db.summaries.where('subjectId').equals(subjectId).reverse().sortBy('createdAt'), [subjectId], [] as Summary[])
  const hasAi = useLiveQuery(() => aiAvailable(), [], false)
  const topics = useLiveQuery(async () => {
    const f = await db.files.where('subjectId').equals(subjectId).toArray()
    const n = await db.notes.where('subjectId').equals(subjectId).toArray()
    return [...new Set([...(subject?.topics ?? []), ...f.map((x) => x.topic), ...n.map((x) => x.topic)].filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }))
  }, [subjectId, subject?.topics.join()], [] as string[])
  const [topic, setTopic] = useState('')
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState<string | null>(null)

  const make = async (style: Summary['style']) => {
    if (!subject) return
    setBusy(true)
    try {
      const ctx = await subjectContext(subjectId, topic || undefined, 300_000)
      if (!ctx.text.trim()) throw new Error('No hay apuntes con texto para resumir. Sube material o escribe notas.')
      const body = await aiSummary(subject, ctx.text, style)
      const id = uid()
      await db.summaries.add({ id, subjectId, topic: topic || undefined, style, body, createdAt: Date.now() })
      setOpen(id)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'No se pudo crear')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack">
      <div className="card pad stack">
        <label className="field">
          Tema
          <select id="sum-topic" className="select" value={topic} onChange={(e) => setTopic(e.target.value)}>
            <option value="">Toda la asignatura</option>
            {topics.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <div className="row wrap">
          <button className="btn primary" disabled={busy || !hasAi} onClick={() => make('resumen')}>
            Resumen
          </button>
          <button className="btn" disabled={busy || !hasAi} onClick={() => make('esquema')}>
            Esquema
          </button>
          {busy && <span className="small muted">Leyendo tus apuntes…</span>}
        </div>
        {!hasAi && <span className="xs muted">Activa la IA en Ajustes.</span>}
      </div>
      {list.map((s) => (
        <section key={s.id} className="card">
          <button className="list-item" onClick={() => setOpen(open === s.id ? null : s.id)}>
            <span className="grow" style={{ fontWeight: 600 }}>
              {s.style === 'resumen' ? 'Resumen' : 'Esquema'} · {s.topic ?? 'toda la asignatura'}
            </span>
            <span className="xs muted">{new Date(s.createdAt).toLocaleDateString('es')}</span>
          </button>
          {open === s.id && (
            <div className="pad stack" style={{ borderTop: '1px solid var(--border)', padding: 16 }}>
              <div className="md" dangerouslySetInnerHTML={{ __html: renderMarkdown(s.body) }} />
              <div className="row">
                <button
                  className="btn sm"
                  onClick={async () => {
                    const id = uid()
                    await db.notes.add({ id, title: `${s.style === 'resumen' ? 'Resumen' : 'Esquema'} ${s.topic ?? subject?.short ?? ''}`, subjectId, topic: s.topic, body: s.body, tags: [s.style], fileIds: [], createdAt: Date.now(), updatedAt: Date.now() })
                    toast('Guardado como nota')
                  }}
                >
                  Guardar como nota
                </button>
                <span className="grow" />
                <ConfirmButton onConfirm={() => db.summaries.delete(s.id)} />
              </div>
            </div>
          )}
        </section>
      ))}
    </div>
  )
}
