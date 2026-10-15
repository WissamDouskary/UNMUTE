import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { apiClient } from '@unmute/api-client';
import type { User, LoginRequest, RegisterRequest, AuthResponse } from '@unmute/api-client';

/**
 * ============================================================================
 * UNMUTE Web Authentication Architecture & Security Strategy
 * ============================================================================
 *
 * 1. ACCESS TOKEN (In-Memory Only):
 *    - The JWT access token is stored strictly in React state and a synchronized
 *      ref. It is NEVER written to localStorage, sessionStorage, or client-accessible
 *      unprotected cookies.
 *    - Security Rationale: In the event of an XSS (Cross-Site Scripting) vulnerability,
 *      an attacker running arbitrary JavaScript cannot dump the access token from
 *      storage APIs.
 *
 * 2. REFRESH TOKEN (LocalStorage with Token Rotation & Cascade Revocation):
 *    - The refresh token is retained in localStorage under 'unmute_refresh_token'.
 *    - Security Trade-off: While storing refresh tokens in localStorage does expose
 *      them to XSS read risk, the backend mitigates this via strict SHA-256 hash
 *      storage and single-use rotation (every refresh burns the old token). If an
 *      attacker attempts to reuse a burned token, the backend's token-reuse detector
 *      automatically revokes the entire token family, killing all active sessions.
 *    - Lifecycle: On tab load or refresh, a silent refresh is triggered using this
 *      token to hydrate the user profile and obtain a fresh in-memory access token.
 * ============================================================================
 */

const REFRESH_TOKEN_KEY = 'unmute_refresh_token';

interface AuthContextType {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (credentials: LoginRequest) => Promise<void>;
  register: (payload: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Synchronized ref so ApiClient token getter always has zero-latency access to the current token
  const accessTokenRef = useRef<string | null>(null);
  accessTokenRef.current = accessToken;

  const handleAuthSuccess = useCallback((authData: AuthResponse) => {
    // 1. In-memory access token
    setAccessToken(authData.accessToken);
    accessTokenRef.current = authData.accessToken;

    // 2. Refresh token stored for session recovery across page reloads
    if (authData.refreshToken) {
      localStorage.setItem(REFRESH_TOKEN_KEY, authData.refreshToken);
    }

    // 3. User profile
    setUser(authData.user);
    setError(null);
  }, []);

  const handleLogoutLocal = useCallback(() => {
    setAccessToken(null);
    accessTokenRef.current = null;
    setUser(null);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  }, []);

  // Configure ApiClient with in-memory token getter
  useEffect(() => {
    apiClient.setTokenGetter(() => accessTokenRef.current);

    apiClient.setOnUnauthorized(async () => {
      // Automatic session recovery attempt on 401
      const storedRefreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
      if (!storedRefreshToken) {
        handleLogoutLocal();
        return;
      }

      try {
        const refreshed = await apiClient.refresh(storedRefreshToken);
        handleAuthSuccess(refreshed);
      } catch {
        handleLogoutLocal();
      }
    });
  }, [handleAuthSuccess, handleLogoutLocal]);

  // Silent session restoration on initial mount
  useEffect(() => {
    let isMounted = true;

    async function restoreSession() {
      const storedRefreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
      if (!storedRefreshToken) {
        if (isMounted) setIsLoading(false);
        return;
      }

      try {
        const response = await apiClient.refresh(storedRefreshToken);
        if (isMounted) {
          handleAuthSuccess(response);
        }
      } catch (err) {
        console.warn('Silent session restoration failed or token expired:', err);
        if (isMounted) {
          handleLogoutLocal();
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    restoreSession();

    return () => {
      isMounted = false;
    };
  }, [handleAuthSuccess, handleLogoutLocal]);

  const login = async (credentials: LoginRequest): Promise<void> => {
    setError(null);
    try {
      const response = await apiClient.login(credentials);
      handleAuthSuccess(response);
    } catch (err: unknown) {
      const apiErr = err as { message?: string; error?: string };
      const msg = apiErr?.message || 'Login failed. Please check your credentials.';
      setError(msg);
      throw err;
    }
  };

  const register = async (payload: RegisterRequest): Promise<void> => {
    setError(null);
    try {
      const response = await apiClient.register(payload);
      handleAuthSuccess(response);
    } catch (err: unknown) {
      const apiErr = err as { message?: string; error?: string };
      const msg = apiErr?.message || 'Registration failed. Please check your information.';
      setError(msg);
      throw err;
    }
  };

  const logout = async (): Promise<void> => {
    const currentRefreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    try {
      if (currentRefreshToken) {
        await apiClient.logout(currentRefreshToken);
      }
    } catch (err) {
      console.warn('Backend logout notification failed, proceeding with local clear:', err);
    } finally {
      handleLogoutLocal();
    }
  };

  const clearError = () => setError(null);

  const refreshUser = async (): Promise<void> => {
    try {
      const currentUser = await apiClient.getMe();
      setUser(currentUser);
    } catch (err) {
      console.error('Failed to refresh user profile:', err);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        accessToken,
        isAuthenticated: !!user && !!accessToken,
        isLoading,
        error,
        login,
        register,
        logout,
        clearError,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
