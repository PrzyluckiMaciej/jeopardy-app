import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { generateRoomCode } from '../lib/utils'
import { useGameStore } from '../store/gameStore'

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
    navigate('/host')
  }

  function handleJoin() {
    if (!joinCode.trim() || !playerName.trim()) return
    setIsHost(false)
    setRoomCode(joinCode.trim().toUpperCase())
    navigate(`/play?name=${encodeURIComponent(playerName.trim())}`)
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4" style={{ background: 'var(--navy)' }}>
      {/* Logo */}
      <div className="text-center mb-12">
        <div className="font-display text-6xl md:text-8xl tracking-wider mb-1" style={{ color: 'var(--gold-bright)', textShadow: '0 0 40px rgba(255,224,102,0.4)' }}>
          JEOPARDY!
        </div>
        <div className="font-condensed text-lg tracking-widest uppercase" style={{ color: 'var(--gold)', opacity: 0.7 }}>
          Play with friends
        </div>
      </div>

      {/* Card */}
      <div className="panel w-full max-w-md">
        {mode === 'pick' ? (
          <div className="flex flex-col gap-4">
            <button className="btn-gold w-full py-4 text-xl" onClick={handleHost}>
              🎙️ &nbsp; Host a game
            </button>
            <div className="flex items-center gap-3 my-1">
              <div className="flex-1 h-px" style={{ background: 'var(--navy-light)' }} />
              <span className="font-condensed text-sm" style={{ color: '#4a5580' }}>OR</span>
              <div className="flex-1 h-px" style={{ background: 'var(--navy-light)' }} />
            </div>
            <button className="btn-outline w-full py-4 text-xl" onClick={() => setMode('join')}>
              🎮 &nbsp; Join a game
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <button className="btn-ghost self-start text-sm mb-1" onClick={() => setMode('pick')}>
              ← Back
            </button>
            <div>
              <label className="font-condensed text-sm uppercase tracking-wider mb-1 block" style={{ color: 'var(--gold)' }}>
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
              <label className="font-condensed text-sm uppercase tracking-wider mb-1 block" style={{ color: 'var(--gold)' }}>
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

      <p className="mt-8 text-center text-sm" style={{ color: '#4a5580' }}>
        No account needed · Fully peer-to-peer · No data leaves your browser
      </p>
    </div>
  )
}
