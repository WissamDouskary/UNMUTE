import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiClient } from '@unmute/api-client';
import type { User } from '@unmute/api-client';
import {
  ShieldCheck,
  Key,
  Database,
  Server,
  RefreshCw,
  CheckCircle2,
  Clock,
  Sparkles,
  ArrowRight,
  Code2,
} from 'lucide-react';

export const DashboardPage: React.FC = () => {
  const { user, accessToken, refreshUser } = useAuth();

  const [testResult, setTestResult] = useState<User | null>(null);
  const [testLatency, setTestLatency] = useState<number | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);

  const handleTestMe = async () => {
    setIsTesting(true);
    setTestError(null);
    const start = performance.now();
    try {
      const data = await apiClient.getMe();
      const end = performance.now();
      setTestResult(data);
      setTestLatency(Math.round(end - start));
    } catch (err: unknown) {
      const e = err as { message?: string };
      setTestError(e?.message || 'Failed to call /api/v1/users/me');
    } finally {
      setIsTesting(false);
    }
  };

  const handleManualRefresh = async () => {
    setIsTesting(true);
    try {
      await refreshUser();
    } catch (err) {
      console.error(err);
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Welcome Hero */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[var(--color-surface-secondary)] to-[var(--color-surface-tertiary)] border border-[var(--color-border)] p-6 sm:p-8">
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--color-accent-muted)] text-[var(--color-accent-hover)] text-xs font-semibold mb-4">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Phase 1: Auth & Foundation Active</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[var(--color-text-primary)] tracking-tight">
            Welcome back, {user?.displayName || user?.email?.split('@')[0]}
          </h1>
          <p className="mt-2 text-sm sm:text-base text-[var(--color-text-secondary)] leading-relaxed">
            Your UNMUTE workspace is live. All interactions are secured with in-memory Bearer token rotation
            and backed by PostgreSQL persistence.
          </p>
        </div>

        {/* Decorative corner glow */}
        <div className="absolute right-0 top-0 -mt-12 -mr-12 w-64 h-64 bg-[var(--color-accent)] opacity-10 rounded-full blur-3xl pointer-events-none" />
      </div>

      {/* Security Architecture & Session Inspector Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card 1: Token Security Model */}
        <div className="rounded-2xl bg-[var(--color-surface-secondary)] border border-[var(--color-border)] p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
                Access Token State
              </span>
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
                <ShieldCheck className="w-5 h-5" />
              </div>
            </div>
            <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
              In-Memory Storage
            </h3>
            <p className="mt-1 text-xs text-[var(--color-text-secondary)] leading-relaxed">
              JWT access token is strictly isolated in React memory. It cannot be extracted by malicious XSS scripts via browser storage APIs.
            </p>
          </div>
          <div className="mt-4 pt-4 border-t border-[var(--color-border)] flex items-center justify-between text-xs">
            <span className="text-[var(--color-text-muted)]">Bearer Status:</span>
            <span className="font-mono text-emerald-400 font-medium">
              {accessToken ? 'Active (Loaded)' : 'Inactive'}
            </span>
          </div>
        </div>

        {/* Card 2: Refresh Token Rotation */}
        <div className="rounded-2xl bg-[var(--color-surface-secondary)] border border-[var(--color-border)] p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
                Refresh Strategy
              </span>
              <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400">
                <Key className="w-5 h-5" />
              </div>
            </div>
            <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
              Single-Use Rotation
            </h3>
            <p className="mt-1 text-xs text-[var(--color-text-secondary)] leading-relaxed">
              Stored in localStorage to restore sessions across reloads. Tokens are SHA-256 hashed in PostgreSQL; reusing a revoked token triggers instant revocation.
            </p>
          </div>
          <div className="mt-4 pt-4 border-t border-[var(--color-border)] flex items-center justify-between text-xs">
            <span className="text-[var(--color-text-muted)]">Session Recovery:</span>
            <span className="font-mono text-purple-400 font-medium">Enabled</span>
          </div>
        </div>

        {/* Card 3: Backend & Database Connection */}
        <div className="rounded-2xl bg-[var(--color-surface-secondary)] border border-[var(--color-border)] p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
                Database & API
              </span>
              <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400">
                <Database className="w-5 h-5" />
              </div>
            </div>
            <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
              PostgreSQL 16
            </h3>
            <p className="mt-1 text-xs text-[var(--color-text-secondary)] leading-relaxed">
              Persisted with Docker named volume <code className="text-xs text-[var(--color-accent-hover)] font-mono">unmute-pgdata</code>, managed via Flyway V1 & V2 migrations.
            </p>
          </div>
          <div className="mt-4 pt-4 border-t border-[var(--color-border)] flex items-center justify-between text-xs">
            <span className="text-[var(--color-text-muted)]">Engine:</span>
            <span className="font-mono text-blue-400 font-medium">Spring Boot 3.4.4</span>
          </div>
        </div>
      </div>

      {/* Live Interactive Endpoint Verification */}
      <div className="rounded-2xl bg-[var(--color-surface-secondary)] border border-[var(--color-border)] p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-[var(--color-accent)]" />
              <h2 className="text-base font-bold text-[var(--color-text-primary)]">
                Live Backend API Inspector
              </h2>
            </div>
            <p className="text-xs text-[var(--color-text-secondary)] mt-1">
              Verify authenticated communication directly between React Web and the Spring Boot backend.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleManualRefresh}
              disabled={isTesting}
              className="px-3 py-2 rounded-xl text-xs font-medium bg-[var(--color-surface-tertiary)] hover:bg-[var(--color-surface-elevated)] border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-white transition-colors flex items-center gap-2 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
              <span>Sync Profile</span>
            </button>

            <button
              onClick={handleTestMe}
              disabled={isTesting}
              className="px-4 py-2 rounded-xl text-xs font-medium bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white shadow-md shadow-[var(--color-accent-muted)] transition-all flex items-center gap-2 cursor-pointer"
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>Test GET /api/v1/users/me</span>
            </button>
          </div>
        </div>

        {testError && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-300">
            {testError}
          </div>
        )}

        {testResult ? (
          <div className="rounded-xl bg-[var(--color-surface-primary)] border border-[var(--color-border)] p-4">
            <div className="flex items-center justify-between mb-3 text-xs">
              <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                <CheckCircle2 className="w-4 h-4" />
                HTTP 200 OK — Authenticated via In-Memory Bearer Token
              </span>
              {testLatency !== null && (
                <span className="flex items-center gap-1 text-[var(--color-text-muted)] font-mono">
                  <Clock className="w-3.5 h-3.5" />
                  {testLatency}ms
                </span>
              )}
            </div>
            <pre className="text-xs font-mono text-[var(--color-text-primary)] overflow-x-auto p-3 rounded-lg bg-[var(--color-surface-secondary)] border border-[var(--color-border)]">
              {JSON.stringify(testResult, null, 2)}
            </pre>
          </div>
        ) : (
          <div className="text-center py-6 text-xs text-[var(--color-text-muted)] border border-dashed border-[var(--color-border)] rounded-xl">
            Click &quot;Test GET /api/v1/users/me&quot; above to perform an authenticated request with the current session.
          </div>
        )}
      </div>

      {/* Product Roadmap Overview */}
      <div className="space-y-4">
        <h2 className="text-base font-bold text-[var(--color-text-primary)]">
          System Roadmap & Next Phases
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="p-5 rounded-2xl bg-[var(--color-surface-secondary)] border border-emerald-500/30 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                  Phase 1.1 - 1.3
                </span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-semibold">
                  Complete
                </span>
              </div>
              <h3 className="font-semibold text-sm text-[var(--color-text-primary)]">
                Auth & Database Foundation
              </h3>
              <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                Dockerized Spring Boot, PostgreSQL, JWT rotation, in-memory client state, Login/Register pages.
              </p>
            </div>
            <div className="mt-4 flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
              <CheckCircle2 className="w-4 h-4" />
              <span>Verified & Live</span>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-[var(--color-surface-secondary)] border border-[var(--color-border)] hover:border-[var(--color-accent)] transition-colors flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-accent-hover)]">
                  Phase 2
                </span>
                <span className="px-2 py-0.5 rounded-full bg-[var(--color-accent-muted)] text-[var(--color-accent-hover)] text-[10px] font-semibold">
                  Up Next
                </span>
              </div>
              <h3 className="font-semibold text-sm text-[var(--color-text-primary)]">
                Notes & Knowledge Ingestion
              </h3>
              <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                Multi-format note creation, markdown editor, auto-tagging, and vector search embeddings.
              </p>
            </div>
            <div className="mt-4 flex items-center gap-1.5 text-xs text-[var(--color-accent-hover)] font-medium">
              <span>Readiness checked</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-[var(--color-surface-secondary)] border border-[var(--color-border)] opacity-70 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
                  Phase 3 & 4
                </span>
                <span className="px-2 py-0.5 rounded-full bg-[var(--color-surface-tertiary)] text-[var(--color-text-muted)] text-[10px] font-semibold">
                  Planned
                </span>
              </div>
              <h3 className="font-semibold text-sm text-[var(--color-text-primary)]">
                Action Engine & Mobile Sync
              </h3>
              <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                Task extraction, projects, reminders, and React Native iOS audio capture client.
              </p>
            </div>
            <div className="mt-4 flex items-center gap-1.5 text-xs text-[var(--color-text-muted)] font-medium">
              <span>Upcoming</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
