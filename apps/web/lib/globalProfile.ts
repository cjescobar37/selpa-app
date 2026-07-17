export type GlobalProfile = {
  first_name: string | null
  last_name: string | null
  display_name: string | null
  birth_date: string | null
  gender: string | null
  country_code: string | null
  country: string | null
  province_id: string | null
  province: string | null
  city_id: string | null
  city: string | null
  height_cm: number | null
  dominant_hand: string | null
  preferred_position: string | null
  avatar_url: string | null
  cover_url: string | null
  phone_country_code: string | null
  phone_area_code: string | null
  phone_number: string | null
  phone_e164: string | null
}

export const globalProfileFields = 'first_name,last_name,display_name,birth_date,gender,country_code,country,province_id,province,city_id,city,height_cm,dominant_hand,preferred_position,avatar_url,cover_url,phone_country_code,phone_area_code,phone_number,phone_e164'

function hasValue(value: string | null | undefined) {
  return Boolean(value?.trim())
}

export function isPersonalProfileComplete(profile: GlobalProfile | null | undefined) {
  if (!profile) return false

  return (
    hasValue(profile.first_name) &&
    hasValue(profile.last_name) &&
    hasValue(profile.phone_e164) &&
    hasValue(profile.birth_date) &&
    (profile.gender === 'FEMALE' || profile.gender === 'MALE') &&
    hasValue(profile.country_code) &&
    hasValue(profile.province_id) &&
    hasValue(profile.city_id)
  )
}

export function isSportsProfileComplete(profile: GlobalProfile | null | undefined) {
  if (!profile) return false

  return (
    (profile.dominant_hand === 'RIGHT' || profile.dominant_hand === 'LEFT' || profile.dominant_hand === 'AMBIDEXTROUS') &&
    (profile.preferred_position === 'DRIVE' || profile.preferred_position === 'REVES' || profile.preferred_position === 'BOTH')
  )
}

export function isGlobalProfileComplete(profile: GlobalProfile | null | undefined) {
  // El perfil deportivo es intencionalmente progresivo: no bloquea la primera
  // experiencia ni la solicitud de ingreso a clubes.
  return isPersonalProfileComplete(profile)
}
