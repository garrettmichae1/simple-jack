import { useEffect, useRef } from "react";
import "./math-scene.css";

export interface MathSceneProps {
  progress: number;
  playing: boolean;
  pulseKey: number;
  intensity?: number;
  reducedMotion?: boolean;
  className?: string;
}

type Point3 = { x: number; y: number; z: number };
type Point2 = Point3 & { scale: number };
type Sample = {
  cu: number;
  su: number;
  cv: number;
  sv: number;
  u: number;
  v: number;
};
type Curve = { samples: Sample[]; accent: boolean };

const TAU = Math.PI * 2;
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
const sample = (u: number, v: number): Sample => ({
  u,
  v,
  cu: Math.cos(u),
  su: Math.sin(u),
  cv: Math.cos(v),
  sv: Math.sin(v),
});

// Parametric samples are immutable; only their projection changes each frame.
const CURVES: Curve[] = [
  ...Array.from({ length: 42 }, (_, ring) => ({
    accent: ring % 7 === 0,
    samples: Array.from({ length: 101 }, (_, i) =>
      sample((ring / 42) * TAU, (i / 100) * TAU),
    ),
  })),
  ...Array.from({ length: 22 }, (_, ring) => ({
    accent: ring % 6 === 0,
    samples: Array.from({ length: 129 }, (_, i) =>
      sample((i / 128) * TAU, (ring / 22) * TAU),
    ),
  })),
];

/** A procedural, projected toroidal field. No external textures or WebGL required. */
export function MathScene({
  progress,
  playing,
  pulseKey,
  intensity = 1,
  reducedMotion = false,
  className = "",
}: MathSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({
    progress,
    playing,
    pulseKey,
    intensity,
    reducedMotion,
  });
  stateRef.current = { progress, playing, pulseKey, intensity, reducedMotion };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return;

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let systemReducedMotion = motionQuery.matches;
    let width = 0;
    let height = 0;
    let dpr = 1;
    let frame = 0;
    let disposed = false;
    let lastTime = 0;
    let clock = 0;
    let smoothProgress = clamp(stateRef.current.progress, 0, 1);
    let lastPulse = stateRef.current.pulseKey;
    let pulseAt = -100;
    let pointerX = 0;
    let pointerY = 0;
    let smoothX = 0;
    let smoothY = 0;

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      width = bounds.width;
      height = bounds.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const onMove = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect();
      pointerX =
        ((event.clientX - bounds.left) / Math.max(bounds.width, 1) - 0.5) * 2;
      pointerY =
        ((event.clientY - bounds.top) / Math.max(bounds.height, 1) - 0.5) * 2;
    };
    const onLeave = () => {
      pointerX = 0;
      pointerY = 0;
    };
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerleave", onLeave);

    const draw = (timestamp: number) => {
      if (disposed || document.hidden) {
        frame = 0;
        return;
      }
      const state = stateRef.current;
      const still = state.reducedMotion || systemReducedMotion;
      const delta = lastTime
        ? Math.min((timestamp - lastTime) / 1000, 0.05)
        : 0;
      lastTime = timestamp;
      if (!still) clock += delta;
      smoothProgress +=
        (clamp(state.progress, 0, 1) - smoothProgress) *
        (still ? 1 : Math.min(delta * 3.5, 1));
      smoothX += (pointerX - smoothX) * 0.035;
      smoothY += (pointerY - smoothY) * 0.035;
      if (lastPulse !== state.pulseKey) {
        lastPulse = state.pulseKey;
        pulseAt = clock;
      }
      if (!width || !height) {
        frame = requestAnimationFrame(draw);
        return;
      }

      const strength = clamp(state.intensity, 0, 2);
      const time = still ? 0 : clock;
      let baseScale = Math.min(width * 0.22, height * 0.325);
      const centerX = width * 0.5;
      const centerY = height * 0.49;
      const angleX =
        0.96 + Math.sin(time * 0.11) * 0.075 + (still ? 0 : smoothY * 0.07);
      const angleY =
        -0.31 + Math.sin(time * 0.07) * 0.13 + (still ? 0 : smoothX * 0.1);
      const angleZ = -0.31 + time * 0.022;
      const cx = Math.cos(angleX),
        sx = Math.sin(angleX);
      const cy = Math.cos(angleY),
        sy = Math.sin(angleY);
      const cz = Math.cos(angleZ),
        sz = Math.sin(angleZ);
      const disorder = (1 - smoothProgress) * 0.095;
      const pulseAge = clock - pulseAt;
      const pulseStrength =
        !still && pulseAge < 2.8 ? Math.exp(-pulseAge * 1.4) : 0;

      const project = (x: number, y: number, z: number): Point2 => {
        const y1 = y * cx - z * sx;
        const z1 = y * sx + z * cx;
        const x2 = x * cy + z1 * sy;
        const z2 = -x * sy + z1 * cy;
        const x3 = x2 * cz - y1 * sz;
        const y3 = x2 * sz + y1 * cz;
        const scale = 5.8 / (5.8 - z2);
        return {
          x: centerX + x3 * baseScale * scale,
          y: centerY + y3 * baseScale * scale,
          z: z2,
          scale,
        };
      };
      const torus = (point: Sample): Point2 => {
        const wave =
          disorder * Math.sin(point.u * 3 + point.v * 2 + time * 0.32);
        const minor = 0.52 + wave;
        const radius = 1.35 + minor * point.cv;
        return project(radius * point.cu, radius * point.su, minor * point.sv);
      };

      // Fit the actual projected sculpture, including at its tallest rotation.
      // The orbital paths may meet the frame; the torus itself never gets cropped.
      let extentX = 0;
      let extentY = 0;
      for (let u = 0; u < 32; u++) {
        for (let v = 0; v < 12; v++) {
          const point = torus(sample((u / 32) * TAU, (v / 12) * TAU));
          extentX = Math.max(extentX, Math.abs(point.x - centerX));
          extentY = Math.max(extentY, Math.abs(point.y - centerY));
        }
      }
      baseScale *= Math.min(
        1,
        (width * 0.46) / Math.max(extentX, 1),
        (height * 0.435) / Math.max(extentY, 1),
      );

      context.clearRect(0, 0, width, height);

      // A very restrained atmospheric light beneath the geometry.
      const halo = context.createRadialGradient(
        centerX,
        centerY,
        0,
        centerX,
        centerY,
        baseScale * 2.9,
      );
      halo.addColorStop(0, `rgba(86, 184, 159, ${0.025 * strength})`);
      halo.addColorStop(0.48, `rgba(82, 184, 156, ${0.042 * strength})`);
      halo.addColorStop(1, "rgba(51, 130, 112, 0)");
      context.fillStyle = halo;
      context.fillRect(0, 0, width, height);

      // Quiet drafting marks make the floating object feel measured and intentional.
      context.lineWidth = 0.65;
      context.strokeStyle = "rgba(145, 170, 154, 0.10)";
      context.setLineDash([2, 7]);
      context.beginPath();
      context.moveTo(centerX, centerY - baseScale * 2.55);
      context.lineTo(centerX, centerY + baseScale * 2.55);
      context.moveTo(centerX - baseScale * 2.8, centerY);
      context.lineTo(centerX + baseScale * 2.8, centerY);
      context.stroke();
      context.setLineDash([]);

      // Depth-layered paths keep the fine lattice legible where strands overlap.
      const lattice = Array.from({ length: 10 }, () => new Path2D());
      const highlights = Array.from({ length: 10 }, () => new Path2D());
      for (const curve of CURVES) {
        let previous = torus(curve.samples[0]);
        for (let i = 1; i < curve.samples.length; i++) {
          const next = torus(curve.samples[i]);
          const depth = clamp(
            Math.floor((((previous.z + next.z) * 0.5 + 2.05) / 4.1) * 10),
            0,
            9,
          );
          const path = curve.accent ? highlights[depth] : lattice[depth];
          path.moveTo(previous.x, previous.y);
          path.lineTo(next.x, next.y);
          previous = next;
        }
      }

      // Faint distant ellipses are drawn before the foreground lattice.
      const orbit = (
        tilt: number,
        radius: number,
        phase: number,
        color: string,
        dashed = false,
      ) => {
        context.beginPath();
        for (let i = 0; i <= 180; i++) {
          const t = (i / 180) * TAU;
          const p = project(
            radius * Math.cos(t),
            radius * Math.sin(t) * Math.cos(tilt),
            radius * Math.sin(t) * Math.sin(tilt),
          );
          if (i === 0) context.moveTo(p.x, p.y);
          else context.lineTo(p.x, p.y);
        }
        context.strokeStyle = color;
        context.lineWidth = 0.6;
        context.setLineDash(dashed ? [1, 6] : []);
        context.stroke();
        context.setLineDash([]);
        const p = project(
          radius * Math.cos(phase),
          radius * Math.sin(phase) * Math.cos(tilt),
          radius * Math.sin(phase) * Math.sin(tilt),
        );
        context.fillStyle = color;
        context.beginPath();
        context.arc(p.x, p.y, 2.2, 0, TAU);
        context.fill();
      };
      orbit(0.19, 2.24, time * 0.09 + 1.9, "rgba(178, 204, 183, 0.23)");
      orbit(-0.72, 2.42, -time * 0.07 + 3.2, "rgba(206, 169, 106, 0.23)", true);
      orbit(0.98, 2.1, time * 0.12 + 0.5, "rgba(121, 194, 173, 0.15)");

      for (let i = 0; i < lattice.length; i++) {
        const depth = i / 9;
        const alpha = (0.075 + depth ** 1.6 * 0.33) * strength * 1.1;
        context.lineWidth = 0.55 + depth * 0.16;
        context.strokeStyle = `rgba(${Math.round(88 + depth * 71)}, ${Math.round(152 + depth * 72)}, ${Math.round(134 + depth * 57)}, ${alpha})`;
        context.stroke(lattice[i]);
        context.lineWidth = 0.72 + depth * 0.2;
        context.strokeStyle = `rgba(185, 232, 201, ${(0.1 + depth * 0.38) * strength * 1.1})`;
        context.stroke(highlights[i]);
      }

      // One copper meridian gives the sculpture a warmer, distinctive counterpoint.
      context.beginPath();
      for (let i = 0; i <= 160; i++) {
        const p = torus(sample((i / 160) * TAU, Math.PI * 0.36));
        if (i === 0) context.moveTo(p.x, p.y);
        else context.lineTo(p.x, p.y);
      }
      context.strokeStyle = `rgba(221, 183, 120, ${0.58 * strength})`;
      context.lineWidth = 0.95;
      context.stroke();

      // A row-operation sends a moving illuminated meridian around the surface.
      if (pulseStrength > 0.018) {
        context.beginPath();
        const u = pulseAge * 2.8 + (state.pulseKey % 11) * 0.4;
        for (let i = 0; i <= 100; i++) {
          const p = torus(sample(u, (i / 100) * TAU));
          if (i === 0) context.moveTo(p.x, p.y);
          else context.lineTo(p.x, p.y);
        }
        context.lineWidth = 1.5;
        context.strokeStyle = `rgba(226, 247, 202, ${pulseStrength * 0.85})`;
        context.shadowColor = "#c5efac";
        context.shadowBlur = 14 * pulseStrength;
        context.stroke();
        context.shadowBlur = 0;
      }

      // Deterministic tracer particles follow actual torus coordinates.
      for (let i = 0; i < 31; i++) {
        const seed = i * 2.3999632297;
        const speed = state.playing ? 0.18 : 0.065;
        const u = seed + time * speed * (i % 2 ? 1 : -1);
        const v = i * 1.618 + time * 0.035;
        const p = torus(sample(u, v));
        const depth = clamp((p.z + 1.8) / 3.6, 0, 1);
        const alpha = (0.15 + depth * 0.7) * strength;
        const amber = i % 7 === 0;
        context.fillStyle = amber
          ? `rgba(246, 204, 139, ${alpha})`
          : `rgba(198, 244, 214, ${alpha})`;
        if (depth > 0.56) {
          context.shadowBlur = 8;
          context.shadowColor = amber ? "#d9b275" : "#9de2c3";
        }
        context.beginPath();
        context.arc(p.x, p.y, (i % 4 === 0 ? 1.65 : 1) * p.scale, 0, TAU);
        context.fill();
        context.shadowBlur = 0;
      }

      // Small registration crosses, deliberately asymmetric like a scientific plate.
      for (const [x, y, size] of [
        [-2.48, -0.9, 4],
        [2.38, 0.65, 4],
        [1.6, -1.83, 3],
      ]) {
        const px = centerX + x * baseScale;
        const py = centerY + y * baseScale;
        context.strokeStyle = "rgba(181, 192, 164, 0.37)";
        context.lineWidth = 0.6;
        context.beginPath();
        context.moveTo(px - size, py);
        context.lineTo(px + size, py);
        context.moveTo(px, py - size);
        context.lineTo(px, py + size);
        context.stroke();
      }

      // Reduced-motion mode still observes data changes, but avoids a 60fps loop.
      if (still) {
        frame = 0;
      } else {
        frame = requestAnimationFrame(draw);
      }
    };

    const requestDraw = () => {
      if (!frame && !document.hidden && !disposed)
        frame = requestAnimationFrame(draw);
    };
    const onVisibility = () => {
      lastTime = 0;
      if (document.hidden) {
        cancelAnimationFrame(frame);
        frame = 0;
      } else requestDraw();
    };
    const onMotionChange = (event: MediaQueryListEvent) => {
      systemReducedMotion = event.matches;
      requestDraw();
    };
    document.addEventListener("visibilitychange", onVisibility);
    motionQuery.addEventListener("change", onMotionChange);

    // Also refresh static scenes when React updates props or the canvas resizes.
    const refresh = window.setInterval(requestDraw, 180);
    requestDraw();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      window.clearInterval(refresh);
      observer.disconnect();
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", onVisibility);
      motionQuery.removeEventListener("change", onMotionChange);
    };
  }, []);

  return (
    <div className={`math-scene ${className}`}>
      <canvas
        ref={canvasRef}
        className="math-scene__canvas"
        role="img"
        aria-label="An illuminated toroidal lattice. Its geometric field becomes ordered as the matrix is solved."
      />
      <span className="math-scene__vignette" aria-hidden="true" />
    </div>
  );
}

export default MathScene;
