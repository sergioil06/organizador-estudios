import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db, type Subject } from '../db'
import { Empty, useToast } from '../components/ui'
import { useSubjects } from '../hooks'
import { aiAvailable, aiQuiz, subjectContext, type QuizQuestion } from '../lib/ai'
import { renderMarkdown } from '../lib/markdown'

export function QuizView({ only }: { only?: string }) {
  const subjects = useSubjects()
  const toast = useToast()
  const active = subjects.filter((s) => (only ? s.id === only : s.status === 'active'))
  const [subjectId, setSubjectId] = useState(only ?? '')
  const subject: Subject | undefined = subjects.find((s) => s.id === (subjectId || active[0]?.id))
  const [topic, setTopic] = useState('')
  const [count, setCount] = useState(8)
  const [busy, setBusy] = useState(false)
  const [qs, setQs] = useState<QuizQuestion[] | null>(null)
  const [answers, setAnswers] = useState<(number | null)[]>([])
  const hasAi = useLiveQuery(() => aiAvailable(), [], false)
  const topics = useLiveQuery(async () => {
    if (!subject) return []
    const f = await db.files.where('subjectId').equals(subject.id).toArray()
    return [...new Set([...subject.topics, ...f.map((x) => x.topic)].filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }))
  }, [subject?.id], [] as string[])

  const start = async () => {
    if (!subject) return
    setBusy(true)
    try {
      const ctx = await subjectContext(subject.id, topic || undefined, 200_000)
      if (!ctx.text.trim()) throw new Error('No hay apuntes con texto para hacer el test. Sube material primero.')
      const exams = (await db.files.where('subjectId').equals(subject.id).filter((f) => f.kind === 'examen').toArray()).map((f) => f.text).join('\n\n')
      const q = await aiQuiz(subject, ctx.text, count, exams || undefined)
      setQs(q.filter((x) => x.options?.length >= 2))
      setAnswers(q.map(() => null))
    } catch (err) {
      toast(err instanceof Error ? err.message : 'No se pudo crear el test')
    } finally {
      setBusy(false)
    }
  }

  if (qs) {
    const answered = answers.filter((a) => a != null).length
    const right = qs.filter((q, i) => answers[i] === q.answer).length
    return (
      <div className="stack">
        <div className="row">
          <span className="grow small muted">
            {subject?.short}
            {topic ? ` · ${topic}` : ''} · {answered}/{qs.length} respondidas
          </span>
          <button className="btn sm" onClick={() => setQs(null)}>
            Salir
          </button>
        </div>
        {qs.map((q, i) => (
          <section key={i} className="card pad stack">
            <div className="md" style={{ fontWeight: 600 }} dangerouslySetInnerHTML={{ __html: renderMarkdown(`${i + 1}. ${q.question}`) }} />
            <div className="stack" style={{ gap: 6 }}>
              {q.options.map((o, j) => {
                const chosen = answers[i] === j
                const show = answers[i] != null
                const color = show && j === q.answer ? 'var(--ok)' : show && chosen ? 'var(--danger)' : undefined
                return (
                  <button
                    key={j}
                    className="btn"
                    style={{ justifyContent: 'flex-start', textAlign: 'left', whiteSpace: 'normal', height: 'auto', padding: '10px 14px', fontWeight: 400, borderColor: color, color }}
                    disabled={show}
                    onClick={() => setAnswers(answers.map((a, k) => (k === i ? j : a)))}
                  >
                    <span className="md" dangerouslySetInnerHTML={{ __html: renderMarkdown(`${'ABCD'[j]}) ${o}`) }} />
                  </button>
                )
              })}
            </div>
            {answers[i] != null && <div className="md small muted" dangerouslySetInnerHTML={{ __html: renderMarkdown(`${answers[i] === q.answer ? '✅ ¡Bien!' : '❌ No.'} ${q.explanation}`) }} />}
          </section>
        ))}
        {answered === qs.length && (
          <div className="card accent pad stack" style={{ alignItems: 'center', textAlign: 'center' }}>
            <span style={{ fontFamily: 'var(--display)', fontSize: 32, fontWeight: 600 }}>
              {((right / qs.length) * 10).toFixed(1).replace('.', ',')}
            </span>
            <span className="muted">
              {right} de {qs.length} correctas
            </span>
            <button className="btn primary" onClick={start} disabled={busy}>
              {busy ? 'Creando…' : 'Otro test'}
            </button>
          </div>
        )}
      </div>
    )
  }

  if (active.length === 0) return <Empty>No hay asignaturas activas.</Empty>
  return (
    <div className="card pad stack">
      <span className="muted small">Un test tipo examen hecho con IA a partir de tus apuntes (y del estilo de tus exámenes antiguos, si los has subido).</span>
      {!only && (
        <label className="field">
          Asignatura
          <select id="q-subject" className="select" value={subject?.id ?? ''} onChange={(e) => setSubjectId(e.target.value)}>
            {active.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>
      )}
      <div className="grid-2">
        <label className="field">
          Tema
          <select id="q-topic" className="select" value={topic} onChange={(e) => setTopic(e.target.value)}>
            <option value="">Toda la asignatura</option>
            {topics.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Preguntas
          <select id="q-count" className="select" value={count} onChange={(e) => setCount(Number(e.target.value))}>
            {[5, 8, 10, 15].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
      </div>
      <button className="btn primary" disabled={busy || !hasAi} onClick={start}>
        {busy ? 'Preparando el test…' : 'Empezar test'}
      </button>
      {!hasAi && <span className="xs muted">Activa la IA en Ajustes para usar los tests.</span>}
    </div>
  )
}
