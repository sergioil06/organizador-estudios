import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db, type ClassSlot } from '../db'
import { Icon } from '../components/Icon'
import { useToast } from '../components/ui'
import { useSubjects } from '../hooks'
import { aiTest, DEFAULT_MODEL } from '../lib/ai'
import { downloadBlob, exportAll, importAll } from '../lib/backup'
import { formatShort, today, WEEKDAYS } from '../lib/dates'
import { connectGoogle, disconnectGoogle, googleConfigured } from '../lib/google'
import { applyCalendarImport, previewCalendarImport } from '../lib/importCalendar'
import { onSyncState, syncNow, type SyncState } from '../lib/sync'
import { humanSize } from '../lib/extract'
import { useInstall } from '../lib/install'


function useSetting<T>(key: string, fallback: T): [T, (v: T) => Promise<void>] {
  const v = useLiveQuery(() => db.settings.get(key), [key])
  return [(v?.value as T) ?? fallback, async (value: T) => void (await db.settings.put({ key, value }))]
}

export default function Settings() {
  const toast = useToast()
  const install = useInstall()
  const navigate = useNavigate()
  const subjects = useSubjects()
  const [name, setName] = useSetting('name', '')
  const [key, setKey] = useSetting('geminiKey', '')
  const [model, setModel] = useSetting('geminiModel', '')
  const [minutes, setMinutes] = useSetting('studyMinutes', { weekday: 150, weekend: 210 })
  const [calTasks, setCalTasks] = useSetting('calendarTasks', true)
  const email = useLiveQuery(() => db.settings.get('googleEmail'), [])?.value as string | undefined
  const [sync, setSync] = useState<SyncState>({ status: 'off' })
  const [testing, setTesting] = useState(false)
  const [keyDraft, setKeyDraft] = useState<string | null>(null)
  const [usage, setUsage] = useState<string>('')
  const [perm, setPerm] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported')
  const [imp, setImp] = useState<{ from: string; until: string; slots?: ClassSlot[]; busy?: boolean }>({ from: today(), until: '2027-06-30' })

  useEffect(() => {
    const off = onSyncState(setSync)
    return () => {
      off()
    }
  }, [])
  useEffect(() => {
    navigator.storage?.estimate?.().then((e) => e.usage != null && setUsage(`${humanSize(e.usage)} usados en este dispositivo`))
  }, [])

  const connect = async () => {
    try {
      const e = await connectGoogle()
      toast(`Conectado como ${e}`)
      void syncNow()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'No se pudo conectar')
    }
  }

  return (
    <div className="page narrow">
      <div className="row">
        <button className="btn icon ghost hide-desktop" onClick={() => navigate(-1)} aria-label="Volver">
          <Icon name="back" />
        </button>
        <h1>Ajustes</h1>
      </div>

      <section className="card pad stack">
        <h2>Tu cuenta de Google</h2>
        {!googleConfigured() ? (
          <span className="small muted">La conexión con Google aún no está configurada en esta instalación (falta el identificador de Google). Mientras tanto todo se guarda en este dispositivo.</span>
        ) : email ? (
          <>
            <span className="small">
              Conectado como <strong>{email}</strong>. Tus datos se sincronizan con tu Google Drive, y tus exámenes y entregas aparecen en tu Google Calendar.
            </span>
            <span className="small muted">
              {sync.status === 'syncing'
                ? 'Sincronizando…'
                : sync.status === 'offline'
                  ? 'Sin conexión: se sincronizará al volver internet.'
                  : sync.status === 'error'
                    ? `Error al sincronizar: ${sync.message}`
                    : sync.at
                      ? `Última sincronización: ${new Date(sync.at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}`
                      : ''}
            </span>
            <div className="row wrap">
              <button className="btn sm" onClick={() => syncNow()}>
                Sincronizar ahora
              </button>
              <button className="btn sm ghost" onClick={connect}>
                Volver a dar permiso
              </button>
              <button className="btn sm ghost danger" onClick={() => disconnectGoogle()}>
                Desconectar
              </button>
            </div>
            <label className="row small" style={{ gap: 8 }}>
              <input type="checkbox" className="check" checked={calTasks} onChange={(e) => setCalTasks(e.target.checked)} />
              Poner también las tareas con fecha en Google Calendar (con aviso el día antes)
            </label>
          </>
        ) : (
          <>
            <span className="small muted">Conecta tu cuenta para tener tus datos en el móvil y el ordenador, guardar tus archivos en tu Google Drive y ver tus exámenes en Google Calendar.</span>
            <button className="btn primary" style={{ alignSelf: 'flex-start' }} onClick={connect}>
              Conectar con Google
            </button>
          </>
        )}
      </section>

      <section className="card pad stack">
        <h2>Inteligencia artificial</h2>
        <span className="small muted">
          Usa Gemini con tu propia clave gratuita. Se guarda solo en tus dispositivos y en tu Drive. En el plan gratuito Google puede usar lo que envías para mejorar sus modelos.
        </span>
        <label className="field">
          Clave de la API de Gemini
          <span className="row">
            <input
              id="ai-key"
              className="input"
              type="password"
              autoComplete="off"
              value={keyDraft ?? key}
              onChange={(e) => setKeyDraft(e.target.value)}
              placeholder="AIza…"
            />
            <button
              className="btn"
              disabled={keyDraft == null}
              onClick={async () => {
                await setKey((keyDraft ?? '').trim())
                setKeyDraft(null)
                toast('Clave guardada')
              }}
            >
              Guardar
            </button>
          </span>
        </label>
        <span className="xs muted">
          Consíguela gratis en <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">aistudio.google.com/apikey</a> (botón “Create API key”).
        </span>
        <div className="row wrap">
          <button
            className="btn sm"
            disabled={!key || testing}
            onClick={async () => {
              setTesting(true)
              try {
                toast(await aiTest())
              } catch (err) {
                toast(err instanceof Error ? err.message : 'No funciona')
              } finally {
                setTesting(false)
              }
            }}
          >
            {testing ? 'Probando…' : 'Probar la IA'}
          </button>
          <label className="row small muted" style={{ gap: 6 }}>
            Modelo
            <input id="ai-model" className="input" style={{ width: 200, minHeight: 36 }} value={model} placeholder={DEFAULT_MODEL} onChange={(e) => setModel(e.target.value.trim())} />
          </label>
        </div>
      </section>

      <section className="card pad stack">
        <h2>Horario</h2>
        <span className="small muted">Importa tus clases desde Google Calendar (las del formato de Uniovi “Asignatura - Grupo: …”). Solo se importan las asignaturas que estás cursando y se sustituye su horario actual.</span>
        <div className="grid-2">
          <label className="field">
            Desde
            <input id="imp-from" type="date" className="input" value={imp.from} onChange={(e) => setImp({ ...imp, from: e.target.value, slots: undefined })} />
          </label>
          <label className="field">
            Hasta
            <input id="imp-until" type="date" className="input" value={imp.until} onChange={(e) => setImp({ ...imp, until: e.target.value, slots: undefined })} />
          </label>
        </div>
        <button
          className="btn sm"
          style={{ alignSelf: 'flex-start' }}
          disabled={!email || imp.busy}
          onClick={async () => {
            setImp({ ...imp, busy: true })
            try {
              setImp({ ...imp, busy: false, slots: await previewCalendarImport(imp.from, imp.until, subjects) })
            } catch (err) {
              setImp({ ...imp, busy: false })
              toast(err instanceof Error ? err.message : 'No se pudo leer el calendario')
            }
          }}
        >
          {imp.busy ? 'Leyendo…' : email ? 'Buscar clases en Google Calendar' : 'Conecta Google primero'}
        </button>
        {imp.slots && (
          <div className="stack">
            {imp.slots.length === 0 ? (
              <span className="small muted">No he encontrado clases de tus asignaturas activas en esas fechas.</span>
            ) : (
              <>
                <div className="card list">
                  {imp.slots.map((s) => (
                    <div key={s.id} className="list-item small">
                      <span className="dot" style={{ background: subjects.find((x) => x.id === s.subjectId)?.color }} />
                      <span className="grow">
                        {subjects.find((x) => x.id === s.subjectId)?.short} {s.type} · <span style={{ textTransform: 'capitalize' }}>{WEEKDAYS[s.weekday - 1]}</span> {s.start}–{s.end} · {s.room}
                      </span>
                      <span className="xs muted">
                        {formatShort(s.from)} → {formatShort(s.until)}
                      </span>
                    </div>
                  ))}
                </div>
                <button
                  className="btn primary sm"
                  style={{ alignSelf: 'flex-start' }}
                  onClick={async () => {
                    await applyCalendarImport(imp.slots!)
                    setImp({ ...imp, slots: undefined })
                    toast('Horario importado')
                  }}
                >
                  Usar este horario
                </button>
              </>
            )}
          </div>
        )}
      </section>

      <section className="card pad stack">
        <h2>Estudio</h2>
        <label className="field">
          Tu nombre
          <input id="set-name" className="input" defaultValue={name} onBlur={(e) => setName(e.target.value.trim())} />
        </label>
        <span className="small muted">Tiempo que quieres dedicar a estudiar al día (lo usa el planificador de exámenes):</span>
        <div className="grid-2">
          <label className="field">
            Entre semana (min)
            <input id="set-wd" className="input" inputMode="numeric" defaultValue={minutes.weekday} onBlur={(e) => setMinutes({ ...minutes, weekday: Number(e.target.value) || 0 })} />
          </label>
          <label className="field">
            Fin de semana (min)
            <input id="set-we" className="input" inputMode="numeric" defaultValue={minutes.weekend} onBlur={(e) => setMinutes({ ...minutes, weekend: Number(e.target.value) || 0 })} />
          </label>
        </div>
      </section>

      <section className="card pad stack">
        <h2>Avisos</h2>
        <span className="small muted">
          Los avisos de exámenes, entregas y tareas te llegan desde Google Calendar (al móvil y al ordenador, aunque no abras la app). El Pomodoro y los recordatorios de la app usan las notificaciones del navegador.
        </span>
        {perm === 'granted' ? (
          <span className="small" style={{ color: 'var(--ok)' }}>Notificaciones activadas en este dispositivo ✓</span>
        ) : perm === 'unsupported' ? (
          <span className="small muted">Este navegador no permite notificaciones. En iPhone, primero instala la app en la pantalla de inicio.</span>
        ) : (
          <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={async () => setPerm(await Notification.requestPermission())}>
            Activar notificaciones en este dispositivo
          </button>
        )}
      </section>

      <section className="card pad stack">
        <h2>Datos y copias de seguridad</h2>
        <span className="small muted">
          {usage ? `${usage}. ` : ''}Descarga una copia con todo (incluidos los archivos) o recupera una copia anterior.
          {email ? ' Con Google conectado, además, todo queda guardado en tu Drive.' : ''}
        </span>
        <div className="row wrap">
          <button
            className="btn sm"
            onClick={async () => {
              downloadBlob(await exportAll(), `organizador-copia-${today()}.json`)
              await db.settings.put({ key: 'lastBackup', value: Date.now() })
            }}
          >
            <Icon name="download" size={16} /> Descargar copia
          </button>
          <label className="btn sm ghost" style={{ cursor: 'pointer' }}>
            Recuperar una copia…
            <input
              type="file"
              accept="application/json,.json"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0]
                if (!f) return
                try {
                  await importAll(f)
                  toast('Copia recuperada')
                } catch (err) {
                  toast(err instanceof Error ? err.message : 'No se pudo leer la copia')
                }
              }}
            />
          </label>
        </div>
      </section>

      {install.canInstall && (
        <section className="card pad stack">
          <h2>Instalar</h2>
          <button className="btn primary" style={{ alignSelf: 'flex-start' }} onClick={() => void install.prompt()}>
            Instalar la app en este dispositivo
          </button>
        </section>
      )}
    </div>
  )
}
