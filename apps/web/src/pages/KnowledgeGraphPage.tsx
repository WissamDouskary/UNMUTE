import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import ForceGraph2D, { type ForceGraphMethods, type LinkObject, type NodeObject } from 'react-force-graph-2d';
import { forceCenter, forceCollide } from 'd3-force-3d';
import {
  AlertCircle,
  Archive,
  ArrowUpRight,
  CheckSquare,
  FileText,
  Hash,
  Loader2,
  Maximize2,
  Radio,
  RefreshCw,
  Search,
  Waypoints,
  X,
} from 'lucide-react';
import { apiClient, type GraphEdgeType, type GraphNode, type GraphNodeType } from '@unmute/api-client';
import { cn } from '../lib/utils';

type NodeData = GraphNode & { degree: number };
type LinkData = { id: string; type: GraphEdgeType };
type GNode = NodeObject<NodeData>;
type GLink = LinkObject<NodeData, LinkData>;

const NODE_TYPES: GraphNodeType[] = ['NOTE', 'TASK', 'SOURCE', 'TAG'];

const TYPE_META: Record<GraphNodeType, { label: string; color: string; icon: React.ElementType }> = {
  NOTE: { label: 'Notes', color: '#a78bfa', icon: FileText },
  TASK: { label: 'Tasks', color: '#34d399', icon: CheckSquare },
  SOURCE: { label: 'Sources', color: '#fbbf24', icon: Radio },
  TAG: { label: 'Tags', color: '#38bdf8', icon: Hash },
};

const BG_COLOR = '#09090b';
const DOUBLE_CLICK_MS = 300;

function nodeRadius(node: GNode): number {
  switch (node.type) {
    case 'NOTE':
      return 4 + Math.min(Math.sqrt(node.degree) * 1.6, 8);
    case 'TAG':
      return 3 + Math.min(Math.sqrt(node.degree) * 1.2, 6);
    case 'SOURCE':
      return 3.4;
    default:
      return 2.6;
  }
}

function nodeColor(node: GNode): string {
  if (node.type === 'TASK' && node.status === 'COMPLETED') return '#52525b';
  if (node.type === 'SOURCE' && node.status === 'FAILED') return '#f87171';
  if (node.type === 'NOTE' && node.status === 'ARCHIVED') return '#71717a';
  return TYPE_META[node.type].color;
}

/** Pull same-type nodes toward their own centroid so the layout forms tight, stable groups. */
function createClusterForce(strength: number) {
  let nodes: GNode[] = [];
  const force = (alpha: number) => {
    const groups = new Map<string, { x: number; y: number; n: number }>();
    for (const node of nodes) {
      const bucket = groups.get(node.type) ?? { x: 0, y: 0, n: 0 };
      bucket.x += node.x ?? 0;
      bucket.y += node.y ?? 0;
      bucket.n += 1;
      groups.set(node.type, bucket);
    }
    for (const node of nodes) {
      const bucket = groups.get(node.type);
      if (!bucket || bucket.n < 2) continue;
      const pull = strength * alpha;
      node.vx = (node.vx ?? 0) + (bucket.x / bucket.n - (node.x ?? 0)) * pull;
      node.vy = (node.vy ?? 0) + (bucket.y / bucket.n - (node.y ?? 0)) * pull;
    }
  };
  force.initialize = (initNodes: GNode[]) => {
    nodes = initNodes;
  };
  return force;
}

const NODE_GLOW_PX = 15;

/** Same geometry nodeCanvasObject fills, expanded by `extra` world units (glow, anti-alias). */
function traceNode(ctx: CanvasRenderingContext2D, node: GNode, extra: number) {
  const x = node.x ?? 0;
  const y = node.y ?? 0;
  const r = nodeRadius(node);
  ctx.beginPath();
  if (node.type === 'SOURCE') {
    const reach = r + extra;
    ctx.moveTo(x, y - reach);
    ctx.lineTo(x + reach, y);
    ctx.lineTo(x, y + reach);
    ctx.lineTo(x - reach, y);
    ctx.closePath();
  } else if (node.type === 'TASK') {
    const side = r * 1.55 + extra * 2;
    ctx.rect(x - side / 2, y - side / 2, side, side);
  } else {
    ctx.arc(x, y, r + extra, 0, 2 * Math.PI);
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function endId(end: GLink['source']): string | undefined {
  if (end === undefined || end === null) return undefined;
  return typeof end === 'object' ? (end.id as string | undefined) : String(end);
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function statusLabel(node: GraphNode): string | null {
  switch (node.type) {
    case 'NOTE':
      return node.status === 'ACTIVE' ? null : node.status ?? null;
    case 'TASK':
      return [node.status, node.priority].filter(Boolean).join(' · ');
    case 'SOURCE':
      return node.status ?? null;
    default:
      return null;
  }
}

export const KnowledgeGraphPage: React.FC = () => {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const graphRef = useRef<ForceGraphMethods<GNode, GLink> | undefined>(undefined);
  const nodeCache = useRef(new Map<string, GNode>());
  const hasFittedRef = useRef(false);
  const lastClickRef = useRef<{ id: string; at: number } | null>(null);

  const [size, setSize] = useState({ width: 0, height: 0 });
  const [includeArchived, setIncludeArchived] = useState(false);
  const [visibleTypes, setVisibleTypes] = useState<Set<GraphNodeType>>(() => new Set(NODE_TYPES));
  const [query, setQuery] = useState('');
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ['graph', 'topology', includeArchived],
    queryFn: () => apiClient.getGraphTopology({ includeArchived, includeTags: true }),
  });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize({ width: Math.floor(width), height: Math.floor(height) });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const lockTouch = () => {
      root.style.touchAction = 'none';
      root.querySelectorAll<HTMLElement>('.force-graph-container, canvas').forEach((node) => {
        node.style.touchAction = 'none';
      });
    };
    lockTouch();
    const observer = new MutationObserver(lockTouch);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  // Node objects are reused across refetches so the simulation keeps their positions.
  const { nodesById, edges, neighbors, counts } = useMemo(() => {
    const nodesById = new Map<string, GNode>();
    const neighbors = new Map<string, Set<string>>();
    const counts: Record<GraphNodeType, number> = { NOTE: 0, TASK: 0, SOURCE: 0, TAG: 0 };
    if (!data) return { nodesById, edges: [], neighbors, counts };

    const link = (a: string, b: string) => {
      if (!neighbors.has(a)) neighbors.set(a, new Set());
      neighbors.get(a)!.add(b);
    };
    for (const edge of data.edges) {
      link(edge.source, edge.target);
      link(edge.target, edge.source);
    }

    for (const raw of data.nodes) {
      const node = Object.assign(nodeCache.current.get(raw.id) ?? {}, raw, {
        degree: neighbors.get(raw.id)?.size ?? 0,
      }) as GNode;
      nodeCache.current.set(raw.id, node);
      nodesById.set(raw.id, node);
      counts[raw.type] += 1;
    }

    const edges = data.edges.filter((e) => nodesById.has(e.source) && nodesById.has(e.target));
    return { nodesById, edges, neighbors, counts };
  }, [data]);

  const graphData = useMemo(() => {
    const nodes = [...nodesById.values()].filter((n) => visibleTypes.has(n.type));
    const visible = new Set(nodes.map((n) => n.id as string));
    const links: GLink[] = edges
      .filter((e) => visible.has(e.source) && visible.has(e.target))
      .map((e) => ({ id: e.id, type: e.type, source: e.source, target: e.target }));
    return { nodes, links };
  }, [nodesById, edges, visibleTypes]);

  const searchMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const matches = new Set<string>();
    for (const node of graphData.nodes) {
      if (node.label.toLowerCase().includes(q)) matches.add(node.id as string);
    }
    return matches;
  }, [query, graphData.nodes]);

  const focusId = hoverId ?? selectedId;

  const activeSet = useMemo(() => {
    if (focusId) return new Set([focusId, ...(neighbors.get(focusId) ?? [])]);
    return searchMatches;
  }, [focusId, neighbors, searchMatches]);

  const selectedNode = selectedId ? nodesById.get(selectedId) ?? null : null;

  useEffect(() => {
    if (selectedId && !nodesById.has(selectedId)) setSelectedId(null);
  }, [selectedId, nodesById]);

  const isEmpty = !isLoading && !isError && (data?.nodes.length ?? 0) === 0;
  const canRenderGraph = size.width > 0 && !!data && !isEmpty;

  useEffect(() => {
    const fg = graphRef.current;
    if (!fg || !canRenderGraph) return;

    for (const node of graphData.nodes) {
      const far = Math.abs(node.x ?? 0) > 2500 || Math.abs(node.y ?? 0) > 2500;
      if (far) {
        node.x = undefined;
        node.y = undefined;
      }
      node.vx = 0;
      node.vy = 0;
      node.fx = undefined;
      node.fy = undefined;
    }

    fg.d3Force('charge')?.strength(-70)?.distanceMin(16)?.distanceMax(420);
    fg.d3Force('link')?.distance((link: GLink) => (link.type === 'NOTE_TAGGED' ? 96 : 72))?.strength(0.4);
    fg.d3Force('center', forceCenter(0, 0).strength(1));
    fg.d3Force(
      'collide',
      forceCollide((node) => nodeRadius(node as GNode) + 14)
        .strength(0.85)
        .iterations(2),
    );
    fg.d3Force('cluster', createClusterForce(0.08));
    fg.d3Force('gravity', null);
    fg.d3ReheatSimulation();
  }, [graphData, canRenderGraph]);

  const focusNode = useCallback((node: GNode) => {
    const fg = graphRef.current;
    if (!fg || node.x === undefined || node.y === undefined) return;
    fg.centerAt(node.x, node.y, 800);
    fg.zoom(2.6, 800);
  }, []);

  const openNode = useCallback(
    (node: GraphNode) => {
      switch (node.type) {
        case 'NOTE':
          navigate(`/notes?noteId=${encodeURIComponent(node.entityId!)}`);
          break;
        case 'TASK': {
          const parentId = [...(neighbors.get(node.id) ?? [])].find((id) => id.startsWith('note:'));
          const parent = parentId ? nodesById.get(parentId) : undefined;
          navigate(parent ? `/notes?noteId=${encodeURIComponent(parent.entityId!)}` : '/tasks');
          break;
        }
        case 'SOURCE':
          navigate('/sources');
          break;
        default:
          break;
      }
    },
    [navigate, neighbors, nodesById],
  );

  const handleNodeClick = useCallback(
    (node: GNode) => {
      const id = node.id as string;
      const now = Date.now();
      const last = lastClickRef.current;
      lastClickRef.current = { id, at: now };
      if (last && last.id === id && now - last.at < DOUBLE_CLICK_MS) {
        openNode(node);
        return;
      }
      setSelectedId(id);
      focusNode(node);
    },
    [focusNode, openNode],
  );

  const selectById = useCallback(
    (id: string) => {
      const node = nodesById.get(id);
      if (!node) return;
      setSelectedId(id);
      focusNode(node);
    },
    [nodesById, focusNode],
  );

  const toggleType = (type: GraphNodeType) => {
    setVisibleTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const zoomToFit = () => {
    const fg = graphRef.current;
    if (!fg) return;
    fg.zoomToFit(0, 120);
    const fitted = fg.zoom();
    if (fitted > 1.35) fg.zoom(1.35, 0);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;
      if (e.key === 'Escape') {
        setSelectedId(null);
        if (typing) {
          setQuery('');
          searchRef.current?.blur();
        }
      } else if (e.key === '/' && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const isLinkActive = useCallback(
    (link: GLink) => !!focusId && (endId(link.source) === focusId || endId(link.target) === focusId),
    [focusId],
  );

  const drawNode = useCallback(
    (node: GNode, ctx: CanvasRenderingContext2D, scale: number) => {
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      const r = nodeRadius(node);
      const id = node.id as string;
      const color = nodeColor(node);
      const hovered = id === hoverId;
      const connected = hoverId ? (neighbors.get(hoverId)?.has(id) ?? false) : false;
      const dimmed = hoverId
        ? !hovered && !connected
        : searchMatches !== null && !searchMatches.has(id);

      ctx.save();
      ctx.globalAlpha = dimmed ? 0.15 : 1;
      if (!dimmed) {
        ctx.shadowBlur = hovered ? 22 : 15;
        ctx.shadowColor = color;
      }

      traceNode(ctx, node, 0);

      if (node.type === 'TAG') {
        ctx.fillStyle = BG_COLOR;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = color;
        ctx.stroke();
      } else {
        ctx.fillStyle = color;
        ctx.fill();
      }

      ctx.shadowBlur = 0;
      if (hovered || id === selectedId) {
        ctx.beginPath();
        ctx.arc(x, y, r + 3.2, 0, 2 * Math.PI);
        ctx.lineWidth = 1.25 / scale;
        ctx.strokeStyle = 'rgba(250, 250, 250, 0.9)';
        ctx.stroke();
      }

      const showLabel = hoverId ? hovered || connected : scale > 2;
      if (showLabel) {
        const text = truncate(node.type === 'TAG' ? `#${node.label}` : node.label, 36);
        const fontSize = 12 / scale;
        ctx.font = `500 ${fontSize}px Inter, ui-sans-serif, system-ui, sans-serif`;
        const padX = 12 / scale;
        const padY = 4 / scale;
        const textWidth = ctx.measureText(text).width;
        const pillW = textWidth + padX * 2;
        const pillH = fontSize + padY * 2;
        const pillX = x - pillW / 2;
        const pillY = y + r + 6 / scale;
        ctx.globalAlpha = 1;
        ctx.fillStyle = 'rgba(9, 9, 11, 0.8)';
        roundRect(ctx, pillX, pillY, pillW, pillH, pillH / 2);
        ctx.fill();
        ctx.fillStyle = '#fafafa';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x, pillY + pillH / 2);
      }
      ctx.restore();
    },
    [hoverId, neighbors, searchMatches, selectedId],
  );

  const paintPointerArea = useCallback((node: GNode, color: string, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const glow = NODE_GLOW_PX / Math.max(globalScale, 0.25);
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.fillStyle = color;
    traceNode(ctx, node, glow);
    ctx.fill();
    ctx.restore();
  }, []);

  const totalNodes = graphData.nodes.length;

  return (
    <div
      ref={containerRef}
      className="relative flex-1 min-h-0 w-full overflow-hidden bg-zinc-950"
      style={{
        backgroundImage: 'radial-gradient(rgba(63, 63, 70, 0.35) 1px, transparent 1px)',
        backgroundSize: '22px 22px',
        touchAction: 'none',
      }}
    >
      {canRenderGraph && (
        <ForceGraph2D<NodeData, LinkData>
          ref={graphRef}
          width={size.width}
          height={size.height}
          graphData={graphData}
          backgroundColor="rgba(0,0,0,0)"
          nodeId="id"
          nodeLabel={() => ''}
          nodeCanvasObjectMode={() => 'replace'}
          nodeCanvasObject={drawNode}
          nodePointerAreaPaint={paintPointerArea}
          linkColor={(link) =>
            isLinkActive(link)
              ? 'rgba(196, 181, 253, 0.85)'
              : activeSet
                ? 'rgba(63, 63, 70, 0.22)'
                : 'rgba(113, 113, 122, 0.45)'
          }
          linkWidth={(link) => (isLinkActive(link) ? 1.35 : 0.7)}
          linkLineDash={(link) => (link.type === 'NOTE_TAGGED' ? [2, 3] : null)}
          linkDirectionalParticles={2}
          linkDirectionalParticleWidth={1.6}
          linkDirectionalParticleSpeed={0.005}
          linkDirectionalParticleColor={() => '#e4e4e7'}
          linkHoverPrecision={1}
          warmupTicks={120}
          cooldownTicks={220}
          cooldownTime={4500}
          d3AlphaDecay={0.035}
          d3AlphaMin={0.015}
          d3VelocityDecay={0.55}
          minZoom={0.25}
          maxZoom={8}
          enablePointerInteraction
          enableZoomInteraction
          enablePanInteraction
          onNodeHover={(node) => setHoverId(node ? (node.id as string) : null)}
          onNodeClick={handleNodeClick}
          onBackgroundClick={() => setSelectedId(null)}
          onEngineStop={() => {
            for (const node of graphData.nodes) {
              node.vx = 0;
              node.vy = 0;
            }
            if (!hasFittedRef.current) {
              hasFittedRef.current = true;
              zoomToFit();
            }
          }}
        />
      )}

      {/* Top toolbar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-start justify-between gap-3 p-3 sm:p-4">
        <div className="pointer-events-auto flex w-full flex-col gap-2 sm:w-auto">
          <div className="flex items-center gap-2">
            <Waypoints className="h-4 w-4 text-zinc-300" />
            <h1 className="text-sm font-semibold tracking-tight text-zinc-100">Knowledge Graph</h1>
            <span className="font-mono text-[11px] text-zinc-500">
              {totalNodes} nodes · {graphData.links.length} links
            </span>
          </div>
          <div className="flex h-8 w-full sm:w-72 items-center gap-2 rounded-lg border border-zinc-800/50 bg-zinc-900/80 px-2.5 backdrop-blur-md focus-within:border-zinc-500 focus-within:ring-1 focus-within:ring-zinc-500">
            <Search className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && searchMatches && searchMatches.size > 0) {
                  selectById(searchMatches.values().next().value as string);
                }
              }}
              placeholder="Find a node…"
              className="min-w-0 flex-1 bg-transparent text-xs text-zinc-200 placeholder:text-zinc-500 outline-none focus:outline-none focus:ring-0"
            />
            {query ? (
              <button
                onClick={() => setQuery('')}
                className="text-zinc-500 hover:text-zinc-200"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : (
              <kbd className="rounded border border-zinc-800 px-1 font-mono text-[10px] text-zinc-500">/</kbd>
            )}
          </div>
          {searchMatches && (
            <span className="text-[11px] text-zinc-500">
              {searchMatches.size} match{searchMatches.size === 1 ? '' : 'es'}
              {searchMatches.size > 0 && ' · Enter to focus'}
            </span>
          )}
        </div>

        <div className="pointer-events-auto flex max-w-full items-center gap-1.5 overflow-x-auto rounded-md border border-zinc-800/50 bg-zinc-900/80 p-1 backdrop-blur-md no-scrollbar">
          {NODE_TYPES.map((type) => {
            const meta = TYPE_META[type];
            const active = visibleTypes.has(type);
            return (
              <button
                key={type}
                onClick={() => toggleType(type)}
                aria-pressed={active}
                className={cn(
                  'flex h-6 items-center gap-1.5 rounded px-2 text-[11px] font-medium transition-colors',
                  active ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300',
                )}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: active ? meta.color : '#3f3f46' }}
                />
                {meta.label}
                <span className="font-mono text-[10px] text-zinc-500">{counts[type]}</span>
              </button>
            );
          })}

          <div className="mx-0.5 h-4 w-px bg-zinc-800" />

          <button
            role="switch"
            aria-checked={includeArchived}
            onClick={() => setIncludeArchived((v) => !v)}
            title="Include archived notes"
            className={cn(
              'flex h-6 items-center gap-1.5 rounded px-2 text-[11px] font-medium transition-colors',
              includeArchived ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300',
            )}
          >
            <Archive className="h-3 w-3" />
            Archived
          </button>

          <div className="mx-0.5 h-4 w-px bg-zinc-800" />

          <button
            onClick={() => refetch()}
            title="Refresh"
            aria-label="Refresh graph"
            className="flex h-6 w-6 items-center justify-center rounded text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
          </button>
          <button
            onClick={zoomToFit}
            title="Zoom to fit"
            aria-label="Zoom to fit"
            className="flex h-6 w-6 items-center justify-center rounded text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Selection inspector */}
      {selectedNode && (
        <NodeInspector
          node={selectedNode}
          neighborIds={[...(neighbors.get(selectedNode.id as string) ?? [])]}
          nodesById={nodesById}
          onSelect={selectById}
          onOpen={() => openNode(selectedNode)}
          onClose={() => setSelectedId(null)}
        />
      )}

      {/* States */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Mapping your knowledge…
          </div>
        </div>
      )}
      {isError && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-center">
            <AlertCircle className="h-5 w-5 text-red-400" />
            <p className="text-sm text-zinc-300">Couldn't load the graph.</p>
            <button
              onClick={() => refetch()}
              className="rounded-md border border-zinc-800 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-900"
            >
              Try again
            </button>
          </div>
        </div>
      )}
      {isEmpty && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex max-w-sm flex-col items-center gap-3 text-center">
            <Waypoints className="h-6 w-6 text-zinc-600" />
            <p className="text-sm font-medium text-zinc-200">Your graph is empty</p>
            <p className="text-xs leading-relaxed text-zinc-500">
              Notes, tasks, sources and tags appear here as connected nodes once you start capturing knowledge.
            </p>
            <button
              onClick={() => navigate('/notes')}
              className="rounded-md bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-900 hover:bg-white"
            >
              Create a note
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

interface NodeInspectorProps {
  node: GNode;
  neighborIds: string[];
  nodesById: Map<string, GNode>;
  onSelect: (id: string) => void;
  onOpen: () => void;
  onClose: () => void;
}

const MAX_INSPECTOR_LINKS = 8;

const NodeInspector: React.FC<NodeInspectorProps> = ({ node, neighborIds, nodesById, onSelect, onOpen, onClose }) => {
  const meta = TYPE_META[node.type];
  const Icon = meta.icon;
  const status = statusLabel(node);
  const linked = neighborIds
    .map((id) => nodesById.get(id))
    .filter((n): n is GNode => n !== undefined)
    .sort((a, b) => NODE_TYPES.indexOf(a.type) - NODE_TYPES.indexOf(b.type));
  const openLabel =
    node.type === 'NOTE' ? 'Open note' : node.type === 'TASK' ? 'Open in context' : node.type === 'SOURCE' ? 'Open sources' : null;

  return (
    <div className="absolute bottom-24 right-4 z-20 w-80 rounded-2xl border border-zinc-800 bg-zinc-950/80 shadow-2xl shadow-black/50 backdrop-blur">
      <div className="flex items-start gap-2.5 border-b border-zinc-800/50 p-3">
        <Icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color: meta.color }} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-zinc-100" title={node.label}>
            {node.type === 'TAG' ? `#${node.label}` : node.label}
          </p>
          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
            {node.type}
            {status && ` · ${status}`}
          </p>
        </div>
        <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200" aria-label="Close inspector">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="p-1.5">
        <p className="px-1.5 pb-1 pt-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
          {linked.length} connection{linked.length === 1 ? '' : 's'}
        </p>
        {linked.length === 0 ? (
          <p className="px-1.5 pb-1.5 text-xs text-zinc-500">Orphan node — nothing links here yet.</p>
        ) : (
          <ul className="max-h-48 overflow-y-auto">
            {linked.slice(0, MAX_INSPECTOR_LINKS).map((n) => (
              <li key={n.id as string}>
                <button
                  onClick={() => onSelect(n.id as string)}
                  className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs text-zinc-300 hover:bg-zinc-800/70"
                >
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: nodeColor(n) }} />
                  <span className="truncate">{n.type === 'TAG' ? `#${n.label}` : n.label}</span>
                </button>
              </li>
            ))}
            {linked.length > MAX_INSPECTOR_LINKS && (
              <li className="px-1.5 py-1 text-[11px] text-zinc-500">+{linked.length - MAX_INSPECTOR_LINKS} more</li>
            )}
          </ul>
        )}
      </div>

      {openLabel && (
        <div className="border-t border-zinc-800/50 p-1.5">
          <button
            onClick={onOpen}
            className="flex w-full items-center justify-between rounded px-1.5 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800/70"
          >
            {openLabel}
            <ArrowUpRight className="h-3.5 w-3.5 text-zinc-500" />
          </button>
        </div>
      )}
    </div>
  );
};
