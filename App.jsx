import { useEffect, useState } from 'react'
import Game from './Game'
import Home from './Home'

export default function App() {
  const [isPlaying, setIsPlaying] = useState(false)
  const [autoLock, setAutoLock] = useState(false)

  useEffect(() => {
    document.documentElement.classList.toggle('no-scroll', isPlaying)
    document.body.classList.toggle('no-scroll', isPlaying)
    return () => {
      document.documentElement.classList.remove('no-scroll')
      document.body.classList.remove('no-scroll')
    }
  }, [isPlaying])

  return (
    <>
      {!isPlaying && <Home onStart={() => { setAutoLock(true); setIsPlaying(true) }} />}
      {isPlaying && <Game autoLock={autoLock} onAutoLockDone={() => setAutoLock(false)} />}
    </>
  )

}
