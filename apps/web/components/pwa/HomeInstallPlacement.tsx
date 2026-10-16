'use client'

import { createContext, useCallback, useContext, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { HOME_MOBILE_PILOT_ENABLED } from '@/lib/homeMobilePilot'
import PwaInstallInvitation from '@/components/pwa/PwaInstallInvitation'
import homePilot from '@/components/home/HomeMobilePilot.module.css'

const Target = createContext<HTMLDivElement | null>(null)
const Placement = createContext<Dispatch<SetStateAction<HTMLDivElement | null>> | null>(null)

export function HomeInstallProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLDivElement | null>(null)
  return <Placement.Provider value={setTarget}><Target.Provider value={target}>{children}</Target.Provider></Placement.Provider>
}

export function HomeInstallSlot() {
  const setTarget = useContext(Placement)
  const attach = useCallback((node: HTMLDivElement | null) => { setTarget?.(node) }, [setTarget])
  if (!HOME_MOBILE_PILOT_ENABLED || !setTarget) return null
  return <div ref={attach} className={homePilot.installSlot} />
}

export function HomeInstallHost() {
  const target = useContext(Target)
  // This single host stays mounted across navigation. Only its DOM placement
  // changes, preserving deferred native capability and dismissal state.
  return <PwaInstallInvitation compact={HOME_MOBILE_PILOT_ENABLED} target={target} />
}
