import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { CLASS_TYPE_LABEL, db, FILE_KIND_LABEL, uid, type CalEvent, type ClassSlot, type FileKind, type StoredFile, type Task } from '../db'
import { ClassSheet } from '../components/ClassSheet'
import { Countdown, EventSheet } from '../components/events'
import { FileItem } from '../components/files'
import { FileSheet } from '../components/FileSheet'
import { Icon } from '../components/Icon'
import { TaskItem, TaskSheet } from '../components/tasks'
import { Empty } from '../components/ui'
import { useSubjects, useToday } from '../hooks'
import { formatShort, WEEKDAYS } from '../lib/dates'
import { SubjectSheet } from './Subjects'
import { AttendanceView, BiblioView, GradesView } from '../features/grades'
import { ChatView, SummariesView } from '../features/chat'
import { FlashcardsView } from '../features/flashcards'

export async function createNote(subjectId?: string, topic?: string): Promise<string> {
  const id = uid()
  await db.notes.add({ id, title: '', subjectId, topic, body: '', tags: [], fileIds: [], createdAt: Date.now(), updatedAt: Date.now() })
  return id
}

export default function SubjectDetail() {
  const { id = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') ?? 'archivos'
  const subjects = useSubjects()
  const subject = subjects.find((s) => s.id === id)
  const [editing, setEditing] = useState(false)

  if (!subject) return <div className="page"><Empty>Cargando…</Empty></div>

  const tabs: { id: string; label: string }[] = [
    { id: 'archivos', label: 'Archivos' },
    { id: 'notas', label: 'Notas' },
    { id: 'tareas', label: 'Tareas' },
    { id: 'examenes', label: 'Exámenes' },
    { id: 'calificacion', label: 'Calificación' },
    { id: 'chat', label: 'Chat' },
    { id: 'resumenes', label: 'Resúmenes' },
    { id: 'flashcards', label: 'Flashcards' },
    { id: 'asistencia', label: 'Asistencia' },
    { id: 'bibliografia', label: 'Bibliografía' },
    { id: 'horario', label: 'Horario' },
  ]

  return (
    <div className="page">
      <div className="subject-hero stack" style={{ ['--c' as string]: subject.color, gap: 14 }}>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <Link to="/asignaturas" className="btn icon sm ghost" aria-label="Volver a asignaturas" style={{ marginLeft: -6 }}>
            <Icon name="back" size={18} />
          </Link>
          <span className="grow" />
          <button className="btn sm" onClick={() => setEditing(true)}>
            <Icon name="edit" size={16} /> Editar
          </button>
        </div>
        <div className="stack" style={{ gap: 6 }}>
          <span className="label row" style={{ gap: 8, color: subject.color }}>
            <span className="dot" style={{ background: subject.color }} />
            {subject.short} · {subject.year}º curso · {subject.term}º cuatrimestre
          </span>
          <h1 style={{ fontSize: 32 }}>{subject.name}</h1>
          <span className="small muted">
            {subject.credits} ECTS · {subject.professor ? `Prof. ${subject.professor}` : 'Profesor sin añadir'}
          </span>
        </div>
      </div>

      <div className="tabs" role="tablist" aria-label="Secciones de la asignatura">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={`tab ${tab === t.id ? 'on' : ''}`} onClick={() => setParams({ tab: t.id }, { replace: true })}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'archivos' && <FilesTab subjectId={id} />}
      {tab === 'notas' && <NotesTab subjectId={id} />}
      {tab === 'tareas' && <TasksTab subjectId={id} />}
      {tab === 'examenes' && <ExamsTab subjectId={id} />}
      {tab === 'horario' && <ScheduleTab subjectId={id} />}
      {tab === 'calificacion' && <GradesView subjectId={id} />}
      {tab === 'chat' && <ChatView subjectId={id} />}
      {tab === 'resumenes' && <SummariesView subjectId={id} />}
      {tab === 'flashcards' && <FlashcardsView only={id} />}
      {tab === 'asistencia' && <AttendanceView subjectId={id} />}
      {tab === 'bibliografia' && <BiblioView subjectId={id} />}

      {editing && <SubjectSheet subject={subject} subjects={subjects} onClose={() => setEditing(false)} />}
    </div>
  )
}

function FilesTab({ subjectId }: { subjectId: string }) {
  const subjects = useSubjects()
  const files = useLiveQuery(() => db.files.where('subjectId').equals(subjectId).toArray(), [subjectId], [] as StoredFile[])
  const [topic, setTopic] = useState('')
  const [kind, setKind] = useState<FileKind | ''>('')
  const [editing, setEditing] = useState<StoredFile | null>(null)

  const topics = [...new Set(files.map((f) => f.topic ?? 'Sin tema'))].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }))
  const shown = files.filter((f) => (!topic || (f.topic ?? 'Sin tema') === topic) && (!kind || f.kind === kind))
  const groups = topics.filter((t) => shown.some((f) => (f.topic ?? 'Sin tema') === t))

  return (
    <div className="stack">
      <div className="row wrap">
        <label className="sr-only" htmlFor="ft-topic">Tema</label>
        <select id="ft-topic" className="select" style={{ width: 'auto', minHeight: 38 }} value={topic} onChange={(e) => setTopic(e.target.value)}>
          <option value="">Todos los temas</option>
          {topics.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <label className="sr-only" htmlFor="ft-kind">Tipo</label>
        <select id="ft-kind" className="select" style={{ width: 'auto', minHeight: 38 }} value={kind} onChange={(e) => setKind(e.target.value as FileKind | '')}>
          <option value="">Todos los tipos</option>
          {(Object.keys(FILE_KIND_LABEL) as FileKind[]).map((k) => (
            <option key={k} value={k}>{FILE_KIND_LABEL[k]}</option>
          ))}
        </select>
        <span className="grow" />
        <Link to={`/subir?asignatura=${subjectId}`} className="btn sm primary">
          <Icon name="upload" size={16} /> Subir
        </Link>
      </div>
      {shown.length === 0 ? (
        <div className="card">
          <Empty>
            <span>Todavía no hay archivos aquí.</span>
            <Link to={`/subir?asignatura=${subjectId}`} className="btn sm">Subir el primero</Link>
          </Empty>
        </div>
      ) : (
        groups.map((g) => (
          <div key={g} className="stack" style={{ gap: 6 }}>
            <span className="label">{g}</span>
            <div className="card list">
              {shown
                .filter((f) => (f.topic ?? 'Sin tema') === g)
                .sort((a, b) => b.date.localeCompare(a.date))
                .map((f) => (
                  <FileItem key={f.id} file={f} onEdit={() => setEditing(f)} />
                ))}
            </div>
          </div>
        ))
      )}
      {editing && <FileSheet file={editing} subjects={subjects} onClose={() => setEditing(null)} />}
    </div>
  )
}

function NotesTab({ subjectId }: { subjectId: string }) {
  const navigate = useNavigate()
  const notes = useLiveQuery(() => db.notes.where('subjectId').equals(subjectId).reverse().sortBy('updatedAt'), [subjectId], [])
  return (
    <div className="stack">
      <div className="row">
        <span className="grow" />
        <button className="btn sm primary" onClick={async () => navigate(`/notas/${await createNote(subjectId)}`)}>
          <Icon name="plus" size={16} /> Nueva nota
        </button>
      </div>
      <div className="card list">
        {notes.length === 0 ? (
          <Empty>Sin notas todavía.</Empty>
        ) : (
          notes.map((n) => (
            <Link key={n.id} to={`/notas/${n.id}`} className="list-item">
              <Icon name="note" size={20} />
              <span className="stack grow" style={{ gap: 2, minWidth: 0 }}>
                <span style={{ fontWeight: 600 }}>{n.title || 'Sin título'}</span>
                <span className="xs muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {[n.topic, ...n.tags.map((t) => `#${t}`)].filter(Boolean).join(' · ') || n.body.slice(0, 80)}
                </span>
              </span>
              <span className="xs muted">{new Date(n.updatedAt).toLocaleDateString('es')}</span>
            </Link>
          ))
        )}
      </div>
    </div>
  )
}

function TasksTab({ subjectId }: { subjectId: string }) {
  const subjects = useSubjects()
  const subject = subjects.find((s) => s.id === subjectId)
  const tasks = useLiveQuery(() => db.tasks.where('subjectId').equals(subjectId).toArray(), [subjectId], [] as Task[])
  const [open, setOpen] = useState<Task | 'new' | null>(null)
  const pending = tasks.filter((t) => !t.done).sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999'))
  const done = tasks.filter((t) => t.done).sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0)).slice(0, 10)
  return (
    <div className="stack">
      <div className="row">
        <span className="grow" />
        <button className="btn sm primary" onClick={() => setOpen('new')}>
          <Icon name="plus" size={16} /> Nueva tarea
        </button>
      </div>
      <div className="card list">
        {pending.length === 0 ? <Empty>No hay tareas pendientes.</Empty> : pending.map((t) => <TaskItem key={t.id} task={t} subject={subject} onOpen={() => setOpen(t)} />)}
      </div>
      {done.length > 0 && (
        <>
          <span className="label">Hechas</span>
          <div className="card list">
            {done.map((t) => (
              <TaskItem key={t.id} task={t} subject={subject} onOpen={() => setOpen(t)} />
            ))}
          </div>
        </>
      )}
      {open && <TaskSheet task={open === 'new' ? undefined : open} defaultSubjectId={subjectId} subjects={subjects} onClose={() => setOpen(null)} />}
    </div>
  )
}

function ExamsTab({ subjectId }: { subjectId: string }) {
  const subjects = useSubjects()
  const day = useToday()
  const subject = subjects.find((s) => s.id === subjectId)
  const events = useLiveQuery(() => db.events.where('subjectId').equals(subjectId).sortBy('date'), [subjectId], [] as CalEvent[])
  const [open, setOpen] = useState<CalEvent | 'new' | null>(null)
  const next = events.filter((e) => e.date >= day)
  const past = events.filter((e) => e.date < day).reverse()
  return (
    <div className="stack">
      <div className="row">
        <span className="grow" />
        <button className="btn sm primary" onClick={() => setOpen('new')}>
          <Icon name="plus" size={16} /> Examen o entrega
        </button>
      </div>
      {next.length === 0 ? (
        <div className="card">
          <Empty>No hay exámenes ni entregas apuntados.</Empty>
        </div>
      ) : (
        <div className="grid-auto" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))' }}>
          {next.map((e) => (
            <Countdown key={e.id} event={e} subject={subject} onOpen={() => setOpen(e)} />
          ))}
        </div>
      )}
      {past.length > 0 && (
        <>
          <span className="label">Pasados</span>
          <div className="card list">
            {past.map((e) => (
              <button key={e.id} className="list-item" onClick={() => setOpen(e)}>
                <span className="grow">{e.title}</span>
                <span className="xs muted">{formatShort(e.date)}</span>
              </button>
            ))}
          </div>
        </>
      )}
      <p className="xs muted" style={{ margin: 0 }}>
        Los exámenes antiguos (PDF) se guardan en Archivos con el tipo “Examen antiguo”.
      </p>
      {open && <EventSheet event={open === 'new' ? undefined : open} defaultSubjectId={subjectId} subjects={subjects} onClose={() => setOpen(null)} />}
    </div>
  )
}

function ScheduleTab({ subjectId }: { subjectId: string }) {
  const classes = useLiveQuery(() => db.classes.where('subjectId').equals(subjectId).toArray(), [subjectId], [] as ClassSlot[])
  const [open, setOpen] = useState<ClassSlot | 'new' | null>(null)
  const sorted = [...classes].sort((a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start))
  return (
    <div className="stack">
      <div className="card list">
        {sorted.length === 0 ? (
          <Empty>Sin clases en el horario.</Empty>
        ) : (
          sorted.map((c) => (
            <button key={c.id} className="list-item" onClick={() => setOpen(c)}>
              <span className="tnum" style={{ width: 96, flex: 'none', textTransform: 'capitalize' }}>
                {WEEKDAYS[c.weekday - 1]}
              </span>
              <span className="stack grow" style={{ gap: 2 }}>
                <span style={{ fontWeight: 600 }}>
                  {c.start}–{c.end} · {c.type}
                </span>
                <span className="xs muted">
                  {CLASS_TYPE_LABEL[c.type]} · {c.room || 'Sin aula'} · del {formatShort(c.from)} al {formatShort(c.until)}
                </span>
              </span>
            </button>
          ))
        )}
      </div>
      <div className="row">
        <button className="btn sm" onClick={() => setOpen('new')}>
          <Icon name="plus" size={16} /> Añadir clase
        </button>
      </div>
      {open && <ClassSheet slot={open === 'new' ? undefined : open} subjectId={subjectId} defaults={classes[0]} onClose={() => setOpen(null)} />}
    </div>
  )
}
