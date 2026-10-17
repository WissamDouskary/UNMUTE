import React, { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
  ChevronLeft,
  CheckSquare,
  ArrowUpRight,
  AlertCircle,
} from 'lucide-react';
import { apiClient, Note, Task } from '@unmute/api-client';
import { RichTextEditor, cleanTaskTitle } from '../components/RichTextEditor';
import { useLiveEvent } from '../hooks/useLiveEvents';

type FilterTab = 'all' | 'pinned' | 'archived';

const AI_IDLE_MS = 4000;

/** Notes caches are either a list or a Spring page (`{ content }`). Home and the command palette use the page. */
function updateNotesCache(old: unknown, update: (notes: Note[]) => Note[]): unknown {
  if (Array.isArray(old)) return update(old as Note[]);
  if (
    old &&
    typeof old === 'object' &&
    Array.isArray((old as { content?: unknown }).content)
  ) {
    const page = old as { content: Note[] };
    return { ...page, content: update(page.content) };
  }
  return old;
}
type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error';

export function NotesPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const urlNoteId = searchParams.get('noteId');

  // --- Filtering & Selection State ---
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(urlNoteId || null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  // Below md only one column fits; desktop always shows both.
  const [mobilePane, setMobilePane] = useState<'list' | 'editor'>(urlNoteId ? 'editor' : 'list');
  const titleInputRef = useRef<HTMLTextAreaElement>(null);

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

  // --- Multi-Select Batch State (WhatsApp / Linear style) ---
  const [isSelectionModeActive, setIsSelectionModeActive] = useState<boolean>(false);
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(new Set());
  const [batchDeleteConfirm, setBatchDeleteConfirm] = useState<boolean>(false);
  const isSelectionMode = isSelectionModeActive || selectedNoteIds.size > 0;

  // --- Synchronization & Save Timers / Refs ---
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const currentNoteIdRef = useRef<string | null>(null);
  const pendingSaveNoteIdRef = useRef<string | null>(null);
  const pendingSaveRef = useRef<{
    id: string;
    title: string;
    content: string;
    isPinned: boolean;
    isArchived: boolean;
  } | null>(null);

  // Tags just applied by the live auto-tagger, so the editor and cards can sparkle them.
  const [freshAiTags, setFreshAiTags] = useState<Set<string>>(new Set());
  const [freshTagsByNote, setFreshTagsByNote] = useState<Map<string, Set<string>>>(() => new Map());

  const selectedNoteIdRef = useRef<string | null>(selectedNoteId);
  selectedNoteIdRef.current = selectedNoteId;

  const titleRef = useRef<string>(title);
  titleRef.current = title;

  const contentRef = useRef<string>(content);
  contentRef.current = content;
  const postponeAiRef = useRef<() => void>(() => {});

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

  // Direct fetch when urlNoteId is present to guarantee instant resolution
  const { data: directNote } = useQuery({
    queryKey: ['note', urlNoteId],
    queryFn: () => (urlNoteId ? apiClient.getNote(urlNoteId) : null),
    enabled: Boolean(urlNoteId),
  });

  // Handle incoming urlNoteId (e.g. redirected from Capture Engine "View Note")
  useEffect(() => {
    if (urlNoteId) {
      setSelectedNoteId(urlNoteId);
      setActiveTab('all');
      setSelectedTag(null);
      setSearchQuery('');
      // Invalidate notes list query to ensure freshly created background notes are fetched
      queryClient.invalidateQueries({ queryKey: ['notes'] });
    }
  }, [urlNoteId, queryClient]);

  // If directNote arrives and is not yet in notesData cache, inject it into the cache
  useEffect(() => {
    if (directNote) {
      queryClient.setQueriesData({ queryKey: ['notes'] }, (old) =>
        updateNotesCache(old, (notes) =>
          notes.some((n) => n.id === directNote.id) ? notes : [directNote, ...notes]
        )
      );
      setSelectedNoteId(directNote.id);
    }
  }, [directNote, queryClient]);

  const notes = useMemo(() => {
    const list = notesData ?? [];
    if (directNote && !list.some((n) => n.id === directNote.id)) {
      return [directNote, ...list];
    }
    return list;
  }, [notesData, directNote]);

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
        // If an explicit note is targeted in URL, preserve it while resolving
        if (urlNoteId && (selectedNoteId === urlNoteId || !selectedNoteId)) {
          return;
        }
        setSelectedNoteId(first.id);
      }
    } else if (!urlNoteId) {
      setSelectedNoteId(null);
    }
  }, [notes, selectedNoteId, urlNoteId]);

  // Active Note reference
  const activeNote = useMemo(() => {
    return (
      notes.find((n) => n.id === selectedNoteId) ||
      (directNote?.id === selectedNoteId ? directNote : null) ||
      null
    );
  }, [notes, selectedNoteId, directNote]);

  const hasActiveNote = !!activeNote;
  useLayoutEffect(() => {
    const el = titleInputRef.current;
    if (!el) return;
    const fit = () => {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [title, hasActiveNote, mobilePane]);

  const activeNoteRef = useRef<Note | null>(activeNote);
  activeNoteRef.current = activeNote;

  // --- Auto-Save Mutation ---
  const updateNoteMutation = useMutation({
    mutationFn: ({
      noteId,
      payload,
    }: {
      noteId: string;
      payload: { title: string; content: string; isPinned: boolean; isArchived: boolean };
    }) => apiClient.updateNote(noteId, payload),
    onMutate: () => {
      setSaveStatus('saving');
    },
    onSuccess: (updated) => {
      queryClient.setQueriesData({ queryKey: ['notes'] }, (old) =>
        updateNotesCache(old, (notes) => notes.map((n) => (n.id === updated.id ? updated : n)))
      );
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
      setFreshAiTags(new Set());

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
      // Tags always come from the server so an in-flight autosave cannot clobber AI tags.
      setTags(activeNote.tags || []);
      tagsRef.current = activeNote.tags || [];
      if (!pendingSaveRef.current) {
        setTitle(activeNote.title || '');
        titleRef.current = activeNote.title || '';
        setContent(activeNote.content || '');
        contentRef.current = activeNote.content || '';
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
    postponeAiRef.current();
    triggerAutoSave({ title: newTitle });
  };

  const handleEditorChange = useCallback(
    (newHtml: string) => {
      setContent(newHtml);
      contentRef.current = newHtml;
      postponeAiRef.current();
      triggerAutoSave({ content: newHtml });
    },
    [triggerAutoSave]
  );

  // --- Create Note Mutation ---
  const createNoteMutation = useMutation({
    mutationFn: (newNoteData: { title: string; content: string; tags: string[]; isPinned: boolean }) =>
      apiClient.createNote(newNoteData),
    onSuccess: (newNote) => {
      queryClient.setQueriesData({ queryKey: ['notes'] }, (old) =>
        updateNotesCache(old, (notes) => [newNote, ...notes.filter((n) => n.id !== newNote.id)])
      );
      queryClient.invalidateQueries({ queryKey: ['notes'] });
      queryClient.invalidateQueries({ queryKey: ['tags'] });

      setSelectedNoteId(newNote.id);
      setMobilePane('editor');
      if (urlNoteId) {
        setSearchParams({ noteId: newNote.id }, { replace: true });
      }
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

  useEffect(() => {
    const token = searchParams.get('compose') === '1' ? searchParams.get('t') : null;
    if (!token || sessionStorage.getItem('unmute-compose') === token) return;
    sessionStorage.setItem('unmute-compose', token);
    handleCreateNote();
    const next = new URLSearchParams(searchParams);
    next.delete('compose');
    next.delete('t');
    setSearchParams(next, { replace: true });
    // Create once per palette token; handleCreateNote closes over the latest filters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, setSearchParams]);

  // --- Toggle Pin Mutation ---
  const pinMutation = useMutation({
    mutationFn: (targetId: string) => apiClient.togglePinNote(targetId),
    onMutate: async (targetId: string) => {
      await queryClient.cancelQueries({ queryKey: ['notes'] });
      const previousNotes = queryClient.getQueryData<Note[]>(notesQueryKey);

      queryClient.setQueriesData({ queryKey: ['notes'] }, (old) =>
        updateNotesCache(old, (notes) => {
          if (activeTab === 'pinned') return notes.filter((n) => n.id !== targetId);
          const updatedList = notes.map((n) =>
            n.id === targetId ? { ...n, isPinned: !n.isPinned } : n
          );
          return [...updatedList].sort((a, b) => {
            if (a.isPinned && !b.isPinned) return -1;
            if (!a.isPinned && b.isPinned) return 1;
            return 0;
          });
        })
      );

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
      queryClient.setQueriesData({ queryKey: ['notes'] }, (old) =>
        updateNotesCache(old, (notes) => {
          if (activeTab === 'all' || activeTab === 'pinned' || activeTab === 'archived') {
            return notes.filter((n) => n.id !== targetId);
          }
          return notes.map((n) => (n.id === targetId ? { ...n, isArchived: !n.isArchived } : n));
        })
      );

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

      queryClient.setQueriesData({ queryKey: ['notes'] }, (old) =>
        updateNotesCache(old, (notes) => notes.filter((n) => n.id !== targetId))
      );

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

  // --- Batch Mutations (Multi-Select / WhatsApp Style) ---
  const batchPinMutation = useMutation({
    mutationFn: async ({ ids, targetPinState }: { ids: string[]; targetPinState: boolean }) => {
      // Toggle only notes that don't already match the desired state
      const toToggle = ids.filter((id) => {
        const n = notes.find((note) => note.id === id);
        return n ? n.isPinned !== targetPinState : true;
      });
      await Promise.all(toToggle.map((id) => apiClient.togglePinNote(id)));
      return { ids, targetPinState };
    },
    onMutate: async ({ ids, targetPinState }: { ids: string[]; targetPinState: boolean }) => {
      await queryClient.cancelQueries({ queryKey: ['notes'] });
      const previousNotes = queryClient.getQueryData<Note[]>(notesQueryKey);

      const idSet = new Set(ids);
      queryClient.setQueriesData({ queryKey: ['notes'] }, (old) =>
        updateNotesCache(old, (notes) => {
          if (activeTab === 'pinned' && !targetPinState) {
            return notes.filter((n) => !idSet.has(n.id));
          }
          const updatedList = notes.map((n) =>
            idSet.has(n.id) ? { ...n, isPinned: targetPinState } : n
          );
          return [...updatedList].sort((a, b) => {
            if (a.isPinned && !b.isPinned) return -1;
            if (!a.isPinned && b.isPinned) return 1;
            return 0;
          });
        })
      );

      setSelectedNoteIds(new Set());
      setIsSelectionModeActive(false);
      return { previousNotes };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousNotes) {
        queryClient.setQueryData(notesQueryKey, context.previousNotes);
      }
    },
    onSuccess: ({ ids, targetPinState }) => {
      queryClient.invalidateQueries({ queryKey: ['notes'] });
      setAiNotification({
        message: targetPinState
          ? `Pinned ${ids.length} ${ids.length === 1 ? 'note' : 'notes'} to top`
          : `Unpinned ${ids.length} ${ids.length === 1 ? 'note' : 'notes'}`,
        type: 'success',
      });
      setTimeout(() => setAiNotification(null), 3000);
    },
  });

  const batchArchiveMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map((id) => apiClient.toggleArchiveNote(id)));
      return ids;
    },
    onMutate: async (ids: string[]) => {
      await queryClient.cancelQueries({ queryKey: ['notes'] });
      const previousNotes = queryClient.getQueryData<Note[]>(notesQueryKey);

      const idSet = new Set(ids);
      queryClient.setQueriesData({ queryKey: ['notes'] }, (old) =>
        updateNotesCache(old, (notes) => notes.filter((n) => !idSet.has(n.id)))
      );

      if (selectedNoteId && idSet.has(selectedNoteId)) {
        const remaining = (previousNotes || []).filter((n) => !idSet.has(n.id));
        setSelectedNoteId(remaining[0]?.id || null);
      }

      setSelectedNoteIds(new Set());
      setIsSelectionModeActive(false);
      return { previousNotes };
    },
    onError: (_err, _ids, context) => {
      if (context?.previousNotes) {
        queryClient.setQueryData(notesQueryKey, context.previousNotes);
      }
    },
    onSuccess: (ids) => {
      queryClient.invalidateQueries({ queryKey: ['notes'] });
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      setAiNotification({
        message:
          activeTab === 'archived'
            ? `Restored ${ids.length} ${ids.length === 1 ? 'note' : 'notes'} from archive`
            : `Archived ${ids.length} ${ids.length === 1 ? 'note' : 'notes'}`,
        type: 'success',
      });
      setTimeout(() => setAiNotification(null), 3000);
    },
  });

  const batchDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map((id) => apiClient.deleteNote(id)));
      return ids;
    },
    onMutate: async (ids: string[]) => {
      await queryClient.cancelQueries({ queryKey: ['notes'] });
      const previousNotes = queryClient.getQueryData<Note[]>(notesQueryKey);

      const idSet = new Set(ids);
      queryClient.setQueriesData({ queryKey: ['notes'] }, (old) =>
        updateNotesCache(old, (notes) => notes.filter((n) => !idSet.has(n.id)))
      );

      if (selectedNoteId && idSet.has(selectedNoteId)) {
        const remaining = (previousNotes || []).filter((n) => !idSet.has(n.id));
        setSelectedNoteId(remaining[0]?.id || null);
      }

      setSelectedNoteIds(new Set());
      setIsSelectionModeActive(false);
      setBatchDeleteConfirm(false);
      return { previousNotes };
    },
    onError: (_err, _ids, context) => {
      if (context?.previousNotes) {
        queryClient.setQueryData(notesQueryKey, context.previousNotes);
      }
    },
    onSuccess: (ids) => {
      queryClient.invalidateQueries({ queryKey: ['notes'] });
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      setAiNotification({
        message: `Permanently deleted ${ids.length} ${ids.length === 1 ? 'note' : 'notes'}`,
        type: 'success',
      });
      setTimeout(() => setAiNotification(null), 3000);
    },
  });

  // Multi-select helper functions
  const toggleNoteSelection = (noteId: string) => {
    setSelectedNoteIds((prev) => {
      const next = new Set(prev);
      if (next.has(noteId)) {
        next.delete(noteId);
      } else {
        next.add(noteId);
      }
      return next;
    });
    setIsSelectionModeActive(true);
  };

  const selectAllNotes = () => {
    if (selectedNoteIds.size === notes.length) {
      setSelectedNoteIds(new Set());
    } else {
      setSelectedNoteIds(new Set(notes.map((n) => n.id)));
    }
  };

  const clearSelection = () => {
    setSelectedNoteIds(new Set());
    setIsSelectionModeActive(false);
  };

  const allSelectedPinned = useMemo(() => {
    if (selectedNoteIds.size === 0) return false;
    const selectedNotes = notes.filter((n) => selectedNoteIds.has(n.id));
    return selectedNotes.length > 0 && selectedNotes.every((n) => n.isPinned);
  }, [notes, selectedNoteIds]);

  const handleBatchPin = () => {
    if (selectedNoteIds.size === 0) return;
    flushPendingSave();
    const targetPinState = !allSelectedPinned;
    batchPinMutation.mutate({ ids: Array.from(selectedNoteIds), targetPinState });
  };

  const handleBatchArchive = () => {
    if (selectedNoteIds.size === 0) return;
    flushPendingSave();
    batchArchiveMutation.mutate(Array.from(selectedNoteIds));
  };

  const handleConfirmBatchDelete = () => {
    if (selectedNoteIds.size === 0) return;
    flushPendingSave();
    batchDeleteMutation.mutate(Array.from(selectedNoteIds));
  };

  // Keyboard shortcut (Escape to clear multi-select) & tab-switch cleanup
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isSelectionMode) {
        clearSelection();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSelectionMode]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key !== 'j' && event.key !== 'k' && event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      if (document.querySelector('[aria-label="Command palette"]')) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (deleteConfirmId || batchDeleteConfirm || showLinkedTasksDrawer || showAiMenu || isSelectionMode) return;
      if (notes.length === 0) return;
      event.preventDefault();
      const index = notes.findIndex((note) => note.id === selectedNoteIdRef.current);
      const delta = event.key === 'j' || event.key === 'ArrowDown' ? 1 : -1;
      const nextIndex = index < 0 ? 0 : Math.min(notes.length - 1, Math.max(0, index + delta));
      const next = notes[nextIndex];
      if (!next || next.id === selectedNoteIdRef.current) return;
      setSelectedNoteId(next.id);
      if (urlNoteId && urlNoteId !== next.id) {
        setSearchParams({ noteId: next.id }, { replace: true });
      }
      document.querySelector(`[data-note-id="${next.id}"]`)?.scrollIntoView({ block: 'nearest' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [notes, deleteConfirmId, batchDeleteConfirm, showLinkedTasksDrawer, showAiMenu, isSelectionMode, urlNoteId, setSearchParams]);

  useEffect(() => {
    setSelectedNoteIds(new Set());
    setIsSelectionModeActive(false);
  }, [activeTab, selectedTag]);

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
      queryClient.setQueriesData({ queryKey: ['notes'] }, (old) =>
        updateNotesCache(old, (notes) => notes.map((n) => (n.id === updated.id ? updated : n)))
      );
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
    onMutate: async (taskId: string) => {
      await queryClient.cancelQueries({ queryKey: ['tasks'] });
      const previous = queryClient.getQueryData<Task[]>(['tasks', { noteId: selectedNoteId }]);

      queryClient.setQueriesData<Task[]>({ queryKey: ['tasks'] }, (old) => {
        if (!old) return [];
        return old.map((t) => (t.id === taskId ? { ...t, isCompleted: !t.isCompleted } : t));
      });

      return { previous };
    },
    onError: (_err, _taskId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['tasks', { noteId: selectedNoteId }], context.previous);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  // Handle task checkbox toggled from inside the Tiptap editor canvas
  const handleEditorTaskToggle = useCallback(
    async ({ taskId, title, checked }: { taskId?: string | null; title: string; checked: boolean }) => {
      const clean = cleanTaskTitle(title);
      const targetTask = linkedTasks.find(
        (t) => (taskId && t.id === taskId) || (clean && cleanTaskTitle(t.title) === clean)
      );

      if (targetTask) {
        if (targetTask.isCompleted !== checked) {
          // Optimistically update query cache so drawer / tasks page update in 0ms
          queryClient.setQueriesData<Task[]>({ queryKey: ['tasks'] }, (old) => {
            if (!old) return [];
            return old.map((t) => (t.id === targetTask.id ? { ...t, isCompleted: checked } : t));
          });

          try {
            await apiClient.updateTask(targetTask.id, { isCompleted: checked });
            queryClient.invalidateQueries({ queryKey: ['tasks'] });
          } catch (err) {
            console.error('Failed to sync editor task to database:', err);
            queryClient.invalidateQueries({ queryKey: ['tasks'] });
          }
        }
      } else if (selectedNoteId && clean) {
        // User typed a task inside editor canvas and checked it — persist to DB linked to this note!
        try {
          const newTask = await apiClient.createTask({
            title: clean,
            noteId: selectedNoteId,
            priority: 'MEDIUM',
          });
          if (checked) {
            await apiClient.toggleTaskCompleted(newTask.id);
          }
          queryClient.invalidateQueries({ queryKey: ['tasks'] });
        } catch (err) {
          console.error('Failed to create task from editor canvas:', err);
        }
      }
    },
    [linkedTasks, selectedNoteId, queryClient]
  );

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

  // --- AI Extract Tasks Mutation with De-duplication ---
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
        // De-duplicate: check if taskItems with these titles already exist in the checklist
        const taskItemRegex = /<li[^>]*data-type=["']taskItem["'][^>]*>(.*?)<\/li>/gi;
        const existingTaskItemTitles: string[] = [];
        let match;
        while ((match = taskItemRegex.exec(contentRef.current)) !== null) {
          const text = (match[1] || '').replace(/<[^>]*>/g, '').trim().toLowerCase();
          existingTaskItemTitles.push(cleanTaskTitle(text));
        }

        const newTasks = res.tasks.filter((t) => {
          const clean = cleanTaskTitle(t.title).toLowerCase();
          return !existingTaskItemTitles.includes(clean);
        });

        if (newTasks.length > 0) {
          const taskItemsHtml = newTasks
            .map(
              (t) =>
                `<li data-type="taskItem" data-checked="false"${t.savedTaskId ? ` data-task-id="${t.savedTaskId}"` : ''}><div><p>${
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
        }

        queryClient.invalidateQueries({ queryKey: ['tasks'] });

        setAiNotification({
          message:
            newTasks.length > 0
              ? `Extracted ${res.count} action items (${newTasks.length} new) and synced with Tasks system!`
              : `All ${res.count} action items are already in sync with Tasks!`,
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

  const aiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingAiRef = useRef<'summarize' | 'extract' | null>(null);
  const summarizeMutationRef = useRef(summarizeMutation);
  summarizeMutationRef.current = summarizeMutation;
  const extractTasksMutationRef = useRef(extractTasksMutation);
  extractTasksMutationRef.current = extractTasksMutation;

  const clearAiTimer = () => {
    if (aiTimerRef.current) {
      clearTimeout(aiTimerRef.current);
      aiTimerRef.current = null;
    }
  };

  const armAi = (action: 'summarize' | 'extract') => {
    const plain = contentRef.current.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').trim();
    if (!plain) return;
    pendingAiRef.current = action;
    clearAiTimer();
    aiTimerRef.current = setTimeout(() => {
      aiTimerRef.current = null;
      const kind = pendingAiRef.current;
      pendingAiRef.current = null;
      const latest = contentRef.current;
      const stillText = latest.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').trim();
      if (!kind || !stillText) return;
      if (kind === 'summarize') {
        if (!summarizeMutationRef.current.isPending) summarizeMutationRef.current.mutate(latest);
        return;
      }
      if (!extractTasksMutationRef.current.isPending) extractTasksMutationRef.current.mutate(latest);
    }, AI_IDLE_MS);
  };

  postponeAiRef.current = () => {
    if (pendingAiRef.current) armAi(pendingAiRef.current);
  };

  useEffect(() => clearAiTimer, []);

  const handleAiSummarize = () => {
    armAi('summarize');
  };

  const handleAiExtractTasks = () => {
    armAi('extract');
  };

  const autoTagMutation = useMutation({
    mutationFn: (noteId: string) => apiClient.requestAutoTag(noteId),
    onMutate: () => {
      setIsAiLoading(true);
    },
    onSuccess: () => {
      setIsAiLoading(false);
      setAiNotification({
        message: 'Auto-tag queued. New tags will appear here in a moment.',
        type: 'info',
      });
      setTimeout(() => setAiNotification(null), 4000);
    },
    onError: (err) => {
      setIsAiLoading(false);
      console.error('Auto-tag failed:', err);
      setAiNotification({
        message: 'Could not queue auto-tag. Please try again.',
        type: 'error',
      });
      setTimeout(() => setAiNotification(null), 4000);
    },
  });

  const handleAiAutoTag = () => {
    if (!selectedNoteId) return;
    autoTagMutation.mutate(selectedNoteId);
  };

  useLiveEvent((event) => {
    if (event.type === 'note.tagged') {
      const { noteId, addedTags, tags: nextTags } = event.data;
      if (addedTags.length > 0) {
        setFreshTagsByNote((prev) => {
          const next = new Map(prev);
          next.set(noteId, new Set(addedTags));
          return next;
        });
        setTimeout(() => {
          setFreshTagsByNote((prev) => {
            const next = new Map(prev);
            next.delete(noteId);
            return next;
          });
        }, 8000);
      }
      if (noteId === selectedNoteIdRef.current) {
        setTags(nextTags);
        tagsRef.current = nextTags;
        if (addedTags.length > 0) {
          setFreshAiTags(new Set(addedTags));
          setAiNotification({
            message: `AI tagged this note: ${addedTags.map((t) => `#${t}`).join(' ')}`,
            type: 'success',
          });
          setTimeout(() => setAiNotification(null), 5000);
          setTimeout(() => setFreshAiTags(new Set()), 8000);
        }
      }
      return;
    }
    if (event.type === 'note.tag-failed' && event.data.noteId === selectedNoteIdRef.current) {
      setAiNotification({
        message: event.data.message || 'Auto-tag failed. Please try again.',
        type: 'error',
      });
      setTimeout(() => setAiNotification(null), 5000);
    }
  });

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
      .trim()
      .replace(/^\S*\s*Voice Recording Transcript Source: .*? Duration: \d+:\d{2}\s*/i, '');
    return clean ? clean.slice(0, 90) : 'Empty note';
  };

  return (
    <div className="flex h-full w-full overflow-hidden bg-zinc-950 text-zinc-100">
      {/* =========================================================================
          MASTER COLUMN: Notes List, Filters & Search (w-80 or w-96 with border-r)
      ========================================================================== */}
      <div
        className={`${mobilePane === 'editor' ? 'hidden md:flex' : 'flex'} w-full md:w-88 lg:w-96 md:border-r border-zinc-800/80 flex-col flex-shrink-0 bg-zinc-950 relative`}
      >
        {/* Header with New Note Button & Multi-Select Toggle */}
        <div className="p-4 border-b border-zinc-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-base font-bold text-zinc-100">
              {activeTab === 'archived' ? 'Archive' : activeTab === 'pinned' ? 'Pinned Notes' : 'All Notes'}
            </h1>
            <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400 font-mono">
              {notes.length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {notes.length > 0 && (
              <button
                onClick={() => {
                  if (isSelectionMode) {
                    clearSelection();
                  } else {
                    setIsSelectionModeActive(true);
                  }
                }}
                title={isSelectionMode ? 'Cancel selection' : 'Select multiple notes'}
                className={`p-1.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
                  isSelectionMode
                    ? 'bg-zinc-800 border-zinc-700 text-zinc-100'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850'
                }`}
              >
                <CheckSquare className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={handleCreateNote}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 text-zinc-950 hover:bg-white rounded-lg text-xs font-medium transition-colors duration-200 cursor-pointer focus:outline-none focus:ring-1 focus:ring-zinc-700"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Note</span>
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="p-3 border-b border-zinc-800/60">
          <div className="relative rounded-lg border border-zinc-800 bg-zinc-900/80 focus-within:border-zinc-500 focus-within:ring-1 focus-within:ring-zinc-500 transition-all">
            <Search className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              dir="auto"
              placeholder="Search notes or keywords..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full ps-9 pe-8 py-2 bg-transparent border-0 text-xs text-zinc-200 placeholder:text-zinc-500 outline-none focus:outline-none focus:ring-0"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute end-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 cursor-pointer"
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
                ? 'bg-zinc-800 text-zinc-100'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            All Notes
          </button>
          <button
            onClick={() => setActiveTab('pinned')}
            className={`flex items-center justify-center gap-1.5 flex-1 py-1.5 px-2 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              activeTab === 'pinned'
                ? 'bg-zinc-800 text-zinc-100'
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
                ? 'bg-zinc-800 text-zinc-100'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            <Archive className="w-3 h-3" />
            <span>Archive</span>
          </button>
        </div>

        {/* Tag Filter Chips */}
        {availableTags.length > 0 && (
          <div className="relative z-10 shrink-0 px-3 pt-2 pb-1 flex items-center gap-1.5 overflow-x-auto border-b border-zinc-800/60 bg-zinc-950 text-xs">
            <button
              onClick={() => setSelectedTag(null)}
              className={`px-2.5 py-0.5 rounded-full flex-shrink-0 transition-all cursor-pointer ${
                selectedTag === null
                  ? 'bg-zinc-800 text-zinc-100 border border-zinc-700'
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
                    ? 'bg-zinc-800 text-zinc-100 border border-zinc-700'
                    : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
                }`}
              >
                #{tag}
              </button>
            ))}
          </div>
        )}

        {/* Notes Scrollable Cards */}
        <div className={`flex-1 overflow-y-auto p-2.5 space-y-1.5 ${isSelectionMode ? 'pb-24' : ''}`}>
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
              const isCardChecked = selectedNoteIds.has(note.id);

              return (
                <div
                  key={note.id}
                  data-note-id={note.id}
                  onClick={() => {
                    if (isSelectionMode) {
                      toggleNoteSelection(note.id);
                    } else {
                      setSelectedNoteId(note.id);
                      setMobilePane('editor');
                      if (urlNoteId && urlNoteId !== note.id) {
                        setSearchParams({ noteId: note.id }, { replace: true });
                      }
                    }
                  }}
                  className={`group relative p-3 rounded-xl cursor-pointer transition-all ${
                    isCardChecked
                      ? 'bg-zinc-900 border border-zinc-600'
                      : isSelected && !isSelectionMode
                      ? 'bg-zinc-900 border border-zinc-700'
                      : 'hover:bg-zinc-800/50 border border-transparent'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    {/* WhatsApp-Style Selection Checkbox */}
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleNoteSelection(note.id);
                      }}
                      className={`mt-0.5 cursor-pointer flex-shrink-0 transition-all ${
                        isSelectionMode
                          ? 'opacity-100 scale-100'
                          : 'opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100'
                      }`}
                    >
                      {isCardChecked ? (
                        <div className="w-4 h-4 rounded-[5px] bg-zinc-100 flex items-center justify-center text-zinc-950 border border-zinc-200">
                          <Check className="w-2.5 h-2.5 stroke-[2.5]" />
                        </div>
                      ) : (
                        <div className="w-4 h-4 rounded-[5px] bg-zinc-950 border border-zinc-700 hover:border-zinc-400 transition-colors duration-200 flex items-center justify-center">
                          <Check className="w-2.5 h-2.5 text-transparent stroke-[2.5]" />
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <h3
                          dir="auto"
                          className={`text-sm truncate text-start flex-1 ${
                            isSelected || isCardChecked ? 'text-zinc-100 font-semibold' : 'text-zinc-300 font-medium'
                          }`}
                        >
                          {note.title || 'Untitled Note'}
                        </h3>
                        {note.isPinned && (
                          <Pin className="w-3.5 h-3.5 text-amber-400 fill-amber-400 flex-shrink-0" />
                        )}
                      </div>

                      <p dir="auto" className="text-xs text-zinc-400 line-clamp-2 text-start leading-relaxed mb-2.5">
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
                            {note.tags.slice(0, 2).map((t) => {
                              const isFresh = freshTagsByNote.get(note.id)?.has(t);
                              return (
                                <span
                                  key={t}
                                  className={`px-1.5 py-0.5 rounded text-[11px] ${
                                    isFresh
                                      ? 'bg-zinc-800 text-zinc-100 border border-zinc-600'
                                      : 'bg-zinc-900 text-zinc-400 border border-zinc-800'
                                  }`}
                                >
                                  #{t}
                                </span>
                              );
                            })}
                            {note.tags.length > 2 && (
                              <span className="text-[10px] text-zinc-500">
                                +{note.tags.length - 2}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Hover Quick Actions (Only when not in multi-selection mode) */}
                  {!isSelectionMode && (
                    <div className="absolute right-2 top-2 hidden group-hover:flex items-center gap-1 bg-zinc-900/95 backdrop-blur-md px-1.5 py-1 rounded-lg border border-zinc-800 shadow-lg z-10">
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
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* WhatsApp / Linear-style Floating Batch Action Bar */}
        {selectedNoteIds.size > 0 && (
          <div className="absolute bottom-3 left-3 right-3 z-30 bg-zinc-900 border border-zinc-800 rounded-xl p-2 flex items-center justify-between gap-2">
            {/* Left: Select all checkbox + count */}
            <div className="flex items-center gap-2 min-w-0">
              <button
                onClick={selectAllNotes}
                title={selectedNoteIds.size === notes.length ? 'Deselect all' : 'Select all'}
                className="cursor-pointer flex-shrink-0"
              >
                {selectedNoteIds.size === notes.length ? (
                  <div className="w-4 h-4 rounded-[5px] bg-zinc-100 flex items-center justify-center text-zinc-950 border border-zinc-200">
                    <Check className="w-2.5 h-2.5 stroke-[2.5]" />
                  </div>
                ) : (
                  <div className="w-4 h-4 rounded-[5px] bg-zinc-900 border border-zinc-700 hover:border-zinc-400 flex items-center justify-center">
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
                  </div>
                )}
              </button>

              <span className="text-xs font-semibold text-zinc-100 truncate">
                {selectedNoteIds.size} selected
              </span>
            </div>

            {/* Right: Batch Action Buttons */}
            <div className="flex items-center gap-1 flex-shrink-0">
              {/* Batch Pin / Unpin */}
              <button
                onClick={handleBatchPin}
                disabled={batchPinMutation.isPending}
                title={allSelectedPinned ? 'Unpin selected' : 'Pin selected to top'}
                className={`p-1.5 rounded-lg border text-xs transition-colors cursor-pointer disabled:opacity-50 ${
                  allSelectedPinned
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20'
                    : 'border-zinc-800 hover:bg-zinc-800 text-zinc-300 hover:text-amber-400'
                }`}
              >
                {allSelectedPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
              </button>

              {/* Batch Archive / Restore */}
              <button
                onClick={handleBatchArchive}
                disabled={batchArchiveMutation.isPending}
                title={activeTab === 'archived' ? 'Restore selected notes' : 'Archive selected notes'}
                className="p-1.5 rounded-lg border border-zinc-800 hover:bg-zinc-800 text-zinc-300 hover:text-violet-400 transition-colors cursor-pointer disabled:opacity-50"
              >
                {activeTab === 'archived' ? (
                  <ArchiveRestore className="w-3.5 h-3.5" />
                ) : (
                  <Archive className="w-3.5 h-3.5" />
                )}
              </button>

              {/* Batch Delete */}
              <button
                onClick={() => setBatchDeleteConfirm(true)}
                disabled={batchDeleteMutation.isPending}
                title="Delete selected notes"
                className="p-1.5 rounded-lg border border-zinc-800 hover:border-red-500/40 hover:bg-red-500/10 text-zinc-300 hover:text-red-400 transition-colors cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>

              <div className="w-px h-4 bg-zinc-800 mx-0.5" />

              {/* Cancel Selection */}
              <button
                onClick={clearSelection}
                title="Cancel selection"
                className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* =========================================================================
          DETAIL COLUMN: Editor Canvas (flex-1 bg-zinc-950 full horizontal space)
      ========================================================================== */}
      <div
        className={`${mobilePane === 'list' ? 'hidden md:flex' : 'flex'} flex-1 flex-col h-full min-w-0 bg-zinc-950 overflow-hidden`}
      >
        {activeNote ? (
          <>
            {/* Top Editor Action Bar */}
            <div className="h-14 px-3 sm:px-8 border-b border-zinc-800/80 flex items-center justify-between gap-2 sm:gap-4 bg-zinc-950/80 backdrop-blur-md flex-shrink-0">
              {/* Save Status & Breadcrumb */}
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <button
                  onClick={() => setMobilePane('list')}
                  aria-label="Back to notes"
                  className="md:hidden -ml-1 p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="hidden sm:flex text-xs font-semibold text-zinc-400 items-center gap-1.5 min-w-0">
                  <FileText className="w-3.5 h-3.5 text-violet-400 flex-shrink-0" />
                  <span className="truncate max-w-[200px] lg:max-w-[320px] text-zinc-200">
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
              <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                {/* Linked Tasks Pill */}
                <button
                  onClick={() => setShowLinkedTasksDrawer(true)}
                  title="View linked action items"
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900 text-xs text-zinc-300 hover:bg-zinc-800/50 hover:text-zinc-100 transition-colors duration-200 cursor-pointer focus:outline-none focus:ring-1 focus:ring-zinc-700"
                >
                  <CheckSquare className="w-3.5 h-3.5 text-violet-400" />
                  <span>
                    {linkedTasks.length}
                    <span className="hidden sm:inline"> {linkedTasks.length === 1 ? 'task' : 'tasks'}</span>
                  </span>
                </button>

                {/* AI Assistant Menu */}
                <div className="relative">
                  <button
                    onClick={() => setShowAiMenu(!showAiMenu)}
                    disabled={isAiLoading}
                    aria-label="AI Assistant"
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-200 hover:bg-zinc-800/50 text-xs font-medium transition-colors duration-200 cursor-pointer focus:outline-none focus:ring-1 focus:ring-zinc-700 disabled:opacity-50"
                  >
                    {isAiLoading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-400" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                    )}
                    <span className="hidden sm:inline">AI Assistant</span>
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
                      <button
                        onClick={() => {
                          setShowAiMenu(false);
                          handleAiAutoTag();
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-xs text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
                      >
                        <TagIcon className="w-4 h-4 text-amber-400 flex-shrink-0" />
                        <div>
                          <p className="font-semibold">Auto-Tag Note</p>
                          <p className="text-[10px] text-zinc-500">Suggest tags from the content</p>
                        </div>
                      </button>
                    </div>
                  )}
                </div>

                <div className="hidden sm:block h-4 w-px bg-zinc-800 mx-0.5" />

                {/* Pin Button */}
                <button
                  onClick={() => handleTogglePin()}
                  title={isPinned ? 'Unpin' : 'Pin note'}
                  aria-label={isPinned ? 'Unpin' : 'Pin note'}
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
                  aria-label={isArchived ? 'Restore from Archive' : 'Archive note'}
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
                  aria-label="Delete note"
                  className="p-2 rounded-lg border border-zinc-800 hover:bg-red-500/10 hover:border-red-500/30 text-zinc-400 hover:text-red-400 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 sm:px-10 xl:px-16 py-8 sm:py-12 lg:py-16">
              <div className="max-w-5xl xl:max-w-6xl mx-auto w-full flex flex-col min-h-full">
                {/* Note Title (textarea so long titles wrap instead of scrolling sideways) */}
                <textarea
                  ref={titleInputRef}
                  rows={1}
                  placeholder="Untitled Note"
                  aria-label="Note title"
                  dir="auto"
                  value={title}
                  onChange={(e) => handleTitleChange(e.target.value.replace(/\n/g, ' '))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.preventDefault();
                  }}
                  className="w-full resize-none overflow-hidden text-2xl sm:text-3xl font-semibold text-zinc-100 placeholder:text-zinc-600 tracking-tight leading-tight focus:outline-none mb-3 bg-transparent border-none selection:bg-zinc-700/40"
                />

                {/* Tags & Metadata Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 pb-6 mb-8 border-b border-zinc-800/80 text-xs">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <TagIcon className="w-3.5 h-3.5 text-zinc-500 mr-0.5" />
                    {tags.map((tag) => {
                      const isFresh = freshAiTags.has(tag);
                      return (
                        <span
                          key={tag}
                          className={`group flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] transition-colors ${
                            isFresh
                              ? 'bg-zinc-800 border border-zinc-600 text-zinc-100'
                              : 'bg-zinc-900 border border-zinc-800 text-zinc-400'
                          }`}
                        >
                          {isFresh && <Sparkles className="w-3 h-3 text-zinc-300" />}
                          #{tag}
                          <button
                            onClick={() => handleRemoveTag(tag)}
                            aria-label={`Remove tag ${tag}`}
                            className="hover:text-red-400 transition-colors cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      );
                    })}

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
                          className="w-28 px-2.5 py-0.5 rounded-md bg-zinc-900 border border-zinc-700 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-700"
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
                    onAiAutoTag={handleAiAutoTag}
                    isAiLoading={isAiLoading}
                    linkedTasks={linkedTasks}
                    onTaskCheckChange={handleEditorTaskToggle}
                  />
                </div>
              </div>
            </div>
          </>
        ) : (
          /* Empty Workspace State */
          <div className="relative flex-1 flex flex-col items-center justify-center p-6 sm:p-12 text-center">
            <button
              onClick={() => setMobilePane('list')}
              aria-label="Back to notes"
              className="md:hidden absolute top-3 left-3 p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
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
              className="flex items-center gap-2 px-4 py-2.5 bg-zinc-100 text-zinc-950 hover:bg-white rounded-lg text-sm font-medium transition-colors duration-200 cursor-pointer focus:outline-none focus:ring-1 focus:ring-zinc-700"
            >
              <Plus className="w-4 h-4" />
              <span>Create New Note</span>
            </button>
          </div>
        )}
      </div>

      {/* Floating AI Notification Toast */}
      {aiNotification && (
        <div className="fixed bottom-20 sm:bottom-6 left-4 right-4 sm:left-auto sm:right-6 z-50 flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-200">
          {aiNotification.type === 'success' && <Sparkles className="w-4 h-4 text-violet-400 flex-shrink-0" />}
          {aiNotification.type === 'error' && <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />}
          {aiNotification.type === 'info' && <CheckSquare className="w-4 h-4 text-blue-400 flex-shrink-0" />}
          <span className="font-medium">{aiNotification.message}</span>
          <button
            onClick={() => setAiNotification(null)}
            aria-label="Dismiss notification"
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
                aria-label="Close linked tasks"
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
                className="flex-1 px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-700"
              />
              <button
                type="submit"
                disabled={!newLinkedTaskTitle.trim() || createLinkedTaskMutation.isPending}
                className="px-3 py-2 bg-zinc-100 hover:bg-white disabled:opacity-50 text-zinc-950 rounded-lg text-xs font-medium cursor-pointer transition-colors duration-200 focus:outline-none focus:ring-1 focus:ring-zinc-700"
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
                        <div className="w-4 h-4 rounded-[5px] bg-zinc-100 flex items-center justify-center text-zinc-950 border border-zinc-200">
                          <Check className="w-2.5 h-2.5 stroke-[2.5]" />
                        </div>
                      ) : (
                        <div className="w-4 h-4 rounded-[5px] bg-zinc-950 border border-zinc-700 hover:border-zinc-400 transition-colors duration-200 flex items-center justify-center">
                          <Check className="w-2.5 h-2.5 text-transparent stroke-[2.5]" />
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
                      <span className="text-[11px] text-zinc-500">
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

      {/* Delete Confirmation Modal (Single Note) */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl bg-zinc-900 border border-zinc-800 p-6 shadow-2xl animate-in zoom-in-95 duration-150">
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

      {/* Batch Delete Confirmation Modal (Multi-Select) */}
      {batchDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl bg-zinc-900 border border-zinc-800 p-6 shadow-2xl animate-in zoom-in-95 duration-150">
            <h3 className="text-base font-bold text-zinc-100 mb-2">
              Delete {selectedNoteIds.size} {selectedNoteIds.size === 1 ? 'note' : 'notes'}?
            </h3>
            <p className="text-xs text-zinc-400 mb-6 leading-relaxed">
              This action cannot be undone. All blocks, tables, and content associated with the selected
              notes will be permanently removed.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setBatchDeleteConfirm(false)}
                className="px-3.5 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-300 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmBatchDelete}
                disabled={batchDeleteMutation.isPending}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-xs font-semibold text-white transition-colors cursor-pointer disabled:opacity-50"
              >
                {batchDeleteMutation.isPending && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                )}
                <span>Delete {selectedNoteIds.size} Notes</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
