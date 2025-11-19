/**
 * Example: Button component with interaction tracking
 */

import { useInteractionTracking } from '../hooks/usePerformance'

interface TracedButtonProps {
  onClick: () => void | Promise<void>
  children: React.ReactNode
  actionName?: string
  className?: string
}

export function TracedButton({ onClick, children, actionName = 'click', className = '' }: TracedButtonProps) {
  const trackInteraction = useInteractionTracking('TracedButton')

  const handleClick = async () => {
    trackInteraction(actionName, {
      'button.label': String(children)
    })

    await onClick()
  }

  return (
    <button onClick={handleClick} className={className}>
      {children}
    </button>
  )
}
