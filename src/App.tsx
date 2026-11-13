import { useEffect, useState } from 'react'
import { HashRouter, NavLink, Route, Routes } from 'react-router-dom'
import { Icon } from './components/Icon'
import { ToastProvider } from './components/ui'
import { seedIfEmpty } from './seed'
import Home from './pages/Home'
import CalendarPage from './pages/Calendar'
import Subjects from './pages/Subjects'
import SubjectDetail from './pages/SubjectDetail'
import Tasks from './pages/Tasks'
import NoteEditor from './pages/NoteEditor'
import Upload from './pages/Upload'
import Search from './pages/Search'
import Study from './pages/Study'
import Settings from './pages/Settings'
import { PomodoroTicker } from './features/pomodoro'

const NAV = [
  { to: '/', icon: 'home', label: 'Inicio' },
  { to: '/calendario', icon: 'calendar', label: 'Calendario' },
  { to: '/asignaturas', icon: 'book', label: 'Asignaturas' },
  { to: '/estudiar', icon: 'timer', label: 'Estudiar' },
  { to: '/tareas', icon: 'tasks', label: 'Tareas' },
]

export default function App() {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    seedIfEmpty().finally(() => setReady(true))
    // Pide al navegador que no borre los datos guardados en el dispositivo.
    navigator.storage?.persist?.().catch(() => {})
  }, [])

  if (!ready) return null

  return (
    <HashRouter>
      <ToastProvider>
        <PomodoroTicker />
        <div className="app">
          <nav className="nav" aria-label="Secciones">
            <span className="brand">Organizador</span>
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
                <Icon name={n.icon} />
                {n.label}
              </NavLink>
            ))}
            <NavLink to="/buscar" className={({ isActive }) => `nav-extra ${isActive ? 'active' : ''}`}>
              <Icon name="search" />
              Buscar
            </NavLink>
            <NavLink to="/subir" className={({ isActive }) => `nav-extra ${isActive ? 'active' : ''}`}>
              <Icon name="upload" />
              Subir archivo
            </NavLink>
            <span className="spacer nav-extra" />
            <NavLink to="/ajustes" className={({ isActive }) => `nav-extra ${isActive ? 'active' : ''}`}>
              <Icon name="settings" />
              Ajustes
            </NavLink>
          </nav>
          <main className="main">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/calendario" element={<CalendarPage />} />
              <Route path="/asignaturas" element={<Subjects />} />
              <Route path="/asignaturas/:id" element={<SubjectDetail />} />
              <Route path="/tareas" element={<Tasks />} />
              <Route path="/notas/:id" element={<NoteEditor />} />
              <Route path="/subir" element={<Upload />} />
              <Route path="/buscar" element={<Search />} />
              <Route path="/estudiar" element={<Study />} />
              <Route path="/ajustes" element={<Settings />} />
              <Route path="*" element={<Home />} />
            </Routes>
          </main>
        </div>
      </ToastProvider>
    </HashRouter>
  )
}
