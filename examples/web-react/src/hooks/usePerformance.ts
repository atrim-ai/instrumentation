/**
 * React Hook for performance monitoring
 *
 * Tracks component render performance and Web Vitals
 */

import { useEffect, useRef } from 'react'
import { trace } from '@opentelemetry/api'

const tracer = trace.getTracer('atrim-platform-ui')

/**
 * Hook to measure component render time
 *
 * @param componentName - Name of the component
 *
 * @example
 * ```tsx
 * function ExpensiveComponent() {
 *   useRenderPerformance('ExpensiveComponent')
 *
 *   return <div>...</div>
 * }
 * ```
 */
export function useRenderPerformance(componentName: string) {
  const renderCount = useRef(0)
  const startTime = useRef(performance.now())

  useEffect(() => {
    const renderTime = performance.now() - startTime.current
    renderCount.current++

    // Create a span for this render
    const span = tracer.startSpan(`${componentName}.render`)
    span.setAttribute('component.name', componentName)
    span.setAttribute('render.count', renderCount.current)
    span.setAttribute('render.duration_ms', Math.round(renderTime))
    span.setStatus({ code: 1 }) // OK
    span.end()

    // Reset for next render
    startTime.current = performance.now()
  })
}

/**
 * Hook to track data fetching performance
 *
 * @param operationName - Name of the operation
 * @returns Function to wrap fetch operations
 *
 * @example
 * ```tsx
 * function UserList() {
 *   const trackFetch = useFetchPerformance('UserList.loadUsers')
 *
 *   const loadUsers = async () => {
 *     return trackFetch(async () => {
 *       const response = await fetch('/api/users')
 *       return response.json()
 *     })
 *   }
 * }
 * ```
 */
export function useFetchPerformance(operationName: string) {
  return async <T>(fetchFn: () => Promise<T>): Promise<T> => {
    return tracer.startActiveSpan(operationName, async (span) => {
      const startTime = performance.now()

      try {
        const result = await fetchFn()
        const duration = performance.now() - startTime

        span.setAttribute('fetch.duration_ms', Math.round(duration))
        span.setStatus({ code: 1 }) // OK

        return result
      } catch (error) {
        span.recordException(error as Error)
        span.setStatus({ code: 2 }) // ERROR
        throw error
      } finally {
        span.end()
      }
    })
  }
}

/**
 * Hook to track user interactions
 *
 * @param componentName - Name of the component
 * @returns Function to track interactions
 *
 * @example
 * ```tsx
 * function SearchBar() {
 *   const trackInteraction = useInteractionTracking('SearchBar')
 *
 *   const handleSearch = (query: string) => {
 *     trackInteraction('search', { 'search.query': query })
 *     // ... perform search
 *   }
 * }
 * ```
 */
export function useInteractionTracking(componentName: string) {
  return (action: string, attributes?: Record<string, string | number | boolean>) => {
    const span = tracer.startSpan(`${componentName}.${action}`)
    span.setAttribute('component.name', componentName)
    span.setAttribute('interaction.type', action)

    if (attributes) {
      for (const [key, value] of Object.entries(attributes)) {
        span.setAttribute(key, value)
      }
    }

    span.setStatus({ code: 1 }) // OK
    span.end()
  }
}
