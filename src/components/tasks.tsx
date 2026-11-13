import { useState } from 'react'
import { db, uid, PRIORITY_LABEL, type Priority, type Subject, type Task } from '../db'
import { relative, today } from '../lib/dates'
import { Icon } from './Icon'
import { ConfirmButton, Dot, Sheet, SubjectSelect } from './ui'

export async function toggleTask(t: Task) {
  await db.tasks.update(t.id, { done: !t.done, doneAt: t.done ? undefined : Date.now() })
}

export function TaskItem({ task, subject, onOpen }: { task: Task; subject?: Subject; onOpen: () => void }) {
  const doneSubs = task.subtasks.filter((s) => s.done).length
  const late = !task.done && task.due && task.due < today()
  return (
    <div className="list-item" style={{ alignItems: 'flex-start' }}>
      <input
        type="checkbox"
        className="check"
        checked={task.done}
        onChange={() => toggleTask(task)}
        aria-label={`Marcar "${task.title}" como ${task.done ? 'pendiente' : 'hecha'}`}
        style={{ marginTop: 2 }}
      />
      <button className="grow" onClick={onOpen} style={{ background: 'none', border: 0, padding: 0, textAlign: 'left', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span className={task.done ? 'done-text' : ''} style={{ fontWeight: 500 }}>{task.title}</span>
        <span className="row wrap xs muted" style={{ gap: 6 }}>
          {subject && (
            <span className="row" style={{ gap: 5 }}>
              <Dot color={subject.color} />
              {subject.short}
            </span>
          )}
          {task.due && <span style={late ? { color: 'var(--danger)', fontWeight: 600 } : undefined}>· {late ? 'vencida ' : ''}{relative(task.due)}</span>}
          {task.subtasks.length > 0 && <span>· {doneSubs}/{task.subtasks.length} subtareas</span>}
          {!task.done && <span className={`pill ${task.priority}`}>{PRIORITY_LABEL[task.priority]}</span>}
        </span>
      </button>
    </div>
  )
}

export function TaskSheet({
  task,
  subjects,
  defaultSubjectId,
  defaultDue,
  onClose,
}: {
  task?: Task
  subjects: Subject[]
  defaultSubjectId?: string
  defaultDue?: string
  onClose: () => void
}) {
  const [title, setTitle] = useState(task?.title ?? '')
  const [subjectId, setSubjectId] = useState(task?.subjectId ?? defaultSubjectId)
  const [priority, setPriority] = useState<Priority>(task?.priority ?? 'medium')
  const [due, setDue] = useState(task?.due ?? defaultDue ?? '')
  const [notes, setNotes] = useState(task?.notes ?? '')
  const [subtasks, setSubtasks] = useState(task?.subtasks ?? [])
  const [newSub, setNewSub] = useState('')

  const save = async () => {
    if (!title.trim()) return
    const data = { title: title.trim(), subjectId, priority, due: due || undefined, notes, subtasks }
    if (task) await db.tasks.update(task.id, data)
    else await db.tasks.add({ id: uid(), done: false, createdAt: Date.now(), ...data })
    onClose()
  }
  const remove = async () => {
    if (task) await db.tasks.delete(task.id)
    onClose()
  }
  const addSub = () => {
    if (!newSub.trim()) return
    setSubtasks([...subtasks, { id: uid(), title: newSub.trim(), done: false }])
    setNewSub('')
  }

  return (
    <Sheet title={task ? 'Editar tarea' : 'Nueva tarea'} onClose={onClose}>
      <label className="field">
        Tarea
        <input id="task-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej. Hoja de ejercicios 5" autoFocus />
      </label>
      <div className="grid-2">
        <label className="field">
          Asignatura
          <SubjectSelect id="task-subject" subjects={subjects} value={subjectId} onChange={setSubjectId} />
        </label>
        <label className="field">
          Fecha límite
          <input id="task-due" type="date" className="input" value={due} onChange={(e) => setDue(e.target.value)} />
        </label>
      </div>
      <div className="field">
        Prioridad
        <div className="segmented" role="radiogroup" aria-label="Prioridad">
          {(['high', 'medium', 'low'] as Priority[]).map((p) => (
            <button key={p} type="button" role="radio" aria-checked={priority === p} className={priority === p ? 'on' : ''} onClick={() => setPriority(p)}>
              {PRIORITY_LABEL[p]}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        Subtareas
        <div className="card list">
          {subtasks.map((s) => (
            <div key={s.id} className="list-item" style={{ minHeight: 44, padding: '6px 12px' }}>
              <input type="checkbox" className="check" checked={s.done} aria-label={s.title} onChange={() => setSubtasks(subtasks.map((x) => (x.id === s.id ? { ...x, done: !x.done } : x)))} />
              <span className={`grow ${s.done ? 'done-text' : ''}`} style={{ color: s.done ? undefined : 'var(--text)' }}>{s.title}</span>
              <button className="btn icon ghost sm" aria-label={`Quitar ${s.title}`} onClick={() => setSubtasks(subtasks.filter((x) => x.id !== s.id))}>
                <Icon name="close" size={16} />
              </button>
            </div>
          ))}
          <div className="row" style={{ padding: 8 }}>
            <input id="task-newsub" className="input" value={newSub} onChange={(e) => setNewSub(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSub())} placeholder="Añadir subtarea" />
            <button className="btn icon" onClick={addSub} aria-label="Añadir subtarea">
              <Icon name="plus" />
            </button>
          </div>
        </div>
      </div>
      <label className="field">
        Notas
        <textarea id="task-notes" className="textarea" style={{ minHeight: 70 }} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <div className="row">
        {task && (
          <ConfirmButton onConfirm={remove} />
        )}
        <span className="grow" />
        <button className="btn primary" onClick={save} disabled={!title.trim()}>
          Guardar
        </button>
      </div>
    </Sheet>
  )
}
