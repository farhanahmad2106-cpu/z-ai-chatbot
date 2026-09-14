import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { AuthProvider } from './context/AuthContext'
import { AdminAuthProvider } from './context/AdminAuthContext'
import { UserStatsProvider } from './context/UserStatsContext'
import { UserProfileProvider } from './context/UserProfileContext'
import { ToastProvider } from './context/ToastContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <AdminAuthProvider>
        <ToastProvider>
          <UserStatsProvider>
            <UserProfileProvider>
              <App />
            </UserProfileProvider>
          </UserStatsProvider>
        </ToastProvider>
      </AdminAuthProvider>
    </AuthProvider>
  </StrictMode>,
)