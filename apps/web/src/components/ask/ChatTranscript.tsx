import { useEffect, useRef } from 'react';
import { ArrowRight, Bot, Clock, Database, ExternalLink, FileText, Tag, User as UserIcon } from 'lucide-react';
import type { Citation, SemanticSearchResult } from '@unmute/api-client';
import type { ChatMessage } from '../../context/AskChatContext';

function stripHtml(value: string | null | undefined): string {
  if (!value) return '';
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function renderInline(text: string, citations: Citation[], onOpenNote: (noteId: string) => void) {
  const parts = text.split(/(\[Note:\s*[^\]]+\]|\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, index) => {
    if (part.startsWith('[Note:') && part.endsWith(']')) {
      const title = part.replace(/^\[Note:\s*/, '').replace(/\]$/, '').trim();
      const citation = citations.find((item) => item.title.trim().toLowerCase() === title.toLowerCase());
      const chipClass =
        'inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded-md bg-violet-950/70 border border-violet-500/30 text-violet-200 text-xs font-medium align-baseline';
      if (!citation) {
        return (
          <span key={index} className={chipClass}>
            <FileText className="w-3 h-3 text-violet-400" />
            {title}
          </span>
        );
      }
      return (
        <button
          key={index}
          type="button"
          onClick={() => onOpenNote(citation.noteId)}
          className={`${chipClass} cursor-pointer hover:border-violet-400 hover:bg-violet-900/50`}
          title={`Open ${citation.title}`}
        >
          <FileText className="w-3 h-3 text-violet-400" />
          {title}
        </button>
      );
    }
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={index} className="text-white font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={index} className="px-1 py-0.5 rounded bg-zinc-800 text-violet-300 text-xs font-mono">
          {part.slice(1, -1)}
        </code>
      );
    }
    return <span key={index}>{part}</span>;
  });
}

function FormattedText({
  content,
  citations,
  onOpenNote,
}: {
  content: string;
  citations: Citation[];
  onOpenNote: (noteId: string) => void;
}) {
  return (
    <div className="space-y-2 text-sm leading-relaxed text-zinc-200">
      {content.split('\n').map((line, index) => {
        if (!line.trim()) return <div key={index} className="h-2" />;
        if (line.startsWith('• ') || line.startsWith('- ')) {
          return (
            <div key={index} className="flex items-start gap-2.5 ml-1">
              <span className="text-violet-400 mt-1.5 h-1.5 w-1.5 rounded-full bg-violet-400 shrink-0" />
              <span>{renderInline(line.replace(/^[•-]\s+/, ''), citations, onOpenNote)}</span>
            </div>
          );
        }
        return <div key={index}>{renderInline(line, citations, onOpenNote)}</div>;
      })}
    </div>
  );
}

export function ChatTranscript({
  messages,
  pending,
  pendingLabel,
  compact = false,
  onOpenNote,
}: {
  messages: ChatMessage[];
  pending: boolean;
  pendingLabel: string;
  compact?: boolean;
  onOpenNote: (noteId: string) => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, pending]);

  return (
    <div className={`flex-1 overflow-y-auto space-y-4 ${compact ? 'px-3 py-3' : 'px-4 sm:px-6 lg:px-8 py-6 space-y-6'}`}>
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} compact={compact} onOpenNote={onOpenNote} />
      ))}
      {pending && (
        <div className="flex items-start gap-2.5 mr-auto">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-tr from-violet-600 to-indigo-600 text-white">
            <Bot className="h-3.5 w-3.5" />
          </div>
          <div className="rounded-2xl rounded-tl-sm border border-violet-500/30 bg-zinc-900 px-3 py-2.5 text-zinc-300">
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-bounce" />
              <span className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-bounce [animation-delay:150ms]" />
              <span className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-bounce [animation-delay:300ms]" />
            </div>
            <p className="mt-1.5 text-[11px] text-zinc-400">{pendingLabel}</p>
          </div>
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
}

function MessageBubble({
  message,
  compact,
  onOpenNote,
}: {
  message: ChatMessage;
  compact: boolean;
  onOpenNote: (noteId: string) => void;
}) {
  const mine = message.sender === 'user';
  return (
    <div className={`flex items-start gap-2.5 ${mine ? 'ml-auto flex-row-reverse' : 'mr-auto'} ${compact ? 'max-w-full' : 'max-w-4xl'}`}>
      {mine ? (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-300">
          <UserIcon className="h-3.5 w-3.5" />
        </div>
      ) : (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-tr from-violet-600 to-indigo-600 text-white">
          <Bot className="h-3.5 w-3.5" />
        </div>
      )}
      <div className={`flex min-w-0 flex-col gap-2 ${compact ? 'max-w-[85%]' : 'max-w-[85%] sm:max-w-2xl'} ${mine ? 'items-end' : 'items-start'}`}>
        <div
          className={`rounded-2xl p-3 shadow-sm ${
            mine
              ? 'rounded-tr-sm border border-violet-500/30 bg-violet-600/20 text-white'
              : 'rounded-tl-sm border border-zinc-800/80 bg-zinc-900/90 text-zinc-200'
          }`}
        >
          <FormattedText content={message.text} citations={message.citations ?? []} onOpenNote={onOpenNote} />
        </div>
        {message.citations && message.citations.length > 0 && (
          <CitationRow citations={message.citations} onOpenNote={onOpenNote} />
        )}
        {message.semanticResults && message.semanticResults.length > 0 && (
          <SemanticGrid results={message.semanticResults} compact={compact} onOpenNote={onOpenNote} />
        )}
        <div className="flex items-center gap-1 px-1 text-[10px] text-zinc-500">
          <Clock className="h-3 w-3" />
          <span>{message.timestamp}</span>
        </div>
      </div>
    </div>
  );
}

function CitationRow({
  citations,
  onOpenNote,
}: {
  citations: Citation[];
  onOpenNote: (noteId: string) => void;
}) {
  return (
    <div className="w-full rounded-xl border border-zinc-800/80 bg-zinc-950/80 p-2.5">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-zinc-400">
        <Database className="h-3.5 w-3.5 text-violet-400" />
        Cited sources ({citations.length})
      </div>
      <div className="flex flex-wrap gap-1.5">
        {citations.map((citation) => (
          <button
            key={citation.noteId}
            type="button"
            onClick={() => onOpenNote(citation.noteId)}
            className="group flex max-w-full items-center gap-1.5 rounded-lg border border-zinc-700/60 bg-zinc-900 px-2 py-1 text-left text-[11px] font-medium text-zinc-200 hover:border-violet-500/50 hover:bg-violet-950/50 hover:text-violet-200 cursor-pointer"
            title={`Open ${citation.title}`}
          >
            <FileText className="h-3.5 w-3.5 shrink-0 text-violet-400" />
            <span dir="auto" className="truncate">{citation.title}</span>
            <span className="shrink-0 rounded border border-violet-500/20 bg-violet-500/10 px-1 font-mono text-[10px] text-violet-300">
              {Math.round(citation.similarity * 100)}%
            </span>
            <ExternalLink className="h-3 w-3 shrink-0 text-zinc-500 opacity-0 group-hover:opacity-100" />
          </button>
        ))}
      </div>
    </div>
  );
}

function SemanticGrid({
  results,
  compact,
  onOpenNote,
}: {
  results: SemanticSearchResult[];
  compact: boolean;
  onOpenNote: (noteId: string) => void;
}) {
  return (
    <div className={`grid w-full gap-2 ${compact ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'}`}>
      {results.map((result) => (
        <button
          key={result.noteId}
          type="button"
          onClick={() => onOpenNote(result.noteId)}
          className="rounded-xl border border-zinc-800 bg-zinc-900/90 p-3 text-start hover:border-violet-500/50 cursor-pointer"
        >
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <h4 dir="auto" className="truncate text-xs font-semibold text-white">{result.title}</h4>
            <span className="shrink-0 rounded border border-violet-500/20 bg-violet-500/10 px-1.5 py-0.5 font-mono text-[10px] text-violet-400">
              {Math.round(result.similarity * 100)}%
            </span>
          </div>
          <p className="line-clamp-2 text-[11px] leading-relaxed text-zinc-400">
            {stripHtml(result.summary) || stripHtml(result.content).slice(0, 140) || 'Empty note content'}
          </p>
          <div className="mt-2 flex items-center justify-between border-t border-zinc-800/60 pt-2 text-[10px] text-zinc-500">
            <span className="flex min-w-0 items-center gap-1 truncate">
              <Tag className="h-3 w-3 shrink-0" />
              {result.tags?.length ? result.tags.join(', ') : 'No tags'}
            </span>
            <span className="flex shrink-0 items-center gap-1 text-violet-400">
              Open <ArrowRight className="h-3 w-3" />
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}
