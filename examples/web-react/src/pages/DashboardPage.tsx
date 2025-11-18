/**
 * Example: Dashboard page with multiple traced operations
 */

import { useState, useEffect } from 'react'
import { useTraceSpan } from '../hooks/useTraceSpan'
import { useRenderPerformance } from '../hooks/usePerformance'
import { TracedButton } from '../components/TracedButton'

interface MetricData {
  name: string
  value: number
  unit: string
}

export function DashboardPage() {
  useRenderPerformance('DashboardPage')

  const [metrics, setMetrics] = useState<MetricData[]>([])
  const [loading, setLoading] = useState(false)

  const traceLoadMetrics = useTraceSpan('Dashboard.loadMetrics')

  const loadMetrics = async () => {
    setLoading(true)

    try {
      await traceLoadMetrics(async (span) => {
        span.setAttribute('dashboard.view', 'overview')

        // Simulate loading metrics
        await new Promise((resolve) => setTimeout(resolve, 500))

        const mockMetrics: MetricData[] = [
          { name: 'Active Users', value: 1234, unit: 'users' },
          { name: 'Total Traces', value: 45678, unit: 'traces' },
          { name: 'Avg Response Time', value: 123, unit: 'ms' },
          { name: 'Error Rate', value: 0.5, unit: '%' }
        ]

        span.setAttribute('metrics.count', mockMetrics.length)
        setMetrics(mockMetrics)
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadMetrics()
  }, [])

  return (
    <div className="page">
      <h1>Dashboard</h1>

      {loading ? (
        <p>Loading metrics...</p>
      ) : (
        <div className="metrics-grid">
          {metrics.map((metric) => (
            <div key={metric.name} className="metric-card">
              <h3>{metric.name}</h3>
              <div className="metric-value">
                {metric.value.toLocaleString()} <span className="unit">{metric.unit}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <TracedButton onClick={loadMetrics} actionName="refresh-metrics" className="refresh-btn">
        Refresh Metrics
      </TracedButton>
    </div>
  )
}
