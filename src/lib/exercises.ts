/**
 * Ejercicios por tipo: la IA lee un PDF (normalmente de Samsung Notes, escrito a mano) página a página,
 * como imagen, separa cada ejercicio y lo guarda en una carpeta según su tipo.
 */
import { db, uid, type Exercise, type StoredFile, type Subject } from '../db'
import { aiExercises, blobToBase64 } from './ai'
import { ensureBlob } from './sync'

/** Páginas que se mandan a la IA en cada petición (más = menos peticiones, pero más lentas). */
const PAGES_PER_CALL = 5
/** Ancho de la foto de cada página: suficiente para leer letra a mano sin pasarse de tamaño. */
const PAGE_WIDTH = 1300
const MAX_PAGES = 60

export const canAnalyze = (f: Pick<StoredFile, 'mime' | 'name'>) => f.mime === 'application/pdf' || /\.pdf$/i.test(f.name) || /^image\/(png|jpe?g|webp)$/.test(f.mime)

interface PageInput {
  page: number
  image?: string
  text?: string
}

async function pdfPages(blob: Blob): Promise<{ total: number; render: (n: number) => Promise<PageInput>; done: () => void }> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  const task = pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) })
  const doc = await task.promise
  return {
    total: doc.numPages,
    done: () => void task.destroy(),
    render: async (n) => {
      const page = await doc.getPage(n)
      const base = page.getViewport({ scale: 1 })
      const vp = page.getViewport({ scale: Math.min(PAGE_WIDTH / base.width, 3) })
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(vp.width)
      canvas.height = Math.round(vp.height)
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.fillStyle = '#fff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
      }
      await page.render({ canvas, viewport: vp }).promise
      const jpg = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.72))
      const content = await page.getTextContent().catch(() => null)
      const text = content?.items.map((it) => ('str' in it ? it.str : '')).join(' ') ?? ''
      page.cleanup()
      return { page: n, image: jpg ? await blobToBase64(jpg) : undefined, text }
    },
  }
}

/** Imagen suelta (foto de la pizarra o del cuaderno): se reduce y se manda como JPEG. */
async function imagePage(blob: Blob): Promise<PageInput> {
  const bmp = await createImageBitmap(blob)
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * scale)
  canvas.height = Math.round(bmp.height * scale)
  canvas.getContext('2d')?.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  const jpg = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.8))
  return { page: 1, image: jpg ? await blobToBase64(jpg) : undefined }
}

export interface AnalyzeProgress {
  done: number
  total: number
  found: number
  /** Aviso mientras se espera a que Google deje de estar saturado. */
  wait?: string
}

/** Por dónde se quedó un análisis que falló a mitad (para seguir sin repetir lo ya hecho). */
interface ResumeState {
  next: number
  total: number
}
const resumeKey = (fileId: string) => `exercises-resume:${fileId}`
export async function getResume(fileId: string): Promise<ResumeState | undefined> {
  return (await db.settings.get(resumeKey(fileId)))?.value as ResumeState | undefined
}

/**
 * Analiza un archivo y guarda sus ejercicios tanda a tanda (5 páginas cada vez), así lo ya leído no se
 * pierde si Google falla a mitad. Con `resume`, sigue desde la página donde se quedó. Si se vuelve a
 * analizar desde el principio, los ejercicios anteriores del archivo se sustituyen (los que se movieron
 * a mano a otra carpeta conservan esa carpeta).
 */
export async function analyzeFile(file: StoredFile, subject: Subject, onProgress: (p: AnalyzeProgress) => void, resume = false): Promise<number> {
  const blob = await ensureBlob(file)
  const saved = resume ? await getResume(file.id) : undefined
  const previous = await db.exercises.where('fileId').equals(file.id).toArray()
  const all = await db.exercises.where('subjectId').equals(subject.id).toArray()
  const folders = new Set(all.filter((e) => saved || e.fileId !== file.id).map((e) => e.folder))
  // Carpetas elegidas a mano para ejercicios de este archivo (se respetan al volver a analizar).
  const manual = new Map(previous.map((e) => [`${e.page}|${norm(e.title)}`, e.folder]))

  const isPdf = file.mime === 'application/pdf' || /\.pdf$/i.test(file.name)
  const reader = isPdf ? await pdfPages(blob) : null
  const total = reader ? Math.min(reader.total, MAX_PAGES) : 1
  const first = saved && saved.next <= total ? saved.next : 1
  if (first === 1) await db.exercises.bulkDelete(previous.map((e) => e.id))
  let found = first === 1 ? 0 : previous.length
  let order = all.length
  // Último ejercicio guardado de este archivo, por si el siguiente bloque empieza con su continuación.
  let last: Exercise | undefined = first === 1 ? undefined : previous.sort((a, b) => (a.page ?? 0) - (b.page ?? 0) || a.createdAt - b.createdAt).at(-1)
  let start = first
  let wait = ''
  const report = () => onProgress({ done: start - 1, total, found, wait: wait || undefined })
  try {
    for (; start <= total; start += PAGES_PER_CALL) {
      report()
      const pages: PageInput[] = []
      for (let n = start; n < start + PAGES_PER_CALL && n <= total; n++) pages.push(reader ? await reader.render(n) : await imagePage(blob))
      const batch = await aiExercises({
        subject,
        fileName: file.name,
        folders: [...folders],
        pages,
        totalPages: total,
        onWait: (msg) => {
          wait = msg
          report()
        },
      })
      const rows: Exercise[] = []
      for (const ex of batch) {
        if (ex.continues && (rows.length || last)) {
          const target = rows.at(-1) ?? (last as Exercise)
          const extra = [ex.statement, ex.solution].filter((x) => x?.trim()).join('\n\n')
          target.solution = [target.solution, extra].filter((x) => x?.trim()).join('\n\n') || undefined
          if (!rows.includes(target)) await db.exercises.update(target.id, { solution: target.solution })
          continue
        }
        const folder = cleanFolder(ex.folder, [...folders])
        folders.add(folder)
        const page = clampPage(ex.page, pages[0].page, total)
        const title = ex.title?.trim() || `Ejercicio pág. ${page}`
        rows.push({
          id: uid(),
          subjectId: subject.id,
          folder: manual.get(`${page}|${norm(title)}`) ?? folder,
          title,
          statement: ex.statement?.trim() ?? '',
          solution: ex.solution?.trim() || undefined,
          fileId: file.id,
          fileName: file.name,
          page,
          status: 'pendiente',
          order: order++,
          createdAt: Date.now() + rows.length,
        })
      }
      await db.exercises.bulkAdd(rows)
      found += rows.length
      if (rows.length) last = rows.at(-1)
      wait = ''
      if (start + PAGES_PER_CALL <= total) await db.settings.put({ key: resumeKey(file.id), value: { next: start + PAGES_PER_CALL, total } })
    }
  } catch (err) {
    reader?.done()
    const why = err instanceof Error ? err.message : String(err)
    if (start === 1 && found === 0) {
      await db.settings.delete(resumeKey(file.id))
      throw err
    }
    await db.settings.put({ key: resumeKey(file.id), value: { next: start, total } })
    throw new Error(`${why}\n\nLo ya leído está guardado: ${found} ${found === 1 ? 'ejercicio' : 'ejercicios'} de las págs. 1-${start - 1}. Cuando quieras, pulsa «Continuar desde pág. ${start}» y seguirá por ahí.`)
  }
  reader?.done()
  await db.settings.delete(resumeKey(file.id))
  onProgress({ done: total, total, found })
  return found
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

/** Une "integrales impropias" con la carpeta "Integrales impropias" que ya existía, y pone mayúscula inicial. */
export function cleanFolder(raw: string | undefined, folders: string[]): string {
  const name = (raw ?? '').trim().replace(/\s+/g, ' ') || 'Sin clasificar'
  const same = folders.find((f) => norm(f) === norm(name))
  return same ?? name.charAt(0).toUpperCase() + name.slice(1)
}

function clampPage(p: number | undefined, fallback: number, total: number) {
  const n = Math.round(Number(p))
  return Number.isFinite(n) && n >= 1 && n <= total ? n : fallback
}
