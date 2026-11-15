import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type ReactNode } from 'react'
import { db, FILE_KIND_LABEL, type Exercise, type ExerciseStatus, type StoredFile } from '../db'
import { Icon } from '../components/Icon'
import { openFile } from '../components/files'
import { ConfirmButton, Empty, ErrorNote, Sheet, useToast } from '../components/ui'
import { useSubjects } from '../hooks'
import { aiAvailable } from '../lib/ai'
import { analyzeFile, canAnalyze, cleanFolder, getResume, knownTopics, matchTopic, sortTopics, type AnalyzeProgress } from '../lib/exercises'
import { renderMarkdown } from '../lib/markdown'
import { storeFile } from '../lib/storeFile'

const STATUS_LABEL: Record<ExerciseStatus, string> = { pendiente: 'Pendiente', hecho: 'Hecho', repasar: 'Repasar' }
const NO_TOPIC = 'Sin tema'
const topicOf = (e: Exercise) => e.topic || NO_TOPIC
const byName = (a: string, b: string) => a.localeCompare(b, 'es', { numeric: true })
const byPlace = (a: Exercise, b: Exercise) => (a.fileName ?? '').localeCompare(b.fileName ?? '', 'es', { numeric: true }) || (a.page ?? 0) - (b.page ?? 0) || a.order - b.order

/**
 * Pestaña "Ejercicios" de una asignatura: carpetas por TEMA (p. ej. "Tema 2 · Integrales") y, dentro,
 * carpetas por TIPO de ejercicio (definidas, impropias, áreas…), creadas por la IA.
 */
export function ExercisesView({ subjectId }: { subjectId: string }) {
  const subjects = useSubjects()
  const subject = subjects.find((s) => s.id === subjectId)
  const exercises = useLiveQuery(() => db.exercises.where('subjectId').equals(subjectId).toArray(), [subjectId], [] as Exercise[])
  const [topic, setTopic] = useState<string | null>(null)
  const [folder, setFolder] = useState<string | null>(null)
  const [analyzing, setAnalyzing] = useState(false)

  const topics = sortTopics([...new Set(exercises.map(topicOf))].filter((t) => t !== NO_TOPIC), subject?.topics ?? [])
  if (exercises.some((e) => !e.topic)) topics.push(NO_TOPIC)
  const inTopic = topic ? exercises.filter((e) => topicOf(e) === topic) : []
  const folders = [...new Set(inTopic.map((e) => e.folder))].sort(byName)
  const inFolder = folder ? inTopic.filter((e) => e.folder === folder) : []

  if (topic && folder && inFolder.length > 0) {
    return (
      <FolderView
        topic={topic}
        folder={folder}
        exercises={inFolder}
        folders={folders}
        topics={sortTopics([...new Set([...(subject?.topics ?? []), ...topics.filter((t) => t !== NO_TOPIC)])], subject?.topics ?? [])}
        onBack={() => setFolder(null)}
        onRenamed={setFolder}
      />
    )
  }

  if (topic && inTopic.length > 0) {
    const renameTopic = async (to: string) => {
      const name = to === NO_TOPIC ? undefined : matchTopic(to, topics.filter((t) => t !== topic && t !== NO_TOPIC))
      await db.exercises.bulkUpdate(inTopic.map((e) => ({ key: e.id, changes: { topic: name } })))
      setTopic(name ?? NO_TOPIC)
    }
    return (
      <div className="stack">
        <TitleBar title={topic} back="Volver a los temas" onBack={() => setTopic(null)} onRename={topic === NO_TOPIC ? undefined : renameTopic} renameLabel="Nombre del tema" />
        <span className="small muted">Tipos de ejercicio de este tema.</span>
        <FolderGrid
          items={folders.map((f) => ({ name: f, list: inTopic.filter((e) => e.folder === f) }))}
          icon="layers"
          onOpen={setFolder}
        />
      </div>
    )
  }

  return (
    <div className="stack">
      <div className="row wrap">
        <span className="small muted grow" style={{ minWidth: 200 }}>
          Sube tus hojas de ejercicios (PDF de Samsung Notes o fotos) y la IA las separa por tema y, dentro, por tipo de ejercicio.
        </span>
        <button className="btn sm primary" onClick={() => setAnalyzing(true)}>
          <Icon name="sparkle" size={16} /> Analizar archivo
        </button>
      </div>

      {exercises.length === 0 ? (
        <div className="card">
          <Empty>
            <span>Todavía no hay ejercicios clasificados.</span>
            <span className="xs">Ej. en Cálculo: la carpeta “Tema 2 · Integrales” con “Integrales definidas”, “Integrales impropias” y “Áreas” dentro.</span>
            <button className="btn sm" onClick={() => setAnalyzing(true)}>Analizar el primero</button>
          </Empty>
        </div>
      ) : (
        <FolderGrid
          items={topics.map((t) => ({ name: t, list: exercises.filter((e) => topicOf(e) === t) }))}
          icon="book"
          types
          onOpen={(t) => {
            setTopic(t)
            setFolder(null)
          }}
        />
      )}

      {analyzing && (
        <AnalyzeSheet
          subjectId={subjectId}
          onClose={() => setAnalyzing(false)}
          onDone={() => {
            setTopic(null)
            setFolder(null)
          }}
        />
      )}
    </div>
  )
}

function FolderGrid({ items, icon, types, onOpen }: { items: { name: string; list: Exercise[] }[]; icon: string; types?: boolean; onOpen: (name: string) => void }) {
  return (
    <div className="grid-auto" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}>
      {items.map(({ name, list }) => {
        const done = list.filter((e) => e.status === 'hecho').length
        const review = list.filter((e) => e.status === 'repasar').length
        const kinds = new Set(list.map((e) => e.folder)).size
        return (
          <button key={name} className="card pad stack ex-folder" style={{ gap: 10, textAlign: 'left' }} onClick={() => onOpen(name)}>
            <span className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
              <Icon name={icon} size={18} />
              <span className="grow" style={{ fontWeight: 600, lineHeight: 1.25 }}>{name}</span>
            </span>
            <span className="xs muted tnum">
              {list.length} {list.length === 1 ? 'ejercicio' : 'ejercicios'}
              {types ? ` · ${kinds} ${kinds === 1 ? 'tipo' : 'tipos'}` : ''} · {done} hechos{review ? ` · ${review} a repasar` : ''}
            </span>
            <span className="ex-bar" aria-hidden="true">
              <span style={{ width: `${(done / list.length) * 100}%` }} />
            </span>
          </button>
        )
      })}
    </div>
  )
}

/** Cabecera con "volver", título y renombrar en el sitio. */
function TitleBar({ title, sub, back, onBack, onRename, renameLabel }: { title: string; sub?: ReactNode; back: string; onBack: () => void; onRename?: (name: string) => Promise<void>; renameLabel: string }) {
  const [renaming, setRenaming] = useState<string | null>(null)
  return (
    <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
      <button className="btn icon sm ghost" onClick={onBack} aria-label={back} style={{ marginLeft: -6 }}>
        <Icon name="back" size={18} />
      </button>
      {renaming === null ? (
        <>
          <span className="stack grow" style={{ gap: 2, minWidth: 0 }}>
            {sub && <span className="xs muted">{sub}</span>}
            <h2 style={{ fontSize: 20 }}>{title}</h2>
          </span>
          {onRename && (
            <button className="btn sm ghost" onClick={() => setRenaming(title)}>
              <Icon name="edit" size={16} /> Renombrar
            </button>
          )}
        </>
      ) : (
        <form
          className="row grow"
          onSubmit={(e) => {
            e.preventDefault()
            const v = renaming.trim()
            setRenaming(null)
            if (v && v !== title) void onRename?.(v)
          }}
        >
          <label htmlFor="ex-rename" className="sr-only">{renameLabel}</label>
          <input id="ex-rename" className="input" autoFocus value={renaming} onChange={(e) => setRenaming(e.target.value)} />
          <button className="btn sm primary">Guardar</button>
          <button type="button" className="btn sm ghost" onClick={() => setRenaming(null)}>Cancelar</button>
        </form>
      )}
    </div>
  )
}

function FolderView({
  topic,
  folder,
  exercises,
  folders,
  topics,
  onBack,
  onRenamed,
}: {
  topic: string
  folder: string
  exercises: Exercise[]
  folders: string[]
  topics: string[]
  onBack: () => void
  onRenamed: (name: string) => void
}) {
  const [filter, setFilter] = useState<ExerciseStatus | ''>('')
  const shown = exercises.filter((e) => !filter || e.status === filter).sort(byPlace)

  const rename = async (to: string) => {
    // Si ya existe una carpeta con ese nombre en el tema, se juntan.
    const name = cleanFolder(to, folders.filter((f) => f !== folder))
    if (name === folder) return
    await db.exercises.bulkUpdate(exercises.map((e) => ({ key: e.id, changes: { folder: name } })))
    onRenamed(name)
  }

  return (
    <div className="stack">
      <TitleBar title={folder} sub={topic} back="Volver al tema" onBack={onBack} onRename={rename} renameLabel="Nombre de la carpeta" />
      <div className="chips" role="group" aria-label="Filtrar por estado">
        {(['', 'pendiente', 'repasar', 'hecho'] as const).map((s) => (
          <button key={s} className={`chip ${filter === s ? 'on' : ''}`} onClick={() => setFilter(s)}>
            {s ? STATUS_LABEL[s] : 'Todos'} <span className="tnum">{s ? exercises.filter((e) => e.status === s).length : exercises.length}</span>
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <div className="card">
          <Empty>No hay ejercicios con ese estado.</Empty>
        </div>
      ) : (
        shown.map((e, i) => <ExerciseCard key={e.id} exercise={e} folders={folders} topics={topics} defaultOpen={i === 0 && shown.length === 1} />)
      )}
    </div>
  )
}

function ExerciseCard({ exercise: e, folders, topics, defaultOpen }: { exercise: Exercise; folders: string[]; topics: string[]; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen)
  const [showSolution, setShowSolution] = useState(false)
  const toast = useToast()

  const move = async (to: string) => {
    const name = cleanFolder(to, folders)
    if (!to.trim() || name === e.folder) return
    await db.exercises.update(e.id, { folder: name })
    toast(`Movido a «${name}»`)
  }
  const moveTopic = async (to: string) => {
    const name = matchTopic(to, topics)
    if (!name || name === e.topic) return
    await db.exercises.update(e.id, { topic: name })
    toast(`Movido al tema «${name}»`)
  }
  const goToPage = async () => {
    const f = e.fileId ? await db.files.get(e.fileId) : undefined
    if (!f) return toast('El archivo original ya no está en la app.')
    openFile(f, e.page)
  }

  return (
    <section className={`card ex-card ${e.status}`}>
      <button className="list-item" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className={`ex-status ${e.status}`} aria-label={STATUS_LABEL[e.status]} title={STATUS_LABEL[e.status]} />
        <span className="stack grow" style={{ gap: 2, minWidth: 0 }}>
          <span style={{ fontWeight: 600 }}>{e.title}</span>
          <span className="xs muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {e.fileName ?? 'Sin archivo'}
            {e.page ? ` · pág. ${e.page}` : ''}
            {e.solution ? ' · resuelto' : ''}
          </span>
        </span>
        <span style={{ transform: open ? 'rotate(90deg)' : undefined, transition: 'transform .15s', display: 'grid' }}>
          <Icon name="chevron" size={16} />
        </span>
      </button>
      {open && (
        <div className="stack" style={{ borderTop: '1px solid var(--border)', padding: 16, gap: 14 }}>
          <div className="md" dangerouslySetInnerHTML={{ __html: renderMarkdown(e.statement || '_Sin enunciado_') }} />
          {e.solution &&
            (showSolution ? (
              <div className="ex-solution stack" style={{ gap: 6 }}>
                <span className="label">Resolución</span>
                <div className="md" dangerouslySetInnerHTML={{ __html: renderMarkdown(e.solution) }} />
              </div>
            ) : (
              <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setShowSolution(true)}>
                <Icon name="eye" size={16} /> Ver resolución
              </button>
            ))}
          <div className="row wrap" style={{ gap: 8 }}>
            <div className="chips" role="group" aria-label="Estado">
              {(Object.keys(STATUS_LABEL) as ExerciseStatus[]).map((s) => (
                <button key={s} className={`chip ${e.status === s ? 'on' : ''}`} onClick={() => db.exercises.update(e.id, { status: s })}>
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>
            <span className="grow" />
            {e.fileId && (
              <button className="btn sm" onClick={goToPage}>
                <Icon name="eye" size={16} /> Ver en el original{e.page ? ` (pág. ${e.page})` : ''}
              </button>
            )}
          </div>
          <div className="row wrap" style={{ gap: 8 }}>
            <MoveControl id={`mv-${e.id}`} label="Mover a otra carpeta…" newLabel="+ Carpeta nueva…" placeholder="Ej. Integrales por partes" options={folders.filter((f) => f !== e.folder)} onMove={move} />
            <MoveControl id={`mt-${e.id}`} label="Cambiar de tema…" newLabel="+ Tema nuevo…" placeholder="Ej. Tema 3 · Series" options={topics.filter((t) => t !== e.topic)} onMove={moveTopic} />
            <span className="grow" />
            <ConfirmButton small onConfirm={() => db.exercises.delete(e.id)} />
          </div>
        </div>
      )}
    </section>
  )
}

/** Desplegable para mover a otra carpeta/tema, con opción de escribir uno nuevo. */
function MoveControl({ id, label, newLabel, placeholder, options, onMove }: { id: string; label: string; newLabel: string; placeholder: string; options: string[]; onMove: (to: string) => Promise<void> }) {
  const [typing, setTyping] = useState<string | null>(null)
  if (typing === null) {
    return (
      <>
        <label className="sr-only" htmlFor={id}>{label}</label>
        <select id={id} className="select" style={{ width: 'auto', maxWidth: '100%', minHeight: 36 }} value="" onChange={(ev) => (ev.target.value === '__new' ? setTyping('') : void onMove(ev.target.value))}>
          <option value="">{label}</option>
          {options.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
          <option value="__new">{newLabel}</option>
        </select>
      </>
    )
  }
  return (
    <form
      className="row"
      onSubmit={(ev) => {
        ev.preventDefault()
        void onMove(typing)
        setTyping(null)
      }}
    >
      <label className="sr-only" htmlFor={`${id}-new`}>{newLabel}</label>
      <input id={`${id}-new`} className="input" style={{ minHeight: 36 }} autoFocus placeholder={placeholder} value={typing} onChange={(ev) => setTyping(ev.target.value)} />
      <button className="btn sm primary" disabled={!typing.trim()}>Mover</button>
      <button type="button" className="btn sm ghost" onClick={() => setTyping(null)}>Cancelar</button>
    </form>
  )
}

function AnalyzeSheet({ subjectId, onClose, onDone }: { subjectId: string; onClose: () => void; onDone: () => void }) {
  const subjects = useSubjects()
  const subject = subjects.find((s) => s.id === subjectId)
  const toast = useToast()
  const hasAi = useLiveQuery(() => aiAvailable(), [], false)
  const files = useLiveQuery(() => db.files.where('subjectId').equals(subjectId).toArray(), [subjectId], [] as StoredFile[])
  const counts = useLiveQuery(async () => {
    const m: Record<string, number> = {}
    for (const e of await db.exercises.where('subjectId').equals(subjectId).toArray()) if (e.fileId) m[e.fileId] = (m[e.fileId] ?? 0) + 1
    return m
  }, [subjectId], {} as Record<string, number>)
  const resumes = useLiveQuery(async () => {
    const m: Record<string, number> = {}
    for (const f of await db.files.where('subjectId').equals(subjectId).toArray()) {
      const r = await getResume(f.id)
      if (r) m[f.id] = r.next
    }
    return m
  }, [subjectId], {} as Record<string, number>)
  const topics = useLiveQuery(async () => (subject ? sortTopics(await knownTopics(subject), subject.topics) : []), [subject], [] as string[])
  const [busy, setBusy] = useState<{ name: string; p: AnalyzeProgress } | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** '' = automático (el tema del archivo o el que deduzca la IA); null = escribiendo uno nuevo. */
  const [topic, setTopic] = useState<string>('')
  const [typing, setTyping] = useState(false)
  const chosen = topic.trim() ? matchTopic(topic, topics) : undefined

  const list = files.filter(canAnalyze).sort((a, b) => Number(b.kind === 'ejercicios') - Number(a.kind === 'ejercicios') || b.createdAt - a.createdAt)

  const run = async (f: StoredFile, resume = false) => {
    if (!subject || busy) return
    setError(null)
    setBusy({ name: f.name, p: { done: 0, total: 1, found: 0 } })
    try {
      const n = await analyzeFile(f, subject, (p) => setBusy({ name: f.name, p }), { resume, topic: chosen })
      toast(n ? `${n} ${n === 1 ? 'ejercicio clasificado' : 'ejercicios clasificados'}` : 'La IA no encontró ejercicios en ese archivo')
      if (n) {
        onDone()
        onClose()
      }
    } catch (err) {
      console.error('Ejercicios', err)
      setError(err instanceof Error ? err.message : `No se pudo analizar (${String(err)})`)
    } finally {
      setBusy(null)
    }
  }

  const upload = async (file: File | undefined) => {
    if (!file) return
    const id = await storeFile(file, { subjectId, topic: chosen, kind: 'ejercicios', tags: [] })
    const stored = await db.files.get(id)
    if (stored) await run(stored)
  }

  return (
    <Sheet title="Analizar ejercicios" onClose={busy ? () => {} : onClose}>
      <p className="small muted" style={{ margin: 0 }}>
        La IA mira cada página (también lo escrito a mano), separa los ejercicios y los guarda en la carpeta de su tema y, dentro, por tipo de ejercicio. Si vuelves a analizar un archivo, sus ejercicios se sustituyen.
      </p>
      {!hasAi && <ErrorNote error="Activa la IA en Ajustes (clave de Gemini) para poder analizar." />}
      {busy ? (
        <div className="card accent pad stack" role="status" style={{ gap: 8 }}>
          <span style={{ fontWeight: 600 }}>Leyendo «{busy.name}»…</span>
          <span className="small muted tnum">
            {busy.p.done < busy.p.total ? `Páginas ${busy.p.done + 1}-${Math.min(busy.p.done + 5, busy.p.total)} de ${busy.p.total}` : 'Guardando'} · {busy.p.found} ejercicios encontrados
          </span>
          <span className="ex-bar" aria-hidden="true">
            <span style={{ width: `${Math.max(4, (busy.p.done / busy.p.total) * 100)}%` }} />
          </span>
          {busy.p.wait ? (
            <span className="small" style={{ color: 'var(--warn)' }}>{busy.p.wait}</span>
          ) : (
            <span className="xs muted">Cada bloque de 5 páginas tarda unos 20-60 s y se guarda al terminar. No cierres la app.</span>
          )}
        </div>
      ) : (
        <>
          <label className="field">
            Tema
            {typing ? (
              <span className="row">
                <input className="input" autoFocus placeholder="Ej. Tema 2 · Integrales" value={topic} onChange={(e) => setTopic(e.target.value)} />
                <button
                  type="button"
                  className="btn sm ghost"
                  onClick={() => {
                    setTyping(false)
                    setTopic('')
                  }}
                >
                  Cancelar
                </button>
              </span>
            ) : (
              <select
                id="ex-topic"
                className="select"
                value={topic}
                onChange={(e) => {
                  if (e.target.value === '__new') {
                    setTyping(true)
                    setTopic('')
                  } else setTopic(e.target.value)
                }}
              >
                <option value="">Automático (lo decide la IA)</option>
                {topics.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
                <option value="__new">+ Otro tema…</option>
              </select>
            )}
          </label>
          <label className={`btn primary ${hasAi ? '' : 'disabled'}`} style={{ alignSelf: 'flex-start', pointerEvents: hasAi ? undefined : 'none', opacity: hasAi ? 1 : 0.5 }}>
            <Icon name="upload" size={16} /> Subir PDF o foto y analizar
            <input
              type="file"
              accept="application/pdf,.pdf,image/png,image/jpeg,image/webp"
              className="sr-only"
              disabled={!hasAi}
              onChange={(e) => {
                void upload(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </label>
          <span className="label">O elige uno que ya está en la asignatura</span>
          <div className="card list">
            {list.length === 0 ? (
              <Empty>No hay PDF ni fotos en esta asignatura todavía.</Empty>
            ) : (
              list.map((f) => (
                <div key={f.id} className="list-item">
                  <span className="stack grow" style={{ gap: 2, minWidth: 0 }}>
                    <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                    <span className="xs muted">
                      {FILE_KIND_LABEL[f.kind]}
                      {f.topic ? ` · ${f.topic}` : ' · sin tema'}
                      {counts[f.id] ? ` · ${counts[f.id]} ejercicios ya sacados` : ''}
                    </span>
                  </span>
                  {resumes[f.id] ? (
                    <span className="row" style={{ gap: 6 }}>
                      <button className="btn sm primary" disabled={!hasAi} onClick={() => run(f, true)}>
                        Continuar desde pág. {resumes[f.id]}
                      </button>
                      <button className="btn sm ghost" disabled={!hasAi} onClick={() => run(f)}>
                        Empezar de cero
                      </button>
                    </span>
                  ) : (
                    <button className="btn sm" disabled={!hasAi} onClick={() => run(f)}>
                      {counts[f.id] ? 'Volver a analizar' : 'Analizar'}
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </>
      )}
      <ErrorNote error={error} onClose={() => setError(null)} />
    </Sheet>
  )
}
