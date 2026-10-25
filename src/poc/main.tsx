import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import { PocPage } from './PocPage'
import { createSession } from './session'
import './window'

// Proof-of-concept page (#40): served at /poc/. `?log=N` keeps the last N controller
// frames for the browser tests (P7, P8).

const log = Number(new URLSearchParams(location.search).get('log') ?? 0)
const session = createSession({ logFrames: log })
window.poc = session

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PocPage session={session} />
  </StrictMode>,
)
document.body.dataset.ready = 'true'
