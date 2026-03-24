import React, { Suspense } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useAuthStore } from '@/store/authStore'

// Lazy-loaded page components
const Landing = React.lazy(() => import('@/pages/Landing'))
const Auth = React.lazy(() => import('@/pages/Auth'))
const Role = React.lazy(() => import('@/pages/Role'))
const ProfessionalOnboarding = React.lazy(() => import('@/pages/onboarding/Professional'))
const ClientOnboarding = React.lazy(() => import('@/pages/onboarding/Client'))
const ProfessionalDashboard = React.lazy(() => import('@/pages/dashboard/ProfessionalDashboard'))
const ClientDashboard = React.lazy(() => import('@/pages/dashboard/ClientDashboard'))
const NewOpportunity = React.lazy(() => import('@/pages/NewOpportunity'))
const ProfilePage = React.lazy(() => import('@/pages/Profile'))
const Analytics = React.lazy(() => import('@/pages/Analytics'))
const Seed = React.lazy(() => import('@/pages/admin/Seed'))
const AdminDiagnostics = React.lazy(() => import('@/pages/AdminDiagnostics'))
const AdminValidation = React.lazy(() => import('@/pages/admin/Validation'))

// ─── Loading fallback ────────────────────────────────────────────────────────

function FullScreenLoader() {
  return (
    <div
      style={{ backgroundColor: '#0C0C0C' }}
      className="fixed inset-0 flex items-center justify-center"
    >
      <div className="flex flex-col items-center gap-4">
        <div
          className="w-10 h-10 rounded-full border-2 border-transparent animate-spin"
          style={{
            borderTopColor: '#E8FF47',
            borderRightColor: '#E8FF47',
          }}
        />
        <span className="text-sm" style={{ color: '#888888' }}>
          Loading...
        </span>
      </div>
    </div>
  )
}

// ─── RequireAuth ─────────────────────────────────────────────────────────────

interface RequireAuthProps {
  children: React.ReactNode
  requireRole?: boolean | 'professional' | 'client'
  requireOnboarding?: boolean
}

function RequireAuth({ children, requireRole, requireOnboarding }: RequireAuthProps) {
  const { user, profile, initialized } = useAuthStore()

  // Parent handles the global loading screen; return null here while not ready
  if (!initialized) return null

  // Not authenticated — send to auth
  if (!user) {
    return <Navigate to="/auth" replace />
  }

  // requireRole=true means we just need *any* role set
  if (requireRole === true && !profile?.role) {
    return <Navigate to="/role" replace />
  }

  // requireRole='professional'|'client' means we need that *specific* role
  if (
    typeof requireRole === 'string' &&
    profile?.role !== requireRole
  ) {
    return <Navigate to="/dashboard" replace />
  }

  // requireOnboarding: if onboarding_complete === true, always go to dashboard
  // Only redirect to onboarding if role is set AND onboarding_complete is explicitly false
  if (requireOnboarding && profile) {
    if (profile.onboarding_complete === true) {
      // Already onboarded — allow through
    } else if (profile.role && profile.onboarding_complete === false) {
      const destination =
        profile.role === 'professional'
          ? '/onboarding/professional'
          : '/onboarding/client'
      return <Navigate to={destination} replace />
    } else if (!profile.role) {
      return <Navigate to="/role" replace />
    }
  }

  return <>{children}</>
}

// ─── DashboardRedirect ───────────────────────────────────────────────────────

function DashboardRedirect() {
  const { profile } = useAuthStore()

  if (profile?.role === 'professional') {
    return <Navigate to="/dashboard/professional" replace />
  }
  if (profile?.role === 'client') {
    return <Navigate to="/dashboard/client" replace />
  }
  return <Navigate to="/role" replace />
}

// ─── AuthRedirect — wraps /auth to skip it when already onboarded ─────────────

function AuthRoute() {
  const { user, profile, initialized } = useAuthStore()

  if (!initialized) return null

  if (user && profile?.onboarding_complete) {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <Suspense fallback={<FullScreenLoader />}>
      <Auth />
    </Suspense>
  )
}

// ─── App ─────────────────────────────────────────────────────────────────────

export default function App() {
  // Initialize auth listener at top level — runs once
  useAuth()

  const { initialized } = useAuthStore()

  // Global loading screen until auth state is known
  if (!initialized) {
    return <FullScreenLoader />
  }

  return (
    <Suspense fallback={<FullScreenLoader />}>
      <Routes>
        {/* Public */}
        <Route path="/" element={<Landing />} />
        <Route path="/auth" element={<AuthRoute />} />

        {/* Role selection — requires login only */}
        <Route
          path="/role"
          element={
            <RequireAuth>
              <Role />
            </RequireAuth>
          }
        />

        {/* Onboarding — requires login + role chosen */}
        <Route
          path="/onboarding/professional"
          element={
            <RequireAuth requireRole="professional">
              <ProfessionalOnboarding />
            </RequireAuth>
          }
        />
        <Route
          path="/onboarding/client"
          element={
            <RequireAuth requireRole="client">
              <ClientOnboarding />
            </RequireAuth>
          }
        />

        {/* Dashboard hub — redirects to role-specific dashboard */}
        <Route
          path="/dashboard"
          element={
            <RequireAuth requireOnboarding>
              <DashboardRedirect />
            </RequireAuth>
          }
        />

        {/* Role-specific dashboards */}
        <Route
          path="/dashboard/professional"
          element={
            <RequireAuth requireOnboarding requireRole="professional">
              <ProfessionalDashboard />
            </RequireAuth>
          }
        />
        <Route
          path="/dashboard/client"
          element={
            <RequireAuth requireOnboarding requireRole="client">
              <ClientDashboard />
            </RequireAuth>
          }
        />

        {/* Client-only pages */}
        <Route
          path="/opportunities/new"
          element={
            <RequireAuth requireOnboarding requireRole="client">
              <NewOpportunity />
            </RequireAuth>
          }
        />
        <Route
          path="/analytics"
          element={
            <RequireAuth requireOnboarding requireRole="client">
              <Analytics />
            </RequireAuth>
          }
        />

        {/* Professional-only pages */}
        <Route
          path="/profile"
          element={
            <RequireAuth requireOnboarding requireRole="professional">
              <ProfilePage />
            </RequireAuth>
          }
        />

        {/* Admin */}
        <Route
          path="/admin/seed"
          element={
            <RequireAuth>
              <Seed />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/diagnostics"
          element={
            <RequireAuth>
              <AdminDiagnostics />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/validation"
          element={
            <RequireAuth>
              <AdminValidation />
            </RequireAuth>
          }
        />

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
