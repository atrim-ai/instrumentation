/**
 * Example: User profile component with data fetching tracing
 */

import { useState, useEffect } from 'react'
import { useTraceSpan } from '../hooks/useTraceSpan'
import { useRenderPerformance } from '../hooks/usePerformance'
import { TracedButton } from './TracedButton'

interface User {
  id: number
  name: string
  email: string
  company: {
    name: string
  }
}

export function UserProfile() {
  useRenderPerformance('UserProfile')

  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const traceOperation = useTraceSpan('UserProfile.loadUser')

  const loadUser = async () => {
    setLoading(true)
    setError(null)

    try {
      await traceOperation(async (span) => {
        const userId = Math.floor(Math.random() * 10) + 1
        span.setAttribute('user.id', userId)

        const response = await fetch(`https://jsonplaceholder.typicode.com/users/${userId}`)

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const data = await response.json()
        span.setAttribute('user.name', data.name)
        span.setAttribute('user.company', data.company.name)

        setUser(data)
      })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadUser()
  }, [])

  if (loading) {
    return (
      <div className="card">
        <h2>User Profile</h2>
        <p>Loading user data...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="card error">
        <h2>User Profile</h2>
        <p className="error-message">Error: {error}</p>
        <TracedButton onClick={loadUser} actionName="retry">
          Retry
        </TracedButton>
      </div>
    )
  }

  if (!user) {
    return null
  }

  return (
    <div className="card">
      <h2>User Profile</h2>
      <div className="user-info">
        <p>
          <strong>Name:</strong> {user.name}
        </p>
        <p>
          <strong>Email:</strong> {user.email}
        </p>
        <p>
          <strong>Company:</strong> {user.company.name}
        </p>
      </div>
      <TracedButton onClick={loadUser} actionName="refresh">
        Load Different User
      </TracedButton>
    </div>
  )
}
