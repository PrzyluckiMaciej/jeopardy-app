import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import LandingPage from './pages/LandingPage'
import ToastHost from './components/ToastHost'

const HostPage = lazy(() => import('./pages/HostPage'))
const PlayerPage = lazy(() => import('./pages/PlayerPage'))

function PageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg-primary)]">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--gold)] border-t-transparent" />
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastHost />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/host" element={<HostPage />} />
          <Route path="/play" element={<PlayerPage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
