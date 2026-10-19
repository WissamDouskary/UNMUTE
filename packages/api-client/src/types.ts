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
  googleEventId?: string | null;
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
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
  kind?: 'TASK' | 'EVENT';
  startAt?: string | null;
  endAt?: string | null;
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

export type SourceStatus = 'PENDING' | 'TRANSCRIBING' | 'EXTRACTING' | 'READY' | 'COMPLETED' | 'FAILED';

export interface ReviewTask {
  title: string;
  description: string;
}

export interface ReviewPayload {
  summary: string;
  tasks: ReviewTask[];
  tags: string[];
}

export interface ApproveCaptureRequest {
  title: string;
  body: string;
  tasks: ReviewTask[];
  tags: string[];
}

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
  reviewPayload?: ReviewPayload | null;
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

export interface ChatSessionSummary {
  id: string;
  title: string;
  updatedAt: string;
  preview: string | null;
}

export interface ChatThreadMessage {
  id: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  citations: Citation[];
  createdAt: string;
}

export interface ChatSessionDetail {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatThreadMessage[];
}

export interface ChatTurn {
  session: ChatSessionSummary;
  userMessage: ChatThreadMessage;
  assistantMessage: ChatThreadMessage;
}

// --- Knowledge Graph ---

export type GraphNodeType = 'NOTE' | 'TASK' | 'SOURCE' | 'TAG';

export type GraphEdgeType = 'TASK_OF_NOTE' | 'SOURCE_OF_NOTE' | 'NOTE_TAGGED' | 'RELATED_TO';

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
  /** EXPLICIT for saved foreign keys. ACCEPTED for a reviewed suggestion. */
  origin?: string | null;
}

export interface GraphSuggestion {
  id: string;
  sourceKey: string;
  targetKey: string;
  sourceLabel?: string | null;
  targetLabel?: string | null;
  relationType: string;
  explanation: string;
  evidence?: string | null;
  origin: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  createdAt: string;
}

export interface GraphTopology {
  nodes: GraphNode[];
  edges: GraphEdge[];
  generatedAt: string;
}

export interface GraphTopologyParams {
  includeArchived?: boolean;
  includeTags?: boolean;
  /** Omit to include every relationship. */
  relationTypes?: GraphEdgeType[];
}

// --- Live Events (Server-Sent Events) ---

export interface NoteTaggedEvent {
  noteId: string;
  addedTags: string[];
  tags: string[];
}

export interface NoteTagFailedEvent {
  noteId: string;
  message: string;
}

export interface NoteCreatedEvent {
  noteId: string;
  title: string;
  sourceId: string | null;
}

export interface SourceUpdatedEvent {
  sourceId: string;
  status: SourceStatus;
  noteId: string | null;
}

export interface CalendarUpdatedEvent {
  changed: boolean;
}

export interface CalendarAttendee {
  email?: string | null;
  name?: string | null;
}

export interface CalendarEvent {
  googleEventId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  attendees: CalendarAttendee[];
  description?: string | null;
  htmlLink?: string | null;
  status: string;
  taskId?: string | null;
}

export interface CalendarStatus {
  connected: boolean;
}

export interface AgendaResponse {
  events: CalendarEvent[];
}

export interface BriefingTask {
  id: string;
  title: string;
  priority: TaskPriority;
  dueDate?: string | null;
  noteId?: string | null;
  noteTitle?: string | null;
}

export interface BriefingDeadline {
  googleEventId: string;
  title: string;
  startsAt: string;
  endsAt: string;
}

export interface BriefingCalendar {
  connected: boolean;
  deadlines: BriefingDeadline[];
  deadlineCount: number;
}

export interface BriefingAttention {
  kind: 'capture' | 'note';
  id: string;
  title: string;
  reason: 'Ready for review' | 'Failed' | 'No task yet';
}

export interface BriefingResponse {
  focus: BriefingTask | null;
  nextTasks: BriefingTask[];
  openCount: number;
  dueTodayCount: number;
  calendar: BriefingCalendar;
  attention: BriefingAttention[];
  readyCount: number;
  readingCount: number;
}

export interface BlockCalendarRequest {
  taskId: string;
  start: string;
  end: string;
}

export interface MeetingNoteResponse {
  noteId: string;
}

export type LiveEvent =
  | { type: 'note.tagged'; data: NoteTaggedEvent }
  | { type: 'note.tag-failed'; data: NoteTagFailedEvent }
  | { type: 'note.created'; data: NoteCreatedEvent }
  | { type: 'source.updated'; data: SourceUpdatedEvent }
  | { type: 'calendar.updated'; data: CalendarUpdatedEvent };

export type LiveEventType = LiveEvent['type'];

export type LiveConnectionStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';

export interface LiveEventHandlers {
  onEvent: (event: LiveEvent) => void;
  /** `reconnected` is true when the stream reopens after a drop, so callers can resync missed state. */
  onStatusChange?: (status: LiveConnectionStatus, reconnected: boolean) => void;
}

