import PlayerModuleHero from './PlayerModuleHero'

type PlayerModuleKpi = { label: string; value: number }

export default function PlayerModuleHeader({ kpis }: {
  kpis: [PlayerModuleKpi, PlayerModuleKpi, PlayerModuleKpi]
}) {
  return (
    <div className="clubPlayerModuleHeader">
      <PlayerModuleHero kpis={kpis} />

      <style jsx>{`
        .clubPlayerModuleHeader {
          width: 100%;
        }
      `}</style>
    </div>
  )
}
