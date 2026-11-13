/**
 * Saca el texto de un archivo para poder buscar dentro de él.
 * Fase 1: PDF (incluidos los exportados desde Samsung Notes si llevan texto) y texto plano.
 * Fase 2: fotos y apuntes a mano con la IA (OCR), y Word / PowerPoint.
 */
export async function extractText(file: Blob, mime: string, name: string): Promise<string> {
  try {
    if (mime === 'application/pdf' || name.toLowerCase().endsWith('.pdf')) {
      return await extractPdf(file)
    }
    if (mime.startsWith('text/') || /\.(md|txt)$/i.test(name)) {
      return await file.text()
    }
  } catch (err) {
    console.warn('No se pudo extraer el texto de', name, err)
  }
  return ''
}

async function extractPdf(file: Blob): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  const pages: string[] = []
  const max = Math.min(doc.numPages, 300)
  for (let i = 1; i <= max; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    const line = content.items.map((it) => ('str' in it ? it.str : '')).join(' ')
    pages.push(`[pág. ${i}] ${line}`)
  }
  void doc.cleanup()
  return pages.join('\n')
}

export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`
}

export function fileBadge(mime: string, name: string): string {
  if (mime === 'application/pdf') return 'PDF'
  if (mime.startsWith('image/')) return 'IMG'
  if (mime.startsWith('audio/')) return 'AUD'
  if (mime.startsWith('video/')) return 'VID'
  const ext = name.split('.').pop()?.toUpperCase() ?? ''
  return ext.slice(0, 4) || 'ARCH'
}
