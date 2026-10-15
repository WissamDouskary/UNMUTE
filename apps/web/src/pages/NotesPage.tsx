import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
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
} from 'lucide-react';
import { apiClient, Note } from '@unmute/api-client';
import { RichTextEditor } from '../components/RichTextEditor';

type FilterTab = 'all' | 'pinned' | 'archived';
type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error';

export function NotesPage() {
  // --- Data State ---
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);

  // --- Filtering & Search ---
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [availableTags, setAvailableTags] = useState<string[]>([]);

  // --- Active Note Form State ---
  const [title, setTitle] = useState<string>('');
  const [content, setContent] = useState<string>('');
  const [tags, setTags] = useState<string[]>([]);
  const [isPinned, setIsPinned] = useState<boolean>(false);
  const [isArchived, setIsArchived] = useState<boolean>(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');

  // --- UI Modals/Popovers ---
  const [showTagInput, setShowTagInput] = useState<boolean>(false);
  const [newTagText, setNewTagText] = useState<string>('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isInitialMount = useRef<boolean>(true);

  // Fetch Tags
  const fetchTags = useCallback(async () => {
    try {
      const tagList = await apiClient.getNoteTags();
      setAvailableTags(tagList);
    } catch {
      // Non-critical, ignore
    }
  }, []);

  // Fetch Notes
  const fetchNotes = useCallback(async () => {
    setLoading(true);
    try {
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
      setNotes(fetched);

      // If nothing selected or selected was deleted, select first if available
      const first = fetched[0];
      if (first && (!selectedNoteId || !fetched.some((n) => n.id === selectedNoteId))) {
        setSelectedNoteId(first.id);
      } else if (fetched.length === 0) {
        setSelectedNoteId(null);
      }
    } catch (err) {
      console.error('Failed to fetch notes:', err);
    } finally {
      setLoading(false);
    }
  }, [activeTab, searchQuery, selectedTag, selectedNoteId]);

  useEffect(() => {
    fetchNotes();
    fetchTags();
  }, [activeTab, searchQuery, selectedTag, fetchNotes, fetchTags]);

  const currentNoteIdRef = useRef<string | null>(null);
  const pendingSaveRef = useRef<{ id: string; title: string; content: string; tags: string[] } | null>(null);

  // Synchronize form when selectedNoteId changes (only on note switch)
  const activeNote = useMemo(() => {
    return notes.find((n) => n.id === selectedNoteId) || null;
  }, [notes, selectedNoteId]);

  // --- Auto-Save Handler (Debounced) ---
  const saveChanges = useCallback(
    async (noteId: string, currentTitle: string, currentContent: string, currentTags: string[]) => {
      if (!currentTitle.trim()) return;

      setSaveStatus('saving');
      try {
        const updated = await apiClient.updateNote(noteId, {
          title: currentTitle.trim(),
          content: currentContent,
          tags: currentTags,
          isPinned,
          isArchived,
        });

        // Update in-memory list
        setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
        setSaveStatus('saved');
        fetchTags();
      } catch (err) {
        console.error('Error saving note:', err);
        setSaveStatus('error');
      }
    },
    [isPinned, isArchived, fetchTags]
  );

  // Switch Note synchronization: Flush pending changes from previous note, then load new note
  useEffect(() => {
    if (selectedNoteId !== currentNoteIdRef.current) {
      // Flush previous pending save immediately before switching
      if (pendingSaveRef.current && pendingSaveRef.current.id === currentNoteIdRef.current) {
        saveChanges(
          pendingSaveRef.current.id,
          pendingSaveRef.current.title,
          pendingSaveRef.current.content,
          pendingSaveRef.current.tags
        );
        pendingSaveRef.current = null;
      }

      currentNoteIdRef.current = selectedNoteId;

      if (activeNote) {
        setTitle(activeNote.title || '');
        setContent(activeNote.content || '');
        setTags(activeNote.tags || []);
        setIsPinned(activeNote.isPinned);
        setIsArchived(activeNote.isArchived);
        setSaveStatus('saved');
      } else {
        setTitle('');
        setContent('');
        setTags([]);
        setIsPinned(false);
        setIsArchived(false);
        setSaveStatus('saved');
      }
    }
  }, [selectedNoteId, activeNote, saveChanges]);

  // Trigger debounced auto-save (1200ms) whenever user edits title or content
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (!selectedNoteId || !activeNote) return;

    const titleChanged = title !== activeNote.title;
    const contentChanged = content !== (activeNote.content || '');

    if (!titleChanged && !contentChanged) return;

    setSaveStatus('unsaved');
    pendingSaveRef.current = { id: selectedNoteId, title, content, tags };

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      saveChanges(selectedNoteId, title, content, tags);
      pendingSaveRef.current = null;
    }, 1200);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [title, content, tags, selectedNoteId, activeNote, saveChanges]);

  // Flush on tab close or navigation
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (pendingSaveRef.current) {
        saveChanges(
          pendingSaveRef.current.id,
          pendingSaveRef.current.title,
          pendingSaveRef.current.content,
          pendingSaveRef.current.tags
        );
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      handleBeforeUnload();
    };
  }, [saveChanges]);

  // Tiptap Content Change Callback
  const handleEditorChange = useCallback((newHtml: string) => {
    setContent(newHtml);
  }, []);

  // --- Create Note ---
  const handleCreateNote = async () => {
    try {
      setSaveStatus('saving');
      const newNote = await apiClient.createNote({
        title: 'Untitled',
        content: '<p></p>',
        tags: selectedTag ? [selectedTag] : [],
        isPinned: activeTab === 'pinned',
      });

      setNotes((prev) => [newNote, ...prev]);
      setSelectedNoteId(newNote.id);
      setTitle(newNote.title);
      setContent('<p></p>');
      setTags(newNote.tags || []);
      setIsPinned(newNote.isPinned);
      setIsArchived(false);
      setSaveStatus('saved');
      fetchTags();
    } catch (err) {
      console.error('Failed to create note:', err);
      setSaveStatus('error');
    }
  };

  // --- Toggle Pin ---
  const handleTogglePin = async (e?: React.MouseEvent, noteId?: string) => {
    e?.stopPropagation();
    const targetId = noteId || selectedNoteId;
    if (!targetId) return;

    try {
      const updated = await apiClient.togglePinNote(targetId);
      setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
      if (targetId === selectedNoteId) {
        setIsPinned(updated.isPinned);
      }
    } catch (err) {
      console.error('Failed to toggle pin:', err);
    }
  };

  // --- Toggle Archive ---
  const handleToggleArchive = async (e?: React.MouseEvent, noteId?: string) => {
    e?.stopPropagation();
    const targetId = noteId || selectedNoteId;
    if (!targetId) return;

    try {
      const updated = await apiClient.toggleArchiveNote(targetId);
      if (activeTab === 'all' || (activeTab === 'archived' && updated.isArchived)) {
        setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
      } else {
        setNotes((prev) => prev.filter((n) => n.id !== targetId));
        if (targetId === selectedNoteId) {
          const remaining = notes.filter((n) => n.id !== targetId);
          const firstRemaining = remaining[0];
          setSelectedNoteId(firstRemaining ? firstRemaining.id : null);
        }
      }
      if (targetId === selectedNoteId) {
        setIsArchived(updated.isArchived);
      }
    } catch (err) {
      console.error('Failed to toggle archive:', err);
    }
  };

  // --- Delete Note ---
  const handleDeleteNote = async (noteId: string) => {
    try {
      await apiClient.deleteNote(noteId);
      const remaining = notes.filter((n) => n.id !== noteId);
      setNotes(remaining);
      setDeleteConfirmId(null);
      if (selectedNoteId === noteId) {
        const firstRemaining = remaining[0];
        setSelectedNoteId(firstRemaining ? firstRemaining.id : null);
      }
      fetchTags();
    } catch (err) {
      console.error('Failed to delete note:', err);
    }
  };

  // --- Tag Management ---
  const handleAddTag = async (tagToAdd: string) => {
    const clean = tagToAdd.trim().toLowerCase();
    if (!clean || tags.includes(clean) || !selectedNoteId) return;

    const nextTags = [...tags, clean];
    setTags(nextTags);
    setNewTagText('');
    setShowTagInput(false);

    try {
      const updated = await apiClient.updateNote(selectedNoteId, {
        title,
        content,
        tags: nextTags,
        isPinned,
        isArchived,
      });
      setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
      fetchTags();
    } catch (err) {
      console.error('Failed to update tags:', err);
    }
  };

  const handleRemoveTag = async (tagToRemove: string) => {
    if (!selectedNoteId) return;
    const nextTags = tags.filter((t) => t !== tagToRemove);
    setTags(nextTags);

    try {
      const updated = await apiClient.updateNote(selectedNoteId, {
        title,
        content,
        tags: nextTags,
        isPinned,
        isArchived,
      });
      setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
      fetchTags();
    } catch (err) {
      console.error('Failed to remove tag:', err);
    }
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
                  onChange={(e) => setTitle(e.target.value)}
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
                    content={content}
                    onChange={handleEditorChange}
                    placeholder="Write your thoughts, or press '/' for commands..."
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
              support. Press <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono text-xs">/</kbd> anywhere to insert blocks.
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
