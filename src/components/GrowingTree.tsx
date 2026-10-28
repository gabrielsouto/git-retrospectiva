import { useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { languageOf } from '../stats/languages';
import { fmtDate } from './format';

interface Node {
  name: string;
  parent: Node | null;
  children: Node[];
  isFile: boolean;
  /** Time the node first appears. */
  born: number;
  /** Last time the node was touched, for the glow effect. */
  touched: number;
  depth: number;
  leaves: number;
  x: number;
  y: number;
  color: string;
}

const MAX_FILES = 2500;

function buildTree(timeline: { time: number; paths: string[] }[]) {
  const root: Node = { name: '', parent: null, children: [], isFile: false, born: timeline[0]?.time ?? 0, touched: -Infinity, depth: 0, leaves: 0, x: 0, y: 0, color: '#fff' };
  const byPath = new Map<string, Node>();
  let files = 0;
  for (const { time, paths } of timeline) {
    for (const path of paths) {
      if (byPath.has(path)) continue;
      if (files >= MAX_FILES) break;
      files++;
      const parts = path.split('/');
      let node = root;
      let acc = '';
      parts.forEach((part, i) => {
        acc = acc ? `${acc}/${part}` : part;
        let child = byPath.get(acc);
        if (!child) {
          const isFile = i === parts.length - 1;
          child = {
            name: part, parent: node, children: [], isFile, born: time, touched: -Infinity,
            depth: node.depth + 1, leaves: 0, x: 0, y: 0,
            color: isFile ? languageOf(part).color : 'rgba(255,255,255,0.8)',
          };
          node.children.push(child);
          byPath.set(acc, child);
        }
        node = child;
      });
    }
  }
  let maxDepth = 0;
  const count = (n: Node): number => {
    maxDepth = Math.max(maxDepth, n.depth);
    n.leaves = n.children.length ? n.children.reduce((s, c) => s + count(c), 0) : 1;
    return n.leaves;
  };
  count(root);
  // Radial layout: each subtree gets an angular wedge proportional to its leaves.
  const place = (n: Node, a0: number, a1: number) => {
    const angle = (a0 + a1) / 2;
    const r = n.depth / Math.max(1, maxDepth);
    n.x = Math.cos(angle) * r;
    n.y = Math.sin(angle) * r;
    let a = a0;
    for (const c of n.children) {
      const span = ((a1 - a0) * c.leaves) / n.leaves;
      place(c, a, a + span);
      a += span;
    }
  };
  place(root, 0, Math.PI * 2);
  return { root, byPath };
}

export function GrowingTree({ timeline, duration }: { timeline: { time: number; author: string; paths: string[] }[]; duration: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduce = useReducedMotion();
  const [caption, setCaption] = useState({ date: '', author: '' });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !timeline.length) return;
    const ctx = canvas.getContext('2d')!;
    const { root, byPath } = buildTree(timeline);
    const nodes: Node[] = [];
    const collect = (n: Node) => {
      nodes.push(n);
      n.children.forEach(collect);
    };
    collect(root);
    const t0 = timeline[0].time;
    const t1 = timeline[timeline.length - 1].time;
    const span = Math.max(1, t1 - t0);
    let raf = 0;
    let start = performance.now();
    let eventIndex = 0;
    let lastCaption = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const frame = (now: number) => {
      const progress = reduce ? 1 : Math.min(1, (now - start) / 1000 / duration);
      const current = t0 + span * progress;
      // Mark files touched by commits up to the current moment.
      while (eventIndex < timeline.length && timeline[eventIndex].time <= current) {
        const ev = timeline[eventIndex];
        for (const p of ev.paths) {
          let n = byPath.get(p);
          while (n) {
            n.touched = ev.time;
            n = n.parent ?? undefined;
          }
        }
        if (now - lastCaption > 120) {
          lastCaption = now;
          setCaption({ date: new Date(ev.time).toISOString().slice(0, 10), author: ev.author });
        }
        eventIndex++;
      }

      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const R = Math.min(w, h) * 0.44;
      const cx = w / 2;
      const cy = h / 2;
      ctx.clearRect(0, 0, w, h);
      const glowWindow = span * 0.04;

      ctx.lineWidth = 1;
      for (const n of nodes) {
        if (!n.parent || n.born > current) continue;
        const age = Math.min(1, (current - n.born) / (span * 0.03 || 1));
        const px = cx + n.parent.x * R;
        const py = cy + n.parent.y * R;
        const x = px + (n.x * R + cx - px) * age;
        const y = py + (n.y * R + cy - py) * age;
        ctx.strokeStyle = n.isFile ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.28)';
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
      for (const n of nodes) {
        if (n.born > current) continue;
        const x = cx + n.x * R;
        const y = cy + n.y * R;
        const heat = Math.max(0, 1 - (current - n.touched) / glowWindow);
        if (n.isFile) {
          if (heat > 0) {
            ctx.fillStyle = n.color;
            ctx.globalAlpha = heat * 0.35;
            ctx.beginPath();
            ctx.arc(x, y, 3 + heat * 9, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.globalAlpha = 0.95;
          ctx.fillStyle = n.color;
          ctx.beginPath();
          ctx.arc(x, y, 2.2 + heat * 1.8, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        } else {
          ctx.fillStyle = heat > 0 ? '#ffffff' : 'rgba(255,255,255,0.6)';
          ctx.beginPath();
          ctx.arc(x, y, n === root ? 5 : 1.6, 0, Math.PI * 2);
          ctx.fill();
          if (n.depth === 1 && n.leaves > 2) {
            ctx.fillStyle = 'rgba(255,255,255,0.75)';
            ctx.font = '600 12px "Space Grotesk", system-ui, sans-serif';
            ctx.fillText(n.name, x + 6, y - 6);
          }
        }
      }
      if (progress < 1) raf = requestAnimationFrame(frame);
    };
    start = performance.now();
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [timeline, duration, reduce]);

  return (
    <div className="tree">
      <canvas ref={canvasRef} className="tree-canvas" aria-label="Animação da árvore de arquivos do projeto crescendo ao longo do tempo" />
      <div className="tree-caption">
        <strong>{caption.date ? fmtDate(caption.date, { day: 'numeric', month: 'short', year: 'numeric' }) : ''}</strong>
        <span>{caption.author}</span>
      </div>
    </div>
  );
}
