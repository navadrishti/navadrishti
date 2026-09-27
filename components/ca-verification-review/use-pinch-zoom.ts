import { useEffect, useRef, useState } from 'react'

export function usePinchZoom(resetKey: string) {
  const [scale, setScale] = useState(1)
  const scaleRef = useRef(1)
  const frameRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scaleRef.current = scale
  }, [scale])

  useEffect(() => {
    setScale(1)
  }, [resetKey])

  useEffect(() => {
    const el = frameRef.current
    if (!el) return

    let startDistance = 0
    let startScale = 1

    const distance = (touches: TouchList) =>
      Math.hypot(
        touches[0].clientX - touches[1].clientX,
        touches[0].clientY - touches[1].clientY
      )

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length === 2) {
        startDistance = distance(event.touches)
        startScale = scaleRef.current
      }
    }

    const onTouchMove = (event: TouchEvent) => {
      event.stopPropagation()
      if (event.touches.length === 2 && startDistance > 0) {
        event.preventDefault()
        const next = Math.min(4, Math.max(1, startScale * (distance(event.touches) / startDistance)))
        setScale(next)
      }
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
    }
  }, [])

  return { scale, frameRef }
}
