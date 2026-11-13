import type { FileKind, Subject } from '../db'
import { guessClassification } from '../components/files'
import { aiAvailable, aiClassify } from './ai'

export interface Classification {
  subjectId?: string
  topic?: string
  kind: FileKind
  date?: string
  tags?: string[]
  /** Texto leído por la IA (OCR de fotos y apuntes a mano). */
  text?: string
  /** Resumen de una línea de lo que es el archivo. */
  summary?: string
  /** Pregunta cuando la IA no lo tiene claro, con respuestas rápidas. */
  question?: string
  options?: { label: string; subjectId?: string; kind?: FileKind; topic?: string }[]
}

/** Propone asignatura, tema, tipo y fecha. Usa la IA si está disponible; si no, reglas sencillas. */
export async function classifyUpload(file: File, text: string, subjects: Subject[], preset?: string): Promise<Classification> {
  const base = guessClassification(file.name, text, subjects)
  if (preset) base.subjectId = preset
  if (await aiAvailable()) {
    try {
      const ai = await aiClassify(file, text, subjects)
      if (ai) return { ...ai, subjectId: preset ?? ai.subjectId }
    } catch (err) {
      console.warn('La IA no pudo clasificar el archivo', err)
    }
  }
  const unsure = !base.subjectId
  return {
    ...base,
    question: unsure ? '¿De qué asignatura es?' : undefined,
    options: unsure
      ? subjects.filter((s) => s.status === 'active').map((s) => ({ label: s.short, subjectId: s.id }))
      : undefined,
  }
}
