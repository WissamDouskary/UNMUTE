import React, { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import ForceGraph3D, { type ForceGraphMethods, type LinkObject, type NodeObject } from 'react-force-graph-3d';
import * as THREE from 'three';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ArrowUpRight, X } from 'lucide-react';
import type { GraphNode, GraphNodeType } from '@unmute/api-client';

export type GraphNode3D = GraphNode & { degree: number; x?: number; y?: number; z?: number };
type GraphLink3D = { id?: string; source?: string | number | object; target?: string | number | object };

const TYPE_COLOR: Record<GraphNodeType, string> = {
  NOTE: '#a78bfa',
  TASK: '#34d399',
  SOURCE: '#fbbf24',
  TAG: '#38bdf8',
};

const GEOMETRY: Record<GraphNodeType, THREE.BufferGeometry> = {
  NOTE: new THREE.SphereGeometry(1, 28, 28),
  TASK: new THREE.BoxGeometry(1.35, 1.35, 1.35),
  SOURCE: new THREE.OctahedronGeometry(1.15, 0),
  TAG: new THREE.TorusGeometry(0.72, 0.24, 12, 28),
};

const PARTICLE_GEOMETRY = new THREE.SphereGeometry(0.7, 10, 10);
const PARTICLE_MATERIAL = new THREE.MeshBasicMaterial({ color: 0xffffff });

function nodeColor(node: GraphNode3D): string {
  if (node.type === 'TASK' && node.status === 'COMPLETED') return '#71717a';
  if (node.type === 'SOURCE' && node.status === 'FAILED') return '#f87171';
  if (node.type === 'NOTE' && node.status === 'ARCHIVED') return '#71717a';
  return TYPE_COLOR[node.type];
}

function nodeRadius(node: GraphNode3D): number {
  return Math.max(3.2, Math.sqrt(Math.max(node.degree, 1)) * 2.3);
}

function buildNodeObject(node: GraphNode3D): THREE.Group {
  const color = new THREE.Color(nodeColor(node));
  const radius = node.type === 'TAG' ? nodeRadius(node) * 0.85 : nodeRadius(node);
  const mesh = new THREE.Mesh(
    GEOMETRY[node.type],
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 2.6,
      metalness: 0.15,
      roughness: 0.35,
    }),
  );
  mesh.scale.setScalar(radius);
  // Invisible collider so the bloom halo can be hovered, not only the bright core.
  const hit = new THREE.Mesh(
    new THREE.SphereGeometry(1, 8, 8),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
  );
  hit.scale.setScalar(radius * 2.6);
  const group = new THREE.Group();
  group.add(mesh);
  group.add(hit);
  return group;
}

function statusLine(node: GraphNode3D): string | null {
  if (node.type === 'NOTE') return node.status && node.status !== 'ACTIVE' ? node.status : null;
  if (node.type === 'TASK') return [node.status, node.priority].filter(Boolean).join(' · ') || null;
  if (node.type === 'SOURCE') return node.status ?? null;
  return null;
}

export type KnowledgeGraph3DHandle = { zoomToFit: () => void };

export const KnowledgeGraph3D = React.forwardRef<
  KnowledgeGraph3DHandle,
  {
    graphData: { nodes: GraphNode3D[]; links: GraphLink3D[] };
    width: number;
    height: number;
    onOpen: (node: GraphNode3D) => void;
  }
>(function KnowledgeGraph3D({ graphData, width, height, onOpen }, ref) {
  const fgRef = useRef<
    ForceGraphMethods<NodeObject<GraphNode3D>, LinkObject<GraphNode3D, { id?: string }>> | undefined
  >(undefined);
  const bloomRef = useRef<UnrealBloomPass | null>(null);
  const fittedRef = useRef(false);
  const sizeRef = useRef({ width, height });
  sizeRef.current = { width, height };

  const [hovered, setHovered] = useState<GraphNode3D | null>(null);
  const [pinned, setPinned] = useState<GraphNode3D | null>(null);
  const [cardPos, setCardPos] = useState({ x: 24, y: 24 });

  const focus = hovered ?? pinned;

  useImperativeHandle(ref, () => ({
    zoomToFit: () => fgRef.current?.zoomToFit(500, 80),
  }));

  useEffect(() => {
    const fg = fgRef.current;
    if (!fg || width < 1 || height < 1) return;

    const renderer = fg.renderer();
    const camera = fg.camera();
    const composer = fg.postProcessingComposer();

    renderer.toneMapping = THREE.NoToneMapping;
    const bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 1.5, 0.4, 0.85);
    const output = new OutputPass();
    composer.addPass(bloom);
    composer.addPass(output);
    bloomRef.current = bloom;

    const ambient = new THREE.AmbientLight(0xffffff, 0.25);
    const key = new THREE.DirectionalLight(0xe9d5ff, 0.9);
    key.position.set(30, 80, 40);
    fg.lights([ambient, key]);

    const fitComposer = () => {
      const nextWidth = sizeRef.current.width;
      const nextHeight = sizeRef.current.height;
      if (nextWidth < 1 || nextHeight < 1) return;
      composer.setSize(nextWidth, nextHeight);
      bloom.setSize(nextWidth, nextHeight);
      if (camera instanceof THREE.PerspectiveCamera) {
        camera.aspect = nextWidth / nextHeight;
        camera.updateProjectionMatrix();
      }
    };
    fitComposer();
    window.addEventListener('resize', fitComposer);

    return () => {
      window.removeEventListener('resize', fitComposer);
      composer.removePass(bloom);
      composer.removePass(output);
      bloom.dispose();
      bloomRef.current = null;
    };
  }, [width > 0 && height > 0]);

  useEffect(() => {
    const fg = fgRef.current;
    const bloom = bloomRef.current;
    if (!fg || !bloom || width < 1 || height < 1) return;
    fg.postProcessingComposer().setSize(width, height);
    bloom.setSize(width, height);
    const camera = fg.camera();
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }
  }, [width, height]);

  useEffect(() => {
    let frame = 0;
    const track = () => {
      const fg = fgRef.current;
      const node = focus;
      if (fg && node && node.x !== undefined && node.y !== undefined && node.z !== undefined) {
        const coords = fg.graph2ScreenCoords(node.x, node.y, node.z);
        setCardPos({ x: coords.x, y: coords.y });
      }
      frame = requestAnimationFrame(track);
    };
    frame = requestAnimationFrame(track);
    return () => cancelAnimationFrame(frame);
  }, [focus]);

  const makeNode = useCallback((node: GraphNode3D) => buildNodeObject(node), []);
  const makeParticle = useCallback(() => new THREE.Mesh(PARTICLE_GEOMETRY, PARTICLE_MATERIAL), []);

  const cardNode = focus;
  const cardLeft = Math.min(Math.max(12, cardPos.x + 18), Math.max(12, width - 272));
  const cardTop = Math.min(Math.max(12, cardPos.y - 16), Math.max(12, height - 168));
  const canOpen = cardNode && cardNode.type !== 'TAG';

  return (
    <div className="absolute inset-0">
      <ForceGraph3D<GraphNode3D, { id?: string }>
        ref={fgRef}
        width={width}
        height={height}
        graphData={{
          nodes: graphData.nodes,
          links: graphData.links as LinkObject<GraphNode3D, { id?: string }>[],
        }}
        backgroundColor="#09090b"
        showNavInfo={false}
        nodeId="id"
        nodeLabel={() => ''}
        nodeThreeObject={makeNode}
        nodeThreeObjectExtend={false}
        linkColor={() => 'rgba(161, 161, 170, 0.45)'}
        linkWidth={0.6}
        linkOpacity={0.55}
        linkDirectionalParticles={2}
        linkDirectionalParticleWidth={1.5}
        linkDirectionalParticleSpeed={0.004}
        linkDirectionalParticleColor={() => '#ffffff'}
        linkDirectionalParticleThreeObject={makeParticle}
        warmupTicks={40}
        cooldownTicks={120}
        onNodeHover={(node) => setHovered(node)}
        onNodeClick={(node) => setPinned(node)}
        onBackgroundClick={() => {
          setPinned(null);
          setHovered(null);
        }}
        onEngineStop={() => {
          if (!fittedRef.current) {
            fittedRef.current = true;
            fgRef.current?.zoomToFit(500, 80);
          }
        }}
      />

      {cardNode && (
        <div
          className="pointer-events-auto absolute z-20 w-64 rounded-xl border border-zinc-800 bg-zinc-950/80 p-3 shadow-2xl shadow-black/50 backdrop-blur"
          style={{ left: cardLeft, top: cardTop }}
        >
          <div className="flex items-start gap-2">
            <span
              className="mt-1 h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: nodeColor(cardNode), boxShadow: `0 0 10px ${nodeColor(cardNode)}` }}
            />
            <div className="min-w-0 flex-1">
              <p dir="auto" className="truncate text-sm font-medium text-zinc-100">
                {cardNode.type === 'TAG' ? `#${cardNode.label}` : cardNode.label}
              </p>
              <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                {cardNode.type}
                {statusLine(cardNode) ? ` · ${statusLine(cardNode)}` : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setPinned(null);
                setHovered(null);
              }}
              className="text-zinc-500 hover:text-zinc-200 cursor-pointer"
              aria-label="Close node details"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="mt-2 text-[11px] text-zinc-400">
            {cardNode.degree} connection{cardNode.degree === 1 ? '' : 's'}
          </p>
          {canOpen && (
            <button
              type="button"
              onClick={() => onOpen(cardNode)}
              className="mt-2 flex w-full items-center justify-between rounded-lg px-1 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-900 cursor-pointer"
            >
              {cardNode.type === 'NOTE' ? 'Open note' : cardNode.type === 'TASK' ? 'Open in context' : 'Open sources'}
              <ArrowUpRight className="h-3.5 w-3.5 text-zinc-500" />
            </button>
          )}
        </div>
      )}
    </div>
  );
});
