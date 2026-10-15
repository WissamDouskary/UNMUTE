import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';

interface MarkdownRendererProps {
  content: string;
  onToggleTask?: (taskIndex: number, newChecked: boolean) => void;
}

interface CodeBlockProps {
  language: string;
  code: string;
}

function CodeBlock({ language, code }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-4 rounded-xl overflow-hidden border border-zinc-800 bg-zinc-950/80 shadow-md">
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800/80 bg-zinc-900/60 text-xs text-zinc-400 font-mono">
        <span className="uppercase tracking-wider font-semibold text-zinc-300">
          {language || 'text'}
        </span>
        <button
          onClick={handleCopy}
          type="button"
          className="flex items-center gap-1.5 py-1 px-2.5 rounded-lg text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors cursor-pointer"
          title="Copy to clipboard"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-4 overflow-x-auto text-sm font-mono text-zinc-200 leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}

// Inline formatting helper
function renderInlineFormatting(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let keyIdx = 0;

  while (remaining.length > 0) {
    // 1. Inline code: `code`
    const codeMatch = remaining.match(/^`([^`]+)`/);
    if (codeMatch && codeMatch[0] && codeMatch[1]) {
      parts.push(
        <code
          key={`code-${keyIdx++}`}
          className="px-1.5 py-0.5 mx-0.5 rounded-md bg-zinc-800/80 text-violet-300 font-mono text-[0.875em] border border-zinc-700/50"
        >
          {codeMatch[1]}
        </code>
      );
      remaining = remaining.slice(codeMatch[0].length);
      continue;
    }

    // 2. Bold: **text** or __text__
    const boldMatch = remaining.match(/^(\*\*|__)(.*?)\1/);
    if (boldMatch && boldMatch[0] && boldMatch[2] !== undefined) {
      parts.push(
        <strong key={`bold-${keyIdx++}`} className="font-semibold text-zinc-100">
          {renderInlineFormatting(boldMatch[2])}
        </strong>
      );
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    // 3. Strikethrough: ~~text~~
    const strikeMatch = remaining.match(/^~~(.*?)~~/);
    if (strikeMatch && strikeMatch[0] && strikeMatch[1] !== undefined) {
      parts.push(
        <del key={`strike-${keyIdx++}`} className="line-through text-zinc-500">
          {renderInlineFormatting(strikeMatch[1])}
        </del>
      );
      remaining = remaining.slice(strikeMatch[0].length);
      continue;
    }

    // 4. Italic: *text* or _text_
    const italicMatch = remaining.match(/^(\*|_)(.*?)\1/);
    if (italicMatch && italicMatch[0] && italicMatch[2] !== undefined && !italicMatch[2].startsWith(' ')) {
      parts.push(
        <em key={`italic-${keyIdx++}`} className="italic text-zinc-200">
          {renderInlineFormatting(italicMatch[2])}
        </em>
      );
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }

    // 5. Link: [title](url)
    const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
    if (linkMatch && linkMatch[0] && linkMatch[1] && linkMatch[2]) {
      parts.push(
        <a
          key={`link-${keyIdx++}`}
          href={linkMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-violet-400 hover:text-violet-300 underline underline-offset-4 decoration-violet-500/40 hover:decoration-violet-400 transition-colors"
        >
          {linkMatch[1]}
        </a>
      );
      remaining = remaining.slice(linkMatch[0].length);
      continue;
    }

    // Plain text until next potential markdown symbol
    const nextSpecial = remaining.search(/[`*_~\[]/);
    if (nextSpecial === -1) {
      parts.push(remaining);
      break;
    } else if (nextSpecial === 0) {
      const firstChar = remaining[0] ?? '';
      parts.push(firstChar);
      remaining = remaining.slice(1);
    } else {
      parts.push(remaining.slice(0, nextSpecial));
      remaining = remaining.slice(nextSpecial);
    }
  }

  return parts;
}

export function MarkdownRenderer({ content, onToggleTask }: MarkdownRendererProps) {
  if (!content || !content.trim()) {
    return (
      <div className="py-12 text-center text-zinc-600 italic text-sm">
        Empty note. Switch to edit mode to start writing.
      </div>
    );
  }

  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBlockLang = '';
  let codeBlockContent: string[] = [];
  let taskCounter = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';

    // Code block open/close
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        elements.push(
          <CodeBlock
            key={`codeblock-${i}`}
            language={codeBlockLang}
            code={codeBlockContent.join('\n')}
          />
        );
        inCodeBlock = false;
        codeBlockLang = '';
        codeBlockContent = [];
      } else {
        inCodeBlock = true;
        codeBlockLang = line.trim().slice(3).trim();
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockContent.push(line);
      continue;
    }

    // Horizontal Rule
    if (/^(\*\*\*|---|___)$/.test(line.trim())) {
      elements.push(<hr key={`hr-${i}`} className="my-6 border-zinc-800" />);
      continue;
    }

    // Headings
    if (line.startsWith('# ')) {
      elements.push(
        <h1
          key={`h1-${i}`}
          className="text-2xl sm:text-3xl font-extrabold text-zinc-100 mt-6 mb-3 tracking-tight border-b border-zinc-800/80 pb-2"
        >
          {renderInlineFormatting(line.slice(2))}
        </h1>
      );
      continue;
    }
    if (line.startsWith('## ')) {
      elements.push(
        <h2
          key={`h2-${i}`}
          className="text-xl sm:text-2xl font-bold text-zinc-100 mt-5 mb-2.5 tracking-tight"
        >
          {renderInlineFormatting(line.slice(3))}
        </h2>
      );
      continue;
    }
    if (line.startsWith('### ')) {
      elements.push(
        <h3
          key={`h3-${i}`}
          className="text-lg sm:text-xl font-semibold text-zinc-200 mt-4 mb-2 tracking-tight"
        >
          {renderInlineFormatting(line.slice(4))}
        </h3>
      );
      continue;
    }
    if (line.startsWith('#### ')) {
      elements.push(
        <h4
          key={`h4-${i}`}
          className="text-base font-semibold text-zinc-300 mt-3 mb-1.5"
        >
          {renderInlineFormatting(line.slice(5))}
        </h4>
      );
      continue;
    }

    // Blockquote
    if (line.startsWith('> ')) {
      elements.push(
        <blockquote
          key={`quote-${i}`}
          className="my-3 pl-4 border-l-4 border-violet-500/80 bg-violet-500/5 py-1 text-zinc-300 italic rounded-r-md"
        >
          {renderInlineFormatting(line.slice(2))}
        </blockquote>
      );
      continue;
    }

    // Task Checklist: - [ ] or - [x]
    const taskMatch = line.match(/^(\s*)[-*]\s+\[([ xX])\]\s+(.*)$/);
    if (taskMatch && taskMatch[2] !== undefined && taskMatch[3] !== undefined) {
      const currentTaskIndex = taskCounter++;
      const isChecked = taskMatch[2].toLowerCase() === 'x';
      const taskText = taskMatch[3];
      elements.push(
        <div
          key={`task-${i}`}
          className="flex items-start gap-2.5 my-1.5 text-zinc-200 group"
        >
          <input
            type="checkbox"
            checked={isChecked}
            onChange={(e) => onToggleTask?.(currentTaskIndex, e.target.checked)}
            className="mt-1 w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-violet-600 focus:ring-violet-500/20 focus:ring-offset-0 cursor-pointer accent-violet-600 transition"
          />
          <span
            className={`text-sm leading-relaxed ${
              isChecked ? 'line-through text-zinc-500' : 'text-zinc-200'
            }`}
          >
            {renderInlineFormatting(taskText)}
          </span>
        </div>
      );
      continue;
    }

    // Unordered List (- or *)
    const bulletMatch = line.match(/^(\s*)[-*]\s+(.*)$/);
    if (bulletMatch && bulletMatch[2] !== undefined) {
      elements.push(
        <div key={`bullet-${i}`} className="flex items-start gap-2.5 my-1 text-zinc-200">
          <span className="text-violet-400 font-bold leading-relaxed select-none">•</span>
          <span className="text-sm leading-relaxed text-zinc-300">
            {renderInlineFormatting(bulletMatch[2])}
          </span>
        </div>
      );
      continue;
    }

    // Ordered List (1. item)
    const numMatch = line.match(/^(\s*)(\d+)\.\s+(.*)$/);
    if (numMatch && numMatch[2] !== undefined && numMatch[3] !== undefined) {
      elements.push(
        <div key={`num-${i}`} className="flex items-start gap-2.5 my-1 text-zinc-200">
          <span className="text-zinc-500 font-mono text-xs mt-0.5 select-none w-5 text-right">
            {numMatch[2]}.
          </span>
          <span className="text-sm leading-relaxed text-zinc-300">
            {renderInlineFormatting(numMatch[3])}
          </span>
        </div>
      );
      continue;
    }

    // Empty line / paragraph break
    if (line.trim() === '') {
      elements.push(<div key={`empty-${i}`} className="h-3" />);
      continue;
    }

    // Normal paragraph
    elements.push(
      <p key={`p-${i}`} className="my-1.5 text-sm sm:text-base leading-relaxed text-zinc-300">
        {renderInlineFormatting(line)}
      </p>
    );
  }

  // If unclosed codeblock at EOF
  if (inCodeBlock && codeBlockContent.length > 0) {
    elements.push(
      <CodeBlock
        key="codeblock-eof"
        language={codeBlockLang}
        code={codeBlockContent.join('\n')}
      />
    );
  }

  return <div className="markdown-body space-y-1">{elements}</div>;
}
