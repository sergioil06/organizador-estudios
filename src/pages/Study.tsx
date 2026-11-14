import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChatView } from '../features/chat'
import { FlashcardsView } from '../features/flashcards'
import { PlannerView } from '../features/planner'
import { PomodoroView } from '../features/pomodoro'
import { QuizView } from '../features/quiz'
import { useSubjects } from '../hooks'
import { Icon } from '../components/Icon'

const TABS = [
  ['plan', 'Plan de exámenes', 'flag'],
  ['pomodoro', 'Pomodoro', 'timer'],
  ['flashcards', 'Flashcards', 'layers'],
  ['tests', 'Tests', 'check'],
  ['chat', 'Chat con apuntes', 'chat'],
] as const

const TITLES: Record<string, string> = {
  plan: 'Plan de exámenes',
  pomodoro: 'Concentración',
  flashcards: 'Repaso con flashcards',
  tests: 'Tests de práctica',
  chat: 'Pregunta a tus apuntes',
}

export default function Study() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') ?? 'plan'
  const subjects = useSubjects().filter((s) => s.status === 'active')
  const [chatSubject, setChatSubject] = useState('')
  const chatId = chatSubject || subjects[0]?.id

  return (
    <div className="page narrow">
      <div className="page-head">
        <div>
          <span className="label eyebrow">Estudiar</span>
          <h1>{TITLES[tab] ?? 'Estudiar'}</h1>
        </div>
      </div>
      <div className="tabs" role="tablist" aria-label="Herramientas de estudio">
        {TABS.map(([id, label, icon]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={`tab ${tab === id ? 'on' : ''}`} onClick={() => setParams({ tab: id }, { replace: true })}>
            <Icon name={icon} size={16} />
            {label}
          </button>
        ))}
      </div>
      {tab === 'plan' && <PlannerView />}
      {tab === 'pomodoro' && <PomodoroView />}
      {tab === 'flashcards' && <FlashcardsView />}
      {tab === 'tests' && <QuizView />}
      {tab === 'chat' && (
        <>
          <div className="chips">
            {subjects.map((s) => (
              <button key={s.id} className={`chip ${chatId === s.id ? 'on' : ''}`} onClick={() => setChatSubject(s.id)}>
                {s.short}
              </button>
            ))}
          </div>
          {chatId && <ChatView key={chatId} subjectId={chatId} />}
        </>
      )}
    </div>
  )
}
