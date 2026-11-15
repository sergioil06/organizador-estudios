/**
 * Ejercicios por tipo: la IA lee un PDF (normalmente de Samsung Notes, escrito a mano) página a página,
 * como imagen, separa cada ejercicio y lo guarda en una carpeta según su tipo.
 */
import { db, uid, type Exercise, type StoredFile, type Subject } from '../db'
import { aiExercises, blobToBase64, type FoundExercise } from './ai'
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
}

/**
 * Analiza un archivo y guarda sus ejercicios. Si el archivo ya se había analizado, sus ejercicios
 * anteriores se sustituyen (los que se movieron a mano a otra carpeta conservan esa carpeta).
 */
export async function analyzeFile(file: StoredFile, subject: Subject, onProgress: (p: AnalyzeProgress) => void): Promise<number> {
  const blob = await ensureBlob(file)
  const previous = await db.exercises.where('fileId').equals(file.id).toArray()
  const folders = new Set((await db.exercises.where('subjectId').equals(subject.id).toArray()).filter((e) => e.fileId !== file.id).map((e) => e.folder))
  // Carpetas elegidas a mano para ejercicios de este archivo (se respetan al volver a analizar).
  const manual = new Map(previous.map((e) => [`${e.page}|${norm(e.title)}`, e.folder]))

  const isPdf = file.mime === 'application/pdf' || /\.pdf$/i.test(file.name)
  const reader = isPdf ? await pdfPages(blob) : null
  const total = reader ? Math.min(reader.total, MAX_PAGES) : 1
  const found: FoundExercise[] = []
  try {
    for (let start = 1; start <= total; start += PAGES_PER_CALL) {
      onProgress({ done: start - 1, total, found: found.length })
      const pages: PageInput[] = []
      for (let n = start; n < start + PAGES_PER_CALL && n <= total; n++) pages.push(reader ? await reader.render(n) : await imagePage(blob))
      const batch = await aiExercises({ subject, fileName: file.name, folders: [...folders], pages, totalPages: total })
      for (const ex of batch) {
        if (ex.continues && found.length) {
          const last = found[found.length - 1]
          const extra = [ex.statement, ex.solution].filter((x) => x?.trim()).join('\n\n')
          last.solution = [last.solution, extra].filter((x) => x?.trim()).join('\n\n')
          continue
        }
        const folder = cleanFolder(ex.folder, [...folders])
        folders.add(folder)
        found.push({ ...ex, folder, page: clampPage(ex.page, pages[0].page, total) })
      }
    }
  } finally {
    reader?.done()
  }
  onProgress({ done: total, total, found: found.length })

  const now = Date.now()
  const existing = await db.exercises.where('subjectId').equals(subject.id).count()
  const rows: Exercise[] = found.map((ex, i) => ({
    id: uid(),
    subjectId: subject.id,
    folder: manual.get(`${ex.page}|${norm(ex.title)}`) ?? ex.folder,
    title: ex.title.trim() || `Ejercicio pág. ${ex.page}`,
    statement: ex.statement?.trim() ?? '',
    solution: ex.solution?.trim() || undefined,
    fileId: file.id,
    fileName: file.name,
    page: ex.page,
    status: 'pendiente',
    order: existing + i,
    createdAt: now + i,
  }))
  await db.transaction('rw', db.exercises, async () => {
    await db.exercises.bulkDelete(previous.map((e) => e.id))
    await db.exercises.bulkAdd(rows)
  })
  return rows.length
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
