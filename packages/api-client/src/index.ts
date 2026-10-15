import { apiClient } from './client';

export { ApiClient, apiClient, resolveBaseUrl } from './client';
export type { ApiClientConfig } from './client';
export type {
  User,
  AuthResponse,
  RegisterRequest,
  LoginRequest,
  RefreshTokenRequest,
  ApiError,
  Note,
  CreateNoteRequest,
  UpdateNoteRequest,
  PageResponse,
  NoteListParams,
} from './types';

export default apiClient;
