import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { apiClient } from '@unmute/api-client';
import type { User, LoginRequest, RegisterRequest, AuthResponse } from '@unmute/api-client';
import { mobileStorage } from '../services/storage';
import { UnmuteShareInbox, uploadStagedShare } from '../capture/shareInbox';

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

  const accessTokenRef = useRef<string | null>(null);
  accessTokenRef.current = accessToken;

  const handleAuthSuccess = useCallback(async (authData: AuthResponse) => {
    setAccessToken(authData.accessToken);
    accessTokenRef.current = authData.accessToken;
    setUser(authData.user);
    setError(null);

    // Persist securely to native Keychain / KeyStore
    await mobileStorage.setTokens(authData.accessToken, authData.refreshToken);
    await mobileStorage.setUser(authData.user);

    try {
      const ids = await UnmuteShareInbox.list();
      if (Array.isArray(ids)) {
        for (const shareId of ids) {
          try {
            await uploadStagedShare(shareId);
          } catch (err) {
            console.warn('Pending share upload failed:', err);
          }
        }
      }
    } catch (err) {
      console.warn('Pending share list failed:', err);
    }
  }, []);

  const handleLogoutLocal = useCallback(async () => {
    setAccessToken(null);
    accessTokenRef.current = null;
    setUser(null);
    await mobileStorage.clearAuth();
  }, []);

  // Configure ApiClient for mobile runtime
  useEffect(() => {
    apiClient.setTokenGetter(() => accessTokenRef.current);

    apiClient.setOnUnauthorized(async () => {
      const storedRefreshToken = await mobileStorage.getRefreshToken();
      if (!storedRefreshToken) {
        await handleLogoutLocal();
        return;
      }

      try {
        const refreshed = await apiClient.refresh(storedRefreshToken);
        await handleAuthSuccess(refreshed);
      } catch {
        await handleLogoutLocal();
      }
    });
  }, [handleAuthSuccess, handleLogoutLocal]);

  // Silent session restoration on app boot
  useEffect(() => {
    let isMounted = true;

    async function restoreSession() {
      try {
        const storedRefreshToken = await mobileStorage.getRefreshToken();
        if (!storedRefreshToken) {
          if (isMounted) setIsLoading(false);
          return;
        }

        const response = await apiClient.refresh(storedRefreshToken);
        if (isMounted) {
          await handleAuthSuccess(response);
        }
      } catch (err) {
        console.warn('Mobile silent session recovery failed:', err);
        if (isMounted) {
          await handleLogoutLocal();
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
      await handleAuthSuccess(response);
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
      await handleAuthSuccess(response);
    } catch (err: unknown) {
      const apiErr = err as { message?: string; error?: string };
      const msg = apiErr?.message || 'Registration failed. Please check your information.';
      setError(msg);
      throw err;
    }
  };

  const logout = async (): Promise<void> => {
    const currentRefreshToken = await mobileStorage.getRefreshToken();
    try {
      if (currentRefreshToken) {
        await apiClient.logout(currentRefreshToken);
      }
    } catch (err) {
      console.warn('Backend logout notification failed, clearing local storage:', err);
    } finally {
      await handleLogoutLocal();
    }
  };

  const clearError = () => setError(null);

  const refreshUser = async (): Promise<void> => {
    try {
      const currentUser = await apiClient.getMe();
      setUser(currentUser);
      await mobileStorage.setUser(currentUser);
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
  return context as AuthContextType;
}
