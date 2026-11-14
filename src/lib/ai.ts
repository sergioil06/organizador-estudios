/**
 * IA con Gemini (Google). La clave se guarda solo en tus dispositivos (y en tu copia de Drive).
 * Todas las llamadas salen directamente de tu navegador a Google: no hay servidores intermedios.
 */
import { db, type FileKind, type Subject } from '../db'
import type { Classification } from './classify'
import { today } from './dates'

export const DEFAULT_MODEL = 'gemini-flash-latest'
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models'

export async function getAiSettings(): Promise<{ key: string; model: string }> {
  const [k, m] = await Promise.all([db.settings.get('geminiKey'), db.settings.get('geminiModel')])
  return { key: (k?.value as string) ?? '', model: (m?.value as string) || DEFAULT_MODEL }
}

export async function aiAvailable(): Promise<boolean> {
  if (!navigator.onLine) return false
  return !!(await getAiSettings()).key
}

type Part = { text: string } | { inlineData: { mimeType: string; data: string } }
export interface ChatTurn {
  role: 'user' | 'model'
  text: string
}

export class AiError extends Error {}

type CallOpts = { system?: string; schema?: object; temperature?: number }

const TIMEOUT_MS = 150_000

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Mensaje de error de Google (si lo hay) para enseñarlo tal cual. */
function googleMessage(detail: string): string {
  try {
    return (JSON.parse(detail)?.error?.message as string) ?? ''
  } catch {
    return detail.slice(0, 200)
  }
}

async function call(contents: { role: string; parts: Part[] }[], opts: CallOpts = {}): Promise<string> {
  const { key, model } = await getAiSettings()
  if (!key) throw new AiError('Falta la clave de la IA. Añádela en Ajustes.')
  if (!navigator.onLine) throw new AiError('Sin conexión: la IA necesita internet.')
  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature: opts.temperature ?? 0.4,
      maxOutputTokens: 32_768,
      ...(opts.schema ? { responseMimeType: 'application/json', responseSchema: opts.schema } : {}),
    },
  }
  if (opts.system) body.systemInstruction = { parts: [{ text: opts.system }] }

  // El plan gratuito a veces responde 503 (modelo saturado) o 500: se reintenta solo.
  let res: Response | null = null
  let detail = ''
  for (let attempt = 0; attempt < 3; attempt++) {
    // Sin límite de tiempo, una petición colgada dejaba el botón "pensando" para siempre.
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
    try {
      res = await fetch(`${ENDPOINT}/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      })
    } catch (err) {
      if (ctrl.signal.aborted) throw new AiError('La IA ha tardado demasiado en responder. Prueba con un tema concreto en vez de toda la asignatura.')
      throw new AiError(`No se pudo contactar con la IA (${err instanceof Error ? err.message : 'error de red'}).`)
    } finally {
      clearTimeout(timer)
    }
    if (res.ok) break
    detail = await res.text().catch(() => '')
    if (![500, 502, 503, 504].includes(res.status)) break
    await wait(1500 * (attempt + 1) ** 2)
  }
  if (!res || !res.ok) {
    const status = res?.status ?? 0
    const msg = googleMessage(detail)
    console.warn('Error de Gemini', status, detail)
    if (status === 429) throw new AiError('Has llegado al límite gratuito de la IA por ahora (por minuto o por día). Prueba dentro de un rato o con menos material (elige un tema).')
    if (status === 400 && /API key/i.test(detail)) throw new AiError('La clave de la IA no es válida. Revísala en Ajustes.')
    if (status === 404) throw new AiError(`El modelo «${model}» no existe o ya no está disponible. Cámbialo en Ajustes (deja ${DEFAULT_MODEL}).`)
    if (status === 503 || status === 500) throw new AiError('Los servidores de la IA están saturados ahora mismo. Prueba en unos minutos.')
    if (status === 400 && /token|too large|exceeds/i.test(msg)) throw new AiError('Hay demasiado material de golpe para la IA. Elige un tema concreto.')
    throw new AiError(`La IA respondió con un error (${status})${msg ? `: ${msg}` : ''}`)
  }
  const json = await res.json()
  const cand = json?.candidates?.[0]
  const text: string = cand?.content?.parts?.filter((p: { thought?: boolean }) => !p.thought).map((p: { text?: string }) => p.text ?? '').join('') ?? ''
  const reason: string = cand?.finishReason ?? ''
  if (!text) {
    console.warn('Gemini sin texto', json)
    if (json?.promptFeedback?.blockReason) throw new AiError('La IA bloqueó la petición por sus filtros. Prueba con otro tema.')
    if (reason === 'RECITATION') throw new AiError('RECITATION')
    if (reason === 'SAFETY' || reason === 'PROHIBITED_CONTENT') throw new AiError('La IA bloqueó la respuesta por sus filtros. Prueba con otro tema.')
    if (reason === 'MAX_TOKENS') throw new AiError('La respuesta de la IA se cortó. Prueba con un tema concreto en vez de toda la asignatura.')
    throw new AiError('La IA no devolvió respuesta. Prueba otra vez.')
  }
  if (reason === 'MAX_TOKENS' && opts.schema) throw new AiError('La respuesta de la IA se cortó. Prueba con un tema concreto en vez de toda la asignatura.')
  return text
}

/**
 * Gemini corta la respuesta ("RECITATION") cuando copia trozos literales del material,
 * algo frecuente con definiciones y teoremas. Se reintenta pidiéndole que lo redacte con sus palabras.
 */
async function ask(parts: Part[], opts: CallOpts = {}) {
  try {
    return await call([{ role: 'user', parts }], opts)
  } catch (err) {
    if (!(err instanceof AiError) || err.message !== 'RECITATION') throw err
  }
  try {
    const reword: Part = { text: 'IMPORTANTE: no copies frases literales del material; redacta todo con tus propias palabras (las fórmulas sí pueden ser iguales).' }
    return await call([{ role: 'user', parts: [...parts, reword] }], { ...opts, temperature: Math.max(opts.temperature ?? 0.4, 0.9) })
  } catch (err) {
    if (err instanceof AiError && err.message === 'RECITATION') throw new AiError('La IA se negó porque copiaba texto literal del material. Prueba con un tema concreto.')
    throw err
  }
}

/** Lee el JSON de la respuesta aunque venga con ```json o con texto alrededor. */
export function parseJSON<T>(raw: string): T {
  const clean = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
  try {
    return JSON.parse(clean) as T
  } catch {
    const start = clean.search(/[[{]/)
    const end = Math.max(clean.lastIndexOf(']'), clean.lastIndexOf('}'))
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(clean.slice(start, end + 1)) as T
      } catch {
        /* sigue abajo */
      }
    }
    console.warn('JSON de la IA no válido', raw)
    throw new AiError('La IA devolvió una respuesta incompleta. Prueba otra vez o con un tema concreto.')
  }
}

async function askJSON<T>(parts: Part[], schema: object, system?: string, temperature?: number): Promise<T> {
  const raw = await ask(parts, { schema, system, temperature })
  return parseJSON<T>(raw)
}

/** Algunas respuestas llegan envueltas en un objeto ({ cards: [...] }); devuelve siempre la lista. */
function asList<T>(v: unknown, key: string): T[] {
  if (Array.isArray(v)) return v as T[]
  const inner = (v as Record<string, unknown>)?.[key]
  if (Array.isArray(inner)) return inner as T[]
  const any = v && typeof v === 'object' ? Object.values(v).find(Array.isArray) : undefined
  return (any as T[]) ?? []
}

export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '')
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

const INLINE_TYPES = /^(image\/(png|jpe?g|webp|heic|heif)|application\/pdf|audio\/|video\/)/
const MAX_INLINE = 18 * 1024 * 1024
/** Lo que cabe en una petición a Gemini (20 MB en total, y base64 ocupa un 33 % más). */
const INLINE_BUDGET = 12 * 1024 * 1024

/** Convierte un archivo en partes que la IA puede leer (el propio archivo si es imagen/PDF/audio, o su texto). */
/** Texto real (sin las marcas "[pág. N]" que salen de los PDF escaneados o escritos a mano). */
export function usefulText(text?: string): string {
  return (text ?? '').replace(/\[pág\. \d+\]/g, '').trim()
}

export async function fileParts(blob: Blob, mime: string, text: string, limit = 60_000): Promise<Part[]> {
  const real = usefulText(text)
  if (INLINE_TYPES.test(mime) && blob.size <= MAX_INLINE && (!real || mime !== 'application/pdf' || real.length < 200)) {
    return [{ inlineData: { mimeType: mime, data: await blobToBase64(blob) } }]
  }
  return text ? [{ text: text.slice(0, limit) }] : []
}

const SYSTEM =
  'Eres el asistente de estudio de Sergio, estudiante de 1º de Ingeniería Informática en Tecnologías de la Información (Universidad de Oviedo). Responde siempre en español de España, claro y conciso.'

const KINDS: FileKind[] = ['apuntes', 'diapositivas', 'ejercicios', 'examen', 'solucion', 'bibliografia', 'otro']

export async function aiClassify(file: File, text: string, subjects: Subject[]): Promise<Classification | null> {
  const active = subjects.filter((s) => s.status === 'active' || s.status === 'upcoming')
  const parts = await fileParts(file, file.type, text, 20_000)
  if (parts.length === 0) return null
  const list = active.map((s) => `- id=${s.id} · ${s.name}${s.topics.length ? ` (temas: ${s.topics.join('; ')})` : ''}`).join('\n')
  const prompt = `Clasifica este material de estudio. Archivo: "${file.name}". Hoy es ${today()}.
Asignaturas posibles:
${list}

Devuelve:
- subjectId: el id de la asignatura (o vacío si no encaja con ninguna)
- topic: el tema, con formato "Tema N · nombre corto" si se puede deducir
- kind: uno de ${KINDS.join(', ')}
- date: fecha del material (YYYY-MM-DD) si aparece; si no, vacío
- tags: 2-4 etiquetas cortas en minúscula
- summary: una frase de qué es
- text: si es una imagen o apuntes a mano, transcribe TODO el texto legible (las fórmulas en LaTeX); si ya es texto, déjalo vacío
- confident: true si estás seguro de asignatura y tipo
- question: si NO estás seguro, una pregunta corta para Sergio (ej. "¿Esto es de Cálculo, tema 3? ¿Son apuntes o ejercicios?")
- options: 2-4 respuestas rápidas a esa pregunta, cada una con label y los campos que fija (subjectId, kind, topic)`
  const schema = {
    type: 'OBJECT',
    properties: {
      subjectId: { type: 'STRING' },
      topic: { type: 'STRING' },
      kind: { type: 'STRING', enum: KINDS },
      date: { type: 'STRING' },
      tags: { type: 'ARRAY', items: { type: 'STRING' } },
      summary: { type: 'STRING' },
      text: { type: 'STRING' },
      confident: { type: 'BOOLEAN' },
      question: { type: 'STRING' },
      options: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: { label: { type: 'STRING' }, subjectId: { type: 'STRING' }, kind: { type: 'STRING', enum: KINDS }, topic: { type: 'STRING' } },
          required: ['label'],
        },
      },
    },
    required: ['kind', 'confident'],
  }
  const r = await askJSON<Classification & { confident: boolean }>([...parts, { text: prompt }], schema, SYSTEM, 0.2)
  const valid = (id?: string) => (id && subjects.some((s) => s.id === id) ? id : undefined)
  return {
    subjectId: valid(r.subjectId),
    topic: r.topic || undefined,
    kind: KINDS.includes(r.kind) ? r.kind : 'otro',
    date: /^\d{4}-\d{2}-\d{2}$/.test(r.date ?? '') ? r.date : undefined,
    tags: r.tags,
    summary: r.summary,
    text: r.text ? `${text ? `${text}\n` : ''}${r.text}` : undefined,
    question: r.confident ? undefined : r.question,
    options: r.confident ? undefined : r.options?.map((o) => ({ ...o, subjectId: valid(o.subjectId) })),
  }
}

/** Material de una asignatura (o de un tema) en forma de texto para darle contexto a la IA. */
export async function subjectContext(subjectId: string, topic?: string, limit = 400_000): Promise<{ text: string; sources: string[]; files: Part[] }> {
  const [files, notes] = await Promise.all([db.files.where('subjectId').equals(subjectId).toArray(), db.notes.where('subjectId').equals(subjectId).toArray()])
  const match = (t?: string) => !topic || (t ?? '').toLowerCase() === topic.toLowerCase()
  const chunks: string[] = []
  const sources: string[] = []
  let size = 0
  for (const n of notes.filter((n) => match(n.topic))) {
    const c = `### Nota: ${n.title || 'Sin título'}${n.topic ? ` (${n.topic})` : ''}\n${n.body}`
    if (size + c.length > limit) break
    chunks.push(c)
    sources.push(`Nota «${n.title || 'Sin título'}»`)
    size += c.length
  }
  const mine = files.filter((f) => match(f.topic))
  for (const f of mine.filter((f) => usefulText(f.text).length >= 80)) {
    const c = `### Archivo: ${f.name}${f.topic ? ` (${f.topic})` : ''} [${f.kind}]\n${f.text}`
    if (size + c.length > limit) break
    chunks.push(c)
    sources.push(`Archivo «${f.name}»`)
    size += c.length
  }
  // Apuntes a mano o escaneados (sin texto legible): se le pasa el propio archivo a la IA para que lo lea.
  const inline: Part[] = []
  let bytes = 0
  for (const f of mine.filter((f) => usefulText(f.text).length < 80 && f.blob && INLINE_TYPES.test(f.mime) && !/^(audio|video)\//.test(f.mime))) {
    const b = f.blob as Blob
    if (bytes + b.size > INLINE_BUDGET) continue
    inline.push({ text: `### Archivo: ${f.name}${f.topic ? ` (${f.topic})` : ''} [${f.kind}]` }, { inlineData: { mimeType: f.mime, data: await blobToBase64(b) } })
    sources.push(`Archivo «${f.name}»`)
    bytes += b.size
  }
  return { text: chunks.join('\n\n'), sources, files: inline }
}

export async function aiSummary(subject: Subject, material: string, style: 'resumen' | 'esquema', files: Part[] = []): Promise<string> {
  const prompt =
    style === 'resumen'
      ? `Haz un resumen de estudio en markdown del siguiente material de ${subject.name}. Da MUCHA importancia a la teoría: definiciones, teoremas (con sus hipótesis) y propiedades, cada una destacada. Usa LaTeX entre $...$ para fórmulas. Termina con "Lo que no puede faltar en el examen" (5-8 puntos).`
      : `Haz un esquema jerárquico en markdown (listas anidadas, muy breve en cada punto) del siguiente material de ${subject.name}. Marca con **negrita** definiciones y teoremas. Usa LaTeX entre $...$ para fórmulas.`
  return ask([...files, { text: `${prompt} Redáctalo con tus propias palabras.\n\nMATERIAL:\n${material}` }], { system: SYSTEM })
}

export interface GenCard {
  front: string
  back: string
}

export async function aiFlashcards(subject: Subject, material: string, n = 15, files: Part[] = []): Promise<GenCard[]> {
  const prompt = `Crea ${n} flashcards de ${subject.name} a partir del material${files.length ? ' (incluidos los archivos adjuntos)' : ''}. Redáctalas con tus propias palabras, sin copiar frases literales. Prioriza la TEORÍA: definiciones enunciados de teoremas con sus hipótesis, propiedades y condiciones; incluye unas pocas de procedimiento ("¿cómo se calcula…?"). Anverso: pregunta corta. Reverso: respuesta precisa y breve. Fórmulas en LaTeX entre $...$.\n\nMATERIAL:\n${material}`
  const schema = {
    type: 'OBJECT',
    properties: { cards: { type: 'ARRAY', items: { type: 'OBJECT', properties: { front: { type: 'STRING' }, back: { type: 'STRING' } }, required: ['front', 'back'] } } },
    required: ['cards'],
  }
  const r = await askJSON<unknown>([...files, { text: prompt }], schema, SYSTEM, 0.5)
  const cards = asList<GenCard>(r, 'cards').filter((c) => c?.front?.trim() && c?.back?.trim())
  if (cards.length === 0) throw new AiError('La IA no sacó ninguna tarjeta de ese material. Prueba con otro tema o sube apuntes con más contenido.')
  return cards
}

export interface QuizQuestion {
  question: string
  options: string[]
  answer: number
  explanation: string
}

export async function aiQuiz(subject: Subject, material: string, n = 8, examStyle?: string, files: Part[] = []): Promise<QuizQuestion[]> {
  const prompt = `Crea un test tipo examen de ${n} preguntas de ${subject.name}, redactadas con tus propias palabras, con 4 opciones cada una (una sola correcta). Mezcla teoría (definiciones, teoremas, condiciones) y aplicación. "answer" es el índice (0-3) de la correcta; "explanation" explica por qué en 1-2 frases. Fórmulas en LaTeX entre $...$.${examStyle ? `\nImita el estilo de estos exámenes antiguos:\n${examStyle.slice(0, 30_000)}` : ''}\n\nMATERIAL:\n${material}`
  const schema = {
    type: 'OBJECT',
    properties: {
      questions: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: { question: { type: 'STRING' }, options: { type: 'ARRAY', items: { type: 'STRING' } }, answer: { type: 'INTEGER' }, explanation: { type: 'STRING' } },
          required: ['question', 'options', 'answer', 'explanation'],
        },
      },
    },
    required: ['questions'],
  }
  const r = await askJSON<unknown>([...files, { text: prompt }], schema, SYSTEM, 0.6)
  const qs = asList<QuizQuestion>(r, 'questions').filter((q) => q?.question && Array.isArray(q.options) && q.options.length >= 2)
  if (qs.length === 0) throw new AiError('La IA no sacó preguntas de ese material. Prueba con otro tema.')
  return qs
}

export async function aiChat(subject: Subject, material: string, history: ChatTurn[], question: string): Promise<string> {
  const system = `${SYSTEM}
Respondes dudas de ${subject.name} usando SOBRE TODO los apuntes de Sergio que tienes abajo. Cuando uses algo de ellos, cita la fuente entre corchetes, por ejemplo [Archivo «Tema 3.pdf», pág. 4] o [Nota «Subespacios»]. Si los apuntes no cubren la duda, dilo y responde con tu conocimiento general avisándolo. Explica paso a paso, con LaTeX entre $...$ para fórmulas. No hagas los ejercicios evaluables por él: guía y explica.

APUNTES DE SERGIO:
${material || '(todavía no hay apuntes con texto en esta asignatura)'}`
  const contents = [...history.map((t) => ({ role: t.role, parts: [{ text: t.text }] as Part[] })), { role: 'user', parts: [{ text: question }] as Part[] }]
  return call(contents, { system, temperature: 0.4 })
}

export interface PlanDay {
  date: string
  items: { topic: string; activity: string; minutes: number }[]
}

export async function aiStudyPlan(args: {
  subject: Subject
  examDate: string
  topics: string[]
  startDate: string
  availability: { date: string; freeMinutes: number }[]
  notes?: string
}): Promise<PlanDay[]> {
  const prompt = `Planifica el estudio para el examen de ${args.subject.name} del ${args.examDate}.
Temas que entran: ${args.topics.join('; ')}.
Días disponibles y minutos libres de cada día (ya descontadas las clases):
${args.availability.map((a) => `${a.date}: ${a.freeMinutes} min`).join('\n')}
${args.notes ? `Preferencias de Sergio: ${args.notes}` : ''}
Reglas: reparte los temas entre los días (más tiempo a los temas largos o difíciles); en cada tema PRIMERO teoría (definiciones y teoremas) y DESPUÉS ejercicios; reserva los 2 últimos días para repaso general y un examen antiguo/test; deja algún hueco libre; no superes los minutos libres de cada día; bloques de 25-50 min. Actividades cortas y concretas (ej. "Teoría: definiciones y teorema de Rouché", "6 ejercicios de la hoja 3", "Flashcards tema 2", "Examen enero 2025 cronometrado").`
  const schema = {
    type: 'OBJECT',
    properties: {
      days: {
    type: 'ARRAY',
    items: {
      type: 'OBJECT',
      properties: {
        date: { type: 'STRING' },
        items: {
          type: 'ARRAY',
          items: { type: 'OBJECT', properties: { topic: { type: 'STRING' }, activity: { type: 'STRING' }, minutes: { type: 'INTEGER' } }, required: ['topic', 'activity', 'minutes'] },
        },
      },
      required: ['date', 'items'],
    },
      },
    },
    required: ['days'],
  }
  const r = await askJSON<unknown>([{ text: prompt }], schema, SYSTEM, 0.3)
  return asList<PlanDay>(r, 'days').filter((d) => d?.date && Array.isArray(d.items))
}

/** Comprueba que la clave funciona. */
export async function aiTest(): Promise<string> {
  return ask([{ text: 'Responde solo con: "IA conectada ✓"' }], { temperature: 0 })
}
