/**
 * UNMUTE API Client — Environment-aware configuration.
 */

import type {
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
  Task,
  CreateTaskRequest,
  UpdateTaskRequest,
  BatchCreateTasksRequest,
  TaskListParams,
  SummarizeRequest,
  SummarizeResponse,
  ExtractTasksRequest,
  ExtractTasksResponse,
} from './types';

// Ambient declaration for process in environments without @types/node
declare const process:
  | {
      env?: {
        EXPO_PUBLIC_API_BASE_URL?: string;
        VITE_API_BASE_URL?: string;
        [key: string]: string | undefined;
      };
    }
  | undefined;

export function resolveBaseUrl(): string {
  // 1. Expo inlines process.env.EXPO_PUBLIC_* at build time (static member access required for Babel/Metro)
  try {
    if (typeof process !== 'undefined' && process?.env) {
      if (process.env.EXPO_PUBLIC_API_BASE_URL) {
        return process.env.EXPO_PUBLIC_API_BASE_URL;
      }
      if (process.env.VITE_API_BASE_URL) {
        return process.env.VITE_API_BASE_URL;
      }
    }
  } catch {
    // Ignore environments where process is undefined or restricted
  }

  // 2. Check if running in a web browser environment via standard globalThis
  const isBrowser =
    typeof globalThis !== 'undefined' &&
    typeof (globalThis as { window?: { document?: unknown } }).window !== 'undefined' &&
    typeof (globalThis as { document?: unknown }).document !== 'undefined';

  if (isBrowser) {
    // In browser, relative URL '' lets Vite dev proxy or Nginx forward to backend
    return '';
  }

  // 3. Native mobile (React Native / iOS Simulator / Android) fallback
  // React Native fetch() requires an absolute URL; relative paths throw a Network Error.
  return 'http://localhost:8080';
}

export interface ApiClientConfig {
  baseUrl?: string;
  getAccessToken?: () => string | null;
  onUnauthorized?: () => void;
}

export class ApiClient {
  private baseUrl: string;
  private getAccessToken: () => string | null;
  private onUnauthorized?: () => void;

  constructor(config: ApiClientConfig = {}) {
    this.baseUrl = config.baseUrl ?? resolveBaseUrl();
    this.getAccessToken = config.getAccessToken ?? (() => null);
    this.onUnauthorized = config.onUnauthorized;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  setBaseUrl(baseUrl: string): void {
    this.baseUrl = baseUrl;
  }

  setTokenGetter(getter: () => string | null): void {
    this.getAccessToken = getter;
  }

  setOnUnauthorized(callback: () => void): void {
    this.onUnauthorized = callback;
  }

  private buildUrl(path: string): string {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    if (!this.baseUrl || this.baseUrl === '') {
      return cleanPath;
    }
    const cleanBase = this.baseUrl.replace(/\/+$/, '');
    return `${cleanBase}${cleanPath}`;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = this.buildUrl(path);
    const token = this.getAccessToken();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) ?? {}),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      let errorBody: ApiError;
      try {
        errorBody = (await response.json()) as ApiError;
      } catch {
        errorBody = { status: response.status, message: response.statusText || `HTTP ${response.status}` };
      }

      if (response.status === 401 && this.onUnauthorized) {
        this.onUnauthorized();
      }

      throw errorBody;
    }

    // 204 No Content
    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'GET' });
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  delete<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'DELETE' });
  }

  // --- Convenience Endpoints ---

  getHealth(): Promise<{ status: string }> {
    return this.get<{ status: string }>('/actuator/health');
  }

  register(data: RegisterRequest): Promise<AuthResponse> {
    return this.post<AuthResponse>('/api/v1/auth/register', data);
  }

  login(data: LoginRequest): Promise<AuthResponse> {
    return this.post<AuthResponse>('/api/v1/auth/login', data);
  }

  refresh(refreshToken: string): Promise<AuthResponse> {
    const payload: RefreshTokenRequest = { refreshToken };
    return this.post<AuthResponse>('/api/v1/auth/refresh', payload);
  }

  logout(refreshToken?: string): Promise<void> {
    const payload = refreshToken ? { refreshToken } : undefined;
    return this.post<void>('/api/v1/auth/logout', payload);
  }

  getMe(): Promise<User> {
    return this.get<User>('/api/v1/users/me');
  }

  // --- Notes Endpoints ---

  getNotes(params: NoteListParams = {}): Promise<PageResponse<Note>> {
    const query = new URLSearchParams();
    if (params.archived !== undefined) {
      query.set('archived', String(params.archived));
    }
    if (params.search) {
      query.set('search', params.search);
    }
    if (params.tag) {
      query.set('tag', params.tag);
    }
    if (params.page !== undefined) {
      query.set('page', String(params.page));
    }
    if (params.size !== undefined) {
      query.set('size', String(params.size));
    }

    const queryString = query.toString();
    const path = queryString ? `/api/v1/notes?${queryString}` : '/api/v1/notes';
    return this.get<PageResponse<Note>>(path);
  }

  getNote(id: string): Promise<Note> {
    return this.get<Note>(`/api/v1/notes/${id}`);
  }

  createNote(data: CreateNoteRequest): Promise<Note> {
    return this.post<Note>('/api/v1/notes', data);
  }

  updateNote(id: string, data: UpdateNoteRequest): Promise<Note> {
    return this.put<Note>(`/api/v1/notes/${id}`, data);
  }

  toggleArchiveNote(id: string): Promise<Note> {
    return this.patch<Note>(`/api/v1/notes/${id}/archive`);
  }

  togglePinNote(id: string): Promise<Note> {
    return this.patch<Note>(`/api/v1/notes/${id}/pin`);
  }

  deleteNote(id: string): Promise<void> {
    return this.delete<void>(`/api/v1/notes/${id}`);
  }

  getNoteTags(): Promise<string[]> {
    return this.get<string[]>('/api/v1/notes/tags');
  }

  // --- Tasks Endpoints ---

  getTasks(params: TaskListParams = {}): Promise<Task[]> {
    const query = new URLSearchParams();
    if (params.completed !== undefined) {
      query.set('completed', String(params.completed));
    }
    if (params.noteId) {
      query.set('noteId', params.noteId);
    }
    if (params.priority) {
      query.set('priority', params.priority);
    }
    const queryString = query.toString();
    const path = queryString ? `/api/v1/tasks?${queryString}` : '/api/v1/tasks';
    return this.get<Task[]>(path);
  }

  getTask(id: string): Promise<Task> {
    return this.get<Task>(`/api/v1/tasks/${id}`);
  }

  createTask(data: CreateTaskRequest): Promise<Task> {
    return this.post<Task>('/api/v1/tasks', data);
  }

  createTasksBatch(data: BatchCreateTasksRequest): Promise<Task[]> {
    return this.post<Task[]>('/api/v1/tasks/batch', data);
  }

  updateTask(id: string, data: UpdateTaskRequest): Promise<Task> {
    return this.put<Task>(`/api/v1/tasks/${id}`, data);
  }

  toggleTaskCompleted(id: string): Promise<Task> {
    return this.patch<Task>(`/api/v1/tasks/${id}/toggle`);
  }

  deleteTask(id: string): Promise<void> {
    return this.delete<void>(`/api/v1/tasks/${id}`);
  }

  getTasksForNote(noteId: string): Promise<Task[]> {
    return this.get<Task[]>(`/api/v1/tasks/note/${noteId}`);
  }

  // --- AI Processing Endpoints ---

  summarizeContent(data: SummarizeRequest): Promise<SummarizeResponse> {
    return this.post<SummarizeResponse>('/api/v1/ai/summarize', data);
  }

  extractTasksFromContent(data: ExtractTasksRequest): Promise<ExtractTasksResponse> {
    return this.post<ExtractTasksResponse>('/api/v1/ai/extract-tasks', data);
  }
}

export const apiClient = new ApiClient();
