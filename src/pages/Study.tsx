import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChatView } from '../features/chat'
import { FlashcardsView } from '../features/flashcards'
import { PlannerView } from '../features/planner'
import { PomodoroView } from '../features/pomodoro'
import { QuizView } from '../features/quiz'
import { useSubjects } from '../hooks'

const TABS = [
  ['plan', 'Plan'],
  ['pomodoro', 'Pomodoro'],
  ['flashcards', 'Flashcards'],
  ['tests', 'Tests'],
  ['chat', 'Chat'],
] as const

export default function Study() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') ?? 'plan'
  const subjects = useSubjects().filter((s) => s.status === 'active')
  const [chatSubject, setChatSubject] = useState('')
  const chatId = chatSubject || subjects[0]?.id

  return (
    <div className="page">
      <h1>Estudiar</h1>
      <div className="chips" role="tablist" aria-label="Herramientas de estudio">
        {TABS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={`chip ${tab === id ? 'on' : ''}`} onClick={() => setParams({ tab: id }, { replace: true })}>
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
