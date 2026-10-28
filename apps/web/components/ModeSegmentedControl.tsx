'use client'

import type { Ref } from 'react'

export type HomeMode = 'space' | 'community'

export default function ModeSegmentedControl({
  value,
  onChange,
  rootRef,
  asButtons = false,
  connected = false,
}: {
  value: HomeMode
  onChange: (value: HomeMode) => void
  rootRef?: Ref<HTMLDivElement>
  asButtons?: boolean
  connected?: boolean
}) {
  return (
    <>
      <div ref={rootRef} className="homeModeSwitch" data-connected={connected || undefined} role={asButtons ? 'group' : 'tablist'} aria-label="Modo de inicio">
        <button
          type="button"
          role={asButtons ? undefined : 'tab'}
          aria-selected={asButtons ? undefined : value === 'space'}
          aria-pressed={asButtons ? value === 'space' : undefined}
          className={value === 'space' ? 'is-active' : ''}
          onClick={() => onChange('space')}
        >
          Mi espacio
        </button>
        <button
          type="button"
          role={asButtons ? undefined : 'tab'}
          aria-selected={asButtons ? undefined : value === 'community'}
          aria-pressed={asButtons ? value === 'community' : undefined}
          className={value === 'community' ? 'is-active' : ''}
          onClick={() => onChange('community')}
        >
          Comunidad SELPA
        </button>
      </div>
      <style>{`
        .homeModeSwitch {
          background: #0a1f3b;
          border: 0;
          border-radius: 10px;
          display: grid;
          box-sizing: border-box;
          gap: 5px;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          justify-self: stretch;
          max-width: none;
          padding: 3px;
          width: 100%;
          min-width: 100%;
        }
        .homeModeSwitch button {
          background: transparent;
          border: 0;
          border-radius: 8px;
          color: #c3d3e2;
          cursor: pointer;
          font: inherit;
          font-size: 13px;
          font-weight: 650;
          min-height: 44px;
          padding: 10px 18px;
          position: relative;
          transition: background .24s cubic-bezier(.2,.8,.2,1), box-shadow .24s cubic-bezier(.2,.8,.2,1), color .2s ease, transform .2s ease;
          white-space: nowrap;
          z-index: 1;
        }
        .homeModeSwitch button.is-active {
          background: var(--club-primary, #0e7490);
          box-shadow: inset 0 0 0 1px rgba(255,255,255,.2);
          color: #fff;
        }
        .homeModeSwitch button:nth-child(2).is-active { background:linear-gradient(110deg,#155d79,#62405f); box-shadow:inset 0 -2px #22d3ee,inset 0 1px #ec4899; }
        @media (max-width: 560px) {
          .homeModeSwitch {
            padding: 3px;
            justify-self: stretch;
            width: 100%;
          }
          .homeModeSwitch button {
            font-size: 12px;
            min-height: 44px;
            padding: 7px 8px;
          }
        }
        @media (max-width: 380px) {
          .homeModeSwitch button {
            font-size: 11px;
          }
        }
        .homeModeSwitch[data-connected] { background: transparent; padding: 0; gap: 4px; }
        .homeModeSwitch[data-connected] button:not(.is-active) { background: #0a1f3b; }
        .homeModeSwitch[data-connected] button.is-active { border-bottom-left-radius: 0; border-bottom-right-radius: 0; box-shadow: none; }
        .homeModeSwitch button:focus-visible { outline: 2px solid #0896ad; outline-offset: -2px; }
        @media (prefers-reduced-motion: reduce) { .homeModeSwitch button { transition: none; } }
      `}</style>
    </>
  )
}
