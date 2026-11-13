import { useState } from 'react'
import { CLASS_TYPE_LABEL, db, uid, type ClassSlot, type ClassType } from '../db'
import { WEEKDAYS } from '../lib/dates'
import { ConfirmButton, Sheet } from './ui'

export function ClassSheet({ slot, subjectId, defaults, onClose }: { slot?: ClassSlot; subjectId: string; defaults?: Partial<ClassSlot>; onClose: () => void }) {
  const [type, setType] = useState<ClassType>(slot?.type ?? 'CE')
  const [weekdayN, setWeekday] = useState(String(slot?.weekday ?? 1))
  const [start, setStart] = useState(slot?.start ?? '09:00')
  const [end, setEnd] = useState(slot?.end ?? '10:00')
  const [room, setRoom] = useState(slot?.room ?? '')
  const [from, setFrom] = useState(slot?.from ?? defaults?.from ?? '2026-09-07')
  const [until, setUntil] = useState(slot?.until ?? defaults?.until ?? '2026-12-22')

  const save = async () => {
    const data = { subjectId, type, weekday: Number(weekdayN), start, end, room, from, until }
    if (slot) await db.classes.update(slot.id, data)
    else await db.classes.add({ id: uid(), ...data })
    onClose()
  }

  return (
    <Sheet title={slot ? 'Editar clase' : 'Nueva clase semanal'} onClose={onClose}>
      <label className="field">
        Tipo
        <select id="c-type" className="select" value={type} onChange={(e) => setType(e.target.value as ClassType)}>
          {(Object.keys(CLASS_TYPE_LABEL) as ClassType[]).map((t) => (
            <option key={t} value={t}>{t} · {CLASS_TYPE_LABEL[t]}</option>
          ))}
        </select>
      </label>
      <div className="grid-2">
        <label className="field">
          Día
          <select id="c-day" className="select" value={weekdayN} onChange={(e) => setWeekday(e.target.value)}>
            {WEEKDAYS.map((w, i) => (
              <option key={w} value={i + 1} style={{ textTransform: 'capitalize' }}>{w}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Aula
          <input id="c-room" className="input" value={room} onChange={(e) => setRoom(e.target.value)} />
        </label>
      </div>
      <div className="grid-2">
        <label className="field">
          Empieza
          <input id="c-start" type="time" className="input" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label className="field">
          Termina
          <input id="c-end" type="time" className="input" value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
      </div>
      <div className="grid-2">
        <label className="field">
          Desde
          <input id="c-from" type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="field">
          Hasta
          <input id="c-until" type="date" className="input" value={until} onChange={(e) => setUntil(e.target.value)} />
        </label>
      </div>
      <div className="row">
        {slot && (
          <ConfirmButton
            onConfirm={async () => {
              await db.classes.delete(slot.id)
              onClose()
            }}
          />
        )}
        <span className="grow" />
        <button className="btn primary" onClick={save}>
          Guardar
        </button>
      </div>
    </Sheet>
  )
}
