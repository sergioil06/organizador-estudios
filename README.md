# Organizador de estudios

App para organizar la carrera (Ingeniería Informática, Uniovi): horario, exámenes, tareas, apuntes, buscador y estudio con IA (Gemini).
Es una **PWA**: se instala en el móvil y en el ordenador, funciona sin conexión y se sincroniza entre dispositivos a través de **tu propia cuenta de Google**.

- **Tus datos son tuyos.** No hay servidor propio ni base de datos de terceros. Todo se guarda en el dispositivo y, si conectas Google, en tu Google Drive (una carpeta oculta para los datos y la carpeta *Organizador de estudios* para los archivos) y en tu Google Calendar (exámenes, entregas y tareas con fecha).
- **IA:** usa tu clave gratuita de Gemini. En el plan gratuito, Google puede usar lo que envías para mejorar sus modelos. La IA solo recibe lo que tú le pides en cada momento (un archivo para clasificar, los apuntes de un tema para resumir, etc.).

---

## Puesta en marcha (una sola vez, unos 15 minutos)

### 1. Publicar la app en Vercel (gratis)

1. Entra en <https://vercel.com/signup> y elige **Continue with GitHub**.
2. Pulsa **Add New… → Project**, busca `organizador-estudios` y pulsa **Import**. Si no aparece, pulsa *Adjust GitHub App Permissions* y dale acceso a ese repositorio.
3. No cambies nada y pulsa **Deploy**. Al terminar tendrás una dirección del tipo `https://organizador-estudios-xxxx.vercel.app`. **Cópiala**, la necesitas en el paso 2.

Ya puedes usar la app. Sin el paso 2 todo funciona pero solo en ese dispositivo.

### 2. Conectar con Google (sincronización entre dispositivos y Calendar)

1. Entra en <https://console.cloud.google.com/projectcreate>, ponle de nombre `Organizador` y pulsa **Crear**.
2. Activa las dos APIs (pulsa **Habilitar** en cada una, con el proyecto Organizador seleccionado arriba):
   - <https://console.cloud.google.com/apis/library/drive.googleapis.com>
   - <https://console.cloud.google.com/apis/library/calendar-json.googleapis.com>
3. Ve a <https://console.cloud.google.com/auth/overview> y pulsa **Comenzar**:
   - Nombre de la app: `Organizador de estudios`. Correo de asistencia: el tuyo.
   - Público: **Externo**.
   - Información de contacto: tu correo. Acepta y **Crear**.
4. En <https://console.cloud.google.com/auth/audience>, en **Usuarios de prueba**, pulsa **Add users** y añade tu propio correo de Gmail. (La app se queda en modo "prueba": solo tú puedes usarla, que es lo que queremos.)
5. En <https://console.cloud.google.com/auth/clients> pulsa **Crear cliente**:
   - Tipo de aplicación: **Aplicación web**.
   - **Orígenes de JavaScript autorizados** → *Añadir URI* → pega la dirección de Vercel del paso 1 (sin barra al final).
   - Pulsa **Crear** y copia el **ID de cliente** (termina en `.apps.googleusercontent.com`).
6. Vuelve a Vercel → tu proyecto → **Settings → Environment Variables**:
   - Key: `VITE_GOOGLE_CLIENT_ID`
   - Value: el ID de cliente que copiaste.
   - Pulsa **Save**.
7. En Vercel → **Deployments** → los tres puntos del último → **Redeploy**.
8. Abre la app → **Ajustes → Conectar con Google**. Google te avisará de que la app "no está verificada": pulsa **Continuar** (es tu propia app) y acepta los permisos.

> Permisos que pide: ver tu nombre y correo, **solo** los archivos de Drive que crea la propia app (no puede ver el resto de tu Drive), su carpeta oculta de datos y crear o editar eventos en tu calendario.

### 3. Activar la IA (Gemini, gratis)

1. Entra en <https://aistudio.google.com/apikey> con tu cuenta de Google y pulsa **Create API key**.
2. Cópiala, ve a la app → **Ajustes → Inteligencia artificial**, pégala y pulsa **Guardar** y luego **Probar la IA**.

La clave se guarda en tu dispositivo y en tu Drive, así que solo hay que ponerla una vez.

---

## Instalar la app

**Android (Chrome):** abre la dirección de Vercel → menú ⋮ → **Instalar aplicación** (o *Añadir a pantalla de inicio*). También puedes pulsar *Instalar* en Ajustes dentro de la app.

**iPhone / iPad (Safari):** abre la dirección → botón **Compartir** → **Añadir a pantalla de inicio**. Para recibir avisos del Pomodoro en iPhone hace falta haberla instalado así.

**Ordenador (Chrome o Edge):** abre la dirección → icono de instalar ⊕ a la derecha de la barra de direcciones → **Instalar**. Se abre en su propia ventana y aparece en el menú de inicio / Launchpad.

En cada dispositivo nuevo: **Ajustes → Conectar con Google** y en unos segundos aparece todo.

**Si al instalar dice que no se puede descargar:**
1. Instálala desde la dirección **corta** de producción (la que sale en Vercel → tu proyecto → *Domains*, del tipo `organizador-estudios-xxxx.vercel.app`), no desde la dirección larga de un despliegue concreto.
2. En Vercel → *Settings* → *Deployment Protection*, pon **Vercel Authentication** en *Disabled* (o al menos que no proteja producción). Si la dirección pide iniciar sesión en Vercel, Google no puede leer los iconos de la app y la instalación en Android falla.
3. Si ya tenías un intento a medias, borra el icono que se haya creado, recarga la página y vuelve a *Instalar aplicación*.

## Avisos

Los avisos de exámenes, entregas y tareas con fecha se crean en Google Calendar con recordatorios, así que te llegan al móvil aunque no abras la app. Asegúrate de tener las notificaciones de Google Calendar activadas.

## Mantenimiento

- **Actualizaciones:** cada cambio que se sube a la rama `main` de GitHub se publica solo en Vercel en un minuto. La app instalada se actualiza sola la próxima vez que la abras (si estaba abierta, ciérrala y vuelve a abrirla).
- **Copias de seguridad:** con Google conectado, todo está en tu Drive. Además, en **Ajustes → Descargar copia** puedes guardar un archivo con todo (hazlo al final de cada cuatrimestre, por ejemplo).
- **Nuevo cuatrimestre:** en *Asignaturas* cambia el estado de las asignaturas (en curso / próximamente / aprobada) e importa el nuevo horario desde **Ajustes → Horario**.
- **Si la IA da error de cuota:** el plan gratuito tiene un límite por minuto y por día; espera un poco. Si un modelo deja de existir, cambia el nombre en *Ajustes → Modelo* (por ejemplo `gemini-flash-latest`).
- **Si cambias la dirección de Vercel** (dominio propio, por ejemplo), añádela también en *Orígenes de JavaScript autorizados* del cliente de Google.

## Para desarrollar

```bash
npm install
cp .env.example .env.local   # pon tu VITE_GOOGLE_CLIENT_ID
npm run dev                  # http://localhost:5173 (añádelo también como origen autorizado en Google)
npm run build                # comprueba tipos y genera dist/
```

Tecnología: Vite + React + TypeScript, Dexie (IndexedDB) para guardar en local, vite-plugin-pwa para el modo sin conexión, Google Identity Services + APIs de Drive y Calendar para sincronizar, Gemini API para la IA.
