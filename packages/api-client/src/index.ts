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
  TaskPriority,
  Task,
  CreateTaskRequest,
  UpdateTaskRequest,
  BatchCreateTasksRequest,
  TaskListParams,
  SummarizeRequest,
  SummarizeResponse,
  ExtractedTaskItem,
  ExtractTasksRequest,
  ExtractTasksResponse,
  SourceStatus,
  Source,
  SemanticSearchResult,
  SemanticSearchRequest,
  Citation,
  AskRequest,
  AskResponse,
  GraphNodeType,
  GraphEdgeType,
  GraphNode,
  GraphEdge,
  GraphTopology,
  GraphTopologyParams,
} from './types';


export default apiClient;
