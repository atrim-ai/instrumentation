/**
 * Example: Home page with traced operations
 */

import { useEffect } from 'react'
import { useComponentTrace } from '../hooks/useTraceSpan'
import { UserProfile } from '../components/UserProfile'

export function HomePage() {
  const { startSpan, endSpan } = useComponentTrace('HomePage')

  useEffect(() => {
    const span = startSpan('mount')
    span.setAttribute('page.name', 'home')
    span.setAttribute('page.path', window.location.pathname)

    return () => endSpan(span)
  }, [startSpan, endSpan])

  return (
    <div className="page">
      <h1>Atrim Platform UI - Instrumentation Example</h1>

      <div className="info-card">
        <h3>OpenTelemetry Auto-Instrumentation Active</h3>
        <ul>
          <li>✅ Page load metrics captured</li>
          <li>✅ All fetch() calls traced automatically</li>
          <li>✅ User interactions (clicks, navigation) tracked</li>
          <li>✅ Component lifecycle traced</li>
          <li>✅ Error tracking with Error Boundary</li>
        </ul>
      </div>

      <UserProfile />
    </div>
  )
}
