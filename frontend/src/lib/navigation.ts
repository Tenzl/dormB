import type { Role } from '../types'

export const rolePath: Record<Role, string> = {
  ADMIN: '/admin',
  MERCHANT: '/merchant',
  SHIPPER: '/shipper',
  STUDENT: '/student',
}

export const pathRole = Object.fromEntries(
  Object.entries(rolePath).map(([role, path]) => [path, role]),
) as Record<string, Role>

export function navigate(path: string, replace = false) {
  if (window.location.pathname === path) return
  window.history[replace ? 'replaceState' : 'pushState']({}, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}
