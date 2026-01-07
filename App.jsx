import { useState } from 'react'
import Game from './Game'
import Home from './Home'

export default function App() {
  const [isPlaying, setIsPlaying] = useState(false)
  const [autoLock, setAutoLock] = useState(false)

  return (
    <>
      {!isPlaying && <Home onStart={() => { setAutoLock(true); setIsPlaying(true) }} />}
      {isPlaying && <Game autoLock={autoLock} onAutoLockDone={() => setAutoLock(false)} />}
    </>
  )

}
