import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/** Popup’ı body’ye taşır — üst başlık kesilmesin / stacking context bozulmasın */
export function DrawerPortal({ children }: { children: ReactNode }) {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  return createPortal(children, document.body)
}

export function DrawerShell({
  onClose,
  eyebrow,
  title,
  wide,
  children,
}: {
  onClose: () => void
  eyebrow?: string
  title: string
  wide?: boolean
  children: ReactNode
}) {
  return (
    <DrawerPortal>
      <div className="drawer-backdrop" onClick={onClose} role="presentation">
        <aside
          className={`drawer ${wide ? 'wide' : ''}`}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
        >
          <header className="drawer-head">
            <div>
              {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
              <h2>{title}</h2>
            </div>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Kapat">
              ✕
            </button>
          </header>
          <div className="drawer-body">{children}</div>
        </aside>
      </div>
    </DrawerPortal>
  )
}
