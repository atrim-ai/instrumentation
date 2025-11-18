/**
 * Main App Component with React Router
 *
 * Demonstrates route-based tracing and navigation tracking
 */

import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { trace } from '@opentelemetry/api'
import { annotateNavigation } from '@atrim/instrument-web'
import { ErrorBoundary } from './components/ErrorBoundary'
import { HomePage } from './pages/HomePage'
import { DashboardPage } from './pages/DashboardPage'
import { SettingsPage } from './pages/SettingsPage'
import './App.css'

const tracer = trace.getTracer('atrim-platform-ui')

/**
 * Navigation tracker component
 * Creates spans for route changes
 */
function NavigationTracker() {
  const location = useLocation()

  useEffect(() => {
    const span = tracer.startSpan('navigation.route-change')
    annotateNavigation(span, {
      to: location.pathname,
      type: 'client-side'
    })
    span.setAttribute('route.pathname', location.pathname)
    span.setAttribute('route.search', location.search)
    span.setAttribute('route.hash', location.hash)
    span.setStatus({ code: 1 }) // OK
    span.end()
  }, [location])

  return null
}

function AppContent() {
  return (
    <div className="app">
      <NavigationTracker />

      <nav className="navbar">
        <div className="nav-brand">Atrim Platform UI</div>
        <div className="nav-links">
          <Link to="/">Home</Link>
          <Link to="/dashboard">Dashboard</Link>
          <Link to="/settings">Settings</Link>
        </div>
      </nav>

      <main className="main-content">
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </ErrorBoundary>
      </main>

      <footer className="footer">
        <p>
          Instrumented with <strong>@atrim/instrument-web</strong>
        </p>
        <p>
          Traces sent to: <code>{import.meta.env.VITE_OTEL_EXPORTER_OTLP_ENDPOINT || 'localhost:4318'}</code>
        </p>
      </footer>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  )
}
