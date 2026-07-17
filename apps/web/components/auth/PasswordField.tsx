'use client'

import { useState, type ChangeEvent, type CSSProperties } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { meetsPasswordRequirements, passwordRequirementsMessage } from '@/lib/passwordPolicy'

export { meetsPasswordRequirements, passwordRequirementsMessage } from '@/lib/passwordPolicy'

type PasswordFieldProps = {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  autoComplete: 'current-password' | 'new-password'
  error?: string
  disabled?: boolean
  minLength?: number
  showRequirements?: boolean
  reserveRequirements?: boolean
  inputAriaLabel?: string
  inputStyle?: CSSProperties
}

export default function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  error,
  disabled = false,
  minLength,
  showRequirements = false,
  reserveRequirements = false,
  inputAriaLabel,
  inputStyle,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false)
  const errorId = error ? `${id}-error` : undefined
  const requirementsId = showRequirements ? `${id}-requirements` : undefined
  const describedBy = [requirementsId, errorId].filter(Boolean).join(' ') || undefined
  const requirements = [
    { label: 'Usa al menos 8 caracteres', met: value.length >= 8 },
    { label: 'Usa al menos un número', met: /\d/.test(value) },
    { label: 'Usa al menos una mayúscula', met: /[A-ZÁÉÍÓÚÑ]/.test(value) },
  ]

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    onChange(event.target.value)
  }

  return (
    <div className="px-field">
      <label className="px-label" htmlFor={id}>{label}</label>
      <div className="px-passwordControl">
        <input
          id={id}
          className="px-input"
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={handleChange}
          autoComplete={autoComplete}
          aria-label={inputAriaLabel}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          disabled={disabled}
          minLength={minLength}
          style={inputStyle}
        />
        <button
          className="px-passwordToggle"
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          aria-pressed={visible}
          disabled={disabled}
        >
          {visible ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
        </button>
      </div>
      <div className="px-passwordErrorSlot">
        {error ? <p id={errorId} className="px-fieldError" role="alert">{error}</p> : null}
      </div>
      {showRequirements ? (
        <ul id={requirementsId} className="px-passwordRequirements" aria-label="Requisitos de contraseña">
          {requirements.map((requirement) => <li key={requirement.label} className={requirement.met ? 'is-met' : ''}><span aria-hidden="true">✓</span>{requirement.label}</li>)}
        </ul>
      ) : reserveRequirements ? <div className="px-passwordRequirementsSpacer" aria-hidden="true" /> : null}
    </div>
  )
}
