/**
 * Conexión con tu cuenta de Google (inicio de sesión, Drive y Calendar).
 * Usa Google Identity Services: el token vive solo en la memoria del navegador.
 */
import { db } from '../db'

const SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/drive.file', // solo los archivos que crea esta app
  'https://www.googleapis.com/auth/drive.appdata', // carpeta oculta para la sincronización
  'https://www.googleapis.com/auth/calendar.events', // crear y leer eventos
].join(' ')

interface TokenResponse {
  access_token?: string
  expires_in?: number
  error?: string
}
interface TokenClient {
  requestAccessToken: (o?: { prompt?: string; hint?: string }) => void
  callback: (r: TokenResponse) => void
}
declare global {
  interface Window {
    google?: { accounts: { oauth2: { initTokenClient: (c: object) => TokenClient; revoke: (t: string, cb?: () => void) => void } } }
  }
}

let token: string | null = null
let tokenExp = 0
let client: TokenClient | null = null
let pending: Promise<string> | null = null

export function clientId(): string {
  return (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ?? ''
}

export function googleConfigured(): boolean {
  return !!clientId()
}

function loadScript(): Promise<void> {
  if (window.google?.accounts) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('No se pudo cargar el inicio de sesión de Google.'))
    document.head.appendChild(s)
  })
}

export async function isConnected(): Promise<boolean> {
  return !!(await db.settings.get('googleEmail'))?.value
}

/** Pide (o renueva) el permiso de Google. `interactive` muestra la ventana de Google si hace falta. */
export async function getToken(interactive = false): Promise<string> {
  if (token && Date.now() < tokenExp - 60_000) return token
  if (pending) return pending
  if (!googleConfigured()) throw new Error('Google no está configurado todavía.')
  pending = (async () => {
    await loadScript()
    const hint = (await db.settings.get('googleEmail'))?.value as string | undefined
    return new Promise<string>((resolve, reject) => {
      const done = (r: TokenResponse) => {
        if (r.access_token) {
          token = r.access_token
          tokenExp = Date.now() + (r.expires_in ?? 3600) * 1000
          resolve(r.access_token)
        } else reject(new Error(r.error ?? 'Google no dio permiso.'))
      }
      if (!client) {
        client = window.google!.accounts.oauth2.initTokenClient({ client_id: clientId(), scope: SCOPES, callback: done, error_callback: (e: { type?: string }) => reject(new Error(e?.type ?? 'popup')) })
      }
      client.callback = done
      client.requestAccessToken({ prompt: interactive && !hint ? 'consent' : '', hint })
    })
  })()
  try {
    return await pending
  } finally {
    pending = null
  }
}

export async function connectGoogle(): Promise<string> {
  const t = await getToken(true)
  const me = await (await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${t}` } })).json()
  await db.settings.put({ key: 'googleEmail', value: me.email })
  await db.settings.put({ key: 'googleName', value: me.given_name ?? me.name })
  return me.email as string
}

export async function disconnectGoogle(): Promise<void> {
  if (token) window.google?.accounts.oauth2.revoke(token)
  token = null
  tokenExp = 0
  await db.settings.delete('googleEmail')
}

export async function gfetch(url: string, init: RequestInit = {}): Promise<Response> {
  const t = await getToken()
  const res = await fetch(url, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${t}` } })
  if (res.status === 401) {
    token = null
    const t2 = await getToken()
    return fetch(url, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${t2}` } })
  }
  return res
}

/* ---------------- Drive ---------------- */

const DRIVE = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3'

async function multipart(meta: object, body: Blob | string, mime: string, url: string, method: 'POST' | 'PATCH') {
  const form = new FormData()
  form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }))
  form.append('file', typeof body === 'string' ? new Blob([body], { type: mime }) : body)
  const res = await gfetch(`${url}${url.includes('?') ? '&' : '?'}uploadType=multipart&fields=id`, { method, body: form })
  if (!res.ok) throw new Error(`Drive respondió ${res.status}`)
  return (await res.json()).id as string
}

/** Lee el archivo de sincronización de la carpeta oculta de la app. */
export async function readAppData(name: string): Promise<{ id: string; data: unknown } | null> {
  const q = encodeURIComponent(`name='${name}'`)
  const list = await (await gfetch(`${DRIVE}/files?spaces=appDataFolder&q=${q}&fields=files(id)`)).json()
  const id = list.files?.[0]?.id
  if (!id) return null
  const res = await gfetch(`${DRIVE}/files/${id}?alt=media`)
  if (!res.ok) return null
  return { id, data: await res.json() }
}

export async function writeAppData(name: string, data: unknown, id?: string): Promise<string> {
  const body = JSON.stringify(data)
  if (id) return multipart({}, body, 'application/json', `${UPLOAD}/files/${id}`, 'PATCH')
  return multipart({ name, parents: ['appDataFolder'] }, body, 'application/json', `${UPLOAD}/files`, 'POST')
}

const folderCache = new Map<string, string>()

/** Busca o crea una carpeta visible en tu Drive (dentro de su carpeta padre). */
export async function ensureFolder(name: string, parent?: string): Promise<string> {
  const ck = `${parent ?? 'root'}/${name}`
  if (folderCache.has(ck)) return folderCache.get(ck)!
  const safe = name.replace(/'/g, "\\'")
  const q = encodeURIComponent(`name='${safe}' and mimeType='application/vnd.google-apps.folder' and trashed=false${parent ? ` and '${parent}' in parents` : ''}`)
  const list = await (await gfetch(`${DRIVE}/files?q=${q}&fields=files(id)`)).json()
  let id = list.files?.[0]?.id as string | undefined
  if (!id) {
    const res = await gfetch(`${DRIVE}/files?fields=id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', ...(parent ? { parents: [parent] } : {}) }),
    })
    id = (await res.json()).id as string
  }
  folderCache.set(ck, id)
  return id
}

export async function uploadToDrive(blob: Blob, name: string, path: string[]): Promise<string> {
  let parent: string | undefined
  for (const p of ['Organizador de estudios', ...path]) parent = await ensureFolder(p, parent)
  return multipart({ name, parents: parent ? [parent] : [] }, blob, blob.type || 'application/octet-stream', `${UPLOAD}/files`, 'POST')
}

export async function moveInDrive(id: string, name: string, path: string[]): Promise<void> {
  let parent: string | undefined
  for (const p of ['Organizador de estudios', ...path]) parent = await ensureFolder(p, parent)
  const meta = await (await gfetch(`${DRIVE}/files/${id}?fields=parents`)).json()
  const remove = (meta.parents ?? []).join(',')
  await gfetch(`${DRIVE}/files/${id}?addParents=${parent}&removeParents=${remove}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
}

export async function downloadFromDrive(id: string): Promise<Blob> {
  const res = await gfetch(`${DRIVE}/files/${id}?alt=media`)
  if (!res.ok) throw new Error('No se pudo descargar el archivo de Drive.')
  return res.blob()
}

export async function trashInDrive(id: string): Promise<void> {
  await gfetch(`${DRIVE}/files/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) })
}

/* ---------------- Calendar ---------------- */

const CAL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'

export interface GEvent {
  id?: string
  summary: string
  description?: string
  location?: string
  start: { date?: string; dateTime?: string; timeZone?: string }
  end: { date?: string; dateTime?: string; timeZone?: string }
  reminders?: { useDefault: boolean; overrides?: { method: 'popup'; minutes: number }[] }
  colorId?: string
  extendedProperties?: { private: Record<string, string> }
}

export async function upsertCalendarEvent(ev: GEvent, id?: string): Promise<string> {
  const res = await gfetch(id ? `${CAL}/${id}` : CAL, {
    method: id ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ev),
  })
  if (res.status === 404 || res.status === 410) return upsertCalendarEvent(ev) // lo borraron en Google: lo volvemos a crear
  if (!res.ok) throw new Error(`Calendar respondió ${res.status}`)
  return (await res.json()).id as string
}

export async function deleteCalendarEvent(id: string): Promise<void> {
  const res = await gfetch(`${CAL}/${id}`, { method: 'DELETE' })
  if (!res.ok && res.status !== 404 && res.status !== 410) throw new Error(`Calendar respondió ${res.status}`)
}

export async function listCalendarEvents(timeMin: string, timeMax: string): Promise<GEvent[]> {
  const out: GEvent[] = []
  let pageToken = ''
  do {
    const url = `${CAL}?singleEvents=true&orderBy=startTime&maxResults=2500&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}${pageToken ? `&pageToken=${pageToken}` : ''}`
    const json = await (await gfetch(url)).json()
    out.push(...(json.items ?? []))
    pageToken = json.nextPageToken ?? ''
  } while (pageToken)
  return out
}
