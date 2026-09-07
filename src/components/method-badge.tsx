import { jsx } from 'hono/jsx'

export interface MethodBadgeProps {
  method: string
  class?: string
}

export const MethodBadge = ({ method, class: customClass = '' }: MethodBadgeProps) => {
  const normalized = method.toLowerCase()
  return (
    <span class={`method-badge ${normalized} ${customClass}`}>
      {method.toUpperCase()}
    </span>
  )
}
