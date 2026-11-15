import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db, FILE_KIND_LABEL, type Exercise, type ExerciseStatus, type StoredFile } from '../db'
import { Icon } from '../components/Icon'
import { openFile } from '../components/files'
import { ConfirmButton, Empty, ErrorNote, Sheet, useToast } from '../components/ui'
import { useSubjects } from '../hooks'
import { aiAvailable } from '../lib/ai'
import { analyzeFile, canAnalyze, cleanFolder, type AnalyzeProgress } from '../lib/exercises'
import { renderMarkdown } from '../lib/markdown'
import { storeFile } from '../lib/storeFile'

const STATUS_LABEL: Record<ExerciseStatus, string> = { pendiente: 'Pendiente', hecho: 'Hecho', repasar: 'Repasar' }
const byName = (a: string, b: string) => a.localeCompare(b, 'es', { numeric: true })
const byPlace = (a: Exercise, b: Exercise) => (a.fileName ?? '').localeCompare(b.fileName ?? '', 'es', { numeric: true }) || (a.page ?? 0) - (b.page ?? 0) || a.order - b.order

/** Pestaña "Ejercicios" de una asignatura: carpetas por tipo de ejercicio creadas por la IA. */
export function ExercisesView({ subjectId }: { subjectId: string }) {
  const exercises = useLiveQuery(() => db.exercises.where('subjectId').equals(subjectId).toArray(), [subjectId], [] as Exercise[])
  const [folder, setFolder] = useState<string | null>(null)
  const [analyzing, setAnalyzing] = useState(false)

  const folders = [...new Set(exercises.map((e) => e.folder))].sort(byName)
  const inFolder = folder ? exercises.filter((e) => e.folder === folder) : []

  if (folder && inFolder.length > 0) {
    return <FolderView subjectId={subjectId} folder={folder} exercises={inFolder} folders={folders} onBack={() => setFolder(null)} onRenamed={setFolder} />
  }

  return (
    <div className="stack">
      <div className="row wrap">
        <span className="small muted grow" style={{ minWidth: 200 }}>
          Sube tus hojas de ejercicios (PDF de Samsung Notes o fotos) y la IA separa cada ejercicio en carpetas por tipo.
        </span>
        <button className="btn sm primary" onClick={() => setAnalyzing(true)}>
          <Icon name="sparkle" size={16} /> Analizar archivo
        </button>
      </div>

      {exercises.length === 0 ? (
        <div className="card">
          <Empty>
            <span>Todavía no hay ejercicios clasificados.</span>
            <span className="xs">Ej. en Cálculo saldrán carpetas como “Integrales definidas”, “Integrales impropias” o “Áreas”.</span>
            <button className="btn sm" onClick={() => setAnalyzing(true)}>Analizar el primero</button>
          </Empty>
        </div>
      ) : (
        <div className="grid-auto" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}>
          {folders.map((f) => {
            const list = exercises.filter((e) => e.folder === f)
            const done = list.filter((e) => e.status === 'hecho').length
            const review = list.filter((e) => e.status === 'repasar').length
            return (
              <button key={f} className="card pad stack ex-folder" style={{ gap: 10, textAlign: 'left' }} onClick={() => setFolder(f)}>
                <span className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
                  <Icon name="layers" size={18} />
                  <span className="grow" style={{ fontWeight: 600, lineHeight: 1.25 }}>{f}</span>
                </span>
                <span className="xs muted tnum">
                  {list.length} {list.length === 1 ? 'ejercicio' : 'ejercicios'} · {done} hechos{review ? ` · ${review} a repasar` : ''}
                </span>
                <span className="ex-bar" aria-hidden="true">
                  <span style={{ width: `${(done / list.length) * 100}%` }} />
                </span>
              </button>
            )
          })}
        </div>
      )}

      {analyzing && <AnalyzeSheet subjectId={subjectId} onClose={() => setAnalyzing(false)} onDone={() => setFolder(null)} />}
    </div>
  )
}

function FolderView({
  subjectId,
  folder,
  exercises,
  folders,
  onBack,
  onRenamed,
}: {
  subjectId: string
  folder: string
  exercises: Exercise[]
  folders: string[]
  onBack: () => void
  onRenamed: (name: string) => void
}) {
  const [filter, setFilter] = useState<ExerciseStatus | ''>('')
  const [renaming, setRenaming] = useState<string | null>(null)
  const shown = exercises.filter((e) => !filter || e.status === filter).sort(byPlace)

  const rename = async () => {
    const name = cleanFolder(renaming ?? '', folders.filter((f) => f !== folder))
    setRenaming(null)
    if (!renaming?.trim() || name === folder) return
    // Si ya existe una carpeta con ese nombre, se juntan.
    await db.exercises.where('subjectId').equals(subjectId).filter((e) => e.folder === folder).modify({ folder: name })
    onRenamed(name)
  }

  return (
    <div className="stack">
      <div className="row" style={{ gap: 8 }}>
        <button className="btn icon sm ghost" onClick={onBack} aria-label="Volver a las carpetas" style={{ marginLeft: -6 }}>
          <Icon name="back" size={18} />
        </button>
        {renaming === null ? (
          <>
            <h2 className="grow" style={{ fontSize: 20 }}>{folder}</h2>
            <button className="btn sm ghost" onClick={() => setRenaming(folder)}>
              <Icon name="edit" size={16} /> Renombrar
            </button>
          </>
        ) : (
          <form
            className="row grow"
            onSubmit={(e) => {
              e.preventDefault()
              void rename()
            }}
          >
            <label htmlFor="ex-rename" className="sr-only">Nombre de la carpeta</label>
            <input id="ex-rename" className="input" autoFocus value={renaming} onChange={(e) => setRenaming(e.target.value)} />
            <button className="btn sm primary">Guardar</button>
            <button type="button" className="btn sm ghost" onClick={() => setRenaming(null)}>Cancelar</button>
          </form>
        )}
      </div>
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
        shown.map((e, i) => <ExerciseCard key={e.id} exercise={e} folders={folders} defaultOpen={i === 0 && shown.length === 1} />)
      )}
    </div>
  )
}

function ExerciseCard({ exercise: e, folders, defaultOpen }: { exercise: Exercise; folders: string[]; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen)
  const [showSolution, setShowSolution] = useState(false)
  const [newFolder, setNewFolder] = useState<string | null>(null)
  const toast = useToast()

  const move = async (to: string) => {
    const name = cleanFolder(to, folders)
    if (!to.trim() || name === e.folder) return
    await db.exercises.update(e.id, { folder: name })
    toast(`Movido a «${name}»`)
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
            {newFolder === null ? (
              <>
                <label className="sr-only" htmlFor={`mv-${e.id}`}>Mover a carpeta</label>
                <select
                  id={`mv-${e.id}`}
                  className="select"
                  style={{ width: 'auto', minHeight: 36 }}
                  value=""
                  onChange={(ev) => (ev.target.value === '__new' ? setNewFolder('') : void move(ev.target.value))}
                >
                  <option value="">Mover a otra carpeta…</option>
                  {folders.filter((f) => f !== e.folder).map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                  <option value="__new">+ Carpeta nueva…</option>
                </select>
              </>
            ) : (
              <form
                className="row"
                onSubmit={(ev) => {
                  ev.preventDefault()
                  void move(newFolder)
                  setNewFolder(null)
                }}
              >
                <label className="sr-only" htmlFor={`nf-${e.id}`}>Nombre de la carpeta nueva</label>
                <input id={`nf-${e.id}`} className="input" style={{ minHeight: 36 }} autoFocus placeholder="Ej. Integrales por partes" value={newFolder} onChange={(ev) => setNewFolder(ev.target.value)} />
                <button className="btn sm primary" disabled={!newFolder.trim()}>Mover</button>
                <button type="button" className="btn sm ghost" onClick={() => setNewFolder(null)}>Cancelar</button>
              </form>
            )}
            <span className="grow" />
            <ConfirmButton small onConfirm={() => db.exercises.delete(e.id)} />
          </div>
        </div>
      )}
    </section>
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
  const [busy, setBusy] = useState<{ name: string; p: AnalyzeProgress } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const list = files.filter(canAnalyze).sort((a, b) => Number(b.kind === 'ejercicios') - Number(a.kind === 'ejercicios') || b.createdAt - a.createdAt)

  const run = async (f: StoredFile) => {
    if (!subject || busy) return
    setError(null)
    setBusy({ name: f.name, p: { done: 0, total: 1, found: 0 } })
    try {
      const n = await analyzeFile(f, subject, (p) => setBusy({ name: f.name, p }))
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
    const id = await storeFile(file, { subjectId, kind: 'ejercicios', tags: [] })
    const stored = await db.files.get(id)
    if (stored) await run(stored)
  }

  return (
    <Sheet title="Analizar ejercicios" onClose={busy ? () => {} : onClose}>
      <p className="small muted" style={{ margin: 0 }}>
        La IA mira cada página (también lo escrito a mano), separa los ejercicios y los guarda en carpetas por tipo. Si vuelves a analizar un archivo, sus ejercicios se sustituyen.
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
          <span className="xs muted">Cada bloque de 5 páginas tarda unos 20-60 s. No cierres la app.</span>
        </div>
      ) : (
        <>
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
                      {f.topic ? ` · ${f.topic}` : ''}
                      {counts[f.id] ? ` · ${counts[f.id]} ejercicios ya sacados` : ''}
                    </span>
                  </span>
                  <button className="btn sm" disabled={!hasAi} onClick={() => run(f)}>
                    {counts[f.id] ? 'Volver a analizar' : 'Analizar'}
                  </button>
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
