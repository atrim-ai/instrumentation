/**
 * Example: Error boundary with OpenTelemetry integration
 */

import { Component, ReactNode } from 'react'
import { trace } from '@opentelemetry/api'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

const tracer = trace.getTracer('atrim-platform-ui')

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Create a span for the error
    const span = tracer.startSpan('ErrorBoundary.componentError')

    span.setAttribute('error.message', error.message)
    span.setAttribute('error.name', error.name)
    span.setAttribute('error.stack', error.stack || '')
    span.setAttribute('error.componentStack', errorInfo.componentStack || '')

    span.recordException(error)
    span.setStatus({ code: 2 }) // ERROR
    span.end()

    console.error('React Error Boundary caught error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="card error">
            <h2>Something went wrong</h2>
            <p className="error-message">{this.state.error?.message}</p>
            <button onClick={() => this.setState({ hasError: false, error: null })}>Try Again</button>
          </div>
        )
      )
    }

    return this.props.children
  }
}
