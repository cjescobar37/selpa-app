import countriesData from '@/data/countries.json'
import locationsData from '@/data/argentina-locations.json'

export type Country = { code: string; name: string }
export type ArgentinaCity = { id: string; name: string; departmentId: string; departmentName: string }
export type ArgentinaProvince = { id: string; name: string; cities: ArgentinaCity[] }

export const countries = countriesData as Country[]
export const argentinaLocations = locationsData as ArgentinaProvince[]

export function findArgentinaLocation(provinceId: string, cityId: string) {
  const province = argentinaLocations.find((item) => item.id === provinceId)
  const city = province?.cities.find((item) => item.id === cityId)
  return province && city ? { province, city } : null
}
