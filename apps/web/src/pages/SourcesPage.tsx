import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import {
  Radio,
  Mic,
  Square,
  UploadCloud,
  FileAudio,
  FileText,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Trash2,
  RotateCw,
  ExternalLink,
  Search,
  Copy,
  Check,
  X,
  Volume2,
  Sparkles,
} from 'lucide-react';
import { apiClient, Source, SourceStatus } from '@unmute/api-client';
import { responsiveDialogContentClass, sheetHandleClass } from '../components/ui/responsiveDialog';

export const SourcesPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | SourceStatus>('ALL');
  const [selectedSource, setSelectedSource] = useState<Source | null>(null);
  const [copiedTranscript, setCopiedTranscript] = useState(false);

  // Voice Recorder State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recorderError, setRecorderError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Upload feedback state
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Track previous source statuses to detect when any source completes transcription
  const prevStatusesRef = useRef<Map<string, SourceStatus>>(new Map());

  // Fetch sources with intelligent polling for in-progress transcriptions
  const { data: sources = [], isLoading } = useQuery<Source[]>({
    queryKey: ['sources'],
    queryFn: () => apiClient.getSources(),
    refetchInterval: (query) => {
      const currentSources = query.state.data;
      const hasActive = currentSources?.some(
        (s) => s.status === 'PENDING' || s.status === 'TRANSCRIBING'
      );
      return hasActive ? 1500 : 8000;
    },
  });

  // Keep selectedSource in sync with refreshed query data
  useEffect(() => {
    if (selectedSource) {
      const updated = sources.find((s) => s.id === selectedSource.id);
      if (updated) {
        setSelectedSource(updated);
      }
    }
  }, [sources, selectedSource]);

  // Invalidate notes & tags queries whenever a source transitions to COMPLETED
  useEffect(() => {
    if (!sources || sources.length === 0) return;

    let hasTransitionedToCompleted = false;

    sources.forEach((source) => {
      const prev = prevStatusesRef.current.get(source.id);
      if (
        prev &&
        (prev === 'PENDING' || prev === 'TRANSCRIBING') &&
        source.status === 'COMPLETED'
      ) {
        hasTransitionedToCompleted = true;
      }
      prevStatusesRef.current.set(source.id, source.status);
    });

    if (hasTransitionedToCompleted) {
      console.log('[Capture Engine] Source transcription completed! Invalidating notes cache...');
      queryClient.invalidateQueries({ queryKey: ['notes'] });
      queryClient.invalidateQueries({ queryKey: ['tags'] });
    }
  }, [sources, queryClient]);

  // Upload Mutation
  const uploadMutation = useMutation({
    mutationFn: async ({ file, filename }: { file: File | Blob; filename?: string }) => {
      return apiClient.uploadSource(file, filename);
    },
    onSuccess: (newSource) => {
      prevStatusesRef.current.set(newSource.id, 'PENDING');
      queryClient.invalidateQueries({ queryKey: ['sources'] });
      setSelectedSource(newSource);
      setIsUploading(false);
      setUploadError(null);
    },
    onError: (err: any) => {
      setIsUploading(false);
      setUploadError(err?.message || 'Failed to upload source file');
    },
  });

  // Delete Mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.deleteSource(id),
    onSuccess: (_, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ['sources'] });
      if (selectedSource?.id === deletedId) {
        setSelectedSource(null);
      }
    },
  });

  // Retry Mutation
  const retryMutation = useMutation({
    mutationFn: (id: string) => apiClient.retrySource(id),
    onSuccess: (retried) => {
      prevStatusesRef.current.set(retried.id, 'PENDING');
      queryClient.invalidateQueries({ queryKey: ['sources'] });
      if (selectedSource?.id === retried.id) {
        setSelectedSource(retried);
      }
    },
  });

  // Navigate to Notes view with guaranteed cache invalidation and noteId selection
  const handleViewNote = (noteId: string) => {
    queryClient.invalidateQueries({ queryKey: ['notes'] });
    queryClient.invalidateQueries({ queryKey: ['tags'] });
    navigate(`/notes?noteId=${encodeURIComponent(noteId)}`);
  };

  // --- Voice Recorder Handlers ---
  const startRecording = async () => {
    setRecorderError(null);
    audioChunksRef.current = [];

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Microphone access is not supported in this browser.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/mp4';

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        const now = new Date();
        const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const filename = `voice-recording-${timestamp}.webm`;

        // Automatically upload recorded blob to backend pipeline
        setIsUploading(true);
        uploadMutation.mutate({ file: audioBlob, filename });

        // Stop all audio tracks to release microphone hardware
        stream.getTracks().forEach((track) => track.stop());
      };

      recorder.start(250); // Collect data chunks every 250ms
      setIsRecording(true);
      setRecordingDuration(0);

      // Start elapsed timer
      timerIntervalRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      setRecorderError(err?.message || 'Could not access microphone.');
      setIsRecording(false);
    }
  };

  useEffect(() => {
    const token = searchParams.get('record') === '1' ? searchParams.get('t') : null;
    if (!token || sessionStorage.getItem('unmute-record') === token) return;
    sessionStorage.setItem('unmute-record', token);
    const next = new URLSearchParams(searchParams);
    next.delete('record');
    next.delete('t');
    setSearchParams(next, { replace: true });
    if (isRecording) return;
    void startRecording();
  }, [searchParams, setSearchParams, isRecording]);

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
      mediaRecorderRef.current.stop();
      audioChunksRef.current = [];
      setIsRecording(false);
    }
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    setRecordingDuration(0);
  };

  const stopRef = useRef(stopRecording);
  stopRef.current = stopRecording;

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('unmute:recording', { detail: { active: isRecording } }));
  }, [isRecording]);

  useEffect(() => {
    const onStop = () => stopRef.current();
    window.addEventListener('unmute:stop-recording', onStop);
    return () => {
      window.removeEventListener('unmute:stop-recording', onStop);
      window.dispatchEvent(new CustomEvent('unmute:recording', { detail: { active: false } }));
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  // --- Dropzone Handlers ---
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) return;
      setUploadError(null);
      setIsUploading(true);

      // Upload accepted files
      acceptedFiles.forEach((file) => {
        uploadMutation.mutate({ file, filename: file.name });
      });
    },
    [uploadMutation]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'audio/*': ['.mp3', '.wav', '.m4a', '.webm', '.ogg', '.aac', '.flac'],
      'application/pdf': ['.pdf'],
      'text/plain': ['.txt', '.md'],
    },
    maxSize: 50 * 1024 * 1024, // 50MB
    disabled: isUploading || isRecording,
  });

  // Format seconds to mm:ss
  const formatDuration = (seconds?: number | null) => {
    if (!seconds && seconds !== 0) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Format file size
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  // Copy transcript to clipboard
  const handleCopyTranscript = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedTranscript(true);
    setTimeout(() => setCopiedTranscript(false), 2000);
  };

  // Filter sources
  const filteredSources = sources.filter((s) => {
    const matchesSearch =
      s.originalName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.transcript && s.transcript.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (s.noteTitle && s.noteTitle.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesStatus = statusFilter === 'ALL' || s.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Calculate stats
  const totalCount = sources.length;
  const transcribingCount = sources.filter(
    (s) => s.status === 'PENDING' || s.status === 'TRANSCRIBING'
  ).length;
  const completedCount = sources.filter((s) => s.status === 'COMPLETED').length;
  const totalSeconds = sources.reduce((acc, curr) => acc + (curr.durationSeconds || 0), 0);

  return (
    <div className="flex-1 w-full flex flex-col bg-transparent h-full overflow-y-auto">
      <div className="w-full px-4 md:px-8 xl:px-12 py-6 pb-20 flex flex-col gap-8">
        {/* Header Title Section */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-zinc-800/60 pb-6">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 ring-1 ring-inset ring-white/10 text-zinc-300">
                <Radio className="w-5 h-5" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-white">Capture Engine & Sources</h1>
            </div>
            <p className="mt-1.5 text-sm text-zinc-400">
              Record voice thoughts or drop audio files. UNMUTE transcribes them and automatically synchronizes them into your knowledge base.
            </p>
          </div>

          {/* Quick Metrics Bar */}
          <div className="flex items-center gap-2 bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-1.5 self-start sm:self-auto">
            <div className="px-3 py-1 text-center">
              <span className="text-[10px] uppercase tracking-wider text-zinc-400 font-semibold block">Total</span>
              <span className="text-sm font-bold text-white">{totalCount}</span>
            </div>
            <div className="h-6 w-px bg-zinc-800" />
            <div className="px-3 py-1 text-center">
              <span className="text-[10px] uppercase tracking-wider text-amber-400 font-semibold block">Active</span>
              <span className="text-sm font-bold text-amber-400 flex items-center justify-center gap-1">
                {transcribingCount > 0 && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />}
                {transcribingCount}
              </span>
            </div>
            <div className="h-6 w-px bg-zinc-800" />
            <div className="px-3 py-1 text-center">
              <span className="text-[10px] uppercase tracking-wider text-emerald-400 font-semibold block">Ready</span>
              <span className="text-sm font-bold text-emerald-400">{completedCount}</span>
            </div>
            <div className="h-6 w-px bg-zinc-800" />
            <div className="px-3 py-1 text-center">
              <span className="text-[10px] uppercase tracking-wider text-zinc-400 font-semibold block">Audio</span>
              <span className="text-sm font-bold text-zinc-200">{formatDuration(totalSeconds)}</span>
            </div>
          </div>
        </div>

        {/* ======================================================== */}
        {/* CAPTURE DOCK: Voice Recorder + Dropzone Side-by-Side     */}
        {/* ======================================================== */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* 1. Native Voice Recording Widget (5 cols) */}
          <div className="lg:col-span-5 flex flex-col justify-between p-6 rounded-2xl max-md:rounded-lg bg-gradient-to-b from-zinc-800/50 to-zinc-900/50 border border-zinc-800/80 ring-1 ring-inset ring-white/10 relative overflow-hidden backdrop-blur-sm group">
            {/* Ambient Background Glow */}
            <div
              className={`absolute -top-24 -left-24 w-60 h-60 rounded-full blur-3xl transition-opacity duration-700 pointer-events-none ${
                isRecording ? 'bg-rose-500/20 opacity-100' : 'bg-violet-400/15 opacity-80'
              }`}
            />

            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      isRecording ? 'bg-rose-500 animate-ping' : 'bg-zinc-500'
                    }`}
                  />
                  <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    {isRecording ? 'Recording Live Audio' : 'Voice Capture Memo'}
                  </span>
                </div>
                {isRecording && (
                  <span className="text-xs font-mono font-bold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-md">
                    LIVE
                  </span>
                )}
              </div>

              {/* Central Mic & Waveform Display */}
              <div className="flex flex-col items-center justify-center my-6 gap-4">
                {/* Large Pulsating Record Button */}
                <div className="relative">
                  {isRecording && (
                    <>
                      <div className="absolute inset-0 rounded-full bg-rose-500/30 animate-ping opacity-75" />
                      <div className="absolute -inset-2 rounded-full bg-rose-500/20 animate-pulse" />
                    </>
                  )}
                  <button
                    onClick={isRecording ? stopRecording : startRecording}
                    disabled={isUploading}
                    aria-label={isRecording ? 'Stop recording' : 'Start recording'}
                    className={`relative z-10 w-20 h-20 rounded-full flex items-center justify-center transition-all duration-200 ease-out active:scale-[0.98] cursor-pointer ${
                      isRecording
                        ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/40'
                        : 'border border-violet-400/40 bg-violet-500/15 text-violet-200 shadow-[0_0_15px_rgba(167,139,250,0.45)] hover:bg-violet-500/25'
                    }`}
                    title={isRecording ? 'Click to Stop & Transcribe' : 'Click to Record Voice Note'}
                  >
                    {isRecording ? (
                      <Square className="w-7 h-7 fill-current" />
                    ) : (
                      <Mic className="w-8 h-8" />
                    )}
                  </button>
                </div>

                {/* Live Timer Display */}
                <div className="text-center">
                  <div
                    className={`text-3xl font-mono font-bold tracking-tight transition-colors ${
                      isRecording ? 'text-rose-400' : 'text-zinc-300'
                    }`}
                  >
                    {formatDuration(recordingDuration)}
                  </div>
                  <p className="text-xs text-zinc-400 mt-1">
                    {isRecording
                      ? 'Speaking... click square button when finished'
                      : 'Tap to dictate audio thought'}
                  </p>
                </div>

                {/* Animated Waveform Visualization */}
                {isRecording && (
                  <div className="flex items-center gap-1.5 h-8 mt-2">
                    {[12, 24, 18, 32, 20, 28, 14, 30, 22, 16, 26, 12].map((height, i) => (
                      <div
                        key={i}
                        className="w-1 bg-rose-500 rounded-full transition-all duration-150 animate-pulse"
                        style={{
                          height: `${Math.max(8, (height * (Math.sin(recordingDuration * 2 + i) + 1.2)) / 1.5)}px`,
                          animationDelay: `${i * 80}ms`,
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Recorder Controls / Status */}
            <div className="pt-4 border-t border-zinc-800/60 flex items-center justify-between">
              {isRecording ? (
                <div className="flex items-center justify-between w-full">
                  <button
                    onClick={cancelRecording}
                    className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer px-3 py-1.5 rounded-lg hover:bg-zinc-800/60"
                  >
                    Discard Recording
                  </button>
                  <button
                    onClick={stopRecording}
                    className="text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 px-3.5 py-1.5 rounded-lg shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Finish & Auto-Transcribe
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between w-full text-xs text-zinc-400">
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-zinc-400" />
                    Auto-creates structured note
                  </span>
                  <span className="font-mono text-[11px] text-zinc-400">MediaRecorder API</span>
                </div>
              )}
            </div>

            {recorderError && (
              <div className="mt-3 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{recorderError}</span>
              </div>
            )}
          </div>

          {/* 2. Drag & Drop Upload Zone (7 cols) */}
          <div className="lg:col-span-7 flex flex-col justify-between">
            <div
              {...getRootProps()}
              className={`flex-1 flex flex-col items-center justify-center p-8 rounded-2xl border-2 border-dashed transition-all duration-200 cursor-pointer text-center relative overflow-hidden backdrop-blur-sm min-h-[280px] ${
                isDragActive
                  ? 'border-zinc-400 bg-zinc-800/50 ring-1 ring-inset ring-white/10'
                  : 'border-zinc-800/80 hover:border-zinc-700 bg-zinc-900/30 hover:bg-zinc-900/50'
              } ${isUploading ? 'opacity-60 pointer-events-none' : ''}`}
            >
              <input {...getInputProps()} />

              {/* Glowing hover state */}
              <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity" />

              <div className="p-4 rounded-2xl bg-zinc-800/50 border border-zinc-700/50 text-zinc-300 mb-4">
                {isUploading ? (
                  <Loader2 className="w-8 h-8 animate-spin text-zinc-300" />
                ) : (
                  <UploadCloud className="w-8 h-8" />
                )}
              </div>

              <h3 className="text-base font-semibold text-white">
                {isDragActive
                  ? 'Drop audio file to process...'
                  : isUploading
                  ? 'Uploading & spooling transcription pipeline...'
                  : 'Drag & drop audio recordings or files'}
              </h3>

              <p className="mt-1 text-xs text-zinc-400 max-w-sm">
                Drop your recorded voice memos (.mp3, .wav, .m4a, .webm) or documents. UNMUTE converts them into structured editable notes automatically.
              </p>

              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <span className="text-[11px] px-2.5 py-1 rounded-md bg-zinc-800/80 text-zinc-400 border border-zinc-700/60 font-mono">
                  MP3 / WAV / M4A / WEBM
                </span>
                <span className="text-[11px] px-2.5 py-1 rounded-md bg-zinc-800/80 text-zinc-400 border border-zinc-700/60 font-mono">
                  PDF / TXT
                </span>
                <span className="text-[11px] px-2.5 py-1 rounded-md bg-zinc-800/80 text-zinc-400 border border-zinc-700/60 font-mono">
                  Max 50MB
                </span>
              </div>
            </div>

            {uploadError && (
              <div className="mt-3 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{uploadError}</span>
                </div>
                <button
                  onClick={() => setUploadError(null)}
                  aria-label="Dismiss error"
                  className="flex max-md:min-h-11 max-md:min-w-11 items-center justify-center p-1 hover:bg-rose-500/20 rounded cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ======================================================== */}
        {/* SOURCES INBOX: Master List & Filter Header              */}
        {/* ======================================================== */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            {/* Filter Tabs */}
            <div className="flex items-center gap-1.5 p-1 bg-zinc-900/60 border border-zinc-800/80 rounded-xl self-start">
              {(
                [
                  { id: 'ALL', label: 'All Sources', count: sources.length },
                  { id: 'TRANSCRIBING', label: 'Transcribing', count: transcribingCount },
                  { id: 'COMPLETED', label: 'Completed', count: completedCount },
                  {
                    id: 'FAILED',
                    label: 'Failed',
                    count: sources.filter((s) => s.status === 'FAILED').length,
                  },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setStatusFilter(tab.id as any)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                    statusFilter === tab.id
                      ? 'bg-zinc-800 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                      statusFilter === tab.id
                        ? 'bg-zinc-700 text-zinc-200'
                        : 'bg-zinc-800/80 text-zinc-400'
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-72 rounded-xl border border-zinc-800/80 bg-zinc-900/60 focus-within:border-zinc-500 focus-within:ring-1 focus-within:ring-zinc-500 transition-colors">
              <Search className="w-4 h-4 text-zinc-400 absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                dir="auto"
                placeholder="Search transcripts or files..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent border-0 rounded-xl ps-9 pe-8 py-1.5 text-xs text-white placeholder-zinc-400 outline-none focus:outline-none focus:ring-0"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                  className="absolute end-1 top-1/2 flex max-md:min-h-11 max-md:min-w-11 -translate-y-1/2 items-center justify-center text-zinc-400 hover:text-zinc-200"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Sources List / Grid */}
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Loader2 className="w-7 h-7 animate-spin text-zinc-400" />
              <p className="text-xs text-zinc-400 font-medium">Loading sources inbox...</p>
            </div>
          ) : filteredSources.length === 0 ? (
            /* Premium Empty State */
            <div className="flex flex-col items-center justify-center py-24 px-6 mt-2 border border-dashed border-zinc-800/60 rounded-2xl max-md:rounded-lg bg-zinc-900/20 text-center">
              <div className="p-4 rounded-2xl bg-zinc-800/40 text-zinc-400 mb-3 border border-zinc-700/40">
                <FileAudio className="w-8 h-8 stroke-[1.5]" />
              </div>
              <h3 className="text-sm font-semibold text-zinc-200">
                {searchQuery || statusFilter !== 'ALL'
                  ? 'No matching sources found'
                  : 'Capture inbox is currently empty'}
              </h3>
              <p className="mt-1 text-xs text-zinc-400 max-w-sm">
                {searchQuery || statusFilter !== 'ALL'
                  ? 'Try adjusting your search query or status filter.'
                  : 'Record your first audio memo above or drag and drop an audio file to run the AI voice-to-knowledge pipeline.'}
              </p>
            </div>
          ) : (
            /* Sources Grid */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 md:gap-4">
              {filteredSources.map((source) => {
                const isTranscribing =
                  source.status === 'PENDING' || source.status === 'TRANSCRIBING';
                const isFailed = source.status === 'FAILED';
                const isCompleted = source.status === 'COMPLETED';
                const isSelected = selectedSource?.id === source.id;

                return (
                  <div
                    key={source.id}
                    onClick={() => setSelectedSource(source)}
                    className={`flex flex-col justify-between p-4 rounded-xl border ring-1 ring-inset ring-white/10 transition-all duration-200 ease-out active:scale-[0.98] cursor-pointer relative group ${
                      isSelected
                        ? 'bg-gradient-to-b from-zinc-800/50 to-zinc-900/50 border-zinc-500'
                        : 'bg-zinc-900/40 hover:bg-zinc-900/70 border-zinc-800/80 hover:border-zinc-700'
                    }`}
                  >
                    <div>
                      {/* Top Card Bar */}
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="p-2 rounded-lg bg-zinc-800/80 text-zinc-300 border border-zinc-700/50 shrink-0">
                            {source.fileType.includes('audio') ? (
                              <FileAudio className="w-4 h-4 text-zinc-300" />
                            ) : (
                              <FileText className="w-4 h-4 text-zinc-400" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <h4
                              className="text-xs font-semibold text-zinc-200 truncate group-hover:text-white transition-colors"
                              title={source.originalName}
                            >
                              {source.originalName}
                            </h4>
                            <div className="flex items-center gap-2 text-[10px] text-zinc-400 mt-0.5">
                              <span>{formatFileSize(source.fileSize)}</span>
                              {source.durationSeconds && (
                                <>
                                  <span>•</span>
                                  <span className="font-mono">
                                    {formatDuration(source.durationSeconds)}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Status Badge */}
                        <div>
                          {isTranscribing && (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse">
                              <Loader2 className="w-2.5 h-2.5 animate-spin" />
                              Transcribing
                            </span>
                          )}
                          {isCompleted && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              <CheckCircle2 className="w-2.5 h-2.5" />
                              Completed
                            </span>
                          )}
                          {isFailed && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
                              <AlertCircle className="w-2.5 h-2.5" />
                              Failed
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Transcript Preview Snippet */}
                      {source.transcript ? (
                        <p className="text-xs text-zinc-400 line-clamp-3 leading-relaxed italic border-l-2 border-zinc-700 pl-2.5 my-2">
                          "{source.transcript}"
                        </p>
                      ) : isTranscribing ? (
                        <div className="p-3 rounded-lg bg-zinc-950/40 border border-zinc-800/60 my-2 flex items-center gap-2 text-xs text-amber-400/80">
                          <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0 text-amber-400" />
                          <span className="truncate">Whisper transcription engine active...</span>
                        </div>
                      ) : (
                        <div className="p-3 rounded-lg bg-zinc-950/40 border border-zinc-800/60 my-2 text-xs text-zinc-400">
                          No transcript content available.
                        </div>
                      )}
                    </div>

                    {/* Bottom Card Footer */}
                    <div className="mt-3 pt-3 border-t border-zinc-800/60 flex items-center justify-between text-xs">
                      {/* Linked Note Link */}
                      {source.noteId ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViewNote(source.noteId!);
                          }}
                          className="flex items-center gap-1 text-[11px] font-medium text-zinc-300 hover:text-zinc-100 transition-all duration-200 ease-out group/link cursor-pointer truncate max-w-[170px]"
                          title={`Open Note: ${source.noteTitle || 'Untitled Note'}`}
                        >
                          <FileText className="w-3 h-3 shrink-0" />
                          <span className="truncate">{source.noteTitle || 'Open Note'}</span>
                          <ExternalLink className="w-2.5 h-2.5 opacity-0 group-hover/link:opacity-100 transition-opacity shrink-0" />
                        </button>
                      ) : (
                        <span className="text-[10px] text-zinc-400">
                          {new Date(source.createdAt).toLocaleDateString()}
                        </span>
                      )}

                      {/* Card Actions */}
                      <div className="flex items-center gap-1">
                        {isFailed && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              retryMutation.mutate(source.id);
                            }}
                            className="p-1 rounded text-zinc-400 hover:text-amber-400 hover:bg-amber-500/10 transition-colors cursor-pointer"
                            title="Retry Transcription"
                          >
                            <RotateCw className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`Delete source "${source.originalName}"?`)) {
                              deleteMutation.mutate(source.id);
                            }
                          }}
                          className="p-1 rounded text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                          title="Delete Source"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ======================================================== */}
      {/* SOURCE DETAIL SLIDE-OUT DRAWER                           */}
      {/* ======================================================== */}
      {selectedSource && (
        <div className="fixed inset-0 z-50">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={() => setSelectedSource(null)}
          />

          {/* Drawer Canvas */}
          <div className={`${responsiveDialogContentClass} z-10 flex w-full flex-col bg-zinc-950 shadow-2xl md:fixed md:inset-y-0 md:right-0 md:bottom-auto md:left-auto md:h-full md:max-h-none md:max-w-xl md:rounded-none md:border-l md:border-t-0 md:border-zinc-800 md:overflow-hidden`}>
            <div className={sheetHandleClass} aria-hidden />
            {/* Drawer Header */}
            <div className="p-6 border-b border-zinc-800 flex items-start justify-between gap-4 bg-zinc-900/40">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 ring-1 ring-inset ring-white/10 text-zinc-300 shrink-0">
                  <FileAudio className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3
                    className="text-sm font-bold text-white truncate"
                    title={selectedSource.originalName}
                  >
                    {selectedSource.originalName}
                  </h3>
                  <div className="flex items-center gap-2 text-xs text-zinc-400 mt-0.5">
                    <span>{formatFileSize(selectedSource.fileSize)}</span>
                    {selectedSource.durationSeconds && (
                      <>
                        <span>•</span>
                        <span className="font-mono">
                          {formatDuration(selectedSource.durationSeconds)}
                        </span>
                      </>
                    )}
                    <span>•</span>
                    <span>{selectedSource.fileType}</span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setSelectedSource(null)}
                aria-label="Close details"
                className="flex max-md:min-h-11 max-md:min-w-11 items-center justify-center p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800/80 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
              {/* Status Banner */}
              <div
                className={`p-4 rounded-xl border flex items-center justify-between gap-4 ${
                  selectedSource.status === 'COMPLETED'
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                    : selectedSource.status === 'FAILED'
                    ? 'bg-rose-500/10 border-rose-500/20 text-rose-300'
                    : 'bg-amber-500/10 border-amber-500/20 text-amber-300'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  {selectedSource.status === 'COMPLETED' && (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  )}
                  {selectedSource.status === 'FAILED' && (
                    <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
                  )}
                  {(selectedSource.status === 'PENDING' ||
                    selectedSource.status === 'TRANSCRIBING') && (
                    <Loader2 className="w-5 h-5 animate-spin text-amber-400 shrink-0" />
                  )}
                  <div>
                    <span className="text-xs font-bold block uppercase tracking-wider">
                      Status: {selectedSource.status}
                    </span>
                    <span className="text-xs text-zinc-400">
                      {selectedSource.status === 'COMPLETED'
                        ? 'Successfully transcribed and synchronized into Notes'
                        : selectedSource.status === 'FAILED'
                        ? selectedSource.errorMessage || 'Transcription encountered an issue'
                        : 'Currently transcribing with AI engine...'}
                    </span>
                  </div>
                </div>

                {selectedSource.status === 'FAILED' && (
                  <button
                    onClick={() => retryMutation.mutate(selectedSource.id)}
                    className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                    Retry
                  </button>
                )}
              </div>

              {/* Linked Generated Note Card */}
              {selectedSource.noteId && (
                <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 ring-1 ring-inset ring-white/10 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 rounded-lg bg-zinc-800 text-zinc-300 shrink-0">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-[11px] font-medium text-zinc-400">
                        Generated note
                      </span>
                      <h4 className="text-xs font-bold text-white truncate">
                        {selectedSource.noteTitle || 'Voice Note'}
                      </h4>
                    </div>
                  </div>

                  <button
                    onClick={() => handleViewNote(selectedSource.noteId!)}
                    className="px-3 py-1.5 rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-semibold flex items-center gap-1.5 transition-all duration-200 ease-out active:scale-[0.98] cursor-pointer shrink-0"
                  >
                    <span>View Note</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Transcript Section */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                    <Volume2 className="w-3.5 h-3.5 text-zinc-400" />
                    AI Transcript
                  </span>
                  {selectedSource.transcript && (
                    <button
                      onClick={() => handleCopyTranscript(selectedSource.transcript || '')}
                      className="text-xs text-zinc-400 hover:text-white flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      {copiedTranscript ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400 font-medium">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy Text</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                <div className="p-5 rounded-xl bg-zinc-900/60 border border-zinc-800 text-xs text-zinc-300 leading-relaxed font-sans min-h-[160px] whitespace-pre-wrap">
                  {selectedSource.transcript ? (
                    selectedSource.transcript
                  ) : (
                    <span className="text-zinc-400 italic">
                      Transcription is currently in progress. Text will stream here automatically upon completion.
                    </span>
                  )}
                </div>
              </div>

              {/* Metadata Table */}
              <div className="flex flex-col gap-2 pt-2 border-t border-zinc-800/60">
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                  Technical Metadata
                </span>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 rounded-lg bg-zinc-900/40 border border-zinc-800/60">
                    <span className="text-[10px] text-zinc-400 uppercase block">Source ID</span>
                    <span className="font-mono text-zinc-300 text-[11px] truncate block">
                      {selectedSource.id}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-zinc-900/40 border border-zinc-800/60">
                    <span className="text-[10px] text-zinc-400 uppercase block">Storage File</span>
                    <span className="font-mono text-zinc-300 text-[11px] truncate block">
                      {selectedSource.filename}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-zinc-900/40 border border-zinc-800/60">
                    <span className="text-[10px] text-zinc-400 uppercase block">Uploaded</span>
                    <span className="text-zinc-300 text-[11px]">
                      {new Date(selectedSource.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-zinc-900/40 border border-zinc-800/60">
                    <span className="text-[10px] text-zinc-400 uppercase block">Duration</span>
                    <span className="font-mono text-zinc-300 text-[11px]">
                      {formatDuration(selectedSource.durationSeconds)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Drawer Bottom Bar */}
            <div className="p-4 border-t border-zinc-800 flex items-center justify-between bg-zinc-900/40">
              <button
                onClick={() => {
                  if (confirm(`Delete source "${selectedSource.originalName}"?`)) {
                    deleteMutation.mutate(selectedSource.id);
                  }
                }}
                className="text-xs font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 px-3 py-2 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete Source
              </button>

              <button
                onClick={() => setSelectedSource(null)}
                className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-medium transition-colors cursor-pointer"
              >
                Close Drawer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SourcesPage;
