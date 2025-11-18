/**
 * React Hook for creating traced operations
 *
 * This hook provides an easy way to trace async operations in React components
 */

import { useCallback } from 'react'
import { trace, Span, SpanStatusCode } from '@opentelemetry/api'

const tracer = trace.getTracer('atrim-platform-ui')

/**
 * Hook to trace async operations
 *
 * @param spanName - Name of the span (e.g., "UserProfile.load")
 * @returns Function to execute traced operations
 *
 * @example
 * ```tsx
 * function UserProfile() {
 *   const traceOperation = useTraceSpan('UserProfile.load')
 *
 *   const loadUser = async (userId: string) => {
 *     return traceOperation(async (span) => {
 *       span.setAttribute('user.id', userId)
 *       const user = await fetchUser(userId)
 *       span.setAttribute('user.role', user.role)
 *       return user
 *     })
 *   }
 * }
 * ```
 */
export function useTraceSpan(spanName: string) {
  return useCallback(
    async <T>(operation: (span: Span) => Promise<T>): Promise<T> => {
      return tracer.startActiveSpan(spanName, async (span) => {
        try {
          const result = await operation(span)
          span.setStatus({ code: SpanStatusCode.OK })
          return result
        } catch (error) {
          span.recordException(error as Error)
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: (error as Error).message
          })
          throw error
        } finally {
          span.end()
        }
      })
    },
    [spanName]
  )
}

/**
 * Hook to create a manual span for component lifecycle tracking
 *
 * @param componentName - Name of the component
 * @returns Object with startSpan and endSpan functions
 *
 * @example
 * ```tsx
 * function Dashboard() {
 *   const { startSpan, endSpan } = useComponentTrace('Dashboard')
 *
 *   useEffect(() => {
 *     const span = startSpan('render')
 *     span.setAttribute('view', 'overview')
 *
 *     return () => endSpan(span)
 *   }, [])
 * }
 * ```
 */
export function useComponentTrace(componentName: string) {
  const startSpan = useCallback(
    (action: string) => {
      return tracer.startSpan(`${componentName}.${action}`)
    },
    [componentName]
  )

  const endSpan = useCallback((span: Span, success = true) => {
    span.setStatus({ code: success ? SpanStatusCode.OK : SpanStatusCode.ERROR })
    span.end()
  }, [])

  return { startSpan, endSpan }
}
