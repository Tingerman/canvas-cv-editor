import type { AnyNode } from '@/types/document';
import type { Renderer, HandleName } from './Renderer';
import type { Scene } from './Scene';
import type { Vec2 } from './utils/geometry';
import { hitTest, hitTestHandle, nodesInBounds, worldToLocal } from './HitTest';
import { computeMoveSnap } from './SnapEngine';

export interface ControllerHooks {
  /** Called at the start of a drag/resize/rotate, right before changes begin. */
  beginInteraction(): void;
  /** Called when the interaction successfully ends; commits the batched undo step. */
  commitInteraction(label: string): void;
  /** Cancels interaction without committing (e.g. click-only). */
  cancelInteraction(): void;

  setSelection(ids: string[], additive?: boolean): void;
  getSelection(): string[];

  moveNodes(ids: string[], dx: number, dy: number): void;
  resizeNode(id: string, patch: Partial<Pick<AnyNode, 'x' | 'y' | 'w' | 'h'>>): void;
  rotateNode(id: string, rotation: number): void;

  deleteSelected(): void;
  nudge(dx: number, dy: number): void;

  requestTextEdit(id: string): void;

  setZoom(zoom: number, anchor?: Vec2): void;
  setPan(x: number, y: number): void;
}

type State =
  | { kind: 'idle' }
  | { kind: 'dragging'; startWorld: Vec2; ids: string[]; origin: Map<string, Vec2>; moved: boolean }
  | { kind: 'resizing'; handle: HandleName; node: AnyNode; startWorld: Vec2; origin: { x: number; y: number; w: number; h: number } }
  | { kind: 'rotating'; node: AnyNode; center: Vec2; startAngle: number; originalRotation: number }
  | { kind: 'marquee'; start: Vec2; current: Vec2; additive: boolean }
  | { kind: 'panning'; startPan: Vec2; startScreen: Vec2 };

export class InteractionController {
  renderer: Renderer;
  scene: Scene;
  hooks: ControllerHooks;
  state: State = { kind: 'idle' };
  spaceDown = false;
  private cleanup: (() => void)[] = [];

  constructor(renderer: Renderer, scene: Scene, hooks: ControllerHooks) {
    this.renderer = renderer;
    this.scene = scene;
    this.hooks = hooks;
    this.attach();
  }

  dispose() {
    this.cleanup.forEach((fn) => fn());
    this.cleanup = [];
  }

  private attach() {
    const el = this.renderer.canvas;
    const onDown = (e: PointerEvent) => this.onPointerDown(e);
    const onMove = (e: PointerEvent) => this.onPointerMove(e);
    const onUp = (e: PointerEvent) => this.onPointerUp(e);
    const onDbl = (e: MouseEvent) => this.onDblClick(e);
    const onWheel = (e: WheelEvent) => this.onWheel(e);
    const onKeyDown = (e: KeyboardEvent) => this.onKeyDown(e);
    const onKeyUp = (e: KeyboardEvent) => this.onKeyUp(e);
    const onContext = (e: MouseEvent) => e.preventDefault();

    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    el.addEventListener('dblclick', onDbl);
    el.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    el.addEventListener('contextmenu', onContext);

    this.cleanup.push(
      () => el.removeEventListener('pointerdown', onDown),
      () => window.removeEventListener('pointermove', onMove),
      () => window.removeEventListener('pointerup', onUp),
      () => el.removeEventListener('dblclick', onDbl),
      () => el.removeEventListener('wheel', onWheel),
      () => window.removeEventListener('keydown', onKeyDown),
      () => window.removeEventListener('keyup', onKeyUp),
      () => el.removeEventListener('contextmenu', onContext)
    );
  }

  private getCanvasPoint(e: MouseEvent): Vec2 {
    const rect = this.renderer.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private onPointerDown(e: PointerEvent) {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const screen = this.getCanvasPoint(e);
    const world = this.renderer.screenToWorld(screen.x, screen.y);

    // Pan mode: space+drag or middle button
    if (this.spaceDown || e.button === 1) {
      this.state = {
        kind: 'panning',
        startPan: { x: this.renderer.viewport.panX, y: this.renderer.viewport.panY },
        startScreen: screen
      };
      return;
    }
    if (e.button !== 0) return;

    const selectedIds = this.hooks.getSelection();

    // 1. Handle hit (only when exactly one node is selected)
    if (selectedIds.length === 1) {
      const node = this.scene.getNode(selectedIds[0]);
      if (node) {
        const handle = hitTestHandle(node, world.x, world.y, this.renderer.viewport.zoom);
        if (handle === 'rotate') {
          const center: Vec2 = { x: node.x + node.w / 2, y: node.y + node.h / 2 };
          this.hooks.beginInteraction();
          this.state = {
            kind: 'rotating',
            node,
            center,
            startAngle: Math.atan2(world.y - center.y, world.x - center.x),
            originalRotation: node.rotation
          };
          return;
        } else if (handle) {
          this.hooks.beginInteraction();
          this.state = {
            kind: 'resizing',
            handle,
            node,
            startWorld: world,
            origin: { x: node.x, y: node.y, w: node.w, h: node.h }
          };
          return;
        }
      }
    }

    // 2. Node hit -> drag
    const hit = hitTest(this.scene, world.x, world.y);
    if (hit && !hit.locked) {
      const additive = e.shiftKey;
      const already = selectedIds.includes(hit.id);
      if (!already) {
        this.hooks.setSelection([hit.id], additive);
      } else if (additive) {
        this.hooks.setSelection(selectedIds.filter((id) => id !== hit.id));
        return;
      }
      const ids = this.hooks.getSelection();
      const origin = new Map<string, Vec2>();
      for (const id of ids) {
        const n = this.scene.getNode(id);
        if (n) origin.set(id, { x: n.x, y: n.y });
      }
      this.hooks.beginInteraction();
      this.state = { kind: 'dragging', startWorld: world, ids, origin, moved: false };
      return;
    }

    // 3. Empty area -> marquee
    if (!e.shiftKey) this.hooks.setSelection([]);
    this.state = { kind: 'marquee', start: world, current: world, additive: e.shiftKey };
  }

  private onPointerMove(e: PointerEvent) {
    if (this.state.kind === 'idle') return;
    const screen = this.getCanvasPoint(e);
    const world = this.renderer.screenToWorld(screen.x, screen.y);

    switch (this.state.kind) {
      case 'panning': {
        const dx = screen.x - this.state.startScreen.x;
        const dy = screen.y - this.state.startScreen.y;
        this.hooks.setPan(this.state.startPan.x + dx, this.state.startPan.y + dy);
        break;
      }
      case 'dragging': {
        let dx = world.x - this.state.startWorld.x;
        let dy = world.y - this.state.startWorld.y;
        if (e.shiftKey) {
          if (Math.abs(dx) > Math.abs(dy)) dy = 0;
          else dx = 0;
        }
        // Reset nodes to origin before applying new delta (accumulation-safe)
        for (const id of this.state.ids) {
          const origin = this.state.origin.get(id);
          const node = this.scene.getNode(id);
          if (!origin || !node) continue;
          const deltaToOrigin = { x: origin.x - node.x, y: origin.y - node.y };
          if (deltaToOrigin.x || deltaToOrigin.y) {
            this.hooks.moveNodes([id], deltaToOrigin.x, deltaToOrigin.y);
          }
        }
        // Apply proposed delta
        this.hooks.moveNodes(this.state.ids, dx, dy);
        // Snap
        const movingNodes = this.state.ids
          .map((id) => this.scene.getNode(id))
          .filter((n): n is AnyNode => !!n);
        const snap = computeMoveSnap(this.scene, movingNodes, this.renderer.viewport.zoom);
        if (snap.dx || snap.dy) {
          this.hooks.moveNodes(this.state.ids, snap.dx, snap.dy);
        }
        this.renderer.overlay.snapGuides = snap.guides;
        this.state.moved = true;
        this.renderer.requestRender();
        break;
      }
      case 'resizing': {
        this.applyResize(world, e.shiftKey, e.altKey);
        this.renderer.requestRender();
        break;
      }
      case 'rotating': {
        const angle = Math.atan2(world.y - this.state.center.y, world.x - this.state.center.x);
        let delta = angle - this.state.startAngle;
        let rot = this.state.originalRotation + delta;
        if (e.shiftKey) {
          const step = (15 * Math.PI) / 180;
          rot = Math.round(rot / step) * step;
        }
        this.hooks.rotateNode(this.state.node.id, rot);
        this.renderer.requestRender();
        break;
      }
      case 'marquee': {
        this.state.current = world;
        const s = this.state.start;
        const box = {
          x: Math.min(s.x, world.x),
          y: Math.min(s.y, world.y),
          w: Math.abs(world.x - s.x),
          h: Math.abs(world.y - s.y)
        };
        this.renderer.overlay.marquee = box;
        this.renderer.requestRender();
        break;
      }
    }
  }

  private applyResize(world: Vec2, keepRatio: boolean, fromCenter: boolean) {
    if (this.state.kind !== 'resizing') return;
    const { node, handle, origin } = this.state;

    // Work in node-local coords so rotated resizes feel natural
    const startLocal = worldToLocal(node, this.state.startWorld.x, this.state.startWorld.y);
    const curLocal = worldToLocal(node, world.x, world.y);
    const dLX = curLocal.x - startLocal.x;
    const dLY = curLocal.y - startLocal.y;

    let nx = 0;
    let ny = 0;
    let nw = origin.w;
    let nh = origin.h;

    // derive new local rectangle based on handle
    let left = 0;
    let top = 0;
    let right = origin.w;
    let bottom = origin.h;
    if (handle.includes('w')) left += dLX;
    if (handle.includes('e')) right += dLX;
    if (handle.includes('n')) top += dLY;
    if (handle.includes('s')) bottom += dLY;

    nw = Math.max(4, right - left);
    nh = Math.max(4, bottom - top);

    if (keepRatio) {
      const ratio = origin.w / origin.h;
      if (nw / nh > ratio) nw = nh * ratio;
      else nh = nw / ratio;
      if (handle.includes('w')) left = right - nw;
      if (handle.includes('n')) top = bottom - nh;
    }

    if (fromCenter) {
      // scale symmetrically
      const cx = origin.w / 2;
      const cy = origin.h / 2;
      const halfW = nw / 2;
      const halfH = nh / 2;
      left = cx - halfW;
      right = cx + halfW;
      top = cy - halfH;
      bottom = cy + halfH;
    }

    // Translate local top-left back to world
    // Local (left, top) -> world: reverse of worldToLocal.
    // Since node.x/y correspond to local origin (0,0) before rotation+translation,
    // the shift of local top-left by (left, top) corresponds to a rotated shift in world.
    const cos = Math.cos(node.rotation);
    const sin = Math.sin(node.rotation);
    const shiftWX = left * cos - top * sin;
    const shiftWY = left * sin + top * cos;

    nx = origin.x + shiftWX;
    ny = origin.y + shiftWY;

    // Also need to keep rotation center invariant: account for size change under rotation.
    // Simpler approach: keep origin corner fixed (fine for MVP).
    this.hooks.resizeNode(node.id, { x: nx, y: ny, w: nw, h: nh });
  }

  private onPointerUp(_e: PointerEvent) {
    switch (this.state.kind) {
      case 'dragging':
        if (this.state.moved) this.hooks.commitInteraction('移动');
        else this.hooks.cancelInteraction();
        break;
      case 'resizing':
        this.hooks.commitInteraction('缩放');
        break;
      case 'rotating':
        this.hooks.commitInteraction('旋转');
        break;
      case 'marquee': {
        const s = this.state.start;
        const c = this.state.current;
        const box = {
          x: Math.min(s.x, c.x),
          y: Math.min(s.y, c.y),
          w: Math.abs(c.x - s.x),
          h: Math.abs(c.y - s.y)
        };
        if (box.w > 2 && box.h > 2) {
          const hits = nodesInBounds(this.scene, box);
          const ids = hits.map((n) => n.id);
          if (this.state.additive) {
            const merged = Array.from(new Set([...this.hooks.getSelection(), ...ids]));
            this.hooks.setSelection(merged);
          } else {
            this.hooks.setSelection(ids);
          }
        }
        this.renderer.overlay.marquee = null;
        break;
      }
    }
    this.renderer.overlay.snapGuides = [];
    this.state = { kind: 'idle' };
    this.renderer.requestRender();
  }

  private onDblClick(e: MouseEvent) {
    const screen = this.getCanvasPoint(e);
    const world = this.renderer.screenToWorld(screen.x, screen.y);
    const hit = hitTest(this.scene, world.x, world.y);
    if (hit && hit.type === 'text') {
      this.hooks.requestTextEdit(hit.id);
    }
  }

  private onWheel(e: WheelEvent) {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const screen = this.getCanvasPoint(e);
    const world = this.renderer.screenToWorld(screen.x, screen.y);
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    const nextZoom = Math.max(0.1, Math.min(4, this.renderer.viewport.zoom * factor));
    this.hooks.setZoom(nextZoom, world);
  }

  private onKeyDown(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;

    if (e.code === 'Space') this.spaceDown = true;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      this.hooks.deleteSelected();
    }
    const step = e.shiftKey ? 10 : 1;
    if (e.key === 'ArrowLeft') { e.preventDefault(); this.hooks.nudge(-step, 0); }
    if (e.key === 'ArrowRight') { e.preventDefault(); this.hooks.nudge(step, 0); }
    if (e.key === 'ArrowUp') { e.preventDefault(); this.hooks.nudge(0, -step); }
    if (e.key === 'ArrowDown') { e.preventDefault(); this.hooks.nudge(0, step); }
  }

  private onKeyUp(e: KeyboardEvent) {
    if (e.code === 'Space') this.spaceDown = false;
  }
}
