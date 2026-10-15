import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { GuestRoute } from './components/GuestRoute';
import { AppShell } from './components/AppShell';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { DashboardPage } from './pages/DashboardPage';
import { NotesPage } from './pages/NotesPage';
import { TasksPage } from './pages/TasksPage';
import { PlaceholderPage } from './pages/PlaceholderPage';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Guest Only Routes (Redirect to / if logged in) */}
          <Route element={<GuestRoute />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
          </Route>

          {/* Protected Routes (Require Authentication) */}
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<AppShell />}>
              <Route index element={<DashboardPage />} />
              <Route path="notes" element={<NotesPage />} />
              <Route path="tasks" element={<TasksPage />} />
              <Route
                path="projects"
                element={
                  <PlaceholderPage
                    title="Projects & Milestones"
                    description="Synthesize knowledge into structured project tracking."
                    phase="Phase 3"
                  />
                }
              />
              <Route
                path="sources"
                element={
                  <PlaceholderPage
                    title="Audio & Knowledge Sources"
                    description="Synchronize audio memos, transcripts, and external inputs."
                    phase="Phase 4"
                  />
                }
              />
              <Route
                path="settings"
                element={
                  <PlaceholderPage
                    title="Account & Security Settings"
                    description="Manage session keys, token revocation, and system preferences."
                    phase="Settings"
                  />
                }
              />
            </Route>
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
