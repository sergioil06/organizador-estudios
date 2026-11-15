import DOMPurify from 'dompurify'
import { Marked } from 'marked'
import markedKatex from 'marked-katex-extension'
import 'katex/dist/katex.min.css'

const marked = new Marked({ gfm: true, breaks: true })
marked.use(markedKatex({ throwOnError: false, nonStandard: true }))

/** Convierte markdown (con fórmulas $...$ y $$...$$) en HTML seguro. */
export function renderMarkdown(md: string | null | undefined): string {
  // Nunca debe tumbar la pantalla: un mensaje vacío o raro se muestra como texto plano.
  const src = typeof md === 'string' ? md : md == null ? '' : String(md)
  try {
    return DOMPurify.sanitize(marked.parse(src, { async: false }) as string, { ADD_TAGS: ['semantics', 'annotation'] })
  } catch (err) {
    console.warn('No se pudo mostrar el markdown', err)
    return DOMPurify.sanitize(src.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] as string).replace(/\n/g, '<br>'))
  }
}
