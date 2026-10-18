import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import ForceGraph2D, { type ForceGraphMethods, type LinkObject, type NodeObject } from 'react-force-graph-2d';
import { forceCenter, forceCollide } from 'd3-force-3d';
import {
  AlertCircle,
  Archive,
  CheckSquare,
  FileText,
  Hash,
  Loader2,
  Maximize2,
  Minus,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Waypoints,
  X,
} from 'lucide-react';
import { apiClient, type GraphEdgeType, type GraphNode, type GraphNodeType } from '@unmute/api-client';
import { cn } from '../lib/utils';
import { GraphInspector } from './graph/GraphInspector';
import { EDGE_META, buildInsights, neighborhood, searchNodes } from './graph/graphIntelligence';

type NodeData = GraphNode & { degree: number };
type LinkData = { id: string; type: GraphEdgeType; origin?: string };
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

const NODE_HALO = 22;

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

/** Labels sit under the marker. Notes and tags are mostly read by that pill, so it has to be part of the hit target. */
function labelVisible(scale: number, hoverId: string | null, hovered: boolean, connected: boolean) {
  return hoverId ? hovered || connected : scale > 2;
}

let labelMeasure: CanvasRenderingContext2D | null = null;

function measureLabel(text: string, fontSize: number): number {
  if (typeof document === 'undefined') return text.length * fontSize * 0.55;
  if (!labelMeasure) labelMeasure = document.createElement('canvas').getContext('2d');
  if (!labelMeasure) return text.length * fontSize * 0.55;
  labelMeasure.font = `500 ${fontSize}px Inter, ui-sans-serif, system-ui, sans-serif`;
  return labelMeasure.measureText(text).width;
}

function labelBox(node: GNode, scale: number) {
  const safe = Math.max(scale, 0.25);
  const x = node.x ?? 0;
  const y = node.y ?? 0;
  const text = truncate(node.type === 'TAG' ? `#${node.label}` : node.label, 32);
  const fontSize = 10 / safe;
  const padX = 5 / safe;
  const padY = 1.5 / safe;
  const w = measureLabel(text, fontSize) + padX * 2;
  const h = fontSize + padY * 2;
  const left = x - w / 2;
  const top = y + nodeRadius(node) + 4 / safe;
  return { text, fontSize, left, top, w, h, cx: x, cy: top + h / 2 };
}

function traceLabel(ctx: CanvasRenderingContext2D, node: GNode, scale: number) {
  const box = labelBox(node, scale);
  roundRect(ctx, box.left, box.top, box.w, box.h, box.h / 2);
  return box;
}

/** Hit markers from geometry. The canvas color picker drops every tag except the ones whose pixels survive link strokes. */
function hitTestNode(
  nodes: GNode[],
  point: { x: number; y: number },
  scale: number,
  hoverId: string | null,
  neighbors: Map<string, Set<string>>,
): GNode | null {
  const safe = Math.max(scale, 0.25);
  const extra = Math.max(NODE_HALO, NODE_HALO / safe);
  let marker: { node: GNode; d: number } | null = null;
  for (const node of nodes) {
    if (node.x == null || node.y == null) continue;
    const d = Math.hypot(point.x - node.x, point.y - node.y);
    if (d <= nodeRadius(node) + extra && (!marker || d < marker.d)) marker = { node, d };
  }
  if (marker) return marker.node;

  let labelHit: { node: GNode; d: number } | null = null;
  for (const node of nodes) {
    if (node.x == null || node.y == null) continue;
    const id = node.id as string;
    const hovered = id === hoverId;
    const connected = hoverId ? (neighbors.get(hoverId)?.has(id) ?? false) : false;
    if (!labelVisible(scale, hoverId, hovered, connected)) continue;
    const box = labelBox(node, scale);
    const inside =
      point.x >= box.left && point.x <= box.left + box.w && point.y >= box.top && point.y <= box.top + box.h;
    if (!inside) continue;
    const d = Math.hypot(point.x - box.cx, point.y - box.cy);
    if (!labelHit || d < labelHit.d) labelHit = { node, d };
  }
  return labelHit?.node ?? null;
}

export const KnowledgeGraphPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const graphRef = useRef<ForceGraphMethods<GNode, GLink> | undefined>(undefined);
  const nodeCache = useRef(new Map<string, GNode>());
  const hasFittedRef = useRef(false);
  const lastClickRef = useRef<{ id: string; at: number } | null>(null);
  const rememberRef = useRef<(id: string | null) => void>(() => {});
  const openRef = useRef<(node: GNode) => void>(() => {});
  const hoverRef = useRef<string | null>(null);
  const graphStateRef = useRef({
    nodes: [] as GNode[],
    neighbors: new Map<string, Set<string>>(),
    hoverId: null as string | null,
  });

  const [size, setSize] = useState({ width: 0, height: 0 });
  const [includeArchived, setIncludeArchived] = useState(false);
  const [visibleTypes, setVisibleTypes] = useState<Set<GraphNodeType>>(() => new Set(NODE_TYPES));
  const [query, setQuery] = useState('');
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusMode, setFocusMode] = useState(false);
  const [focusDepth, setFocusDepth] = useState(1);
  const [openTasksOnly, setOpenTasksOnly] = useState(false);
  const [hiddenEdgeTypes, setHiddenEdgeTypes] = useState<Set<GraphEdgeType>>(() => new Set());
  const [searchIndex, setSearchIndex] = useState(0);
  const [hoveredEdge, setHoveredEdge] = useState<GLink | null>(null);
  const [insightsOpen, setInsightsOpen] = useState(false);

  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ['graph', 'topology', includeArchived],
    queryFn: () => apiClient.getGraphTopology({ includeArchived, includeTags: true }),
  });

  const suggestions = useQuery({
    queryKey: ['graph', 'suggestions'],
    queryFn: () => apiClient.listGraphSuggestions(),
  });

  const generateSuggestions = useMutation({
    mutationFn: () => apiClient.generateGraphSuggestions(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['graph', 'suggestions'] });
    },
  });

  const reviewSuggestion = useMutation({
    mutationFn: ({ id, accept }: { id: string; accept: boolean }) =>
      accept ? apiClient.acceptGraphSuggestion(id) : apiClient.rejectGraphSuggestion(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['graph', 'suggestions'] });
      void queryClient.invalidateQueries({ queryKey: ['graph', 'topology'] });
    },
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
    const nodes = [...nodesById.values()].filter((n) => {
      if (!visibleTypes.has(n.type)) return false;
      if (openTasksOnly && n.type === 'TASK' && n.status !== 'OPEN') return false;
      return true;
    });
    const visible = new Set(nodes.map((n) => n.id as string));
    const links: GLink[] = edges
      .filter((e) => visible.has(e.source) && visible.has(e.target) && !hiddenEdgeTypes.has(e.type))
      .map((e) => ({ id: e.id, type: e.type, origin: e.origin ?? 'EXPLICIT', source: e.source, target: e.target }));
    for (const suggestion of suggestions.data ?? []) {
      if (hiddenEdgeTypes.has('RELATED_TO')) continue;
      if (!visible.has(suggestion.sourceKey) || !visible.has(suggestion.targetKey)) continue;
      links.push({
        id: `pending:${suggestion.id}`,
        type: 'RELATED_TO',
        origin: 'PENDING',
        source: suggestion.sourceKey,
        target: suggestion.targetKey,
      });
    }
    return { nodes, links };
  }, [nodesById, edges, visibleTypes, openTasksOnly, hiddenEdgeTypes, suggestions.data]);

  const nodeIdsKey = graphData.nodes.map((node) => node.id).join('\0');

  const searchResults = useMemo(
    () => searchNodes(graphData.nodes as Array<GraphNode & { id: string }>, query).slice(0, 8),
    [graphData.nodes, query],
  );

  const searchMatches = useMemo(() => {
    if (!query.trim()) return null;
    return new Set(searchResults.map((node) => node.id));
  }, [query, searchResults]);

  const focusId = hoverId ?? selectedId;

  const focusNeighborhood = useMemo(() => {
    if (!focusMode || !selectedId) return null;
    return neighborhood(neighbors, selectedId, focusDepth);
  }, [focusMode, selectedId, focusDepth, neighbors]);

  const activeSet = useMemo(() => {
    if (focusNeighborhood) return focusNeighborhood;
    if (focusId) return new Set([focusId, ...(neighbors.get(focusId) ?? [])]);
    return searchMatches;
  }, [focusNeighborhood, focusId, neighbors, searchMatches]);

  const selectedNode = selectedId ? nodesById.get(selectedId) ?? null : null;

  useEffect(() => {
    if (selectedId && !nodesById.has(selectedId)) setSelectedId(null);
  }, [selectedId, nodesById]);

  useEffect(() => {
    const id = params.get('node');
    if (id && nodesById.has(id)) setSelectedId(id);
  }, [params, nodesById]);

  const rememberSelection = useCallback(
    (id: string | null) => {
      setSelectedId(id);
      const next = new URLSearchParams(params);
      if (id) next.set('node', id);
      else next.delete('node');
      setParams(next, { replace: true });
    },
    [params, setParams],
  );
  rememberRef.current = rememberSelection;
  graphStateRef.current = { nodes: graphData.nodes, neighbors, hoverId };

  const pickNode = (event: PointerEvent): GNode | null => {
    const fg = graphRef.current;
    const canvas = event.target instanceof HTMLCanvasElement ? event.target : null;
    if (!fg || !canvas || event.target !== canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const point = fg.screen2GraphCoords(event.clientX - rect.left, event.clientY - rect.top);
    const { nodes, neighbors: links, hoverId: hover } = graphStateRef.current;
    return hitTestNode(nodes, point, fg.zoom() || 1, hover, links);
  };

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    let down: { x: number; y: number } | null = null;
    const onDown = (event: PointerEvent) => {
      if (event.button !== 0 || !(event.target instanceof HTMLCanvasElement)) return;
      down = { x: event.clientX, y: event.clientY };
    };
    const onMove = (event: PointerEvent) => {
      if (!(event.target instanceof HTMLCanvasElement)) {
        if (hoverRef.current) {
          hoverRef.current = null;
          setHoverId(null);
        }
        return;
      }
      const hit = pickNode(event);
      const id = hit ? (hit.id as string) : null;
      if (id !== hoverRef.current) {
        hoverRef.current = id;
        setHoverId(id);
      }
    };
    const onUp = (event: PointerEvent) => {
      if (!down) return;
      const start = down;
      down = null;
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) return;
      const hit = pickNode(event);
      if (!hit) {
        rememberRef.current(null);
        return;
      }
      const id = hit.id as string;
      const now = Date.now();
      const last = lastClickRef.current;
      lastClickRef.current = { id, at: now };
      if (last && last.id === id && now - last.at < DOUBLE_CLICK_MS) {
        openRef.current(hit);
        return;
      }
      rememberRef.current(id);
    };
    root.addEventListener('pointerdown', onDown);
    root.addEventListener('pointermove', onMove);
    root.addEventListener('pointerup', onUp);
    return () => {
      root.removeEventListener('pointerdown', onDown);
      root.removeEventListener('pointermove', onMove);
      root.removeEventListener('pointerup', onUp);
    };
  }, []);

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
  }, [nodeIdsKey, canRenderGraph]);

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
  openRef.current = openNode;

  const selectById = useCallback(
    (id: string) => {
      const node = nodesById.get(id);
      if (!node) return;
      rememberSelection(id);
      focusNode(node);
    },
    [nodesById, focusNode, rememberSelection],
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
        rememberSelection(null);
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
  }, [rememberSelection]);

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
        : focusNeighborhood
          ? !focusNeighborhood.has(id)
          : searchMatches !== null && !searchMatches.has(id);

      ctx.save();
      ctx.globalAlpha = dimmed ? 0.15 : 1;
      if (!dimmed) {
        ctx.shadowBlur = hovered ? NODE_HALO : 15;
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

      const showLabel = labelVisible(scale, hoverId, hovered, connected);
      if (showLabel) {
        ctx.globalAlpha = 1;
        ctx.fillStyle = 'rgba(9, 9, 11, 0.8)';
        const label = traceLabel(ctx, node, scale);
        ctx.fill();
        ctx.font = `500 ${label.fontSize}px Inter, ui-sans-serif, system-ui, sans-serif`;
        ctx.fillStyle = '#e4e4e7';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label.text, label.cx, label.cy);
      }
      ctx.restore();
    },
    [hoverId, neighbors, searchMatches, selectedId, focusNeighborhood],
  );

  const paintPointerArea = useCallback((node: GNode, color: string, ctx: CanvasRenderingContext2D, globalScale: number) => {
    // shadowBlur is in world units, so the halo grows on screen as you zoom.
    // The old hit slop shrank by the same zoom, and clicks on note 1's glow missed.
    const scale = Math.max(globalScale, 0.25);
    const glow = Math.max(NODE_HALO, NODE_HALO / scale);
    const id = node.id as string;
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = color;
    traceNode(ctx, node, glow);
    ctx.fill();
    const hovered = id === hoverId;
    const connected = hoverId ? (neighbors.get(hoverId)?.has(id) ?? false) : false;
    if (labelVisible(globalScale, hoverId, hovered, connected)) {
      // Keep the marker on top of this node's label and of labels painted earlier.
      ctx.globalCompositeOperation = 'destination-over';
      traceLabel(ctx, node, globalScale);
      ctx.fill();
    }
    ctx.restore();
  }, [hoverId, neighbors]);

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
          linkLineDash={(link) => (link.origin === 'PENDING' || link.type === 'NOTE_TAGGED' ? [2, 3] : null)}
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
          onLinkHover={(link) => setHoveredEdge(link ?? null)}
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
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setSearchIndex((index) => Math.min(index + 1, Math.max(searchResults.length - 1, 0)));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setSearchIndex((index) => Math.max(index - 1, 0));
                } else if (e.key === 'Enter' && searchResults[searchIndex]) {
                  selectById(searchResults[searchIndex].id);
                } else if (e.key === 'Escape') {
                  setQuery('');
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
          {query.trim() && (
            <div className="w-full overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950/95 sm:w-72">
              {searchResults.length === 0 && <p className="px-2.5 py-2 text-xs text-zinc-500">No matching nodes.</p>}
              {searchResults.map((node, index) => (
                <button
                  key={node.id}
                  type="button"
                  onClick={() => selectById(node.id)}
                  className={cn(
                    'flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs',
                    index === searchIndex ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-300 hover:bg-zinc-900',
                  )}
                >
                  <span className="truncate">{node.type === 'TAG' ? `#${node.label}` : node.label}</span>
                  <span className="ml-auto text-[10px] text-zinc-500">{node.type}</span>
                </button>
              ))}
            </div>
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
            title="Fit graph"
            aria-label="Fit graph"
            className="flex h-6 w-6 items-center justify-center rounded text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => graphRef.current?.zoom((graphRef.current.zoom() || 1) * 1.25, 200)}
            className="flex h-6 w-6 items-center justify-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => graphRef.current?.zoom((graphRef.current.zoom() || 1) / 1.25, 200)}
            className="flex h-6 w-6 items-center justify-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-pressed={openTasksOnly}
            onClick={() => setOpenTasksOnly((value) => !value)}
            className={cn('h-6 rounded px-2 text-[11px]', openTasksOnly ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500')}
          >
            Open tasks
          </button>
          <button
            type="button"
            aria-label="Center selected node"
            disabled={!selectedNode}
            onClick={() => selectedNode && focusNode(selectedNode)}
            className="h-6 rounded px-2 text-[11px] text-zinc-500 disabled:opacity-40"
          >
            Center
          </button>
          <button
            type="button"
            aria-pressed={focusMode}
            onClick={() => setFocusMode((value) => !value)}
            className={cn('h-6 rounded px-2 text-[11px]', focusMode ? 'bg-zinc-100 text-zinc-950' : 'text-zinc-500')}
          >
            Focus
          </button>
          {focusMode && (
            <span className="flex items-center gap-1 px-1 text-[11px] text-zinc-400">
              {[1, 2, 3].map((depth) => (
                <button
                  key={depth}
                  type="button"
                  aria-pressed={focusDepth === depth}
                  onClick={() => setFocusDepth(depth)}
                  className={cn('h-6 w-6 rounded', focusDepth === depth ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500')}
                >
                  {depth}
                </button>
              ))}
            </span>
          )}
          <button
            type="button"
            aria-pressed={insightsOpen}
            onClick={() => setInsightsOpen((value) => !value)}
            className={cn('h-6 rounded px-2 text-[11px]', insightsOpen ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500')}
          >
            Insights
          </button>
        </div>
      </div>

      {selectedId && nodesById.has(selectedId) && !graphData.nodes.some((node) => node.id === selectedId) && (
        <div className="absolute left-1/2 top-24 z-20 -translate-x-1/2 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-300">
          This node is hidden by the current filters.
          <button type="button" className="ml-2 text-zinc-100 underline" onClick={() => { setOpenTasksOnly(false); setVisibleTypes(new Set(NODE_TYPES)); }}>
            Clear filters
          </button>
        </div>
      )}

      {focusMode && (
        <div className="pointer-events-none absolute left-1/2 top-20 z-10 -translate-x-1/2 rounded-full border border-zinc-800 bg-zinc-950/90 px-3 py-1 text-[11px] text-zinc-300">
          Focus · {focusDepth} hop{focusDepth === 1 ? '' : 's'} · other nodes stay on the canvas
        </div>
      )}

      {selectedNode && (
        <GraphInspector
          node={selectedNode as GraphNode & { id: string }}
          nodes={nodesById as Map<string, GraphNode & { id: string }>}
          edges={edges}
          neighborIds={[...(neighbors.get(selectedNode.id as string) ?? [])]}
          onSelect={selectById}
          onOpen={() => openNode(selectedNode)}
          onAsk={() => {
            sessionStorage.setItem('unmute-ask-seed', `What should I know about "${selectedNode.label}"?`);
            navigate('/ask');
          }}
          onClose={() => rememberSelection(null)}
        />
      )}

      <div className="absolute bottom-3 left-3 z-20 max-w-[16rem] rounded-lg border border-zinc-800/80 bg-zinc-950/90 p-2 text-[11px] text-zinc-400 backdrop-blur max-md:bottom-[calc(5.5rem+env(safe-area-inset-bottom))]">
        <p className="mb-1 text-[10px] uppercase tracking-wider text-zinc-500">Legend</p>
        {(Object.keys(EDGE_META) as GraphEdgeType[]).map((type) => (
          <button
            key={type}
            type="button"
            aria-pressed={!hiddenEdgeTypes.has(type)}
            onClick={() => setHiddenEdgeTypes((prev) => {
              const next = new Set(prev);
              if (next.has(type)) next.delete(type);
              else next.add(type);
              return next;
            })}
            className={cn('flex w-full items-center gap-2 rounded px-1 py-0.5 text-left', hiddenEdgeTypes.has(type) && 'opacity-40')}
          >
            <span className={cn('h-px w-6 bg-zinc-400', EDGE_META[type].dashed && 'border-t border-dashed border-zinc-400 bg-transparent')} />
            <span>{EDGE_META[type].label}</span>
          </button>
        ))}
        {hoveredEdge && (
          <p className="mt-1 border-t border-zinc-800 pt-1 text-zinc-300">
            {EDGE_META[hoveredEdge.type].label}
            {hoveredEdge.origin === 'PENDING' ? ' · suggested, not saved' : hoveredEdge.origin === 'ACCEPTED' ? ' · confirmed' : ' · saved'}
          </p>
        )}
      </div>

      {insightsOpen && (
        <div className="absolute left-3 top-28 z-20 w-72 max-h-[50dvh] overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950/95 p-3 text-xs text-zinc-300">
          <p className="text-[10px] uppercase tracking-wider text-zinc-500">Insights</p>
          {buildInsights([...nodesById.values()], neighbors).length === 0 && (
            <p className="mt-2 text-zinc-500">Nothing to flag in this graph yet.</p>
          )}
          <ul className="mt-2 space-y-1">
            {buildInsights([...nodesById.values()], neighbors).map((insight) => (
              <li key={insight.id}>
                <button type="button" onClick={() => selectById(insight.nodeId)} className="w-full rounded px-1 py-1 text-left hover:bg-zinc-800/70">
                  <span className="block text-zinc-100">{insight.title}</span>
                  <span className="block text-zinc-500">{insight.detail}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-3 border-t border-zinc-800 pt-2">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500">Shared-tag suggestions</p>
            <p className="mt-1 text-zinc-500">These are rule matches, not a language-model judgment.</p>
            <button
              type="button"
              onClick={() => generateSuggestions.mutate()}
              disabled={generateSuggestions.isPending}
              className="mt-2 min-h-11 rounded-lg bg-zinc-100 px-3 text-zinc-950 disabled:opacity-60"
            >
              {generateSuggestions.isPending ? 'Looking…' : 'Find shared tags'}
            </button>
            {suggestions.isError && <p className="mt-2 text-zinc-500">Suggestions are unavailable until the graph service is updated.</p>}
            {!suggestions.isError && !generateSuggestions.isPending && (suggestions.data ?? []).length === 0 && (
              <p className="mt-2 text-zinc-500">No notes share a tag right now.</p>
            )}
            <ul className="mt-2 space-y-2">
              {(suggestions.data ?? []).map((suggestion) => (
                <li key={suggestion.id} className="rounded-lg border border-dashed border-zinc-700 p-2">
                  <p className="text-zinc-100">{suggestion.sourceLabel || suggestion.sourceKey} · {suggestion.targetLabel || suggestion.targetKey}</p>
                  <p className="mt-1 text-zinc-400">{suggestion.explanation}</p>
                  {suggestion.evidence && <p className="mt-1 text-zinc-500">Evidence: #{suggestion.evidence}</p>}
                  <div className="mt-2 flex gap-2">
                    <button type="button" className="min-h-11 rounded px-2 text-zinc-100" onClick={() => selectById(suggestion.sourceKey)}>Open</button>
                    <button type="button" className="min-h-11 rounded px-2 text-zinc-100" onClick={() => reviewSuggestion.mutate({ id: suggestion.id, accept: true })}>Accept</button>
                    <button type="button" className="min-h-11 rounded px-2 text-zinc-400" onClick={() => reviewSuggestion.mutate({ id: suggestion.id, accept: false })}>Reject</button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
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

