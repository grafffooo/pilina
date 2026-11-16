import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Model3DBody } from '../model/model3d';
import styles from './Model3DImportModal.module.css';

export interface Model3DViewerProps {
  bodies: readonly Model3DBody[];
  selectedIds: ReadonlySet<string>;
  hoveredBodyId: string | null;
  hideDeselected: boolean;
  onToggleBody: (bodyId: string, wholeComponent: boolean) => void;
  onHoverBody: (bodyId: string | null) => void;
}

type ViewPreset = 'iso' | 'top' | 'front';

interface MeshEntry {
  body: Model3DBody;
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  edges: THREE.LineSegments;
  edgeMaterial: THREE.LineBasicMaterial;
  baseColor: THREE.Color;
}

function updateEntriesVisualState(
  entries: readonly MeshEntry[],
  selectedIds: ReadonlySet<string>,
  hoveredBodyId: string | null,
  hideDeselected: boolean,
) {
  for (const entry of entries) {
    const isSelected = selectedIds.has(entry.body.id);
    const isHovered = hoveredBodyId === entry.body.id;

    if (!isSelected && hideDeselected) {
      entry.mesh.visible = false;
      continue;
    }
    entry.mesh.visible = true;

    if (isSelected) {
      entry.material.color.copy(entry.baseColor);
      entry.material.emissive.setHex(isHovered ? 0x92400e : 0x000000);
      entry.material.emissiveIntensity = isHovered ? 0.55 : 0;
      entry.material.opacity = entry.body.opacity;
      entry.material.transparent = entry.body.opacity < 1;
      entry.material.depthWrite = entry.body.opacity >= 1;
      entry.edgeMaterial.opacity = isHovered ? 0.95 : 0.45;
      entry.edgeMaterial.color.setHex(isHovered ? 0xf59e0b : 0x292524);
    } else {
      entry.material.color.copy(entry.baseColor);
      entry.material.emissive.setHex(isHovered ? 0x57534e : 0x000000);
      entry.material.emissiveIntensity = isHovered ? 0.4 : 0;
      entry.material.transparent = true;
      entry.material.opacity = isHovered ? 0.3 : 0.1;
      entry.material.depthWrite = false;
      entry.edgeMaterial.opacity = isHovered ? 0.5 : 0.12;
      entry.edgeMaterial.color.setHex(0x78716c);
    }
    entry.material.needsUpdate = true;
  }
}

export function Model3DViewer({
  bodies,
  selectedIds,
  hoveredBodyId,
  hideDeselected,
  onToggleBody,
  onHoverBody,
}: Model3DViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const entriesRef = useRef<MeshEntry[]>([]);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const boundsRef = useRef<THREE.Box3>(new THREE.Box3());

  // Keep latest callbacks in refs so Three.js event listeners never go stale.
  const callbacksRef = useRef({ onToggleBody, onHoverBody });
  useEffect(() => {
    callbacksRef.current = { onToggleBody, onHoverBody };
  });

  const applyViewPreset = (preset: ViewPreset) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const box = boundsRef.current;
    if (!camera || !controls || box.isEmpty()) return;

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 200);
    const dist = maxDim * 1.45;

    if (preset === 'top') {
      camera.position.set(center.x, center.y + dist, center.z + 0.01);
    } else if (preset === 'front') {
      camera.position.set(center.x, center.y + maxDim * 0.25, center.z + dist);
    } else {
      camera.position.set(center.x + dist * 0.75, center.y + dist * 0.65, center.z + dist * 0.75);
    }
    controls.target.copy(center);
    camera.near = Math.max(1, maxDim * 0.002);
    camera.far = maxDim * 20;
    camera.updateProjectionMatrix();
    controls.update();
  };

  // Build scene when `bodies` changes.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1c1917);

    const width = container.clientWidth || 640;
    const height = container.clientHeight || 480;
    const camera = new THREE.PerspectiveCamera(42, width / height, 1, 50000);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controlsRef.current = controls;

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.72));
    const dir1 = new THREE.DirectionalLight(0xfff7ed, 0.85);
    dir1.position.set(1, 2, 1.5).normalize();
    scene.add(dir1);
    const dir2 = new THREE.DirectionalLight(0xe2e8f0, 0.35);
    dir2.position.set(-1.5, 0.8, -1).normalize();
    scene.add(dir2);

    // Z-up (SolidCraft) -> Y-up (Three.js)
    const modelRoot = new THREE.Group();
    modelRoot.rotation.x = -Math.PI / 2;
    scene.add(modelRoot);

    const entries: MeshEntry[] = [];
    const mat4 = new THREE.Matrix4();

    for (const body of bodies) {
      const [dx, dy, dz] = body.geometry.size;
      const [cx, cy, cz] = body.geometry.corner;
      const geom = new THREE.BoxGeometry(dx, dy, dz);
      geom.translate(cx + dx / 2, cy + dy / 2, cz + dz / 2);

      const baseColor = body.color
        ? new THREE.Color(body.color[0] / 255, body.color[1] / 255, body.color[2] / 255)
        : new THREE.Color(0xd6bfa3);

      const material = new THREE.MeshStandardMaterial({
        color: baseColor.clone(),
        roughness: 0.72,
        metalness: 0.04,
        transparent: body.opacity < 1,
        opacity: body.opacity,
      });

      const mesh = new THREE.Mesh(geom, material);
      mat4.fromArray(body.transform);
      mesh.applyMatrix4(mat4);
      mesh.userData.bodyId = body.id;
      mesh.userData.componentId = body.componentId;
      modelRoot.add(mesh);

      const edgesGeom = new THREE.EdgesGeometry(geom);
      const edgeMaterial = new THREE.LineBasicMaterial({
        color: 0x292524,
        transparent: true,
        opacity: 0.45,
      });
      const edges = new THREE.LineSegments(edgesGeom, edgeMaterial);
      mesh.add(edges);

      entries.push({ body, mesh, material, edges, edgeMaterial, baseColor });
    }
    entriesRef.current = entries;

    // Compute world bounds and add floor grid.
    modelRoot.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(modelRoot);
    boundsRef.current = box;

    if (!box.isEmpty()) {
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const gridSize = Math.max(size.x, size.z, 1000) * 1.4;
      const grid = new THREE.GridHelper(gridSize, 24, 0x44403c, 0x292524);
      grid.position.set(center.x, box.min.y - 0.5, center.z);
      scene.add(grid);
    }

    applyViewPreset('iso');

    // Raycasting for hover and click-to-toggle
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let downX = 0;
    let downY = 0;

    const pickBody = (clientX: number, clientY: number): string | null => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const visibleMeshes = entriesRef.current
        .filter((e) => e.mesh.visible)
        .map((e) => e.mesh);
      const hits = raycaster.intersectObjects(visibleMeshes, false);
      return (hits[0]?.object.userData.bodyId as string | undefined) ?? null;
    };

    const onPointerDown = (e: PointerEvent) => {
      downX = e.clientX;
      downY = e.clientY;
    };

    const onPointerUp = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const dist = Math.hypot(e.clientX - downX, e.clientY - downY);
      if (dist > 5) return;
      const hitId = pickBody(e.clientX, e.clientY);
      if (hitId) {
        callbacksRef.current.onToggleBody(hitId, e.shiftKey || e.altKey);
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const hitId = pickBody(e.clientX, e.clientY);
      renderer.domElement.style.cursor = hitId ? 'pointer' : 'grab';
      callbacksRef.current.onHoverBody(hitId);
    };

    const onPointerLeave = () => {
      callbacksRef.current.onHoverBody(null);
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerleave', onPointerLeave);

    const resizeObserver = new ResizeObserver((items) => {
      const entry = items[0];
      if (!entry) return;
      const w = Math.max(1, entry.contentRect.width);
      const h = Math.max(1, entry.contentRect.height);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resizeObserver.observe(container);

    let raf = 0;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerleave', onPointerLeave);
      controls.dispose();
      for (const e of entries) {
        e.mesh.geometry.dispose();
        e.material.dispose();
        e.edges.geometry.dispose();
        e.edgeMaterial.dispose();
      }
      renderer.dispose();
      renderer.domElement.remove();
      entriesRef.current = [];
    };
  }, [bodies]);

  // Update visual state (selected / ghosted / hidden / hovered) without rebuilding geometry.
  useEffect(() => {
    updateEntriesVisualState(entriesRef.current, selectedIds, hoveredBodyId, hideDeselected);
  }, [selectedIds, hoveredBodyId, hideDeselected]);

  return (
    <div className={styles.viewerWrap}>
      <div ref={containerRef} className={styles.viewerCanvas} />
      <div className={styles.viewerOverlay}>
        <button type="button" className={styles.viewBtn} onClick={() => applyViewPreset('iso')}>
          Iso
        </button>
        <button type="button" className={styles.viewBtn} onClick={() => applyViewPreset('top')}>
          Top
        </button>
        <button type="button" className={styles.viewBtn} onClick={() => applyViewPreset('front')}>
          Front
        </button>
      </div>
      <div className={styles.viewerHint}>
        Click to toggle part · Shift+click to toggle component · Drag to orbit
      </div>
    </div>
  );
}
