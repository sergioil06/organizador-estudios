import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db, uid, type Flashcard, type Subject } from '../db'
import { Icon } from '../components/Icon'
import { ConfirmButton, Dot, Empty, Sheet, useToast } from '../components/ui'
import { useSubjects, useToday } from '../hooks'
import { aiFlashcards, AiError, aiAvailable, subjectContext } from '../lib/ai'
import { addDays, today } from '../lib/dates'
import { renderMarkdown } from '../lib/markdown'

type Grade = 0 | 1 | 2 | 3 // otra vez, difícil, bien, fácil

/** Repetición espaciada (variante sencilla de SM-2). */
export function schedule(c: Flashcard, g: Grade): Partial<Flashcard> {
  let { ease, interval, reps } = c
  if (g === 0) {
    reps = 0
    interval = 0
    ease = Math.max(1.3, ease - 0.2)
  } else {
    reps += 1
    if (reps === 1) interval = g === 1 ? 1 : g === 2 ? 1 : 3
    else if (reps === 2) interval = g === 1 ? 2 : g === 2 ? 3 : 6
    else interval = Math.round(interval * (g === 1 ? 1.2 : g === 2 ? ease : ease * 1.3))
    ease = Math.max(1.3, ease + (g === 1 ? -0.15 : g === 3 ? 0.15 : 0))
  }
  return { ease, interval, reps, due: addDays(today(), interval) }
}

export function newCard(subjectId: string, front: string, back: string, topic?: string): Flashcard {
  return { id: uid(), subjectId, topic, front, back, ease: 2.5, interval: 0, reps: 0, due: today(), createdAt: Date.now() }
}

export async function generateCards(subject: Subject, topic: string | undefined, material?: string) {
  const ctx = material ?? (await subjectContext(subject.id, topic, 200_000)).text
  if (!ctx.trim()) throw new AiError('No hay apuntes con texto para esa asignatura o tema. Sube PDFs o fotos, o escribe notas.')
  const cards = await aiFlashcards(subject, ctx, 15)
  await db.cards.bulkAdd(cards.map((c) => newCard(subject.id, c.front, c.back, topic)))
  return cards.length
}

export function FlashcardsView({ only }: { only?: string }) {
  const day = useToday()
  const subjects = useSubjects()
  const cards = useLiveQuery(() => db.cards.toArray(), [], [] as Flashcard[])
  const [review, setReview] = useState<string | 'all' | null>(null)
  const [gen, setGen] = useState<Subject | null>(null)
  const [manage, setManage] = useState<Subject | null>(null)
  const list = subjects.filter((s) => (only ? s.id === only : s.status === 'active'))
  const dueAll = cards.filter((c) => c.due <= day && (!only || c.subjectId === only))

  if (review) return <Review subjectId={review} onExit={() => setReview(null)} />

  return (
    <div className="stack">
      {dueAll.length > 0 && !only && (
        <div className="card accent pad row">
          <span className="grow">
            <strong>{dueAll.length}</strong> tarjetas para repasar hoy
          </span>
          <button className="btn primary" onClick={() => setReview('all')}>
            Repasar todo
          </button>
        </div>
      )}
      <div className="card list">
        {list.map((s) => {
          const mine = cards.filter((c) => c.subjectId === s.id)
          const due = mine.filter((c) => c.due <= day).length
          return (
            <div key={s.id} className="list-item" style={{ flexWrap: 'wrap' }}>
              <Dot color={s.color} />
              <span className="stack grow" style={{ gap: 2 }}>
                <span style={{ fontWeight: 600 }}>{s.short}</span>
                <span className="xs muted">
                  {mine.length} tarjetas · {due} para hoy
                </span>
              </span>
              <span className="row">
                {mine.length > 0 && (
                  <button className="btn sm ghost" onClick={() => setManage(s)}>
                    Ver
                  </button>
                )}
                <button className="btn sm" onClick={() => setGen(s)}>
                  Crear
                </button>
                <button className="btn sm primary" disabled={due === 0} onClick={() => setReview(s.id)}>
                  Repasar
                </button>
              </span>
            </div>
          )
        })}
      </div>
      {gen && <GenerateSheet subject={gen} onClose={() => setGen(null)} />}
      {manage && <ManageSheet subject={manage} onClose={() => setManage(null)} />}
    </div>
  )
}

function GenerateSheet({ subject, onClose }: { subject: Subject; onClose: () => void }) {
  const toast = useToast()
  const [topic, setTopic] = useState('')
  const [front, setFront] = useState('')
  const [back, setBack] = useState('')
  const [busy, setBusy] = useState(false)
  const hasAi = useLiveQuery(() => aiAvailable(), [], false)
  const topics = useLiveQuery(async () => {
    const [f, n] = await Promise.all([db.files.where('subjectId').equals(subject.id).toArray(), db.notes.where('subjectId').equals(subject.id).toArray()])
    return [...new Set([...subject.topics, ...f.map((x) => x.topic), ...n.map((x) => x.topic)].filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }))
  }, [subject.id], [] as string[])

  const generate = async () => {
    setBusy(true)
    try {
      const n = await generateCards(subject, topic || undefined)
      toast(`${n} tarjetas creadas`)
      onClose()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'No se pudieron crear')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet title={`Flashcards de ${subject.short}`} onClose={onClose}>
      <div className="card accent pad stack">
        <span style={{ fontWeight: 600 }}>Crear con IA desde tus apuntes</span>
        <label className="field">
          Tema
          <select id="g-topic" className="select" value={topic} onChange={(e) => setTopic(e.target.value)}>
            <option value="">Toda la asignatura</option>
            {topics.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <button className="btn primary" disabled={busy || !hasAi} onClick={generate}>
          {busy ? 'Creando tarjetas…' : 'Crear 15 tarjetas'}
        </button>
        {!hasAi && <span className="xs muted">Activa la IA en Ajustes para crearlas automáticamente.</span>}
      </div>
      <span className="label">O a mano</span>
      <label className="field">
        Pregunta
        <textarea id="g-front" className="textarea" style={{ minHeight: 60 }} value={front} onChange={(e) => setFront(e.target.value)} placeholder="¿Qué es un subespacio vectorial?" />
      </label>
      <label className="field">
        Respuesta
        <textarea id="g-back" className="textarea" style={{ minHeight: 80 }} value={back} onChange={(e) => setBack(e.target.value)} />
      </label>
      <button
        className="btn"
        disabled={!front.trim() || !back.trim()}
        onClick={async () => {
          await db.cards.add(newCard(subject.id, front.trim(), back.trim(), topic || undefined))
          setFront('')
          setBack('')
          toast('Tarjeta añadida')
        }}
      >
        Añadir tarjeta
      </button>
    </Sheet>
  )
}

function ManageSheet({ subject, onClose }: { subject: Subject; onClose: () => void }) {
  const cards = useLiveQuery(() => db.cards.where('subjectId').equals(subject.id).toArray(), [subject.id], [] as Flashcard[])
  return (
    <Sheet title={`Tarjetas de ${subject.short} (${cards.length})`} onClose={onClose}>
      <div className="card list">
        {cards.map((c) => (
          <div key={c.id} className="list-item" style={{ alignItems: 'flex-start' }}>
            <span className="stack grow" style={{ gap: 4, minWidth: 0 }}>
              <span className="md small" style={{ fontWeight: 600 }} dangerouslySetInnerHTML={{ __html: renderMarkdown(c.front) }} />
              <span className="md xs muted" dangerouslySetInnerHTML={{ __html: renderMarkdown(c.back) }} />
              <span className="xs faint">
                {c.topic ? `${c.topic} · ` : ''}próximo repaso {c.due}
              </span>
            </span>
            <ConfirmButton label="Quitar" confirm="¿Quitar?" onConfirm={() => db.cards.delete(c.id)} />
          </div>
        ))}
      </div>
    </Sheet>
  )
}

function Review({ subjectId, onExit }: { subjectId: string; onExit: () => void }) {
  const day = useToday()
  const subjects = useSubjects()
  const [queue] = useState(() => db.cards.filter((c) => c.due <= day && (subjectId === 'all' || c.subjectId === subjectId)).toArray())
  const cards = useLiveQuery(() => queue, [], [] as Flashcard[])
  const [i, setI] = useState(0)
  const [show, setShow] = useState(false)
  const [again, setAgain] = useState<Flashcard[]>([])
  const all = [...cards, ...again]
  const c = all[i]

  if (!c)
    return (
      <div className="card">
        <Empty>
          <span style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>¡Repaso terminado!</span>
          <span>{cards.length} tarjetas repasadas. Las difíciles volverán antes.</span>
          <button className="btn" onClick={onExit}>
            Volver
          </button>
        </Empty>
      </div>
    )

  const s = subjects.find((x) => x.id === c.subjectId)
  const rate = async (g: Grade) => {
    await db.cards.update(c.id, schedule(c, g))
    if (g === 0) setAgain((a) => [...a, c])
    setShow(false)
    setI(i + 1)
  }

  return (
    <div className="stack">
      <div className="row">
        <button className="btn icon ghost" onClick={onExit} aria-label="Salir del repaso">
          <Icon name="close" />
        </button>
        <span className="grow small muted">
          {i + 1} / {all.length}
        </span>
        {s && (
          <span className="row small" style={{ gap: 6 }}>
            <Dot color={s.color} /> {s.short}
            {c.topic ? ` · ${c.topic}` : ''}
          </span>
        )}
      </div>
      <button className="card pad stack" style={{ minHeight: 260, justifyContent: 'center', textAlign: 'center', cursor: 'pointer', color: 'var(--text)', gap: 16 }} onClick={() => setShow(true)}>
        <div className="md" style={{ fontSize: 19, fontWeight: 600 }} dangerouslySetInnerHTML={{ __html: renderMarkdown(c.front) }} />
        {show ? (
          <div className="md" style={{ borderTop: '1px solid var(--border)', paddingTop: 16, color: 'var(--text-2)' }} dangerouslySetInnerHTML={{ __html: renderMarkdown(c.back) }} />
        ) : (
          <span className="small muted">Piensa la respuesta y toca para verla</span>
        )}
      </button>
      {show && (
        <div className="grid-2" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
          <button className="btn" style={{ color: 'var(--danger)' }} onClick={() => rate(0)}>
            Otra vez
          </button>
          <button className="btn" onClick={() => rate(1)}>
            Difícil
          </button>
          <button className="btn" onClick={() => rate(2)}>
            Bien
          </button>
          <button className="btn" style={{ color: 'var(--ok)' }} onClick={() => rate(3)}>
            Fácil
          </button>
        </div>
      )}
    </div>
  )
}
