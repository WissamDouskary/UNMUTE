export interface User {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  user: User;
}

export interface RegisterRequest {
  email: string;
  password: string;
  displayName: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface ApiError {
  status: number;
  message: string;
  errors?: Record<string, string[]>;
  timestamp?: string;
}

export interface Note {
  id: string;
  title: string;
  content: string | null;
  summary: string | null;
  isPinned: boolean;
  isArchived: boolean;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateNoteRequest {
  title: string;
  content?: string;
  tags?: string[];
  isPinned?: boolean;
}

export interface UpdateNoteRequest {
  title?: string;
  content?: string;
  summary?: string;
  tags?: string[];
  isPinned?: boolean;
  isArchived?: boolean;
}

export interface PageResponse<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  first: boolean;
  last: boolean;
}

export interface NoteListParams {
  archived?: boolean;
  search?: string;
  tag?: string;
  page?: number;
  size?: number;
}

export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface Task {
  id: string;
  userId: string;
  noteId?: string | null;
  noteTitle?: string | null;
  title: string;
  description?: string | null;
  isCompleted: boolean;
  priority: TaskPriority;
  dueDate?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaskRequest {
  title: string;
  description?: string;
  noteId?: string;
  priority?: TaskPriority;
  dueDate?: string;
}

export interface UpdateTaskRequest {
  title?: string;
  description?: string;
  noteId?: string;
  isCompleted?: boolean;
  priority?: TaskPriority;
  dueDate?: string;
}

export interface BatchCreateTasksRequest {
  noteId?: string;
  tasks: CreateTaskRequest[];
}

export interface TaskListParams {
  completed?: boolean;
  noteId?: string;
  priority?: TaskPriority;
}

export interface SummarizeRequest {
  content: string;
  noteId?: string;
}

export interface SummarizeResponse {
  summary: string;
  keyPoints: string[];
}

export interface ExtractedTaskItem {
  title: string;
  description?: string;
  priority: TaskPriority;
  dueDate?: string;
  savedTaskId?: string | null;
}

export interface ExtractTasksRequest {
  content: string;
  noteId?: string;
  saveToTasks?: boolean;
}

export interface ExtractTasksResponse {
  tasks: ExtractedTaskItem[];
  count: number;
}

export type SourceStatus = 'PENDING' | 'TRANSCRIBING' | 'COMPLETED' | 'FAILED';

export interface Source {
  id: string;
  filename: string;
  originalName: string;
  fileType: string;
  fileSize: number;
  status: SourceStatus;
  transcript?: string | null;
  durationSeconds?: number | null;
  errorMessage?: string | null;
  noteId?: string | null;
  noteTitle?: string | null;
  createdAt: string;
  updatedAt: string;
}

// --- Semantic Search & Ask UNMUTE (RAG) ---

export interface SemanticSearchResult {
  noteId: string;
  title: string;
  content: string | null;
  summary: string | null;
  similarity: number;
  tags: string[];
  updatedAt: string;
}

export interface SemanticSearchRequest {
  query: string;
  limit?: number;
}

export interface Citation {
  noteId: string;
  title: string;
  snippet: string;
  similarity: number;
}

export interface AskRequest {
  question: string;
  topK?: number;
}

export interface AskResponse {
  answer: string;
  citations: Citation[];
}

// --- Knowledge Graph ---

export type GraphNodeType = 'NOTE' | 'TASK' | 'SOURCE' | 'TAG';

export type GraphEdgeType = 'TASK_OF_NOTE' | 'SOURCE_OF_NOTE' | 'NOTE_TAGGED';

export interface GraphNode {
  /** Type-prefixed key, e.g. `note:<uuid>` or `tag:<name>`. */
  id: string;
  /** Backing row id; absent for tags. */
  entityId?: string | null;
  type: GraphNodeType;
  label: string;
  /** NOTE: ACTIVE | PINNED | ARCHIVED, TASK: OPEN | COMPLETED, SOURCE: SourceStatus, TAG: absent. */
  status?: string | null;
  priority?: TaskPriority | null;
  updatedAt?: string | null;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: GraphEdgeType;
}

export interface GraphTopology {
  nodes: GraphNode[];
  edges: GraphEdge[];
  generatedAt: string;
}

export interface GraphTopologyParams {
  includeArchived?: boolean;
  includeTags?: boolean;
}

