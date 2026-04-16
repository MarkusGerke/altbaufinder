import { useEffect, useRef, useCallback } from 'react'

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string
          callback: (token: string) => void
          'expired-callback'?: () => void
          'error-callback'?: () => void
        }
      ) => string
      remove?: (widgetId: string) => void
      reset?: (widgetId: string) => void
    }
  }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

function loadTurnstileScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  if (window.turnstile) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src^="${SCRIPT_SRC.split('?')[0]}"]`)
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('Turnstile')), { once: true })
      return
    }
    const s = document.createElement('script')
    s.src = SCRIPT_SRC
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Turnstile-Laden fehlgeschlagen'))
    document.head.appendChild(s)
  })
}

interface TurnstileWidgetProps {
  siteKey: string
  onToken: (token: string | null) => void
}

/** Sichtbares Turnstile-Feld; bei fehlendem Site-Key nicht rendern. */
export function TurnstileWidget({ siteKey, onToken }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)
  const onTokenRef = useRef(onToken)
  onTokenRef.current = onToken
  const clear = useCallback(() => onTokenRef.current(null), [])

  useEffect(() => {
    if (!siteKey || !containerRef.current) return undefined

    let cancelled = false
    void loadTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile?.render) return
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          callback: (t) => onTokenRef.current(t),
          'expired-callback': clear,
          'error-callback': clear,
        })
      })
      .catch(() => clear())

    return () => {
      cancelled = true
      const id = widgetIdRef.current
      widgetIdRef.current = null
      if (id && window.turnstile?.remove) {
        try {
          window.turnstile.remove(id)
        } catch {
          /* ignore */
        }
      }
      clear()
    }
  }, [siteKey, clear])

  return <div ref={containerRef} className="min-h-[65px]" />
}
