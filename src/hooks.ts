import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { db, type Subject } from './db'
import { today } from './lib/dates'

export function useSubjects(): Subject[] {
  return useLiveQuery(() => db.subjects.toArray(), [], [] as Subject[])
}

export function useSubjectMap(): Map<string, Subject> {
  const subjects = useSubjects()
  return new Map(subjects.map((s) => [s.id, s]))
}

/** Fecha de hoy que se actualiza sola al pasar la medianoche. */
export function useToday(): string {
  const [d, setD] = useState(today())
  useEffect(() => {
    const t = setInterval(() => setD(today()), 60_000)
    return () => clearInterval(t)
  }, [])
  return d
}

/** Re-renderiza cada minuto (para "próxima clase" y cuentas atrás). */
export function useMinuteTick(): number {
  const [n, setN] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setN((x) => x + 1), 60_000)
    return () => clearInterval(t)
  }, [])
  return n
}
