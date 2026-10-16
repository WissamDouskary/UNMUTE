import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { BubbleMenu, FloatingMenu } from '@tiptap/react/menus';
import { StarterKit } from '@tiptap/starter-kit';
import { Typography } from '@tiptap/extension-typography';
import { Table, TableRow, TableHeader, TableCell } from '@tiptap/extension-table';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight';
import { Placeholder } from '@tiptap/extension-placeholder';
import { Link } from '@tiptap/extension-link';
import { TextDirection } from 'tiptap-text-direction';
import { createLowlight, common } from 'lowlight';
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Link2,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  CheckSquare,
  Table as TableIcon,
  Quote,
  Minus,
  AlignLeft,
  AlignRight,
  Sparkles,
  Loader2,
  Tag,
} from 'lucide-react';

import { Task } from '@unmute/api-client';

const lowlight = createLowlight(common);

export function cleanTaskTitle(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/^(\s*[-*•]\s*|\[[ xX]\]\s*)*/g, '')
    .replace(/^(🚨\s*\[URGENT\]\s*|⚠️\s*\[HIGH\]\s*|⚡\s*\[MEDIUM\]\s*|📌\s*\[LOW\]\s*)/i, '')
    .replace(/^(TODO:?|Action:?|Task:?)\s*/i, '')
    .trim();
}

const CustomTaskItem = TaskItem.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      taskId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-task-id'),
        renderHTML: (attributes) => {
          if (!attributes.taskId) return {};
          return {
            'data-task-id': attributes.taskId,
          };
        },
      },
    };
  },
});

interface RichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  editable?: boolean;
  onAiSummarize?: () => void;
  onAiExtractTasks?: () => void;
  onAiAutoTag?: () => void;
  isAiLoading?: boolean;
  linkedTasks?: Task[];
  onTaskCheckChange?: (task: { taskId?: string | null; title: string; checked: boolean }) => void;
}

interface CommandItem {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  action: (editor: ReturnType<typeof useEditor>) => void;
}

const SLASH_COMMANDS: CommandItem[] = [
  {
    id: 'h1',
    title: 'Heading 1',
    description: 'Large section heading',
    icon: Heading1,
    action: (editor) => editor?.chain().focus().toggleHeading({ level: 1 }).run(),
  },
  {
    id: 'h2',
    title: 'Heading 2',
    description: 'Medium section heading',
    icon: Heading2,
    action: (editor) => editor?.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    id: 'h3',
    title: 'Heading 3',
    description: 'Small section heading',
    icon: Heading3,
    action: (editor) => editor?.chain().focus().toggleHeading({ level: 3 }).run(),
  },
  {
    id: 'tasks',
    title: 'Task List',
    description: 'Track tasks with interactive checkboxes',
    icon: CheckSquare,
    action: (editor) => editor?.chain().focus().toggleTaskList().run(),
  },
  {
    id: 'bullet',
    title: 'Bullet List',
    description: 'Create a simple bulleted list',
    icon: List,
    action: (editor) => editor?.chain().focus().toggleBulletList().run(),
  },
  {
    id: 'numbered',
    title: 'Numbered List',
    description: 'Create a list with numbering',
    icon: ListOrdered,
    action: (editor) => editor?.chain().focus().toggleOrderedList().run(),
  },
  {
    id: 'table',
    title: 'Table',
    description: 'Insert an editable 3x3 data table',
    icon: TableIcon,
    action: (editor) =>
      editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  },
  {
    id: 'code',
    title: 'Code Block',
    description: 'Syntax-highlighted code snippet',
    icon: Code,
    action: (editor) => editor?.chain().focus().toggleCodeBlock().run(),
  },
  {
    id: 'quote',
    title: 'Quote',
    description: 'Capture a memorable quote or callout',
    icon: Quote,
    action: (editor) => editor?.chain().focus().toggleBlockquote().run(),
  },
  {
    id: 'divider',
    title: 'Divider',
    description: 'Visually divide blocks with a line',
    icon: Minus,
    action: (editor) => editor?.chain().focus().setHorizontalRule().run(),
  },
];

export function RichTextEditor({
  content,
  onChange,
  placeholder = "Write something, or press '/' for commands...",
  editable = true,
  onAiSummarize,
  onAiExtractTasks,
  onAiAutoTag,
  isAiLoading = false,
  linkedTasks,
  onTaskCheckChange,
}: RichTextEditorProps) {
  // --- Slash Command State ---
  const [slashMenuOpen, setSlashMenuOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [slashIndex, setSlashIndex] = useState(0);
  const [slashCoords, setSlashCoords] = useState<{ x: number; y: number } | null>(null);

  // Link Dialog State
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');

  // Table Context State (Active when selection is inside a table)
  const [isInTable, setIsInTable] = useState(false);

  // Ref tracking previous task checked states to detect user clicks on checkboxes
  const previousTaskStates = useRef<Map<string, boolean>>(new Map());
  const isExternalSyncRef = useRef<boolean>(false);
  const onTaskCheckChangeRef = useRef(onTaskCheckChange);
  onTaskCheckChangeRef.current = onTaskCheckChange;

  const snapshotTaskStates = useCallback((doc: any) => {
    const map = new Map<string, boolean>();
    doc.descendants((node: any) => {
      if (node.type.name === 'taskItem') {
        const key = (node.attrs.taskId as string) || cleanTaskTitle(node.textContent);
        if (key) {
          map.set(key, Boolean(node.attrs.checked));
        }
      }
    });
    previousTaskStates.current = map;
  }, []);

  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    editable,
    content: content || '<p></p>',
    extensions: [
      StarterKit.configure({
        codeBlock: false,
        link: false,
      }),
      Typography,
      TextDirection.configure({
        types: ['heading', 'paragraph', 'bulletList', 'orderedList', 'taskList', 'blockquote'],
        defaultDirection: 'auto',
      }),
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
      TaskList,
      CustomTaskItem.configure({
        nested: true,
      }),
      CodeBlockLowlight.configure({
        lowlight,
      }),
      Placeholder.configure({
        placeholder,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-violet-400 hover:text-violet-300 underline underline-offset-4 cursor-pointer',
        },
      }),
    ],
    onCreate: ({ editor }) => {
      snapshotTaskStates(editor.state.doc);
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      lastEmittedHtml.current = html;
      onChange(html);

      // Intercept checkbox clicks inside editor canvas
      if (!isExternalSyncRef.current) {
        editor.state.doc.descendants((node) => {
          if (node.type.name === 'taskItem') {
            const taskId = (node.attrs.taskId as string) || null;
            const title = cleanTaskTitle(node.textContent);
            const key = taskId || title;
            const checked = Boolean(node.attrs.checked);

            if (key) {
              const prev = previousTaskStates.current.get(key);
              if (prev !== undefined && prev !== checked) {
                onTaskCheckChangeRef.current?.({ taskId, title, checked });
              }
              previousTaskStates.current.set(key, checked);
            }
          }
        });
      }
    },
    onSelectionUpdate: ({ editor }) => {
      const active = editor.isActive('table');
      setIsInTable((prev) => (prev !== active ? active : prev));
    },
  });

  const lastEmittedHtml = useRef<string>('');

  // Keep editor content in sync when a different note is selected
  useEffect(() => {
    if (editor && content !== lastEmittedHtml.current && content !== editor.getHTML()) {
      lastEmittedHtml.current = content;
      editor.commands.setContent(content || '<p></p>', { emitUpdate: false });
      snapshotTaskStates(editor.state.doc);
    }
  }, [content, editor, snapshotTaskStates]);

  // Bi-directional sync: When linkedTasks change (e.g. from drawer or /tasks), update Tiptap checkboxes in-place
  useEffect(() => {
    if (!editor || !linkedTasks) return;

    const { tr, doc } = editor.state;
    let hasChanges = false;

    doc.descendants((node, pos) => {
      if (node.type.name === 'taskItem') {
        const nodeTaskId = node.attrs.taskId as string | null;
        const nodeTitle = cleanTaskTitle(node.textContent);

        const matchingTask = linkedTasks.find(
          (t) => (nodeTaskId && t.id === nodeTaskId) || (nodeTitle && cleanTaskTitle(t.title) === nodeTitle)
        );

        if (matchingTask) {
          const isCompleted = matchingTask.isCompleted;
          const currentChecked = Boolean(node.attrs.checked);

          if (currentChecked !== isCompleted || (!nodeTaskId && matchingTask.id)) {
            hasChanges = true;
            tr.setNodeMarkup(pos, undefined, {
              ...node.attrs,
              checked: isCompleted,
              taskId: matchingTask.id,
            });

            const key = matchingTask.id || nodeTitle;
            previousTaskStates.current.set(key, isCompleted);
          }
        }
      }
    });

    if (hasChanges) {
      isExternalSyncRef.current = true;
      editor.view.dispatch(tr);
      isExternalSyncRef.current = false;

      const newHtml = editor.getHTML();
      lastEmittedHtml.current = newHtml;
      onChange(newHtml);
    }
  }, [editor, linkedTasks, onChange]);

  const slashCommands = useMemo<CommandItem[]>(() => {
    const aiCommands: CommandItem[] = [];
    if (onAiSummarize) {
      aiCommands.push({
        id: 'summarize',
        title: 'Summarize with AI',
        description: 'Generate executive summary & key takeaways',
        icon: Sparkles,
        action: () => {
          onAiSummarize();
        },
      });
    }
    if (onAiExtractTasks) {
      aiCommands.push({
        id: 'extract-tasks',
        title: 'Extract Action Items',
        description: 'AI detects tasks and syncs with Tasks system',
        icon: CheckSquare,
        action: () => {
          onAiExtractTasks();
        },
      });
    }
    if (onAiAutoTag) {
      aiCommands.push({
        id: 'auto-tag',
        title: 'Auto-Tag Note',
        description: 'Suggest tags from this note',
        icon: Tag,
        action: () => {
          onAiAutoTag();
        },
      });
    }
    return [...aiCommands, ...SLASH_COMMANDS];
  }, [onAiSummarize, onAiExtractTasks, onAiAutoTag]);

  const filteredCommands = slashCommands.filter((cmd: CommandItem) =>
    cmd.title.toLowerCase().includes(slashQuery.toLowerCase()) ||
    cmd.description.toLowerCase().includes(slashQuery.toLowerCase()) ||
    cmd.id.toLowerCase().includes(slashQuery.toLowerCase())
  );

  // Handle Slash commands detection via keyboard
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!editor || editor.isDestroyed) return;

      if (slashMenuOpen) {
        if (e.key === 'ArrowDown' && filteredCommands.length > 0) {
          e.preventDefault();
          setSlashIndex((prev) => (prev + 1) % filteredCommands.length);
          return;
        }
        if (e.key === 'ArrowUp' && filteredCommands.length > 0) {
          e.preventDefault();
          setSlashIndex((prev) => (prev - 1 + filteredCommands.length) % filteredCommands.length);
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          const selectedCmd = filteredCommands[slashIndex];
          if (selectedCmd) {
            // Delete the slash and query text
            const { from } = editor.state.selection;
            const startPos = Math.max(0, from - (slashQuery.length + 1));
            editor.commands.deleteRange({ from: startPos, to: from });
            selectedCmd.action(editor);
          }
          setSlashMenuOpen(false);
          setSlashQuery('');
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          setSlashMenuOpen(false);
          setSlashQuery('');
          return;
        }
      }

      // Check for Slash trigger: user types '/' at start of line or after space
      if (e.key === '/' && !slashMenuOpen) {
        // Calculate coords of cursor for positioning dropdown
        setTimeout(() => {
          if (!editor || editor.isDestroyed) return;
          try {
            const { from } = editor.state.selection;
            const coords = editor.view?.coordsAtPos?.(from);
            if (coords) {
              setSlashCoords({ x: coords.left, y: coords.bottom + 8 });
              setSlashMenuOpen(true);
              setSlashQuery('');
              setSlashIndex(0);
            }
          } catch (err) {
            console.warn('Could not determine coords for slash menu:', err);
          }
        }, 10);
      }
    },
    [editor, slashMenuOpen, slashIndex, filteredCommands, slashQuery]
  );

  // Link handler
  const handleSetLink = () => {
    if (!editor) return;
    if (linkUrl.trim()) {
      editor.chain().focus().extendMarkRange('link').setLink({ href: linkUrl.trim() }).run();
    } else {
      editor.chain().focus().unsetLink().run();
    }
    setShowLinkInput(false);
    setLinkUrl('');
  };

  if (!editor) {
    return null;
  }

  return (
    <div className="relative w-full" onKeyDown={handleKeyDown}>
      {/* =========================================================================
          BUBBLE MENU: Floating Glassmorphism Pill on active selection
      ========================================================================== */}
      <BubbleMenu
        editor={editor}
        className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-zinc-900/90 backdrop-blur-md border border-zinc-700/80 shadow-2xl text-zinc-300 z-50 animate-in fade-in zoom-in-95 duration-150"
      >
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`p-1.5 rounded-full hover:bg-zinc-800 transition-colors cursor-pointer ${
            editor.isActive('bold') ? 'bg-violet-600 text-white' : 'text-zinc-300'
          }`}
          title="Bold (Cmd+B)"
        >
          <Bold className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`p-1.5 rounded-full hover:bg-zinc-800 transition-colors cursor-pointer ${
            editor.isActive('italic') ? 'bg-violet-600 text-white' : 'text-zinc-300'
          }`}
          title="Italic (Cmd+I)"
        >
          <Italic className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={() => editor.chain().focus().toggleStrike().run()}
          className={`p-1.5 rounded-full hover:bg-zinc-800 transition-colors cursor-pointer ${
            editor.isActive('strike') ? 'bg-violet-600 text-white' : 'text-zinc-300'
          }`}
          title="Strikethrough"
        >
          <Strikethrough className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={() => editor.chain().focus().toggleCode().run()}
          className={`p-1.5 rounded-full hover:bg-zinc-800 transition-colors cursor-pointer ${
            editor.isActive('code') ? 'bg-violet-600 text-white' : 'text-zinc-300'
          }`}
          title="Inline Code"
        >
          <Code className="w-3.5 h-3.5" />
        </button>

        <div className="h-4 w-px bg-zinc-700/80 mx-1" />

        {/* Link Button */}
        <button
          type="button"
          onClick={() => {
            const previousUrl = editor.getAttributes('link').href;
            setLinkUrl(previousUrl || '');
            setShowLinkInput(!showLinkInput);
          }}
          className={`p-1.5 rounded-full hover:bg-zinc-800 transition-colors cursor-pointer ${
            editor.isActive('link') ? 'bg-violet-600 text-white' : 'text-zinc-300'
          }`}
          title="Hyperlink"
        >
          <Link2 className="w-3.5 h-3.5" />
        </button>

        <div className="h-4 w-px bg-zinc-700/80 mx-1" />

        {/* Direction Toggles for Moroccan/Arabic Support */}
        <button
          type="button"
          onClick={() => editor.commands.setTextDirection('ltr')}
          className="p-1.5 rounded-full hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
          title="Left-to-Right (LTR)"
        >
          <AlignLeft className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={() => editor.commands.setTextDirection('rtl')}
          className="p-1.5 rounded-full hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
          title="Right-to-Left (RTL - Arabic)"
        >
          <AlignRight className="w-3.5 h-3.5" />
        </button>
      </BubbleMenu>

      {/* Inline Link Popover */}
      {showLinkInput && (
        <div className="absolute z-50 mt-2 p-2 rounded-xl bg-zinc-900 border border-zinc-700 shadow-2xl flex items-center gap-2">
          <input
            type="url"
            placeholder="https://example.com"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSetLink();
              } else if (e.key === 'Escape') {
                setShowLinkInput(false);
              }
            }}
            autoFocus
            className="w-64 px-3 py-1 bg-zinc-950 border border-zinc-700 rounded-lg text-xs text-zinc-100 focus:outline-none focus:border-violet-500"
          />
          <button
            onClick={handleSetLink}
            className="px-2.5 py-1 bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold rounded-lg cursor-pointer"
          >
            Apply
          </button>
        </div>
      )}

      {/* =========================================================================
          FLOATING MENU: Block Inserter on empty line
      ========================================================================== */}
      <FloatingMenu
        editor={editor}
        className="flex items-center gap-1 px-2 py-1 rounded-xl bg-zinc-900/90 backdrop-blur-md border border-zinc-800 shadow-xl text-zinc-400 -ml-10"
      >
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          className="p-1.5 rounded-lg hover:bg-zinc-800 hover:text-zinc-200 transition-colors cursor-pointer"
          title="Heading 1"
        >
          <Heading1 className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className="p-1.5 rounded-lg hover:bg-zinc-800 hover:text-zinc-200 transition-colors cursor-pointer"
          title="Heading 2"
        >
          <Heading2 className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleTaskList().run()}
          className="p-1.5 rounded-lg hover:bg-zinc-800 hover:text-zinc-200 transition-colors cursor-pointer"
          title="Task List"
        >
          <CheckSquare className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() =>
            editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
          }
          className="p-1.5 rounded-lg hover:bg-zinc-800 hover:text-zinc-200 transition-colors cursor-pointer"
          title="Insert Table"
        >
          <TableIcon className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          className="p-1.5 rounded-lg hover:bg-zinc-800 hover:text-zinc-200 transition-colors cursor-pointer"
          title="Code Block"
        >
          <Code className="w-4 h-4" />
        </button>
      </FloatingMenu>

      {/* =========================================================================
          ADVANCED TABLE TOOLS (Word-like parity, displayed when cursor in table)
      ========================================================================== */}
      {isInTable && (
        <div className="my-3 px-3 py-1.5 rounded-xl bg-zinc-900/90 border border-violet-500/40 shadow-lg flex flex-wrap items-center gap-1.5 text-xs text-zinc-300">
          <span className="text-[10px] uppercase font-mono font-bold text-violet-400 mr-2 flex items-center gap-1">
            <TableIcon className="w-3.5 h-3.5" />
            <span>Table Tools</span>
          </span>

          <button
            type="button"
            onClick={() => editor.chain().focus().addColumnBefore().run()}
            className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors cursor-pointer"
          >
            + Col Left
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().addColumnAfter().run()}
            className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors cursor-pointer"
          >
            + Col Right
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().deleteColumn().run()}
            className="px-2 py-1 rounded bg-zinc-800 hover:bg-red-500/20 text-red-300 transition-colors cursor-pointer"
          >
            Delete Col
          </button>

          <div className="h-4 w-px bg-zinc-700 mx-1" />

          <button
            type="button"
            onClick={() => editor.chain().focus().addRowBefore().run()}
            className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors cursor-pointer"
          >
            + Row Above
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().addRowAfter().run()}
            className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors cursor-pointer"
          >
            + Row Below
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().deleteRow().run()}
            className="px-2 py-1 rounded bg-zinc-800 hover:bg-red-500/20 text-red-300 transition-colors cursor-pointer"
          >
            Delete Row
          </button>

          <div className="h-4 w-px bg-zinc-700 mx-1" />

          <button
            type="button"
            onClick={() => editor.chain().focus().deleteTable().run()}
            className="px-2 py-1 rounded bg-red-600/20 text-red-400 hover:bg-red-600/30 transition-colors cursor-pointer font-medium"
          >
            Delete Table
          </button>
        </div>
      )}

      {/* =========================================================================
          SLASH COMMAND DROPDOWN: Keyboard navigable block switcher
      ========================================================================== */}
      {slashMenuOpen && slashCoords && (
        <div
          style={{ top: slashCoords.y, left: slashCoords.x }}
          className="fixed z-50 w-72 max-h-80 overflow-y-auto rounded-2xl bg-zinc-900 border border-zinc-750 shadow-2xl p-1.5 text-zinc-200 animate-in fade-in zoom-in-95 duration-100"
        >
          <div className="px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-zinc-500 font-semibold border-b border-zinc-800 mb-1 flex items-center justify-between">
            <span>Basic Blocks</span>
            <span className="text-zinc-600">Esc to close</span>
          </div>

          <div className="space-y-0.5">
            {filteredCommands.map((cmd: CommandItem, idx: number) => {
              const Icon = cmd.icon;
              const isSelected = idx === slashIndex;
              return (
                <button
                  key={cmd.id}
                  type="button"
                  onClick={() => {
                    const { from } = editor.state.selection;
                    const startPos = Math.max(0, from - (slashQuery.length + 1));
                    editor.commands.deleteRange({ from: startPos, to: from });
                    cmd.action(editor);
                    setSlashMenuOpen(false);
                    setSlashQuery('');
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-colors cursor-pointer ${
                    isSelected ? 'bg-violet-600 text-white' : 'hover:bg-zinc-800/80 text-zinc-300'
                  }`}
                >
                  <div
                    className={`p-1.5 rounded-lg border ${
                      isSelected
                        ? 'bg-violet-500/20 border-violet-400 text-white'
                        : 'bg-zinc-800/80 border-zinc-700/80 text-zinc-400'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold leading-none mb-0.5">{cmd.title}</p>
                    <p
                      className={`text-[11px] truncate ${
                        isSelected ? 'text-violet-200' : 'text-zinc-500'
                      }`}
                    >
                      {cmd.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* AI Processing Floating Indicator */}
      {isAiLoading && (
        <div className="mb-4 flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-violet-600/15 border border-violet-500/30 text-violet-300 text-xs shadow-lg shadow-purple-950/30 animate-pulse">
          <Loader2 className="w-4 h-4 animate-spin text-violet-400" />
          <span className="font-semibold">AI Assistant is analyzing note content...</span>
        </div>
      )}

      {/* =========================================================================
          CORE TIPTAP EDITOR CANVAS
      ========================================================================== */}
      <EditorContent
        editor={editor}
        className="prose prose-invert prose-lg max-w-none focus:outline-none leading-relaxed text-zinc-300 selection:bg-violet-600/30 min-h-[500px]"
      />
    </div>
  );
}
