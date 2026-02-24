import React, { useRef, useMemo, useCallback, useEffect, useState } from "react";
import { Routes, Route } from "react-router-dom";
import NotFound from "./pages/NotFound";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

/* ─────────────────────────────────────────────
   1. Generate receipt texture on an HTML canvas
   ───────────────────────────────────────────── */
function createReceiptTexture() {
  const w = 512;
  const h = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");

  // Paper background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);

  // Subtle paper grain
  for (let i = 0; i < 8000; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const a = Math.random() * 0.04;
    ctx.fillStyle = `rgba(0,0,0,${a})`;
    ctx.fillRect(x, y, 1, 1);
  }

  const margin = 40;
  let y = 60;
  const textColor = "#1a1a1a";
  const lightColor = "#555";

  const centerText = (text, fontSize, bold = false, color = textColor) => {
    ctx.fillStyle = color;
    ctx.font = `${bold ? "bold " : ""}${fontSize}px "Courier New", Courier, monospace`;
    ctx.textAlign = "center";
    ctx.fillText(text, w / 2, y);
  };

  const leftText = (text, fontSize, bold = false, color = textColor) => {
    ctx.fillStyle = color;
    ctx.font = `${bold ? "bold " : ""}${fontSize}px "Courier New", Courier, monospace`;
    ctx.textAlign = "left";
    ctx.fillText(text, margin, y);
  };

  const leftRightText = (left, right, fontSize, bold = false) => {
    ctx.fillStyle = textColor;
    ctx.font = `${bold ? "bold " : ""}${fontSize}px "Courier New", Courier, monospace`;
    ctx.textAlign = "left";
    ctx.fillText(left, margin, y);
    ctx.textAlign = "right";
    ctx.fillText(right, w - margin, y);
  };

  const dashedLine = () => {
    ctx.fillStyle = lightColor;
    ctx.font = `14px "Courier New", Courier, monospace`;
    ctx.textAlign = "center";
    ctx.fillText("- ".repeat(26), w / 2, y);
  };

  const thickLine = () => {
    ctx.fillStyle = textColor;
    ctx.fillRect(margin, y - 6, w - margin * 2, 2);
  };

  // Header
  centerText("Suhail Roushan", 28, true);
  y += 32;
  centerText("Software Engineer", 15, false, lightColor);
  y += 22;
  centerText("Email: suhailroushan13@gmail.com", 15, false, lightColor);
  y += 40;

  // Order info
  leftText("GitHub: https://github.com/suhailroushan", 14);
  y += 22;
  leftText("LinkedIn: https://www.linkedin.com/in/suhailroushan", 14);
  y += 28;

  dashedLine();
  y += 28;

  // Items
  const items = [
    ["Next.js", "$4.20"],
    ["Nest.js", "$3.50"],
    ["MongoDB", "$5.50"],
    ["Docker", "$1.50"],
    ["AWS", "$5.50"],
    ["GCP", "$5.50"],
    ["AI", "$5.50"],
    ["React Native", "$5.50"],
    ["PostgreSQL", "$5.50"],
    ["MySQL", "$5.50"],
    ["Automations", "$5.50"],
  ];
  for (const [name, price] of items) {
    leftRightText(name, price, 16);
    y += 26;
  }

  y += 8;
  dashedLine();
  y += 28;

  leftRightText("Subtotal", "$18.00", 16);
  y += 26;
  leftRightText("Tax (18%)", "$9.58", 16);
  y += 28;

  thickLine();
  y += 28;

  leftRightText("TOTAL", "$62.78", 20, true);
  y += 60;

  centerText("Thank you for visiting!", 16, false, lightColor);
  y += 26;
  centerText("suhailroushan.com", 15, true, "#999");

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

/* ─────────────────────────────────────────────
   2. Verlet Cloth simulation
   ───────────────────────────────────────────── */
class ClothSim {
  constructor(segW, segH, width, height) {
    this.segW = segW;
    this.segH = segH;
    this.width = width;
    this.height = height;
    this.count = (segW + 1) * (segH + 1);

    // Spacing
    this.spacingX = width / segW;
    this.spacingY = height / segH;

    // Particle arrays
    this.pos = new Float32Array(this.count * 3);
    this.prev = new Float32Array(this.count * 3);
    this.pinned = new Uint8Array(this.count);

    // Init positions — hang from top, centered at origin
    for (let j = 0; j <= segH; j++) {
      for (let i = 0; i <= segW; i++) {
        const idx = (j * (segW + 1) + i) * 3;
        const x = (i - segW / 2) * this.spacingX;
        const y = (segH / 2 - j) * this.spacingY; // top row at positive y
        const z = 0;
        this.pos[idx] = x;
        this.pos[idx + 1] = y;
        this.pos[idx + 2] = z;
        this.prev[idx] = x;
        this.prev[idx + 1] = y;
        this.prev[idx + 2] = z;
      }
    }

    // Pin top row
    for (let i = 0; i <= segW; i++) {
      this.pinned[i] = 1;
    }

    // Build constraints (horizontal + vertical + diagonals for shear)
    this.constraints = [];
    for (let j = 0; j <= segH; j++) {
      for (let i = 0; i <= segW; i++) {
        const idx = j * (segW + 1) + i;
        // Right neighbor
        if (i < segW) {
          this.constraints.push([idx, idx + 1, this.spacingX]);
        }
        // Bottom neighbor
        if (j < segH) {
          this.constraints.push([idx, idx + (segW + 1), this.spacingY]);
        }
        // Diagonal bottom-right
        if (i < segW && j < segH) {
          const diag = Math.sqrt(this.spacingX ** 2 + this.spacingY ** 2);
          this.constraints.push([idx, idx + (segW + 1) + 1, diag]);
        }
        // Diagonal bottom-left
        if (i > 0 && j < segH) {
          const diag = Math.sqrt(this.spacingX ** 2 + this.spacingY ** 2);
          this.constraints.push([idx, idx + (segW + 1) - 1, diag]);
        }
      }
    }

    // Mutable params (can be driven by UI)
    this.gravity = new THREE.Vector3(0, -28, 0);
    this.damping = 0.99;
    this.constraintIterations = 12;
    this.grabbedIdx = -1;
    this.grabPos = new THREE.Vector3();
  }

  reset() {
    for (let j = 0; j <= this.segH; j++) {
      for (let i = 0; i <= this.segW; i++) {
        const idx = (j * (this.segW + 1) + i) * 3;
        const x = (i - this.segW / 2) * this.spacingX;
        const y = (this.segH / 2 - j) * this.spacingY;
        const z = 0;
        this.pos[idx] = x;
        this.pos[idx + 1] = y;
        this.pos[idx + 2] = z;
        this.prev[idx] = x;
        this.prev[idx + 1] = y;
        this.prev[idx + 2] = z;
      }
    }
  }

  step(dt) {
    const dt2 = dt * dt;

    // Verlet integration
    for (let i = 0; i < this.count; i++) {
      if (this.pinned[i]) continue;
      const ix = i * 3, iy = i * 3 + 1, iz = i * 3 + 2;
      const cx = this.pos[ix], cy = this.pos[iy], cz = this.pos[iz];
      const px = this.prev[ix], py = this.prev[iy], pz = this.prev[iz];
      const vx = (cx - px) * this.damping;
      const vy = (cy - py) * this.damping;
      const vz = (cz - pz) * this.damping;

      this.prev[ix] = cx;
      this.prev[iy] = cy;
      this.prev[iz] = cz;

      this.pos[ix] = cx + vx + this.gravity.x * dt2;
      this.pos[iy] = cy + vy + this.gravity.y * dt2;
      this.pos[iz] = cz + vz + this.gravity.z * dt2;
    }

    // If grabbed, override
    if (this.grabbedIdx >= 0) {
      const ix = this.grabbedIdx * 3;
      this.pos[ix] = this.grabPos.x;
      this.pos[ix + 1] = this.grabPos.y;
      this.pos[ix + 2] = this.grabPos.z;
      this.prev[ix] = this.grabPos.x;
      this.prev[ix + 1] = this.grabPos.y;
      this.prev[ix + 2] = this.grabPos.z;
    }

    // Satisfy constraints (iterations set from options)
    const iters = Math.max(1, this.constraintIterations);
    for (let iter = 0; iter < iters; iter++) {
      for (const [a, b, restLen] of this.constraints) {
        const ax = a * 3, ay = a * 3 + 1, az = a * 3 + 2;
        const bx = b * 3, by = b * 3 + 1, bz = b * 3 + 2;

        const dx = this.pos[bx] - this.pos[ax];
        const dy = this.pos[by] - this.pos[ay];
        const dz = this.pos[bz] - this.pos[az];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist < 1e-6) continue;

        const diff = (dist - restLen) / dist;
        const offX = dx * 0.5 * diff;
        const offY = dy * 0.5 * diff;
        const offZ = dz * 0.5 * diff;

        const aPinned = this.pinned[a] || a === this.grabbedIdx;
        const bPinned = this.pinned[b] || b === this.grabbedIdx;

        if (!aPinned && !bPinned) {
          this.pos[ax] += offX;
          this.pos[ay] += offY;
          this.pos[az] += offZ;
          this.pos[bx] -= offX;
          this.pos[by] -= offY;
          this.pos[bz] -= offZ;
        } else if (!aPinned) {
          this.pos[ax] += offX * 2;
          this.pos[ay] += offY * 2;
          this.pos[az] += offZ * 2;
        } else if (!bPinned) {
          this.pos[bx] -= offX * 2;
          this.pos[by] -= offY * 2;
          this.pos[bz] -= offZ * 2;
        }
      }
    }
  }

  findClosest(point) {
    let best = -1, bestDist = Infinity;
    for (let i = 0; i < this.count; i++) {
      const ix = i * 3;
      const dx = this.pos[ix] - point.x;
      const dy = this.pos[ix + 1] - point.y;
      const dz = this.pos[ix + 2] - point.z;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    return best;
  }
}

/* ─────────────────────────────────────────────
   3. Grab indicator (small sphere)
   ───────────────────────────────────────────── */
function GrabIndicator({ position, visible }) {
  if (!visible) return null;
  return (
    <mesh position={position}>
      <sphereGeometry args={[0.08, 16, 16]} />
      <meshStandardMaterial color="#ff6b35" transparent opacity={0.5} />
    </mesh>
  );
}

/* ─────────────────────────────────────────────
   Default simulation options (used by Reset)
   ───────────────────────────────────────────── */
export const DEFAULT_OPTIONS = {
  gravityOn: true,
  gravityStrength: 40,
  damping: 0.99,
  constraintIterations: 4,
  subSteps: 1,
  maxDt: 0.016,
};

/* ─────────────────────────────────────────────
   4. Receipt Mesh component
   ───────────────────────────────────────────── */
function ReceiptCloth({ options = DEFAULT_OPTIONS, clothRef }) {
  const meshRef = useRef();
  const { camera, raycaster, pointer } = useThree();

  const segW = 25;
  const segH = 50;
  const planeW = 3;
  const planeH = 5;

  const cloth = useMemo(() => new ClothSim(segW, segH, planeW, planeH), []);

  useEffect(() => {
    if (clothRef) {
      clothRef.current = { reset: () => cloth.reset() };
    }
    return () => {
      if (clothRef) clothRef.current = null;
    };
  }, [clothRef, cloth]);

  const texture = useMemo(() => createReceiptTexture(), []);

  const [grabState, setGrabState] = useState({ active: false, pos: [0, 0, 0] });
  const dragging = useRef(false);
  const clickPending = useRef(false);
  const downPoint = useRef(new THREE.Vector3());
  const downUv = useRef(new THREE.Vector2());
  const dragPlane = useRef(new THREE.Plane());
  const intersectPoint = useRef(new THREE.Vector3());
  const offset = useRef(new THREE.Vector3());

  const CLICK_THRESHOLD = 0.08;
  const LINK_REGIONS = [
    { vMin: 0.87, vMax: 0.91, uMin: 0.2, uMax: 0.8, url: "mailto:suhailroushan13@gmail.com" },
    { vMin: 0.83, vMax: 0.87, uMin: 0.05, uMax: 0.95, url: "https://github.com/suhailroushan" },
    { vMin: 0.80, vMax: 0.84, uMin: 0.05, uMax: 0.95, url: "https://www.linkedin.com/in/suhailroushan/" },
  ];

  const onPointerDown = useCallback(
    (e) => {
      e.stopPropagation();
      const point = e.point.clone();
      const uv = e.uv?.clone();
      const closest = cloth.findClosest(point);
      if (closest < 0 || cloth.pinned[closest]) return;

      downPoint.current.copy(point);
      downUv.current.copy(uv || new THREE.Vector2(0.5, 0.5));
      clickPending.current = true;
      dragging.current = false;

      // Create a drag plane facing the camera through the grab point
      const camDir = new THREE.Vector3();
      camera.getWorldDirection(camDir);
      dragPlane.current.setFromNormalAndCoplanarPoint(camDir.negate(), point);

      const ix = closest * 3;
      offset.current.set(
        cloth.pos[ix] - point.x,
        cloth.pos[ix + 1] - point.y,
        cloth.pos[ix + 2] - point.z
      );

      e.target?.setPointerCapture?.(e.pointerId);
    },
    [cloth, camera]
  );

  const onPointerMove = useCallback(
    (e) => {
      e.stopPropagation();
      if (clickPending.current) {
        const dist = e.point.distanceTo(downPoint.current);
        if (dist > CLICK_THRESHOLD) {
          clickPending.current = false;
          const closest = cloth.findClosest(e.point);
          if (closest >= 0 && !cloth.pinned[closest]) {
            cloth.grabbedIdx = closest;
            dragging.current = true;
            cloth.grabPos.copy(e.point).add(offset.current);
            setGrabState({ active: true, pos: [e.point.x, e.point.y, e.point.z] });
          }
        }
        return;
      }
      if (!dragging.current) return;

      raycaster.setFromCamera(pointer, camera);
      if (raycaster.ray.intersectPlane(dragPlane.current, intersectPoint.current)) {
        cloth.grabPos.copy(intersectPoint.current).add(offset.current);
        setGrabState({
          active: true,
          pos: [intersectPoint.current.x, intersectPoint.current.y, intersectPoint.current.z],
        });
      }
    },
    [cloth, camera, raycaster, pointer]
  );

  const onPointerUp = useCallback(
    (e) => {
      e.stopPropagation();
      if (clickPending.current) {
        clickPending.current = false;
        const uv = downUv.current;
        for (const region of LINK_REGIONS) {
          if (
            uv.u >= region.uMin && uv.u <= region.uMax &&
            uv.v >= region.vMin && uv.v <= region.vMax
          ) {
            window.open(region.url, "_blank", "noopener,noreferrer");
            break;
          }
        }
      } else if (dragging.current) {
        dragging.current = false;
        cloth.grabbedIdx = -1;
        setGrabState({ active: false, pos: [0, 0, 0] });
      }
      e.target?.releasePointerCapture?.(e.pointerId);
    },
    [cloth]
  );

  useFrame((_, delta) => {
    cloth.gravity.y = options.gravityOn ? -options.gravityStrength : 0;
    cloth.damping = options.damping;
    cloth.constraintIterations = options.constraintIterations;

    const dt = Math.min(delta, options.maxDt);
    const steps = Math.max(1, options.subSteps);
    for (let s = 0; s < steps; s++) {
      cloth.step(dt / steps);
    }

    // Update geometry
    const geo = meshRef.current?.geometry;
    if (!geo) return;
    const posAttr = geo.attributes.position;
    const arr = posAttr.array;

    for (let i = 0; i < cloth.count; i++) {
      arr[i * 3] = cloth.pos[i * 3];
      arr[i * 3 + 1] = cloth.pos[i * 3 + 1];
      arr[i * 3 + 2] = cloth.pos[i * 3 + 2];
    }
    posAttr.needsUpdate = true;
    geo.computeVertexNormals();
  });

  return (
    <>
      <mesh
        ref={meshRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <planeGeometry args={[planeW, planeH, segW, segH]} />
        <meshStandardMaterial
          map={texture}
          side={THREE.DoubleSide}
          roughness={0.92}
          metalness={0}
        />
      </mesh>
      <GrabIndicator position={grabState.pos} visible={grabState.active} />
    </>
  );
}

/* ─────────────────────────────────────────────
   5. Options panel components
   ───────────────────────────────────────────── */
const panelStyles = {
  container: {
    width: 320,
    minWidth: 280,
    height: "100vh",
    background: "#1a1a1a",
    display: "flex",
    flexDirection: "column",
    fontFamily: "system-ui, -apple-system, sans-serif",
    overflowY: "auto",
    boxShadow: "-4px 0 24px rgba(0,0,0,0.2)",
  },
  header: {
    padding: "24px 24px 20px",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
  },
  title: {
    fontSize: 18,
    fontWeight: 600,
    color: "#fff",
    letterSpacing: "-0.02em",
    margin: 0,
  },
  subtitle: {
    fontSize: 12,
    color: "rgba(255,255,255,0.45)",
    marginTop: 4,
  },
  section: {
    padding: "20px 24px",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 600,
    color: "rgba(255,255,255,0.5)",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    marginBottom: 16,
  },
  row: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    marginBottom: 18,
  },
  label: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    fontSize: 13,
    color: "rgba(255,255,255,0.85)",
  },
  value: {
    fontSize: 12,
    fontWeight: 500,
    color: "rgba(255,255,255,0.6)",
    fontVariantNumeric: "tabular-nums",
  },
  slider: {
    width: "100%",
    height: 6,
    borderRadius: 3,
    appearance: "none",
    background: "rgba(255,255,255,0.1)",
    outline: "none",
  },
  btn: {
    padding: "10px 16px",
    fontSize: 13,
    fontWeight: 500,
    fontFamily: "inherit",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    transition: "all 0.15s ease",
  },
  btnPrimary: {
    background: "#3b82f6",
    color: "#fff",
  },
  btnSecondary: {
    background: "rgba(255,255,255,0.1)",
    color: "#fff",
    border: "1px solid rgba(255,255,255,0.15)",
  },
};

function OptionRow({ label, value, min, max, step, onChange, unit = "", format }) {
  const display = format ? format(value) : (typeof value === "number" && value % 1 !== 0 ? value.toFixed(2) : value);
  return (
    <div style={panelStyles.row}>
      <div style={panelStyles.label}>
        <span>{label}</span>
        <span style={panelStyles.value}>{display}{unit ? ` ${unit}` : ""}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{
          ...panelStyles.slider,
          accentColor: "#3b82f6",
        }}
      />
    </div>
  );
}

/* ─────────────────────────────────────────────
   6. Main ClothReceipt component
   ───────────────────────────────────────────── */
function ClothReceipt() {
  const clothRef = useRef(null);
  const [options, setOptions] = useState(() => ({ ...DEFAULT_OPTIONS }));

  const setOption = useCallback((key, value) => {
    setOptions((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleReset = useCallback(() => {
    setOptions({ ...DEFAULT_OPTIONS });
    clothRef.current?.reset();
  }, []);

  const toggleGravity = useCallback(() => {
    setOptions((prev) => ({ ...prev, gravityOn: !prev.gravityOn }));
  }, []);

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "#0f0f0f",
        display: "flex",
        flexDirection: "row",
        fontFamily: "system-ui, -apple-system, sans-serif",
        overflow: "hidden",
      }}
    >
      {/* Left: Full canvas */}
      <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
        <Canvas
          camera={{ position: [0, 0, 8], fov: 45 }}
          style={{ width: "100%", height: "100%", cursor: "grab" }}
          onPointerDown={(e) => {
            e.currentTarget.style.cursor = "grabbing";
          }}
          onPointerUp={(e) => {
            e.currentTarget.style.cursor = "grab";
          }}
        >
          <color attach="background" args={["#141414"]} />
          <ambientLight intensity={0.6} />
          <directionalLight position={[4, 6, 5]} intensity={1.0} castShadow />
          <directionalLight position={[-3, 2, -4]} intensity={0.3} />
          <ReceiptCloth options={options} clothRef={clothRef} />
        </Canvas>
        <p
          style={{
            position: "absolute",
            bottom: 16,
            left: "50%",
            transform: "translateX(-50%)",
            color: "rgba(255,255,255,0.35)",
            fontSize: 12,
            margin: 0,
            pointerEvents: "none",
          }}
        >
          Grab and drag the receipt
        </p>
      </div>

      {/* Right: Options panel */}
      <aside style={panelStyles.container}>
        <div style={panelStyles.header}>
          <h2 style={panelStyles.title}>Simulation</h2>
          <p style={panelStyles.subtitle}>Cloth physics controls</p>
        </div>

        <div style={panelStyles.section}>
          <div style={panelStyles.sectionTitle}>Actions</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={toggleGravity}
              style={{
                ...panelStyles.btn,
                ...(options.gravityOn ? panelStyles.btnPrimary : panelStyles.btnSecondary),
              }}
            >
              Gravity {options.gravityOn ? "ON" : "OFF"}
            </button>
            <button
              type="button"
              onClick={handleReset}
              style={{
                ...panelStyles.btn,
                ...panelStyles.btnSecondary,
              }}
            >
              Reset
            </button>
          </div>
        </div>

        <div style={panelStyles.section}>
          <div style={panelStyles.sectionTitle}>Physics</div>
          <OptionRow
            label="Gravity strength"
            value={options.gravityStrength}
            min={0}
            max={50}
            step={1}
            onChange={(v) => setOption("gravityStrength", v)}
          />
          <OptionRow
            label="Damping"
            value={options.damping}
            min={0.9}
            max={1}
            step={0.01}
            onChange={(v) => setOption("damping", v)}
            format={(v) => v.toFixed(2)}
          />
        </div>

        <div style={panelStyles.section}>
          <div style={panelStyles.sectionTitle}>Solver</div>
          <OptionRow
            label="Constraint iterations"
            value={options.constraintIterations}
            min={4}
            max={24}
            step={1}
            onChange={(v) => setOption("constraintIterations", v)}
          />
          <OptionRow
            label="Sub-steps"
            value={options.subSteps}
            min={1}
            max={8}
            step={1}
            onChange={(v) => setOption("subSteps", v)}
          />
          <OptionRow
            label="Max time step"
            value={options.maxDt}
            min={0.008}
            max={0.05}
            step={0.002}
            onChange={(v) => setOption("maxDt", v)}
            format={(v) => v.toFixed(3)}
            unit="s"
          />
        </div>

        <div
          style={{
            marginTop: "auto",
            padding: "24px 24px 28px",
            borderTop: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", margin: "0 0 4px" }}>
            Made with Paper ❤️
          </p>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", margin: "0 0 6px" }}>
          </p>
          <a
            href="https://suhailroushan.com"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: "#3b82f6",
              textDecoration: "none",
            }}
          >
            suhailroushan.com
          </a>
        </div>
      </aside>
    </div>
  );
}

/* ─────────────────────────────────────────────
   7. Desktop-only gate (block mobile & tablet)
   ───────────────────────────────────────────── */
const DESKTOP_MIN_WIDTH = 1024;

function DesktopOnlyGate({ children }) {
  const [isDesktop, setIsDesktop] = useState(() => window.innerWidth >= DESKTOP_MIN_WIDTH);

  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= DESKTOP_MIN_WIDTH);
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  if (isDesktop) return children;

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "#0f0f0f",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui, -apple-system, sans-serif",
        color: "#fff",
        padding: 24,
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 48, marginBottom: 16 }}>🖥️</div>
      <h1 style={{ fontSize: 22, fontWeight: 600, margin: "0 0 12px" }}>
        Desktop only
      </h1>
      <p style={{ fontSize: 15, color: "rgba(255,255,255,0.6)", margin: 0, maxWidth: 320 }}>
        This experience is optimized for desktop. Please view on a larger screen.
      </p>
    </div>
  );
}

/* ─────────────────────────────────────────────
   8. App with routing
   ───────────────────────────────────────────── */
export default function App() {
  return (
    <DesktopOnlyGate>
      <Routes>
        <Route path="/" element={<ClothReceipt />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </DesktopOnlyGate>
  );
}