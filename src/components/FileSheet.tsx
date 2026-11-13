import { useState } from 'react'
import { db, FILE_KIND_LABEL, type FileKind, type StoredFile, type Subject } from '../db'
import { deleteFile, openFile } from './files'
import { ConfirmButton, Sheet, SubjectSelect, parseTags } from './ui'

/** Editar la clasificación de un archivo ya guardado. */
export function FileSheet({ file, subjects, onClose }: { file: StoredFile; subjects: Subject[]; onClose: () => void }) {
  const [name, setName] = useState(file.name)
  const [subjectId, setSubjectId] = useState(file.subjectId)
  const [topic, setTopic] = useState(file.topic ?? '')
  const [kind, setKind] = useState<FileKind>(file.kind)
  const [date, setDate] = useState(file.date)
  const [tags, setTags] = useState(file.tags.join(', '))
  const subject = subjects.find((s) => s.id === subjectId)

  const save = async () => {
    await db.files.update(file.id, { name, subjectId, topic: topic || undefined, kind, date, tags: parseTags(tags) })
    onClose()
  }

  return (
    <Sheet title="Archivo" onClose={onClose}>
      <label className="field">
        Nombre
        <input id="f-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <ClassificationFields
        subjects={subjects}
        subject={subject}
        subjectId={subjectId}
        setSubjectId={setSubjectId}
        topic={topic}
        setTopic={setTopic}
        kind={kind}
        setKind={setKind}
        date={date}
        setDate={setDate}
        tags={tags}
        setTags={setTags}
      />
      {file.text && <p className="xs muted" style={{ margin: 0 }}>Texto leído para la búsqueda: {file.text.length.toLocaleString('es')} caracteres.</p>}
      <div className="row wrap">
        <ConfirmButton
          onConfirm={async () => {
            await deleteFile(file.id)
            onClose()
          }}
        />
        <span className="grow" />
        <button className="btn" onClick={() => openFile(file)}>
          Abrir
        </button>
        <button className="btn primary" onClick={save}>
          Guardar
        </button>
      </div>
    </Sheet>
  )
}

export function ClassificationFields(p: {
  subjects: Subject[]
  subject?: Subject
  subjectId?: string
  setSubjectId: (v?: string) => void
  topic: string
  setTopic: (v: string) => void
  kind: FileKind
  setKind: (v: FileKind) => void
  date: string
  setDate: (v: string) => void
  tags: string
  setTags: (v: string) => void
  idPrefix?: string
}) {
  const id = (s: string) => `${p.idPrefix ?? 'f'}-${s}`
  return (
    <>
      <label className="field">
        Asignatura
        <SubjectSelect id={id('subject')} subjects={p.subjects} value={p.subjectId} onChange={p.setSubjectId} />
      </label>
      <div className="grid-2">
        <label className="field">
          Tema
          <input id={id('topic')} className="input" list={id('topics')} value={p.topic} onChange={(e) => p.setTopic(e.target.value)} placeholder="Ej. Tema 3" />
          <datalist id={id('topics')}>
            {(p.subject?.topics ?? []).map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </label>
        <label className="field">
          Fecha
          <input id={id('date')} type="date" className="input" value={p.date} onChange={(e) => p.setDate(e.target.value)} />
        </label>
      </div>
      <div className="field">
        Tipo
        <div className="chips" role="radiogroup" aria-label="Tipo de material">
          {(Object.keys(FILE_KIND_LABEL) as FileKind[]).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={p.kind === k} className={`chip ${p.kind === k ? 'on' : ''}`} onClick={() => p.setKind(k)}>
              {FILE_KIND_LABEL[k]}
            </button>
          ))}
        </div>
      </div>
      <label className="field">
        Etiquetas (separadas por comas)
        <input id={id('tags')} className="input" value={p.tags} onChange={(e) => p.setTags(e.target.value)} placeholder="teoría, definiciones" />
      </label>
    </>
  )
}
