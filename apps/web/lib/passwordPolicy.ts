export const passwordRequirementsMessage = 'Usá 8 caracteres, una mayúscula y un número.'

export function meetsPasswordRequirements(value: string) {
  return value.length >= 8 && /[A-ZÁÉÍÓÚÑ]/.test(value) && /\d/.test(value)
}
