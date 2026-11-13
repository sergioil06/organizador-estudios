import DOMPurify from 'dompurify'
import { Marked } from 'marked'
import markedKatex from 'marked-katex-extension'
import 'katex/dist/katex.min.css'

const marked = new Marked({ gfm: true, breaks: true })
marked.use(markedKatex({ throwOnError: false, nonStandard: true }))

/** Convierte markdown (con fórmulas $...$ y $$...$$) en HTML seguro. */
export function renderMarkdown(md: string): string {
  return DOMPurify.sanitize(marked.parse(md, { async: false }) as string, { ADD_TAGS: ['semantics', 'annotation'] })
}
