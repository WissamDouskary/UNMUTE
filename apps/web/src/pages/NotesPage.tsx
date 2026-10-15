import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Search,
  Pin,
  PinOff,
  Archive,
  ArchiveRestore,
  Trash2,
  Check,
  Loader2,
  Tag as TagIcon,
  X,
  FileText,
  Clock,
  Sparkles,
  ChevronRight,
  ChevronDown,
  CheckSquare,
  ArrowUpRight,
  AlertCircle,
} from 'lucide-react';
import { apiClient, Note, Task } from '@unmute/api-client';
import { RichTextEditor } from '../components/RichTextEditor';

type FilterTab = 'all' | 'pinned' | 'archived';
type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error';

export function NotesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // --- Filtering & Selection State ---
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // --- Active Note Form State ---
  const [title, setTitle] = useState<string>('');
  const [content, setContent] = useState<string>('');
  const [tags, setTags] = useState<string[]>([]);
  const [isPinned, setIsPinned] = useState<boolean>(false);
  const [isArchived, setIsArchived] = useState<boolean>(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');

  // --- AI & Task Integration State ---
  const [isAiLoading, setIsAiLoading] = useState<boolean>(false);
  const [aiNotification, setAiNotification] = useState<{
    message: string;
    type: 'success' | 'info' | 'error';
  } | null>(null);
  const [showAiMenu, setShowAiMenu] = useState<boolean>(false);
  const [showLinkedTasksDrawer, setShowLinkedTasksDrawer] = useState<boolean>(false);
  const [newLinkedTaskTitle, setNewLinkedTaskTitle] = useState<string>('');

  // --- UI Modals/Popovers ---
  const [showTagInput, setShowTagInput] = useState<boolean>(false);
  const [newTagText, setNewTagText] = useState<string>('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // --- Synchronization & Save Timers / Refs ---
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const currentNoteIdRef = useRef<string | null>(null);
  const pendingSaveNoteIdRef = useRef<string | null>(null);
  const pendingSaveRef = useRef<{
    id: string;
    title: string;
    content: string;
    tags: string[];
    isPinned: boolean;
    isArchived: boolean;
  } | null>(null);

  const selectedNoteIdRef = useRef<string | null>(selectedNoteId);
  selectedNoteIdRef.current = selectedNoteId;

  const titleRef = useRef<string>(title);
  titleRef.current = title;

  const contentRef = useRef<string>(content);
  contentRef.current = content;

  const tagsRef = useRef<string[]>(tags);
  tagsRef.current = tags;

  const isPinnedRef = useRef<boolean>(isPinned);
  isPinnedRef.current = isPinned;

  const isArchivedRef = useRef<boolean>(isArchived);
  isArchivedRef.current = isArchived;

  // 1. TanStack Query: Fetch Notes with keepPreviousData to prevent UI flashes on filter switch
  const notesQueryKey = ['notes', { activeTab, searchQuery, selectedTag }];

  const { data: notesData, isLoading: loading } = useQuery({
    queryKey: notesQueryKey,
    queryFn: async () => {
      const response = await apiClient.getNotes({
        archived: activeTab === 'archived',
        search: searchQuery.trim() || undefined,
        tag: selectedTag || undefined,
        size: 50,
      });

      let fetched = response.content;
      if (activeTab === 'pinned') {
        fetched = fetched.filter((n) => n.isPinned);
      }
      return fetched;
    },
    placeholderData: keepPreviousData,
  });

  const notes = useMemo(() => notesData ?? [], [notesData]);

  // 2. TanStack Query: Fetch Available Tags
  const { data: availableTags = [] } = useQuery({
    queryKey: ['tags'],
    queryFn: () => apiClient.getNoteTags(),
  });

  // If currently filtered tag no longer exists in available tags, reset to null (#all)
  useEffect(() => {
    if (selectedTag && availableTags.length > 0 && !availableTags.includes(selectedTag)) {
      setSelectedTag(null);
    }
  }, [availableTags, selectedTag]);

  // Ensure a valid note is selected whenever the notes list changes
  useEffect(() => {
    const first = notes[0];
    if (first) {
      if (!selectedNoteId || !notes.some((n) => n.id === selectedNoteId)) {
        setSelectedNoteId(first.id);
      }
    } else {
      setSelectedNoteId(null);
    }
  }, [notes, selectedNoteId]);

  // Active Note reference
  const activeNote = useMemo(() => {
    return notes.find((n) => n.id === selectedNoteId) || null;
  }, [notes, selectedNoteId]);

  const activeNoteRef = useRef<Note | null>(activeNote);
  activeNoteRef.current = activeNote;

  // --- Auto-Save Mutation ---
  const updateNoteMutation = useMutation({
    mutationFn: ({
      noteId,
      payload,
    }: {
      noteId: string;
      payload: { title: string; content: string; tags: string[]; isPinned: boolean; isArchived: boolean };
    }) => apiClient.updateNote(noteId, payload),
    onMutate: () => {
      setSaveStatus('saving');
    },
    onSuccess: (updated) => {
      queryClient.setQueriesData<Note[]>({ queryKey: ['notes'] }, (old) => {
        if (!old) return [];
        return old.map((n) => (n.id === updated.id ? updated : n));
      });
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      setSaveStatus('saved');
    },
    onError: (err) => {
      console.error('Error saving note:', err);
      setSaveStatus('error');
    },
  });

  const updateNoteMutationRef = useRef(updateNoteMutation);
  updateNoteMutationRef.current = updateNoteMutation;

  const performSave = useCallback(
    (
      noteId: string,
      payload: {
        title: string;
        content: string;
        tags: string[];
        isPinned: boolean;
        isArchived: boolean;
      }
    ) => {
      const titleToSave = payload.title.trim() || 'Untitled';
      updateNoteMutationRef.current.mutate({
        noteId,
        payload: {
          title: titleToSave,
          content: payload.content,
          tags: payload.tags,
          isPinned: payload.isPinned,
          isArchived: payload.isArchived,
        },
      });
    },
    []
  );

  const flushPendingSave = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    if (pendingSaveNoteIdRef.current && pendingSaveRef.current) {
      const idToSave = pendingSaveNoteIdRef.current;
      const dataToSave = { ...pendingSaveRef.current };
      pendingSaveNoteIdRef.current = null;
      pendingSaveRef.current = null;
      performSave(idToSave, dataToSave);
    }
  }, [performSave]);

  const triggerAutoSave = useCallback(
    (
      overrides?: Partial<{
        title: string;
        content: string;
        tags: string[];
        isPinned: boolean;
        isArchived: boolean;
      }>
    ) => {
      const currentId = selectedNoteIdRef.current;
      if (!currentId) return;

      setSaveStatus('unsaved');
      pendingSaveNoteIdRef.current = currentId;
      pendingSaveRef.current = {
        id: currentId,
        title: overrides?.title !== undefined ? overrides.title : titleRef.current,
        content: overrides?.content !== undefined ? overrides.content : contentRef.current,
        tags: overrides?.tags !== undefined ? overrides.tags : tagsRef.current,
        isPinned: overrides?.isPinned !== undefined ? overrides.isPinned : isPinnedRef.current,
        isArchived: overrides?.isArchived !== undefined ? overrides.isArchived : isArchivedRef.current,
      };

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(() => {
        if (pendingSaveNoteIdRef.current && pendingSaveRef.current) {
          const idToSave = pendingSaveNoteIdRef.current;
          const payload = { ...pendingSaveRef.current };
          pendingSaveNoteIdRef.current = null;
          pendingSaveRef.current = null;
          performSave(idToSave, payload);
        }
      }, 1200);
    },
    [performSave]
  );

  // Switch Note synchronization: Flush pending changes from previous note, then cleanly load new note
  useEffect(() => {
    if (selectedNoteId !== currentNoteIdRef.current) {
      if (
        currentNoteIdRef.current &&
        pendingSaveNoteIdRef.current === currentNoteIdRef.current &&
        pendingSaveRef.current
      ) {
        const idToSave = pendingSaveNoteIdRef.current;
        const dataToSave = { ...pendingSaveRef.current };
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
          saveTimeoutRef.current = null;
        }
        pendingSaveNoteIdRef.current = null;
        pendingSaveRef.current = null;
        performSave(idToSave, dataToSave);
      } else {
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
          saveTimeoutRef.current = null;
        }
        pendingSaveNoteIdRef.current = null;
        pendingSaveRef.current = null;
      }

      currentNoteIdRef.current = selectedNoteId;

      if (activeNote) {
        setTitle(activeNote.title || '');
        titleRef.current = activeNote.title || '';
        setContent(activeNote.content || '');
        contentRef.current = activeNote.content || '';
        setTags(activeNote.tags || []);
        tagsRef.current = activeNote.tags || [];
        setIsPinned(activeNote.isPinned);
        isPinnedRef.current = activeNote.isPinned;
        setIsArchived(activeNote.isArchived);
        isArchivedRef.current = activeNote.isArchived;
        setSaveStatus('saved');
      } else {
        setTitle('');
        titleRef.current = '';
        setContent('');
        contentRef.current = '';
        setTags([]);
        tagsRef.current = [];
        setIsPinned(false);
        isPinnedRef.current = false;
        setIsArchived(false);
        isArchivedRef.current = false;
        setSaveStatus('saved');
      }
    } else if (activeNote) {
      // Same note, sync query changes (e.g. tag additions, pin/archive) only if no pending local typing
      if (!pendingSaveRef.current) {
        setTitle(activeNote.title || '');
        titleRef.current = activeNote.title || '';
        setContent(activeNote.content || '');
        contentRef.current = activeNote.content || '';
        setTags(activeNote.tags || []);
        tagsRef.current = activeNote.tags || [];
        setIsPinned(activeNote.isPinned);
        isPinnedRef.current = activeNote.isPinned;
        setIsArchived(activeNote.isArchived);
        isArchivedRef.current = activeNote.isArchived;
      }
    }
  }, [selectedNoteId, activeNote, performSave]);

  // Flush on tab close or navigation
  useEffect(() => {
    const handleBeforeUnload = () => {
      flushPendingSave();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      flushPendingSave();
    };
  }, [flushPendingSave]);

  // User input handlers
  const handleTitleChange = (newTitle: string) => {
    setTitle(newTitle);
    titleRef.current = newTitle;
    triggerAutoSave({ title: newTitle });
  };

  const handleEditorChange = useCallback(
    (newHtml: string) => {
      setContent(newHtml);
      contentRef.current = newHtml;
      triggerAutoSave({ content: newHtml });
    },
    [triggerAutoSave]
  );

  // --- Create Note Mutation ---
  const createNoteMutation = useMutation({
    mutationFn: (newNoteData: { title: string; content: string; tags: string[]; isPinned: boolean }) =>
      apiClient.createNote(newNoteData),
    onSuccess: (newNote) => {
      queryClient.setQueriesData<Note[]>({ queryKey: ['notes'] }, (old) => {
        if (!old) return [newNote];
        return [newNote, ...old];
      });
      queryClient.invalidateQueries({ queryKey: ['notes'] });
      queryClient.invalidateQueries({ queryKey: ['tags'] });

      setSelectedNoteId(newNote.id);
      setTitle(newNote.title);
      setContent(newNote.content || '<p></p>');
      setTags(newNote.tags || []);
      setIsPinned(newNote.isPinned);
      setIsArchived(false);
      setSaveStatus('saved');
    },
    onError: (err) => {
      console.error('Failed to create note:', err);
      setSaveStatus('error');
    },
  });

  const handleCreateNote = () => {
    flushPendingSave();
    createNoteMutation.mutate({
      title: 'Untitled',
      content: '<p></p>',
      tags: selectedTag ? [selectedTag] : [],
      isPinned: activeTab === 'pinned',
    });
  };

  // --- Toggle Pin Mutation ---
  const pinMutation = useMutation({
    mutationFn: (targetId: string) => apiClient.togglePinNote(targetId),
    onMutate: async (targetId: string) => {
      await queryClient.cancelQueries({ queryKey: ['notes'] });
      const previousNotes = queryClient.getQueryData<Note[]>(notesQueryKey);

      queryClient.setQueriesData<Note[]>({ queryKey: ['notes'] }, (old) => {
        if (!old) return [];
        if (activeTab === 'pinned') {
          return old.filter((n) => n.id !== targetId);
        }
        const updatedList = old.map((n) =>
          n.id === targetId ? { ...n, isPinned: !n.isPinned } : n
        );
        return [...updatedList].sort((a, b) => {
          if (a.isPinned && !b.isPinned) return -1;
          if (!a.isPinned && b.isPinned) return 1;
          return 0;
        });
      });

      return { previousNotes };
    },
    onError: (_err, _targetId, context) => {
      if (context?.previousNotes) {
        queryClient.setQueryData(notesQueryKey, context.previousNotes);
      }
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['notes'] });
      if (selectedNoteId === updated.id) {
        setIsPinned(updated.isPinned);
        isPinnedRef.current = updated.isPinned;
      }
    },
  });

  const handleTogglePin = (e?: React.MouseEvent, noteId?: string) => {
    e?.stopPropagation();
    const targetId = noteId || selectedNoteId;
    if (!targetId) return;
    if (pendingSaveNoteIdRef.current === targetId) {
      flushPendingSave();
    }
    pinMutation.mutate(targetId);
  };

  // --- Toggle Archive Mutation (Fixes instant disappearance in UI) ---
  const archiveMutation = useMutation({
    mutationFn: (targetId: string) => apiClient.toggleArchiveNote(targetId),
    onMutate: async (targetId: string) => {
      await queryClient.cancelQueries({ queryKey: ['notes'] });
      const previousNotes = queryClient.getQueryData<Note[]>(notesQueryKey);

      // Optimistically update:
      // When in 'all' (active notes) or 'pinned', an archived note must disappear immediately!
      // When in 'archived', an unarchived note must disappear immediately!
      queryClient.setQueriesData<Note[]>({ queryKey: ['notes'] }, (old) => {
        if (!old) return [];
        if (activeTab === 'all' || activeTab === 'pinned') {
          return old.filter((n) => n.id !== targetId);
        }
        if (activeTab === 'archived') {
          return old.filter((n) => n.id !== targetId);
        }
        return old.map((n) => (n.id === targetId ? { ...n, isArchived: !n.isArchived } : n));
      });

      // Advance selectedNoteId to another note if current note was archived/unarchived
      if (selectedNoteId === targetId) {
        const remaining = (previousNotes || []).filter((n) => n.id !== targetId);
        setSelectedNoteId(remaining[0]?.id || null);
      }

      return { previousNotes };
    },
    onError: (_err, _targetId, context) => {
      if (context?.previousNotes) {
        queryClient.setQueryData(notesQueryKey, context.previousNotes);
      }
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['notes'] });
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      if (selectedNoteId === updated.id) {
        setIsArchived(updated.isArchived);
        isArchivedRef.current = updated.isArchived;
      }
    },
  });

  const handleToggleArchive = (e?: React.MouseEvent, noteId?: string) => {
    e?.stopPropagation();
    const targetId = noteId || selectedNoteId;
    if (!targetId) return;
    if (pendingSaveNoteIdRef.current === targetId) {
      flushPendingSave();
    }
    archiveMutation.mutate(targetId);
  };

  // --- Delete Note Mutation ---
  const deleteMutation = useMutation({
    mutationFn: (targetId: string) => apiClient.deleteNote(targetId),
    onMutate: async (targetId: string) => {
      await queryClient.cancelQueries({ queryKey: ['notes'] });
      const previousNotes = queryClient.getQueryData<Note[]>(notesQueryKey);

      queryClient.setQueriesData<Note[]>({ queryKey: ['notes'] }, (old) => {
        if (!old) return [];
        return old.filter((n) => n.id !== targetId);
      });

      if (selectedNoteId === targetId) {
        const remaining = (previousNotes || []).filter((n) => n.id !== targetId);
        setSelectedNoteId(remaining[0]?.id || null);
      }

      setDeleteConfirmId(null);
      return { previousNotes };
    },
    onError: (_err, _targetId, context) => {
      if (context?.previousNotes) {
        queryClient.setQueryData(notesQueryKey, context.previousNotes);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] });
      queryClient.invalidateQueries({ queryKey: ['tags'] });
    },
  });

  const handleDeleteNote = (noteId: string) => {
    if (pendingSaveNoteIdRef.current === noteId) {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      pendingSaveNoteIdRef.current = null;
      pendingSaveRef.current = null;
    }
    deleteMutation.mutate(noteId);
  };

  // --- Tag Mutations ---
  const updateTagsMutation = useMutation({
    mutationFn: ({ noteId, nextTags }: { noteId: string; nextTags: string[] }) => {
      const noteToUpdate = notes.find((n) => n.id === noteId) || activeNote;
      const titleToUse = (titleRef.current || noteToUpdate?.title || 'Untitled').trim();
      const contentToUse = contentRef.current ?? noteToUpdate?.content ?? '';

      return apiClient.updateNote(noteId, {
        title: titleToUse,
        content: contentToUse,
        tags: nextTags,
        isPinned: noteToUpdate ? noteToUpdate.isPinned : isPinnedRef.current,
        isArchived: noteToUpdate ? noteToUpdate.isArchived : isArchivedRef.current,
      });
    },
    onSuccess: (updated) => {
      queryClient.setQueriesData<Note[]>({ queryKey: ['notes'] }, (old) => {
        if (!old) return [];
        return old.map((n) => (n.id === updated.id ? updated : n));
      });
      queryClient.invalidateQueries({ queryKey: ['notes'] });
      queryClient.invalidateQueries({ queryKey: ['tags'] });
    },
    onError: (err) => {
      console.error('Failed to update tags:', err);
    },
  });

  const handleAddTag = (tagToAdd: string) => {
    const clean = tagToAdd.trim().toLowerCase().replace(/^#+/, '');
    if (!clean || !selectedNoteId) return;

    const currentTags = tagsRef.current || activeNote?.tags || [];
    if (currentTags.includes(clean)) {
      setNewTagText('');
      setShowTagInput(false);
      return;
    }

    const nextTags = [...currentTags, clean];
    setTags(nextTags);
    tagsRef.current = nextTags;
    setNewTagText('');
    setShowTagInput(false);

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    pendingSaveRef.current = null;
    pendingSaveNoteIdRef.current = null;

    updateTagsMutation.mutate({ noteId: selectedNoteId, nextTags });
  };

  const handleRemoveTag = (tagToRemove: string) => {
    if (!selectedNoteId) return;
    const currentTags = tagsRef.current || activeNote?.tags || [];
    const nextTags = currentTags.filter((t) => t !== tagToRemove);
    setTags(nextTags);
    tagsRef.current = nextTags;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    pendingSaveRef.current = null;
    pendingSaveNoteIdRef.current = null;

    updateTagsMutation.mutate({ noteId: selectedNoteId, nextTags });
  };

  // --- Linked Tasks for Current Note ---
  const { data: linkedTasks = [] } = useQuery<Task[]>({
    queryKey: ['tasks', { noteId: selectedNoteId }],
    queryFn: () =>
      selectedNoteId ? apiClient.getTasksForNote(selectedNoteId) : Promise.resolve([]),
    enabled: !!selectedNoteId,
  });

  const toggleLinkedTaskMutation = useMutation({
    mutationFn: (taskId: string) => apiClient.toggleTaskCompleted(taskId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const createLinkedTaskMutation = useMutation({
    mutationFn: (taskTitle: string) =>
      apiClient.createTask({
        title: taskTitle.trim(),
        noteId: selectedNoteId || undefined,
        priority: 'MEDIUM',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setNewLinkedTaskTitle('');
    },
  });

  // --- AI Summarize Mutation ---
  const summarizeMutation = useMutation({
    mutationFn: (noteContent: string) =>
      apiClient.summarizeContent({
        content: noteContent,
        noteId: selectedNoteId || undefined,
      }),
    onMutate: () => {
      setIsAiLoading(true);
    },
    onSuccess: (res) => {
      setIsAiLoading(false);
      const keyPointsHtml =
        res.keyPoints && res.keyPoints.length > 0
          ? `<ul>${res.keyPoints.map((p) => `<li>${p}</li>`).join('')}</ul>`
          : '';
      const summaryCallout = `<blockquote class="ai-summary-callout"><strong>✨ AI Executive Summary</strong><p>${res.summary}</p>${keyPointsHtml}</blockquote><p></p>`;

      const nextContent = `${summaryCallout}${contentRef.current}`;
      setContent(nextContent);
      contentRef.current = nextContent;
      triggerAutoSave({ content: nextContent });

      setAiNotification({
        message: 'Executive summary generated by AI and inserted into note!',
        type: 'success',
      });
      setTimeout(() => setAiNotification(null), 4000);
    },
    onError: (err) => {
      setIsAiLoading(false);
      console.error('AI summarize failed:', err);
      setAiNotification({
        message: 'AI summary failed. Please try again.',
        type: 'error',
      });
      setTimeout(() => setAiNotification(null), 4000);
    },
  });

  // --- AI Extract Tasks Mutation ---
  const extractTasksMutation = useMutation({
    mutationFn: (noteContent: string) =>
      apiClient.extractTasksFromContent({
        content: noteContent,
        noteId: selectedNoteId || undefined,
        saveToTasks: true,
      }),
    onMutate: () => {
      setIsAiLoading(true);
    },
    onSuccess: (res) => {
      setIsAiLoading(false);
      if (res.tasks && res.tasks.length > 0) {
        const taskItemsHtml = res.tasks
          .map(
            (t) =>
              `<li data-type="taskItem" data-checked="false"><div><p>${
                t.priority === 'URGENT'
                  ? '🚨 [URGENT] '
                  : t.priority === 'HIGH'
                  ? '⚠️ [HIGH] '
                  : ''
              }${t.title}</p></div></li>`
          )
          .join('');

        const taskListBlock = `<p></p><ul data-type="taskList">${taskItemsHtml}</ul><p></p>`;
        const nextContent = `${contentRef.current}${taskListBlock}`;
        setContent(nextContent);
        contentRef.current = nextContent;
        triggerAutoSave({ content: nextContent });

        queryClient.invalidateQueries({ queryKey: ['tasks'] });

        setAiNotification({
          message: `Extracted ${res.count} action items and synced with Tasks system!`,
          type: 'success',
        });
      } else {
        setAiNotification({
          message: 'No actionable tasks detected in this note.',
          type: 'info',
        });
      }
      setTimeout(() => setAiNotification(null), 4000);
    },
    onError: (err) => {
      setIsAiLoading(false);
      console.error('AI task extraction failed:', err);
      setAiNotification({
        message: 'AI task extraction failed. Please try again.',
        type: 'error',
      });
      setTimeout(() => setAiNotification(null), 4000);
    },
  });

  const handleAiSummarize = () => {
    if (!content.trim()) return;
    summarizeMutation.mutate(content);
  };

  const handleAiExtractTasks = () => {
    if (!content.trim()) return;
    extractTasksMutation.mutate(content);
  };

  // Content Statistics
  const stats = useMemo(() => {
    // Strip HTML tags for word counting
    const cleanText = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const words = cleanText ? cleanText.split(/\s+/).length : 0;
    const chars = cleanText.length;
    const readTimeMinutes = Math.max(1, Math.ceil(words / 200));
    return { words, chars, readTimeMinutes };
  }, [content]);

  // Format relative timestamp
  const formatTime = (isoString?: string) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  // Strip HTML / markdown for preview card excerpt
  const getExcerpt = (text?: string | null) => {
    if (!text) return 'Empty note';
    const clean = text
      .replace(/<[^>]*>/g, ' ')
      .replace(/[#*`~>-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return clean ? clean.slice(0, 90) : 'Empty note';
  };

  return (
    <div className="flex h-full w-full overflow-hidden bg-zinc-950 text-zinc-100">
      {/* =========================================================================
          MASTER COLUMN: Notes List, Filters & Search (w-80 or w-96 with border-r)
      ========================================================================== */}
      <div className="w-80 md:w-88 lg:w-96 border-r border-zinc-800/80 flex flex-col flex-shrink-0 bg-zinc-950">
        {/* Header with New Note Button */}
        <div className="p-4 border-b border-zinc-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-base font-bold text-zinc-100">All Notes</h1>
            <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400 font-mono">
              {notes.length}
            </span>
          </div>
          <button
            onClick={handleCreateNote}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-lg text-xs font-semibold shadow-lg shadow-violet-600/20 active:scale-95 transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Note</span>
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-3 border-b border-zinc-800/60">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Search notes or keywords..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-2 bg-zinc-900/80 border border-zinc-800 rounded-lg text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-violet-500/80 focus:ring-1 focus:ring-violet-500/30 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Filter Tabs (All / Pinned / Archived) */}
        <div className="px-3 pt-2 pb-1.5 flex gap-1 border-b border-zinc-800/60">
          <button
            onClick={() => setActiveTab('all')}
            className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              activeTab === 'all'
                ? 'bg-zinc-850 text-zinc-100 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            All Notes
          </button>
          <button
            onClick={() => setActiveTab('pinned')}
            className={`flex items-center justify-center gap-1.5 flex-1 py-1.5 px-2 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              activeTab === 'pinned'
                ? 'bg-zinc-850 text-amber-400 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            <Pin className="w-3 h-3" />
            <span>Pinned</span>
          </button>
          <button
            onClick={() => setActiveTab('archived')}
            className={`flex items-center justify-center gap-1.5 flex-1 py-1.5 px-2 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              activeTab === 'archived'
                ? 'bg-zinc-850 text-violet-400 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            <Archive className="w-3 h-3" />
            <span>Archive</span>
          </button>
        </div>

        {/* Tag Filter Chips */}
        {availableTags.length > 0 && (
          <div className="px-3 py-2 flex items-center gap-1.5 overflow-x-auto no-scrollbar border-b border-zinc-800/60 text-xs">
            <button
              onClick={() => setSelectedTag(null)}
              className={`px-2.5 py-0.5 rounded-full flex-shrink-0 transition-all cursor-pointer ${
                selectedTag === null
                  ? 'bg-violet-600/30 text-violet-300 border border-violet-500/50 font-medium'
                  : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
              }`}
            >
              #all
            </button>
            {availableTags.map((tag) => (
              <button
                key={tag}
                onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                className={`px-2.5 py-0.5 rounded-full flex-shrink-0 transition-all cursor-pointer ${
                  selectedTag === tag
                    ? 'bg-violet-600/30 text-violet-300 border border-violet-500/50 font-medium'
                    : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
                }`}
              >
                #{tag}
              </button>
            ))}
          </div>
        )}

        {/* Notes Scrollable Cards */}
        <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5">
          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center text-zinc-500 text-xs gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-violet-500" />
              <span>Loading notes...</span>
            </div>
          ) : notes.length === 0 ? (
            <div className="py-16 px-4 text-center">
              <div className="w-12 h-12 mx-auto rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-3">
                <FileText className="w-6 h-6 text-zinc-600" />
              </div>
              <h2 className="text-sm font-semibold text-zinc-300 mb-1">No notes found</h2>
              <p className="text-xs text-zinc-500 mb-4 leading-relaxed">
                {searchQuery || selectedTag
                  ? 'Try clearing your search query or tag filter.'
                  : 'Start capturing knowledge with block-based editing.'}
              </p>
              <button
                onClick={handleCreateNote}
                className="px-3.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-200 transition-colors cursor-pointer"
              >
                Create First Note
              </button>
            </div>
          ) : (
            notes.map((note) => {
              const isSelected = note.id === selectedNoteId;
              return (
                <div
                  key={note.id}
                  onClick={() => setSelectedNoteId(note.id)}
                  className={`group relative p-3 rounded-xl cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-zinc-900 border border-violet-500/50 shadow-md shadow-violet-950/20'
                      : 'hover:bg-zinc-900/60 border border-zinc-900/80'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h3
                      className={`text-sm truncate flex-1 ${
                        isSelected ? 'text-zinc-100 font-semibold' : 'text-zinc-300 font-medium'
                      }`}
                    >
                      {note.title || 'Untitled Note'}
                    </h3>
                    {note.isPinned && (
                      <Pin className="w-3.5 h-3.5 text-amber-400 fill-amber-400 flex-shrink-0" />
                    )}
                  </div>

                  <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed mb-2.5">
                    {getExcerpt(note.content)}
                  </p>

                  <div className="flex items-center justify-between text-[11px] text-zinc-500">
                    <span className="flex items-center gap-1 font-mono text-[10px]">
                      <Clock className="w-3 h-3 text-zinc-600" />
                      {formatTime(note.updatedAt || note.createdAt)}
                    </span>

                    {/* Tag Pills */}
                    {note.tags && note.tags.length > 0 && (
                      <div className="flex items-center gap-1 overflow-hidden">
                        {note.tags.slice(0, 2).map((t) => (
                          <span
                            key={t}
                            className="px-1.5 py-0.5 rounded bg-zinc-800/80 text-violet-300 text-[10px]"
                          >
                            #{t}
                          </span>
                        ))}
                        {note.tags.length > 2 && (
                          <span className="text-[10px] text-zinc-500">
                            +{note.tags.length - 2}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Hover Quick Actions */}
                  <div className="absolute right-2 top-2 hidden group-hover:flex items-center gap-1 bg-zinc-900/95 backdrop-blur-md px-1.5 py-1 rounded-lg border border-zinc-800 shadow-lg">
                    <button
                      onClick={(e) => handleTogglePin(e, note.id)}
                      title={note.isPinned ? 'Unpin' : 'Pin to top'}
                      className={`p-1 rounded hover:bg-zinc-800 cursor-pointer ${
                        note.isPinned ? 'text-amber-400' : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {note.isPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      onClick={(e) => handleToggleArchive(e, note.id)}
                      title={note.isArchived ? 'Restore' : 'Archive'}
                      className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 cursor-pointer"
                    >
                      {note.isArchived ? (
                        <ArchiveRestore className="w-3.5 h-3.5" />
                      ) : (
                        <Archive className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteConfirmId(note.id);
                      }}
                      title="Delete note"
                      className="p-1 rounded hover:bg-red-500/20 text-zinc-400 hover:text-red-400 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* =========================================================================
          DETAIL COLUMN: Editor Canvas (flex-1 bg-zinc-950 full horizontal space)
      ========================================================================== */}
      <div className="flex-1 flex flex-col h-full min-w-0 bg-zinc-950 overflow-hidden">
        {activeNote ? (
          <>
            {/* Top Editor Action Bar */}
            <div className="h-14 px-8 border-b border-zinc-800/80 flex items-center justify-between gap-4 bg-zinc-950/80 backdrop-blur-md flex-shrink-0">
              {/* Save Status & Breadcrumb */}
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-zinc-400 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-violet-400" />
                  <span className="truncate max-w-[200px] sm:max-w-[320px] text-zinc-200">
                    {title || 'Untitled Note'}
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-zinc-600" />
                </span>

                <div className="flex items-center gap-1.5 text-xs">
                  {saveStatus === 'saved' && (
                    <span className="flex items-center gap-1 text-emerald-400 font-medium">
                      <Check className="w-3.5 h-3.5" />
                      <span>Saved</span>
                    </span>
                  )}
                  {saveStatus === 'saving' && (
                    <span className="flex items-center gap-1.5 text-violet-400 font-medium">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </span>
                  )}
                  {saveStatus === 'unsaved' && (
                    <span className="flex items-center gap-1 text-amber-400">
                      <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                      <span>Unsaved</span>
                    </span>
                  )}
                  {saveStatus === 'error' && (
                    <span className="flex items-center gap-1 text-red-400 font-medium">
                      <span className="w-2 h-2 rounded-full bg-red-400" />
                      <span>Sync failed</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                {/* Linked Tasks Pill */}
                <button
                  onClick={() => setShowLinkedTasksDrawer(true)}
                  title="View linked action items"
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-800 hover:border-violet-500/40 bg-zinc-900/60 hover:bg-violet-950/20 text-xs text-zinc-300 hover:text-violet-300 transition-all cursor-pointer"
                >
                  <CheckSquare className="w-3.5 h-3.5 text-violet-400" />
                  <span>
                    {linkedTasks.length} {linkedTasks.length === 1 ? 'task' : 'tasks'}
                  </span>
                </button>

                {/* AI Assistant Menu */}
                <div className="relative">
                  <button
                    onClick={() => setShowAiMenu(!showAiMenu)}
                    disabled={isAiLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-violet-600/20 to-indigo-600/20 hover:from-violet-600/30 hover:to-indigo-600/30 border border-violet-500/40 text-violet-300 hover:text-white text-xs font-semibold shadow-sm transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isAiLoading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-400" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                    )}
                    <span>AI Assistant</span>
                    <ChevronDown className="w-3 h-3 text-violet-400" />
                  </button>

                  {showAiMenu && (
                    <div className="absolute right-0 mt-1.5 w-60 rounded-xl bg-zinc-900 border border-zinc-750 shadow-2xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
                      <button
                        onClick={() => {
                          setShowAiMenu(false);
                          handleAiSummarize();
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-xs text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
                      >
                        <Sparkles className="w-4 h-4 text-violet-400 flex-shrink-0" />
                        <div>
                          <p className="font-semibold">Summarize Note</p>
                          <p className="text-[10px] text-zinc-500">Executive summary & key points</p>
                        </div>
                      </button>
                      <button
                        onClick={() => {
                          setShowAiMenu(false);
                          handleAiExtractTasks();
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-xs text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
                      >
                        <CheckSquare className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                        <div>
                          <p className="font-semibold">Extract Action Items</p>
                          <p className="text-[10px] text-zinc-500">Detect & sync with Tasks</p>
                        </div>
                      </button>
                    </div>
                  )}
                </div>

                <div className="h-4 w-px bg-zinc-800 mx-0.5" />

                {/* Pin Button */}
                <button
                  onClick={() => handleTogglePin()}
                  title={isPinned ? 'Unpin' : 'Pin note'}
                  className={`p-2 rounded-lg border transition-colors cursor-pointer ${
                    isPinned
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                      : 'border-zinc-800 hover:bg-zinc-900 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Pin className="w-4 h-4" />
                </button>

                {/* Archive Button */}
                <button
                  onClick={() => handleToggleArchive()}
                  title={isArchived ? 'Restore from Archive' : 'Archive note'}
                  className={`p-2 rounded-lg border transition-colors cursor-pointer ${
                    isArchived
                      ? 'bg-violet-500/10 border-violet-500/30 text-violet-400'
                      : 'border-zinc-800 hover:bg-zinc-900 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Archive className="w-4 h-4" />
                </button>

                {/* Delete Button */}
                <button
                  onClick={() => setDeleteConfirmId(activeNote.id)}
                  title="Delete note"
                  className="p-2 rounded-lg border border-zinc-800 hover:bg-red-500/10 hover:border-red-500/30 text-zinc-400 hover:text-red-400 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Reading Constraint (The 65-Character Rule): Centered max-w-3xl editor canvas */}
            <div className="flex-1 overflow-y-auto px-8 sm:px-12 py-12 lg:py-16">
              <div className="max-w-3xl mx-auto w-full flex flex-col min-h-full">
                {/* Note Title Input */}
                <input
                  type="text"
                  placeholder="Untitled Note"
                  value={title}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  className="w-full text-4xl sm:text-5xl font-extrabold text-white placeholder:text-zinc-700 tracking-tight leading-tight focus:outline-none mb-4 w-full bg-transparent border-none selection:bg-violet-600/30"
                />

                {/* Tags & Metadata Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 pb-6 mb-8 border-b border-zinc-800/80 text-xs">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <TagIcon className="w-3.5 h-3.5 text-zinc-500 mr-0.5" />
                    {tags.map((tag) => (
                      <span
                        key={tag}
                        className="group flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-300 font-mono text-[11px]"
                      >
                        #{tag}
                        <button
                          onClick={() => handleRemoveTag(tag)}
                          className="hover:text-red-400 transition-colors cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}

                    {/* Add Tag Input */}
                    {showTagInput ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          placeholder="tag-name..."
                          value={newTagText}
                          onChange={(e) => setNewTagText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddTag(newTagText);
                            } else if (e.key === 'Escape') {
                              setShowTagInput(false);
                            }
                          }}
                          autoFocus
                          className="w-28 px-2.5 py-0.5 rounded-md bg-zinc-900 border border-violet-500/50 text-xs text-zinc-200 focus:outline-none"
                        />
                        <button
                          onClick={() => handleAddTag(newTagText)}
                          className="p-1 rounded hover:bg-zinc-800 text-emerald-400 cursor-pointer"
                        >
                          <Check className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => setShowTagInput(false)}
                          className="p-1 rounded hover:bg-zinc-800 text-zinc-500 cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowTagInput(true)}
                        className="flex items-center gap-1 px-2.5 py-0.5 rounded-md hover:bg-zinc-900 text-zinc-500 hover:text-zinc-300 transition-colors text-[11px] cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Add tag</span>
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-4 text-zinc-500 font-mono text-[11px]">
                    <span>{stats.words} words</span>
                    <span>{stats.chars} chars</span>
                    <span>~{stats.readTimeMinutes} min read</span>
                  </div>
                </div>

                {/* Next-Gen Tiptap Block WYSIWYG Editor */}
                <div className="flex-1 w-full pb-24">
                  <RichTextEditor
                    key={selectedNoteId || 'empty'}
                    content={content}
                    onChange={handleEditorChange}
                    placeholder="Write your thoughts, or press '/' for commands..."
                    onAiSummarize={handleAiSummarize}
                    onAiExtractTasks={handleAiExtractTasks}
                    isAiLoading={isAiLoading}
                  />
                </div>
              </div>
            </div>
          </>
        ) : (
          /* Empty Workspace State */
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-zinc-900/80 border border-zinc-800 flex items-center justify-center mb-4 shadow-xl shadow-purple-950/20">
              <Sparkles className="w-8 h-8 text-violet-400" />
            </div>
            <h2 className="text-xl font-bold text-zinc-200 mb-2">Notes & Knowledge Engine</h2>
            <p className="text-sm text-zinc-500 max-w-md mb-6 leading-relaxed">
              Capture your ideas with block-based editing, tables, task lists, and bidirectional text
              support. Press <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono text-xs">/</kbd> anywhere to insert blocks or trigger AI.
            </p>
            <button
              onClick={handleCreateNote}
              className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-xl text-sm font-semibold shadow-lg shadow-violet-600/25 active:scale-95 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Create New Note</span>
            </button>
          </div>
        )}
      </div>

      {/* Floating AI Notification Toast */}
      {aiNotification && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-2xl bg-zinc-900 border border-violet-500/40 shadow-2xl text-xs text-zinc-100 animate-in fade-in slide-in-from-bottom-3 duration-200">
          {aiNotification.type === 'success' && <Sparkles className="w-4 h-4 text-violet-400 flex-shrink-0" />}
          {aiNotification.type === 'error' && <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />}
          {aiNotification.type === 'info' && <CheckSquare className="w-4 h-4 text-blue-400 flex-shrink-0" />}
          <span className="font-medium">{aiNotification.message}</span>
          <button
            onClick={() => setAiNotification(null)}
            className="text-zinc-500 hover:text-zinc-300 ml-2 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Linked Tasks Slide-Over Drawer */}
      {showLinkedTasksDrawer && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md h-full bg-zinc-900 border-l border-zinc-800 p-6 flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <CheckSquare className="w-5 h-5 text-violet-400" />
                <h3 className="text-base font-bold text-white">Linked Action Items</h3>
                <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 font-mono">
                  {linkedTasks.length}
                </span>
              </div>
              <button
                onClick={() => setShowLinkedTasksDrawer(false)}
                className="p-1 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-zinc-400 mt-2 mb-4">
              Action items connected directly to{' '}
              <span className="text-zinc-200 font-semibold">{title || 'this note'}</span>.
            </p>

            {/* Quick Add Linked Task */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (newLinkedTaskTitle.trim()) {
                  createLinkedTaskMutation.mutate(newLinkedTaskTitle);
                }
              }}
              className="flex items-center gap-2 mb-6"
            >
              <input
                type="text"
                placeholder="Add actionable task for this note..."
                value={newLinkedTaskTitle}
                onChange={(e) => setNewLinkedTaskTitle(e.target.value)}
                className="flex-1 px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-violet-500/80"
              />
              <button
                type="submit"
                disabled={!newLinkedTaskTitle.trim() || createLinkedTaskMutation.isPending}
                className="px-3 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold cursor-pointer transition-colors"
              >
                Add
              </button>
            </form>

            {/* Linked Tasks List */}
            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
              {linkedTasks.length === 0 ? (
                <div className="text-center py-16 text-zinc-500 text-xs">
                  <CheckSquare className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                  <p>No tasks linked to this note yet.</p>
                  <p className="text-[11px] text-zinc-600 mt-1">
                    Use <kbd className="px-1 py-0.5 rounded bg-zinc-800 font-mono">/extract-tasks</kbd> in
                    the editor to extract tasks with AI.
                  </p>
                </div>
              ) : (
                linkedTasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-start gap-2.5 p-3 rounded-xl bg-zinc-950/70 border border-zinc-800/80"
                  >
                    <button
                      onClick={() => toggleLinkedTaskMutation.mutate(task.id)}
                      title={task.isCompleted ? 'Mark incomplete' : 'Mark complete'}
                      className="mt-0.5 cursor-pointer flex-shrink-0 transition-transform active:scale-95"
                    >
                      {task.isCompleted ? (
                        <div className="w-4 h-4 rounded-md bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center text-white shadow-sm shadow-violet-600/40 border border-violet-500">
                          <Check className="w-2.5 h-2.5 stroke-[2.5]" />
                        </div>
                      ) : (
                        <div className="w-4 h-4 rounded-md bg-zinc-900 border border-zinc-700/80 hover:border-violet-500/70 hover:bg-violet-500/10 transition-all flex items-center justify-center">
                          <Check className="w-2.5 h-2.5 text-transparent hover:text-violet-400/40 transition-colors stroke-[2.5]" />
                        </div>
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-xs font-medium ${
                          task.isCompleted ? 'line-through text-zinc-500' : 'text-zinc-200'
                        }`}
                      >
                        {task.title}
                      </p>
                      <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-mono">
                        {task.priority}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Drawer Footer */}
            <div className="pt-4 border-t border-zinc-800 flex items-center justify-between">
              <button
                onClick={() => {
                  setShowLinkedTasksDrawer(false);
                  navigate('/tasks');
                }}
                className="flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 font-semibold cursor-pointer"
              >
                <span>Open full Tasks dashboard</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl bg-zinc-900 border border-zinc-800 p-6 shadow-2xl">
            <h3 className="text-base font-bold text-zinc-100 mb-2">Delete this note?</h3>
            <p className="text-xs text-zinc-400 mb-6 leading-relaxed">
              This action cannot be undone. All blocks, tables, and content associated with this note
              will be permanently removed.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="px-3.5 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-300 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteNote(deleteConfirmId)}
                className="px-3.5 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-xs font-semibold text-white transition-colors cursor-pointer"
              >
                Delete Note
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
