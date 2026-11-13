import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { db, uid, type Subject } from '../db'
import { Icon } from '../components/Icon'
import { ConfirmButton, Sheet } from '../components/ui'
import { useSubjects } from '../hooks'
import { nextColor } from '../seed'

const GROUPS: { status: Subject['status']; title: string }[] = [
  { status: 'active', title: 'Este cuatrimestre' },
  { status: 'upcoming', title: 'Próximamente' },
  { status: 'passed', title: 'Aprobadas (archivo)' },
  { status: 'dropped', title: 'No cursadas' },
]

export default function Subjects() {
  const subjects = useSubjects()
  const counts = useLiveQuery(async () => {
    const [files, tasks] = await Promise.all([db.files.toArray(), db.tasks.filter((t) => !t.done).toArray()])
    const m = new Map<string, { files: number; tasks: number }>()
    for (const f of files) if (f.subjectId) m.set(f.subjectId, { files: (m.get(f.subjectId)?.files ?? 0) + 1, tasks: m.get(f.subjectId)?.tasks ?? 0 })
    for (const t of tasks) if (t.subjectId) m.set(t.subjectId, { files: m.get(t.subjectId)?.files ?? 0, tasks: (m.get(t.subjectId)?.tasks ?? 0) + 1 })
    return m
  }, [], new Map())
  const [adding, setAdding] = useState(false)

  const passed = subjects.filter((s) => s.status === 'passed')
  const credits = passed.reduce((a, s) => a + s.credits, 0)
  const graded = passed.filter((s) => s.finalGrade != null)
  const avg = graded.length ? graded.reduce((a, s) => a + s.finalGrade! * s.credits, 0) / graded.reduce((a, s) => a + s.credits, 0) : null

  return (
    <div className="page">
      <div className="page-head">
        <h1>Asignaturas</h1>
        <button className="btn sm" onClick={() => setAdding(true)}>
          <Icon name="plus" size={16} /> Añadir
        </button>
      </div>

      <div className="grid-2">
        <div className="card pad stack" style={{ gap: 2 }}>
          <span className="label">Créditos superados</span>
          <span className="tnum" style={{ fontFamily: 'var(--display)', fontSize: 26, fontWeight: 600 }}>
            {credits} <span className="small muted">/ 240 ECTS</span>
          </span>
        </div>
        <div className="card pad stack" style={{ gap: 2 }}>
          <span className="label">Media del expediente</span>
          <span className="tnum" style={{ fontFamily: 'var(--display)', fontSize: 26, fontWeight: 600 }}>
            {avg != null ? avg.toFixed(2).replace('.', ',') : '—'}
          </span>
        </div>
      </div>

      {GROUPS.map((g) => {
        const list = subjects.filter((s) => s.status === g.status).sort((a, b) => a.year - b.year || a.term - b.term || a.name.localeCompare(b.name))
        if (list.length === 0) return null
        return (
          <section key={g.status} className="stack">
            <h2>{g.title}</h2>
            <div className="card list">
              {list.map((s) => {
                const c = counts.get(s.id)
                return (
                  <Link key={s.id} to={`/asignaturas/${s.id}`} className="list-item">
                    <span className="bar" style={{ background: s.color, minHeight: 34 }} />
                    <span className="stack grow" style={{ gap: 2 }}>
                      <span style={{ fontWeight: 600 }}>{s.name}</span>
                      <span className="xs muted">
                        {s.year}º · {s.term}er cuatrimestre · {s.credits} ECTS
                        {s.professor ? ` · ${s.professor}` : ''}
                        {s.status === 'passed' && s.finalGrade != null ? ` · Nota ${String(s.finalGrade).replace('.', ',')}` : ''}
                      </span>
                    </span>
                    {c && (c.files > 0 || c.tasks > 0) && (
                      <span className="xs muted" style={{ textAlign: 'right' }}>
                        {c.files > 0 && <div>{c.files} archivos</div>}
                        {c.tasks > 0 && <div>{c.tasks} tareas</div>}
                      </span>
                    )}
                    <Icon name="chevron" size={18} />
                  </Link>
                )
              })}
            </div>
          </section>
        )
      })}

      {adding && <SubjectSheet subjects={subjects} onClose={() => setAdding(false)} />}
    </div>
  )
}

export function SubjectSheet({ subject, subjects, onClose }: { subject?: Subject; subjects: Subject[]; onClose: () => void }) {
  const [name, setName] = useState(subject?.name ?? '')
  const [short, setShort] = useState(subject?.short ?? '')
  const [professor, setProfessor] = useState(subject?.professor ?? '')
  const [credits, setCredits] = useState(String(subject?.credits ?? 6))
  const [year, setYear] = useState(String(subject?.year ?? 1))
  const [term, setTerm] = useState(String(subject?.term ?? 1))
  const [status, setStatus] = useState<Subject['status']>(subject?.status ?? 'active')
  const [finalGrade, setFinalGrade] = useState(subject?.finalGrade != null ? String(subject.finalGrade) : '')
  const [topics, setTopics] = useState((subject?.topics ?? []).join('\n'))

  const save = async () => {
    if (!name.trim()) return
    const data = {
      name: name.trim(),
      short: short.trim() || name.trim().split(' ')[0],
      professor: professor.trim() || undefined,
      credits: Number(credits) || 6,
      year: Number(year) || 1,
      term: (Number(term) === 2 ? 2 : 1) as 1 | 2,
      status,
      finalGrade: finalGrade ? Number(finalGrade.replace(',', '.')) : undefined,
      topics: topics.split('\n').map((t) => t.trim()).filter(Boolean),
    }
    if (subject) await db.subjects.update(subject.id, data)
    else await db.subjects.add({ id: uid(), color: nextColor(subjects.map((s) => s.color)), ...data })
    onClose()
  }

  return (
    <Sheet title={subject ? 'Editar asignatura' : 'Nueva asignatura'} onClose={onClose}>
      <label className="field">
        Nombre
        <input id="s-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="grid-2">
        <label className="field">
          Nombre corto
          <input id="s-short" className="input" value={short} onChange={(e) => setShort(e.target.value)} placeholder="Ej. Álgebra" />
        </label>
        <label className="field">
          Profesor/a
          <input id="s-prof" className="input" value={professor} onChange={(e) => setProfessor(e.target.value)} />
        </label>
      </div>
      <div className="grid-2">
        <label className="field">
          Créditos (ECTS)
          <input id="s-credits" className="input" inputMode="decimal" value={credits} onChange={(e) => setCredits(e.target.value)} />
        </label>
        <label className="field">
          Curso y cuatrimestre
          <span className="row">
            <select id="s-year" className="select" value={year} onChange={(e) => setYear(e.target.value)} aria-label="Curso">
              {[1, 2, 3, 4].map((y) => (
                <option key={y} value={y}>{y}º</option>
              ))}
            </select>
            <select id="s-term" className="select" value={term} onChange={(e) => setTerm(e.target.value)} aria-label="Cuatrimestre">
              <option value="1">1er cuatr.</option>
              <option value="2">2º cuatr.</option>
            </select>
          </span>
        </label>
      </div>
      <div className="grid-2">
        <label className="field">
          Estado
          <select id="s-status" className="select" value={status} onChange={(e) => setStatus(e.target.value as Subject['status'])}>
            <option value="active">La estoy cursando</option>
            <option value="upcoming">Próximamente</option>
            <option value="passed">Aprobada</option>
            <option value="dropped">No la curso</option>
          </select>
        </label>
        {status === 'passed' && (
          <label className="field">
            Nota final
            <input id="s-grade" className="input" inputMode="decimal" value={finalGrade} onChange={(e) => setFinalGrade(e.target.value)} placeholder="Ej. 7,5" />
          </label>
        )}
      </div>
      <label className="field">
        Temas (uno por línea)
        <textarea id="s-topics" className="textarea" value={topics} onChange={(e) => setTopics(e.target.value)} placeholder={'Tema 1 · Matrices\nTema 2 · Determinantes'} />
      </label>
      <div className="row">
        {subject && (
          <ConfirmButton
            onConfirm={async () => {
              await db.subjects.delete(subject.id)
              await db.classes.where('subjectId').equals(subject.id).delete()
              onClose()
              history.back()
            }}
          />
        )}
        <span className="grow" />
        <button className="btn primary" onClick={save} disabled={!name.trim()}>
          Guardar
        </button>
      </div>
    </Sheet>
  )
}
