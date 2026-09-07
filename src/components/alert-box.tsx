import { jsx } from 'hono/jsx'

export interface AlertBoxProps {
  message: string
  title?: string
}

export const AlertBox = ({ message, title = 'Error' }: AlertBoxProps) => {
  return (
    <div class="alert-error" role="alert">
      <div class="alert-title">{title}</div>
      <div>{message}</div>
    </div>
  )
}
