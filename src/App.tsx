import { useEffect, useState } from 'react'
import { HashRouter, Route, Routes } from 'react-router-dom'
import { CommandPalette, QuickAdd, SideNav } from './components/shell'
import { ToastProvider } from './components/ui'
import { FileViewer } from './components/FileViewer'
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
          <SideNav />
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
        <QuickAdd />
        <CommandPalette />
        <FileViewer />
      </ToastProvider>
    </HashRouter>
  )
}
