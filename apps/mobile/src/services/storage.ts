import * as SecureStore from 'expo-secure-store';
import type { User } from '@unmute/api-client';

const ACCESS_TOKEN_KEY = 'unmute_mobile_access_token';
const REFRESH_TOKEN_KEY = 'unmute_mobile_refresh_token';
const USER_KEY = 'unmute_mobile_user';

/**
 * Native Mobile Secure Storage Adapter
 *
 * Persists sensitive credentials in the platform's hardware-backed
 * keystore (iOS Keychain, Android KeyStore via expo-secure-store).
 */
export const mobileStorage = {
  async setTokens(accessToken: string, refreshToken: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken);
      await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);
    } catch (e) {
      console.warn('SecureStore setTokens failed:', e);
    }
  },

  async getAccessToken(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
    } catch (e) {
      console.warn('SecureStore getAccessToken failed:', e);
      return null;
    }
  },

  async getRefreshToken(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
    } catch (e) {
      console.warn('SecureStore getRefreshToken failed:', e);
      return null;
    }
  },

  async setUser(user: User): Promise<void> {
    try {
      await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
    } catch (e) {
      console.warn('SecureStore setUser failed:', e);
    }
  },

  async getUser(): Promise<User | null> {
    try {
      const raw = await SecureStore.getItemAsync(USER_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as User;
    } catch (e) {
      console.warn('SecureStore getUser failed:', e);
      return null;
    }
  },

  async clearAuth(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
      await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
      await SecureStore.deleteItemAsync(USER_KEY);
    } catch (e) {
      console.warn('SecureStore clearAuth failed:', e);
    }
  },
};
