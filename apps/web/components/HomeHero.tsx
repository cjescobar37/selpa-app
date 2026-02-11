'use client'

import React from 'react'

type Player = {
  rank: number
  name: string
  countryCode: string
  points: number
  pairedWith: string
  birthDate: string
  height: string
  bornIn: string
  avatarUrl: string
  photoUrl: string
  coach?: string | null
}

export default function HomeHero({ player }: { player: Player }) {
  return (
    <>
      <section className="hero">
        <div className="hero__grid">
          <div>
            <div className="hero__rankBig">{player.rank}</div>
            <div className="hero__name">{player.name}</div>

            <div className="hero__bar">
              <div className="hero__flag" />
              <div className="hero__code">{player.countryCode}</div>
              <div className="hero__points">Points {player.points}</div>
            </div>

            <div className="hero__partner">
              <img className="hero__avatar" src={player.avatarUrl} alt="Partner" />
              <div>
                <div className="hero__partnerLabel">Paired with</div>
                <div className="hero__partnerName">{player.pairedWith}</div>
              </div>
            </div>
          </div>

          <div
            className="hero__photoWrap"
           style={{ "--hero-photo": `url(${player.photoUrl})` } as React.CSSProperties}
            aria-label={`${player.name} photo`}
          />
        </div>
      </section>

      <section className="metaRow">
        <div className="metaCell">
          <div className="metaLabel">Date of birth</div>
          <div className="metaValue">{player.birthDate}</div>
        </div>

        <div className="metaCell">
          <div className="metaLabel">Height</div>
          <div className="metaValue">{player.height}</div>
        </div>

        <div className="metaCell">
          <div className="metaLabel">Born in</div>
          <div className="metaValue">{player.bornIn}</div>
        </div>

        <div className="metaCell">
          <div className="metaLabel">Coach</div>
          <div className="metaValue">{player.coach ?? '—'}</div>
        </div>
      </section>
    </>
  )
}
