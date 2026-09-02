'use client'

export type HomeMode = 'space' | 'community'

export default function ModeSegmentedControl({
  value,
  onChange,
}: {
  value: HomeMode
  onChange: (value: HomeMode) => void
}) {
  return (
    <>
      <div className="homeModeSwitch" role="tablist" aria-label="Modo de inicio">
        <button
          type="button"
          role="tab"
          aria-selected={value === 'space'}
          className={value === 'space' ? 'is-active' : ''}
          onClick={() => onChange('space')}
        >
          Mi espacio
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={value === 'community'}
          className={value === 'community' ? 'is-active' : ''}
          onClick={() => onChange('community')}
        >
          Comunidad SELPA
        </button>
      </div>
      <style>{`
        .homeModeSwitch {
          background: rgba(255,255,255,.78);
          backdrop-filter: blur(18px);
          border: 1px solid rgba(226,232,240,.95);
          border-radius: 999px;
          box-shadow: 0 18px 42px rgba(15,23,42,.10), inset 0 1px 0 rgba(255,255,255,.75);
          display: grid;
          box-sizing: border-box;
          gap: 5px;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          justify-self: stretch;
          max-width: none;
          padding: 6px;
          width: 100%;
          min-width: 100%;
        }
        .homeModeSwitch button {
          background: transparent;
          border: 0;
          border-radius: 999px;
          color: #475569;
          cursor: pointer;
          font: inherit;
          font-size: 13px;
          font-weight: 950;
          min-height: 42px;
          padding: 10px 18px;
          position: relative;
          transition: background .24s cubic-bezier(.2,.8,.2,1), box-shadow .24s cubic-bezier(.2,.8,.2,1), color .2s ease, transform .2s ease;
          white-space: nowrap;
          z-index: 1;
        }
        .homeModeSwitch button.is-active {
          background: linear-gradient(135deg, #061b3a, #0a1f44);
          box-shadow: 0 12px 26px rgba(15,23,42,.22), inset 0 1px 0 rgba(255,255,255,.10);
          color: #fff;
          transform: translateY(-1px);
        }
        @media (max-width: 560px) {
          .homeModeSwitch {
            box-shadow: 0 10px 24px rgba(15,23,42,.08), inset 0 1px 0 rgba(255,255,255,.72);
            padding: 4px;
            justify-self: stretch;
            width: 100%;
          }
          .homeModeSwitch button {
            font-size: 12px;
            min-height: 34px;
            padding: 7px 8px;
          }
        }
        @media (max-width: 380px) {
          .homeModeSwitch button {
            font-size: 11px;
          }
        }
      `}</style>
    </>
  )
}
