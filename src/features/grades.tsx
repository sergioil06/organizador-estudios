import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db, uid, type Attendance, type BiblioEntry, type ClassSlot, type GradeItem } from '../db'
import { Icon } from '../components/Icon'
import { ConfirmButton, Empty, Sheet } from '../components/ui'
import { useSubjects, useToday } from '../hooks'
import { addDays, formatShort, weekday } from '../lib/dates'
import { openFile } from '../components/files'

const num = (s: string) => (s.trim() === '' ? undefined : Number(s.replace(',', '.')))
const fmt = (n: number) => n.toFixed(2).replace('.', ',').replace(/,00$/, '')

export function gradeSummary(items: GradeItem[], target = 5) {
  const totalW = items.reduce((a, i) => a + i.weight, 0)
  const graded = items.filter((i) => i.grade != null)
  const doneW = graded.reduce((a, i) => a + i.weight, 0)
  const points = graded.reduce((a, i) => a + (i.grade! * i.weight) / 100, 0) // puntos sobre 10 ya conseguidos
  const remainingW = totalW - doneW
  const current = doneW ? (points / doneW) * 100 : null // media de lo evaluado
  const needed = remainingW > 0 ? ((target - points) / remainingW) * 100 : null // nota media necesaria en lo que falta
  const failsMin = graded.filter((i) => i.minGrade != null && i.grade! < i.minGrade)
  return { totalW, doneW, points, remainingW, current, needed, failsMin, final: remainingW === 0 ? points : null }
}

export function GradesView({ subjectId }: { subjectId: string }) {
  const items = useLiveQuery(() => db.grades.where('subjectId').equals(subjectId).sortBy('order'), [subjectId], [] as GradeItem[])
  const [target, setTarget] = useState(5)
  const [edit, setEdit] = useState<GradeItem | 'new' | null>(null)
  const s = gradeSummary(items, target)

  const template = async (parts: [string, number, number?][]) => {
    await db.grades.bulkAdd(parts.map(([name, weight, minGrade], i) => ({ id: uid(), subjectId, name, weight, minGrade, order: i })))
  }

  return (
    <div className="stack">
      {items.length === 0 ? (
        <div className="card pad stack">
          <span>Apunta cómo te evalúan (lo pone la guía docente) y te calculo la media y lo que necesitas en el final.</span>
          <span className="xs muted">Empieza con una plantilla y ajusta los porcentajes:</span>
          <div className="row wrap">
            <button className="btn sm" onClick={() => template([['Examen final', 70, 4], ['Prácticas de laboratorio', 20], ['Entregas / seminarios', 10]])}>
              Final 70 · prácticas 20 · entregas 10
            </button>
            <button className="btn sm" onClick={() => template([['Parcial', 40], ['Examen final', 60, 4]])}>
              Parcial 40 · final 60
            </button>
            <button className="btn sm" onClick={() => setEdit('new')}>
              Desde cero
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="grid-2">
            <div className="card pad stack" style={{ gap: 2 }}>
              <span className="label">Llevas</span>
              <span style={{ fontFamily: 'var(--display)', fontSize: 28, fontWeight: 600 }}>{fmt(s.points)} <span className="small muted">puntos de 10</span></span>
              <span className="xs muted">{s.current != null ? `Media de lo evaluado: ${fmt(s.current)}` : 'Aún no hay notas'}</span>
            </div>
            <div className="card pad stack" style={{ gap: 2 }}>
              <span className="label">
                Para sacar un{' '}
                <select aria-label="Nota objetivo" value={target} onChange={(e) => setTarget(Number(e.target.value))} style={{ background: 'none', border: 0, color: 'var(--accent)', fontWeight: 700 }}>
                  {[5, 6, 7, 8, 9, 10].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </span>
              {s.final != null ? (
                <span style={{ fontFamily: 'var(--display)', fontSize: 28, fontWeight: 600 }}>Nota final {fmt(s.final)}</span>
              ) : s.needed == null ? (
                <span className="muted">—</span>
              ) : s.needed <= 0 ? (
                <span style={{ fontFamily: 'var(--display)', fontSize: 24, fontWeight: 600, color: 'var(--ok)' }}>¡Ya lo tienes!</span>
              ) : s.needed > 10 ? (
                <span style={{ fontFamily: 'var(--display)', fontSize: 22, fontWeight: 600, color: 'var(--danger)' }}>No llega</span>
              ) : (
                <span style={{ fontFamily: 'var(--display)', fontSize: 28, fontWeight: 600 }}>{fmt(s.needed)}</span>
              )}
              <span className="xs muted">{s.remainingW > 0 ? `de media en lo que falta (${s.remainingW} %)` : ''}</span>
            </div>
          </div>
          {s.totalW !== 100 && <span className="small" style={{ color: 'var(--danger)' }}>Los porcentajes suman {s.totalW} %, deberían sumar 100 %.</span>}
          {s.failsMin.map((i) => (
            <span key={i.id} className="small" style={{ color: 'var(--danger)' }}>
              Ojo: en “{i.name}” necesitas al menos un {fmt(i.minGrade!)} para que haga media.
            </span>
          ))}
          {items.filter((i) => i.grade == null && i.minGrade != null).map((i) => (
            <span key={i.id} className="xs muted">“{i.name}” necesita un mínimo de {fmt(i.minGrade!)}.</span>
          ))}
          <div className="card list">
            {items.map((i) => (
              <button key={i.id} className="list-item" onClick={() => setEdit(i)}>
                <span className="stack grow" style={{ gap: 2 }}>
                  <span style={{ fontWeight: 600 }}>{i.name}</span>
                  <span className="xs muted">{i.weight} %{i.minGrade != null ? ` · mínimo ${fmt(i.minGrade)}` : ''}</span>
                </span>
                <span className="tnum" style={{ fontFamily: 'var(--display)', fontSize: 20, fontWeight: 600, color: i.grade == null ? 'var(--faint)' : i.minGrade != null && i.grade < i.minGrade ? 'var(--danger)' : 'var(--text)' }}>
                  {i.grade != null ? fmt(i.grade) : '—'}
                </span>
              </button>
            ))}
          </div>
          <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setEdit('new')}>
            <Icon name="plus" size={16} /> Añadir parte
          </button>
        </>
      )}
      {edit && <GradeSheet item={edit === 'new' ? undefined : edit} subjectId={subjectId} order={items.length} onClose={() => setEdit(null)} />}
    </div>
  )
}

function GradeSheet({ item, subjectId, order, onClose }: { item?: GradeItem; subjectId: string; order: number; onClose: () => void }) {
  const [name, setName] = useState(item?.name ?? '')
  const [weight, setWeight] = useState(item ? String(item.weight) : '')
  const [grade, setGrade] = useState(item?.grade != null ? String(item.grade).replace('.', ',') : '')
  const [minGrade, setMinGrade] = useState(item?.minGrade != null ? String(item.minGrade).replace('.', ',') : '')
  const save = async () => {
    const data = { name: name.trim() || 'Parte', weight: num(weight) ?? 0, grade: num(grade), minGrade: num(minGrade) }
    if (item) await db.grades.update(item.id, data)
    else await db.grades.add({ id: uid(), subjectId, order, ...data })
    onClose()
  }
  return (
    <Sheet title={item ? item.name : 'Nueva parte de la evaluación'} onClose={onClose}>
      <label className="field">
        Nombre
        <input id="g-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Examen final" />
      </label>
      <div className="grid-2">
        <label className="field">
          Porcentaje (%)
          <input id="g-weight" className="input" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} />
        </label>
        <label className="field">
          Mi nota (0-10)
          <input id="g-grade" className="input" inputMode="decimal" value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="Sin nota aún" />
        </label>
      </div>
      <label className="field">
        Nota mínima para que haga media (opcional)
        <input id="g-min" className="input" inputMode="decimal" value={minGrade} onChange={(e) => setMinGrade(e.target.value)} placeholder="Ej. 4" />
      </label>
      <div className="row">
        {item && <ConfirmButton onConfirm={async () => (await db.grades.delete(item.id), onClose())} />}
        <span className="grow" />
        <button className="btn primary" onClick={save}>
          Guardar
        </button>
      </div>
    </Sheet>
  )
}

/* ---------------- Asistencia ---------------- */

export function AttendanceView({ subjectId }: { subjectId: string }) {
  const day = useToday()
  const subjects = useSubjects()
  const subject = subjects.find((s) => s.id === subjectId)
  const classes = useLiveQuery(() => db.classes.where('subjectId').equals(subjectId).toArray(), [subjectId], [] as ClassSlot[])
  const records = useLiveQuery(() => db.attendance.where('subjectId').equals(subjectId).toArray(), [subjectId], [] as Attendance[])
  const limits = (useLiveQuery(() => db.settings.get(`absences:${subjectId}`), [subjectId])?.value ?? {}) as Record<string, number>
  const byId = new Map(records.map((r) => [r.id, r]))

  // Clases que ya han pasado (las últimas 10 semanas)
  const past: { slot: ClassSlot; date: string }[] = []
  for (let d = day; d >= addDays(day, -70); d = addDays(d, -1)) {
    for (const c of classes) if (c.weekday === weekday(d) && d >= c.from && d <= c.until) past.push({ slot: c, date: d })
  }
  const types = [...new Set(classes.map((c) => c.type))]

  const mark = async (slot: ClassSlot, date: string, present: boolean | null) => {
    const id = `${slot.id}_${date}`
    if (present == null) await db.attendance.delete(id)
    else await db.attendance.put({ id, classId: slot.id, subjectId, date, present })
  }

  if (!subject) return null
  return (
    <div className="stack">
      <div className="grid-auto" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
        {types.map((t) => {
          const ids = new Set(classes.filter((c) => c.type === t).map((c) => c.id))
          const misses = records.filter((r) => ids.has(r.classId) && !r.present).length
          const limit = limits[t]
          return (
            <div key={t} className="card pad stack" style={{ gap: 2 }}>
              <span className="label">Faltas {t}</span>
              <span style={{ fontFamily: 'var(--display)', fontSize: 26, fontWeight: 600, color: limit != null && misses >= limit ? 'var(--danger)' : undefined }}>
                {misses}
                {limit != null && <span className="small muted"> de {limit}</span>}
              </span>
              <label className="xs muted row" style={{ gap: 4 }}>
                Máximo permitido
                <input
                  className="input"
                  style={{ width: 56, minHeight: 30, padding: '0 6px' }}
                  inputMode="numeric"
                  aria-label={`Faltas permitidas en ${t}`}
                  defaultValue={limit ?? ''}
                  onBlur={(e) => {
                    const v = e.target.value.trim()
                    const next = { ...limits }
                    if (v) next[t] = Number(v)
                    else delete next[t]
                    void db.settings.put({ key: `absences:${subjectId}`, value: next })
                  }}
                />
              </label>
            </div>
          )
        })}
      </div>
      <span className="xs muted">Marca si fuiste. Si no marcas nada, no cuenta.</span>
      <div className="card list">
        {past.length === 0 && <Empty>Aún no ha habido clases.</Empty>}
        {past.slice(0, 40).map(({ slot, date }) => {
          const r = byId.get(`${slot.id}_${date}`)
          return (
            <div key={`${slot.id}_${date}`} className="list-item">
              <span className="stack grow" style={{ gap: 2 }}>
                <span style={{ fontWeight: 500 }}>
                  {formatShort(date)} · {slot.type}
                </span>
                <span className="xs muted">
                  {slot.start}–{slot.end} · {slot.room}
                </span>
              </span>
              <div className="segmented" style={{ gridAutoColumns: 'minmax(64px, auto)' }}>
                <button className={r?.present === true ? 'on' : ''} onClick={() => mark(slot, date, r?.present === true ? null : true)} aria-pressed={r?.present === true}>
                  Fui
                </button>
                <button className={r?.present === false ? 'on' : ''} style={r?.present === false ? { color: 'var(--danger)' } : undefined} onClick={() => mark(slot, date, r?.present === false ? null : false)} aria-pressed={r?.present === false}>
                  Falté
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ---------------- Bibliografía ---------------- */

const BIB_LABEL: Record<BiblioEntry['kind'], string> = { basica: 'Básica', complementaria: 'Complementaria', web: 'Web / recursos' }

export function BiblioView({ subjectId }: { subjectId: string }) {
  const list = useLiveQuery(() => db.biblio.where('subjectId').equals(subjectId).toArray(), [subjectId], [] as BiblioEntry[])
  const bibFiles = useLiveQuery(() => db.files.where('subjectId').equals(subjectId).filter((f) => f.kind === 'bibliografia').toArray(), [subjectId], [])
  const [edit, setEdit] = useState<BiblioEntry | 'new' | null>(null)
  return (
    <div className="stack">
      {(['basica', 'complementaria', 'web'] as const).map((k) => {
        const l = list.filter((b) => b.kind === k)
        if (!l.length) return null
        return (
          <section key={k} className="stack" style={{ gap: 6 }}>
            <span className="label">{BIB_LABEL[k]}</span>
            <div className="card list">
              {l.map((b) => (
                <div key={b.id} className="list-item">
                  <span className="stack grow" style={{ gap: 2, minWidth: 0 }}>
                    <span style={{ fontWeight: 600 }}>{b.title}</span>
                    <span className="xs muted">{[b.authors, b.notes].filter(Boolean).join(' · ')}</span>
                  </span>
                  {b.url && (
                    <a className="btn sm" href={b.url} target="_blank" rel="noreferrer">
                      Abrir
                    </a>
                  )}
                  <button className="btn sm ghost" onClick={() => setEdit(b)}>
                    Editar
                  </button>
                </div>
              ))}
            </div>
          </section>
        )
      })}
      {bibFiles.length > 0 && (
        <section className="stack" style={{ gap: 6 }}>
          <span className="label">PDFs de bibliografía</span>
          <div className="card list">
            {bibFiles.map((f) => (
              <button key={f.id} className="list-item" onClick={() => openFile(f)}>
                {f.name}
              </button>
            ))}
          </div>
        </section>
      )}
      {list.length === 0 && bibFiles.length === 0 && (
        <div className="card">
          <Empty>Apunta aquí los libros de la guía docente y enlaces útiles.</Empty>
        </div>
      )}
      <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setEdit('new')}>
        <Icon name="plus" size={16} /> Añadir
      </button>
      {edit && <BiblioSheet entry={edit === 'new' ? undefined : edit} subjectId={subjectId} onClose={() => setEdit(null)} />}
    </div>
  )
}

function BiblioSheet({ entry, subjectId, onClose }: { entry?: BiblioEntry; subjectId: string; onClose: () => void }) {
  const [title, setTitle] = useState(entry?.title ?? '')
  const [authors, setAuthors] = useState(entry?.authors ?? '')
  const [kind, setKind] = useState<BiblioEntry['kind']>(entry?.kind ?? 'basica')
  const [url, setUrl] = useState(entry?.url ?? '')
  const [notes, setNotes] = useState(entry?.notes ?? '')
  const save = async () => {
    if (!title.trim()) return
    const data = { title: title.trim(), authors, kind, url: url.trim() || undefined, notes }
    if (entry) await db.biblio.update(entry.id, data)
    else await db.biblio.add({ id: uid(), subjectId, ...data })
    onClose()
  }
  return (
    <Sheet title={entry ? 'Editar' : 'Nueva referencia'} onClose={onClose}>
      <label className="field">
        Título
        <input id="b-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="field">
        Autores
        <input id="b-authors" className="input" value={authors} onChange={(e) => setAuthors(e.target.value)} />
      </label>
      <div className="field">
        Tipo
        <div className="segmented">
          {(['basica', 'complementaria', 'web'] as const).map((k) => (
            <button key={k} type="button" className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>
              {BIB_LABEL[k]}
            </button>
          ))}
        </div>
      </div>
      <label className="field">
        Enlace (biblioteca de Uniovi, web…)
        <input id="b-url" className="input" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
      </label>
      <label className="field">
        Notas
        <input id="b-notes" className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ej. capítulos 2 y 3" />
      </label>
      <div className="row">
        {entry && <ConfirmButton onConfirm={async () => (await db.biblio.delete(entry.id), onClose())} />}
        <span className="grow" />
        <button className="btn primary" onClick={save} disabled={!title.trim()}>
          Guardar
        </button>
      </div>
    </Sheet>
  )
}
