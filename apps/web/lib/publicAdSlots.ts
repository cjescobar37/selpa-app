export type PublicAdSlotId =
  | 'home_ad_left_6x3'
  | 'home_ad_right_6x3'
  | 'home_after_news_wide'
  | 'home_news_right'
  | 'home_calendar_inline'
  | 'home_footer_strip'

export type PublicAdSlotConfig = {
  id: PublicAdSlotId
  label: string
  ratio: string
  description: string
  recommendedSize: string
  className: string
}

export const PUBLIC_AD_SLOTS: PublicAdSlotConfig[] = [
  {
    id: 'home_ad_left_6x3',
    label: 'Banner publicitario izquierdo',
    ratio: '6:3',
    description: 'Slot fijo 50% para publicidad principal de la Home pública.',
    recommendedSize: '1200 x 600 px',
    className: 'is-half',
  },
  {
    id: 'home_ad_right_6x3',
    label: 'Banner publicitario derecho',
    ratio: '6:3',
    description: 'Slot fijo 50% para publicidad secundaria de la Home pública.',
    recommendedSize: '1200 x 600 px',
    className: 'is-half',
  },
  {
    id: 'home_after_news_wide',
    label: 'Banner principal inferior',
    ratio: '12:3',
    description: 'Horizontal wide para marcas principales debajo de noticias.',
    recommendedSize: '1440 x 360 px',
    className: 'is-wide',
  },
  {
    id: 'home_news_right',
    label: 'Banner lateral noticias',
    ratio: '6:9',
    description: 'Vertical para presencia lateral asociada al bloque editorial.',
    recommendedSize: '720 x 1080 px',
    className: 'is-vertical',
  },
  {
    id: 'home_calendar_inline',
    label: 'Banner entre torneos',
    ratio: '6:2',
    description: 'Horizontal chico para acompañar la agenda competitiva.',
    recommendedSize: '900 x 300 px',
    className: 'is-inline',
  },
  {
    id: 'home_footer_strip',
    label: 'Banner inferior',
    ratio: '12:2',
    description: 'Strip inferior para sponsors persistentes.',
    recommendedSize: '1440 x 240 px',
    className: 'is-strip',
  },
]

export function getPublicAdSlot(slotId: PublicAdSlotId) {
  return PUBLIC_AD_SLOTS.find((slot) => slot.id === slotId) ?? PUBLIC_AD_SLOTS[0]
}
