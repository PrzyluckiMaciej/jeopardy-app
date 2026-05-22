import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { generateRoomCode } from '../lib/utils'
import { useGameStore } from '../store/gameStore'
import { logEvent } from '../lib/logger'

export default function LandingPage() {
  const navigate = useNavigate()
  const [joinCode, setJoinCode] = useState('')
  const [playerName, setPlayerName] = useState('')
  const [mode, setMode] = useState<'pick' | 'join'>('pick')
  const { setIsHost, setRoomCode } = useGameStore()

  function handleHost() {
    const code = generateRoomCode()
    setIsHost(true)
    setRoomCode(code)
    logEvent({ role: 'host', roomCode: code, actor: 'host', event: 'Room created' })
    navigate('/host')
  }

  function handleJoin() {
    if (!joinCode.trim() || !playerName.trim()) return
    const code = joinCode.trim().toUpperCase()
    const name = playerName.trim()
    setIsHost(false)
    setRoomCode(code)
    logEvent({ role: 'player', roomCode: code, actor: name, event: `Attempting to join room` })
    navigate(`/play?name=${encodeURIComponent(name)}`)
  }

  return (
    <div className="landing-page app-page min-h-screen flex flex-col items-center justify-center safe-area-x safe-area-bottom px-4 page-fade-in">
      <div className="landing-page__bg" aria-hidden />
      <div className="landing-page__particles" aria-hidden>
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} className="landing-page__particle" />
        ))}
      </div>

      <div className="landing-page__content">
        <div className="text-center mb-12">
          <div className="landing-hero__title">JEOPARDY!</div>
          <div className="landing-hero__subtitle">Play with friends</div>
        </div>

        <div className="landing-card">
          {mode === 'pick' ? (
            <div className="flex flex-col gap-4">
              <button className="btn-gold w-full py-4 text-xl" onClick={handleHost}>
                Host a game
              </button>
              <div className="flex items-center gap-3 my-1">
                <div className="flex-1 divider-line" />
                <span className="font-condensed text-sm text-muted">OR</span>
                <div className="flex-1 divider-line" />
              </div>
              <button className="btn-outline w-full py-4 text-xl" onClick={() => setMode('join')}>
                Join a game
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <button className="btn-ghost self-start text-sm mb-1" onClick={() => setMode('pick')}>
                ← Back
              </button>
              <div>
                <label className="font-condensed text-sm uppercase tracking-wider mb-1 block text-gold">
                  Your name
                </label>
                <input
                  className="w-full"
                  placeholder="Enter your name"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                  autoFocus
                />
              </div>
              <div>
                <label className="font-condensed text-sm uppercase tracking-wider mb-1 block text-gold">
                  Room code
                </label>
                <input
                  className="w-full font-display text-2xl tracking-widest text-center"
                  placeholder="ABC123"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
                  onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                  maxLength={6}
                />
              </div>
              <button
                className="btn-gold w-full py-3 text-lg"
                onClick={handleJoin}
                disabled={!joinCode.trim() || !playerName.trim()}
              >
                Join game
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
