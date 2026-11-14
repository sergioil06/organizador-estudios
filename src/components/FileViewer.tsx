import { useEffect, useRef, useState } from 'react'
import type { StoredFile } from '../db'
import { ensureBlob } from '../lib/sync'
import { downloadBlob } from '../lib/backup'
import { Icon } from './Icon'

/**
 * Visor de archivos dentro de la propia app.
 * Antes abríamos el archivo en otra pestaña con una dirección blob:, pero en la app instalada
 * (sobre todo en Android) eso no funciona y el móvil dice que "no se puede descargar".
 */
export function FileViewer() {
  const [file, setFile] = useState<StoredFile | null>(null)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const on = (e: Event) => {
      const f = (e as CustomEvent<StoredFile>).detail
      setFile(f)
      setBlob(null)
      setError('')
      ensureBlob(f)
        .then(setBlob)
        .catch((err) => setError(err instanceof Error ? err.message : 'No se pudo abrir el archivo.'))
    }
    window.addEventListener('open-file', on)
    return () => window.removeEventListener('open-file', on)
  }, [])

  useEffect(() => {
    if (!file) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setFile(null)
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [file])

  if (!file) return null
  const mime = blob?.type || file.mime || ''
  const isPdf = mime === 'application/pdf' || /\.pdf$/i.test(file.name)

  return (
    <div className="viewer" role="dialog" aria-modal="true" aria-label={file.name}>
      <div className="viewer-bar">
        <button className="btn icon ghost" onClick={() => setFile(null)} aria-label="Cerrar">
          <Icon name="close" />
        </button>
        <span className="grow viewer-title">{file.name}</span>
        {blob && (
          <button className="btn sm" onClick={() => downloadBlob(blob, file.name)}>
            <Icon name="download" size={16} /> Descargar
          </button>
        )}
      </div>
      <div className="viewer-body">
        {error ? (
          <p className="viewer-msg">{error}</p>
        ) : !blob ? (
          <p className="viewer-msg muted">Abriendo…</p>
        ) : isPdf ? (
          <PdfPages blob={blob} />
        ) : mime.startsWith('image/') ? (
          <BlobMedia blob={blob} kind="img" name={file.name} />
        ) : mime.startsWith('audio/') ? (
          <BlobMedia blob={blob} kind="audio" name={file.name} />
        ) : mime.startsWith('video/') ? (
          <BlobMedia blob={blob} kind="video" name={file.name} />
        ) : mime.startsWith('text/') || /\.(md|txt|csv)$/i.test(file.name) ? (
          <TextView blob={blob} />
        ) : (
          <p className="viewer-msg muted">Este tipo de archivo no se puede ver aquí. Pulsa «Descargar» para abrirlo con otra app.</p>
        )}
      </div>
    </div>
  )
}

function useObjectUrl(blob: Blob) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    const u = URL.createObjectURL(blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [blob])
  return url
}

function BlobMedia({ blob, kind, name }: { blob: Blob; kind: 'img' | 'audio' | 'video'; name: string }) {
  const url = useObjectUrl(blob)
  if (!url) return null
  if (kind === 'img') return <img className="viewer-img" src={url} alt={name} />
  if (kind === 'audio') return <audio src={url} controls style={{ width: '100%', maxWidth: 560, margin: '40px auto' }} />
  return <video src={url} controls playsInline className="viewer-img" />
}

function TextView({ blob }: { blob: Blob }) {
  const [text, setText] = useState('')
  useEffect(() => void blob.text().then(setText), [blob])
  return <pre className="viewer-text">{text}</pre>
}

function PdfPages({ blob }: { blob: Blob }) {
  const ref = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading')

  useEffect(() => {
    let cancelled = false
    let cleanup = () => {}
    const box = ref.current
    if (!box) return
    box.replaceChildren()
    ;(async () => {
      try {
        const pdfjs = await import('pdfjs-dist')
        pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
        const task = pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) })
        cleanup = () => void task.destroy()
        const doc = await task.promise
        if (cancelled) return
        setState('ok')
        const width = Math.min(box.clientWidth || window.innerWidth, 900)
        const dpr = Math.min(window.devicePixelRatio || 1, 2)
        // Creamos un hueco por página y la dibujamos cuando se acerca a la pantalla.
        const io = new IntersectionObserver(
          (entries) => {
            for (const en of entries) {
              if (!en.isIntersecting) continue
              io.unobserve(en.target)
              const holder = en.target as HTMLDivElement
              const n = Number(holder.dataset.page)
              void doc.getPage(n).then(async (page) => {
                if (cancelled) return
                const base = page.getViewport({ scale: 1 })
                const vp = page.getViewport({ scale: (width / base.width) * dpr })
                const canvas = document.createElement('canvas')
                canvas.width = vp.width
                canvas.height = vp.height
                canvas.style.width = '100%'
                await page.render({ canvas, viewport: vp }).promise
                holder.replaceChildren(canvas)
                holder.style.aspectRatio = ''
              })
            }
          },
          { root: box.parentElement, rootMargin: '800px 0px' },
        )
        const first = await doc.getPage(1)
        const ratio = first.getViewport({ scale: 1 })
        for (let i = 1; i <= doc.numPages; i++) {
          const holder = document.createElement('div')
          holder.className = 'viewer-page'
          holder.dataset.page = String(i)
          holder.style.aspectRatio = `${ratio.width} / ${ratio.height}`
          box.appendChild(holder)
          io.observe(holder)
        }
        cleanup = () => {
          io.disconnect()
          void task.destroy()
        }
      } catch (err) {
        console.warn('No se pudo mostrar el PDF', err)
        if (!cancelled) setState('error')
      }
    })()
    return () => {
      cancelled = true
      cleanup()
    }
  }, [blob])

  return (
    <>
      {state === 'loading' && <p className="viewer-msg muted">Cargando PDF…</p>}
      {state === 'error' && <p className="viewer-msg muted">No se pudo mostrar este PDF aquí. Pulsa «Descargar» para abrirlo con otra app.</p>}
      <div ref={ref} className="viewer-pages" />
    </>
  )
}
