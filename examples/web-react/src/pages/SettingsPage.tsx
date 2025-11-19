/**
 * Example: Settings page with form interactions
 */

import { useState } from 'react'
import { useInteractionTracking } from '../hooks/usePerformance'
import { TracedButton } from '../components/TracedButton'

export function SettingsPage() {
  const [settings, setSettings] = useState({
    enableNotifications: true,
    darkMode: false,
    autoRefresh: true
  })

  const trackInteraction = useInteractionTracking('SettingsPage')

  const handleToggle = (setting: keyof typeof settings) => {
    trackInteraction('toggle-setting', {
      'setting.name': setting,
      'setting.value': !settings[setting]
    })

    setSettings((prev) => ({
      ...prev,
      [setting]: !prev[setting]
    }))
  }

  const handleSave = async () => {
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 500))
    trackInteraction('save-settings', {
      'settings.notifications': settings.enableNotifications,
      'settings.darkMode': settings.darkMode,
      'settings.autoRefresh': settings.autoRefresh
    })
    alert('Settings saved!')
  }

  return (
    <div className="page">
      <h1>Settings</h1>

      <div className="card">
        <h2>Preferences</h2>

        <div className="settings-list">
          <label className="setting-item">
            <input
              type="checkbox"
              checked={settings.enableNotifications}
              onChange={() => handleToggle('enableNotifications')}
            />
            <span>Enable Notifications</span>
          </label>

          <label className="setting-item">
            <input
              type="checkbox"
              checked={settings.darkMode}
              onChange={() => handleToggle('darkMode')}
            />
            <span>Dark Mode</span>
          </label>

          <label className="setting-item">
            <input
              type="checkbox"
              checked={settings.autoRefresh}
              onChange={() => handleToggle('autoRefresh')}
            />
            <span>Auto Refresh Dashboard</span>
          </label>
        </div>

        <TracedButton onClick={handleSave} actionName="save-settings" className="save-btn">
          Save Settings
        </TracedButton>
      </div>
    </div>
  )
}
