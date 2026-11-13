import { useState } from 'react'
import { db, uid, EVENT_KIND_LABEL, type CalEvent, type EventKind, type Subject } from '../db'
import { daysBetween, formatShort, today } from '../lib/dates'
import { ConfirmButton, Dot, Sheet, SubjectSelect } from './ui'

export function EventSheet({
  event,
  subjects,
  defaultDate,
  defaultKind = 'exam',
  defaultSubjectId,
  onClose,
}: {
  event?: CalEvent
  subjects: Subject[]
  defaultDate?: string
  defaultKind?: EventKind
  defaultSubjectId?: string
  onClose: () => void
}) {
  const [kind, setKind] = useState<EventKind>(event?.kind ?? defaultKind)
  const [subjectId, setSubjectId] = useState(event?.subjectId ?? defaultSubjectId)
  const [title, setTitle] = useState(event?.title ?? '')
  const [date, setDate] = useState(event?.date ?? defaultDate ?? today())
  const [start, setStart] = useState(event?.start ?? '')
  const [end, setEnd] = useState(event?.end ?? '')
  const [place, setPlace] = useState(event?.place ?? '')
  const [topics, setTopics] = useState(event?.topics ?? '')
  const [notes, setNotes] = useState(event?.notes ?? '')

  const subject = subjects.find((s) => s.id === subjectId)
  const autoTitle = `${EVENT_KIND_LABEL[kind]}${subject ? ` de ${subject.short}` : ''}`

  const save = async () => {
    const data = {
      kind,
      subjectId,
      title: title.trim() || autoTitle,
      date,
      start: start || undefined,
      end: end || undefined,
      place,
      topics,
      notes,
      reminderDays: event?.reminderDays ?? (kind === 'exam' ? [7, 3, 1] : [2, 1]),
    }
    if (event) await db.events.update(event.id, data)
    else await db.events.add({ id: uid(), ...data })
    onClose()
  }
  const remove = async () => {
    if (event) await db.events.delete(event.id)
    onClose()
  }

  return (
    <Sheet title={event ? 'Editar' : 'Nuevo examen o entrega'} onClose={onClose}>
      <div className="segmented" role="radiogroup" aria-label="Tipo">
        {(['exam', 'delivery', 'other'] as EventKind[]).map((k) => (
          <button key={k} type="button" role="radio" aria-checked={kind === k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>
            {EVENT_KIND_LABEL[k]}
          </button>
        ))}
      </div>
      <div className="grid-2">
        <label className="field">
          Asignatura
          <SubjectSelect id="ev-subject" subjects={subjects} value={subjectId} onChange={setSubjectId} />
        </label>
        <label className="field">
          Fecha
          <input id="ev-date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>
      <label className="field">
        Título
        <input id="ev-title" className="input" value={title} placeholder={autoTitle} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <div className="grid-2">
        <label className="field">
          Empieza
          <input id="ev-start" type="time" className="input" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label className="field">
          Termina
          <input id="ev-end" type="time" className="input" value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
      </div>
      <label className="field">
        Lugar
        <input id="ev-place" className="input" value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Aula, edificio…" />
      </label>
      {kind === 'exam' && (
        <label className="field">
          Temas que entran
          <input id="ev-topics" className="input" value={topics} onChange={(e) => setTopics(e.target.value)} placeholder="Ej. temas 1 a 4" />
        </label>
      )}
      <label className="field">
        Notas
        <textarea id="ev-notes" className="textarea" style={{ minHeight: 70 }} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <p className="xs muted" style={{ margin: 0 }}>
        Cuando conectes tu cuenta de Google, los exámenes y entregas se copiarán también a tu Google Calendar.
      </p>
      <div className="row">
        {event && (
          <ConfirmButton onConfirm={remove} />
        )}
        <span className="grow" />
        <button className="btn primary" onClick={save}>
          Guardar
        </button>
      </div>
    </Sheet>
  )
}

export function Countdown({ event, subject, onOpen }: { event: CalEvent; subject?: Subject; onOpen: () => void }) {
  const n = daysBetween(today(), event.date)
  return (
    <button className="card pad stack" style={{ gap: 4, textAlign: 'left', cursor: 'pointer', color: 'var(--text)' }} onClick={onOpen}>
      <span className="row xs" style={{ gap: 6, color: subject?.color ?? 'var(--accent)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {subject && <Dot color={subject.color} />}
        {subject?.short ?? EVENT_KIND_LABEL[event.kind]}
      </span>
      <span className="tnum" style={{ fontFamily: 'var(--display)', fontSize: 30, fontWeight: 600, lineHeight: 1.1 }}>
        {n === 0 ? '¡Hoy!' : n === 1 ? 'Mañana' : `${n} días`}
      </span>
      <span className="small muted">
        {event.title} · {formatShort(event.date)}
        {event.start ? ` · ${event.start}` : ''}
      </span>
    </button>
  )
}
