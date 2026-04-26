import type { ClassValue } from 'clsx'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Thousands grouping with ASCII commas only (no `Intl` / locale).
 * Use for SSR’d UI so server and client markup always match.
 */
export function formatIntegerGrouped(value: number): string {
  const n = Math.trunc(value)
  const sign = n < 0 ? '-' : ''
  const digits = String(Math.abs(n))
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}
