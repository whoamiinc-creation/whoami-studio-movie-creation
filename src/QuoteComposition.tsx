import {
  AbsoluteFill,
  Audio,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

// ── PRNG / palette ─────────────────────────────────────────
function makePRNG(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    return ((z ^ (z >>> 16)) >>> 0) / 0xffffffff;
  };
}
function dateSeed(str: string): number {
  return Array.from(str).reduce((a, c) => (Math.imul(a, 31) + c.charCodeAt(0)) | 0, 0x811c9dc5);
}
const PALETTES = [
  ["#00f5ff", "#bf00ff", "#ff0080", "#0040ff"],
  ["#00ff88", "#ff6600", "#ffee00", "#00aaff"],
  ["#ff69b4", "#da70d6", "#e0e0ff", "#7b68ee"],
  ["#39ff14", "#ff073a", "#ff9f00", "#bc13fe"],
];

// ── Helpers ────────────────────────────────────────────────
function polygonPts(cx: number, cy: number, r: number, n: number, deg: number) {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * 2 * Math.PI + (deg * Math.PI) / 180;
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  }).join(" ");
}

function spirographPath(cx: number, cy: number, R: number, r: number, d: number): string {
  const gcd = (a: number, b: number): number => (b < 0.5 ? a : gcd(b, a % b));
  const periods = Math.round(r / gcd(R, r));
  const steps = Math.max(400, periods * 120);
  return "M " + Array.from({ length: steps + 1 }, (_, i) => {
    const t = (i / steps) * 2 * Math.PI * periods;
    return `${(cx + (R - r) * Math.cos(t) + d * Math.cos(((R - r) / r) * t)).toFixed(1)},${(cy + (R - r) * Math.sin(t) - d * Math.sin(((R - r) / r) * t)).toFixed(1)}`;
  }).join(" L ") + " Z";
}

// ── Particle field ─────────────────────────────────────────
function Particles({ frame, width, height, opacity, color, cols = 8, rows = 16 }: {
  frame: number; width: number; height: number; opacity: number; color: string;
  cols?: number; rows?: number;
}) {
  const cw = width / cols, rh = height / rows;
  return <>
    {Array.from({ length: cols * rows }, (_, i) => {
      const phase = (i * 0.37) % (2 * Math.PI);
      const pulse = (Math.sin(frame / 25 + phase) + 1) / 2;
      return <circle key={i}
        cx={cw * (i % cols + 0.5)} cy={rh * (Math.floor(i / cols) + 0.5)}
        r={1.2 + 0.8 * ((Math.sin(i * 1.37) + 1) / 2)} fill={color}
        opacity={opacity * (0.06 + 0.22 * pulse)} />;
    })}
  </>;
}

// ── Ring burst ─────────────────────────────────────────────
function RingBurst({ frame, cx, cy, count, maxR, color, opacity }: {
  frame: number; cx: number; cy: number; count: number; maxR: number;
  color: string; opacity: number;
}) {
  return <>
    {Array.from({ length: count }, (_, i) => {
      const t = ((frame + (i / count) * 60) % 90) / 90;
      return <circle key={i} cx={cx} cy={cy} r={t * maxR}
        fill="none" stroke={color} strokeWidth={1}
        opacity={opacity * (1 - t) * 0.6} />;
    })}
  </>;
}

// ── Background variant A: Orbiting polygons ────────────────
function BgOrbits({ frame, width, height, c0, c1, c2, globalOpacity }: {
  frame: number; width: number; height: number;
  c0: string; c1: string; c2: string; globalOpacity: number;
}) {
  const cx = width / 2, cy = height / 2, u = width / 2;
  return <>
    <RingBurst frame={frame} cx={cx} cy={cy} count={5} maxR={u * 0.9} color={c2} opacity={globalOpacity * 0.25} />
    <polygon points={polygonPts(cx, cy, u * 0.55, 6, (frame * 0.25) % 360)}
      fill="none" stroke={c0} strokeWidth={1} opacity={globalOpacity * 0.4}
      style={{ filter: `drop-shadow(0 0 8px ${c0})` }} />
    <polygon points={polygonPts(cx, cy, u * 0.78, 3, (-frame * 0.18) % 360)}
      fill="none" stroke={c1} strokeWidth={1} opacity={globalOpacity * 0.3}
      style={{ filter: `drop-shadow(0 0 6px ${c1})` }} />
    <polygon points={polygonPts(cx, cy, u * 0.95, 8, (frame * 0.10) % 360)}
      fill="none" stroke={c2} strokeWidth={0.8} opacity={globalOpacity * 0.2} />
  </>;
}

// ── Background variant B: Spirograph ──────────────────────
function BgSpiro({ frame, width, height, c0, c1, globalOpacity, rng }: {
  frame: number; width: number; height: number;
  c0: string; c1: string; globalOpacity: number; rng: () => number;
}) {
  const cx = width / 2, cy = height / 2, u = width / 2;
  const presets = [[7, 3, 0.5], [5, 3, 0.8], [7, 2, 0.9], [8, 3, 0.6]];
  const p = presets[Math.floor(rng() * presets.length)];
  const sc = u * 0.11;
  const fade = interpolate(frame, [30, 90], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return <>
    <g transform={`rotate(${frame * 0.05}, ${cx}, ${cy})`}>
      <path d={spirographPath(cx, cy, p[0] * sc, p[1] * sc, p[2] * p[1] * sc)}
        fill="none" stroke={c0} strokeWidth={0.8} opacity={globalOpacity * fade * 0.55}
        style={{ filter: `drop-shadow(0 0 5px ${c0})` }} />
    </g>
    <g transform={`rotate(${-frame * 0.03}, ${cx}, ${cy})`}>
      <path d={spirographPath(cx, cy, p[0] * sc * 0.7, p[1] * sc * 0.7, p[2] * p[1] * sc * 0.7)}
        fill="none" stroke={c1} strokeWidth={0.6} opacity={globalOpacity * fade * 0.35} />
    </g>
  </>;
}

// ── Background variant C: Concentric mandala ──────────────
function BgMandala({ frame, width, height, c0, c1, c2, globalOpacity, sides }: {
  frame: number; width: number; height: number;
  c0: string; c1: string; c2: string; globalOpacity: number; sides: number;
}) {
  const cx = width / 2, cy = height / 2, u = width / 2;
  const colors = [c0, c1, c2, c0, c1];
  return <>
    {Array.from({ length: 7 }, (_, i) => {
      const r = u * (0.18 + i * 0.12);
      const dir = i % 2 === 0 ? 1 : -1;
      const col = colors[i % colors.length];
      return <polygon key={i}
        points={polygonPts(cx, cy, r, sides + (i % 3), (frame * 0.15 * dir) % 360)}
        fill="none" stroke={col} strokeWidth={0.8}
        opacity={globalOpacity * (0.55 - i * 0.06)}
        style={{ filter: i < 3 ? `drop-shadow(0 0 5px ${col})` : undefined }} />;
    })}
  </>;
}

// ── Background variant D: Pulse waves ─────────────────────
function BgPulseWaves({ frame, width, height, c0, c1, c2, globalOpacity }: {
  frame: number; width: number; height: number;
  c0: string; c1: string; c2: string; globalOpacity: number;
}) {
  const cx = width / 2, cy = height / 2, u = width / 2;
  const colors = [c0, c1, c2];
  return <>
    {Array.from({ length: 12 }, (_, i) => {
      const phase = (i / 12) * 90;
      const t = ((frame + phase) % 120) / 120;
      const r = t * u * 1.1;
      return <circle key={i} cx={cx} cy={cy} r={r}
        fill="none" stroke={colors[i % 3]} strokeWidth={1}
        opacity={globalOpacity * (1 - t) * 0.45} />;
    })}
    {/* Crossing sweepers */}
    {[0, 1, 2].map(i => {
      const angle = (frame * (0.4 + i * 0.15) + i * 120) % 360;
      const rad = angle * Math.PI / 180;
      return <line key={`l${i}`} x1={cx} y1={cy}
        x2={cx + Math.cos(rad) * u} y2={cy + Math.sin(rad) * u}
        stroke={colors[i]} strokeWidth={0.8}
        opacity={globalOpacity * 0.3} />;
    })}
  </>;
}

// ── Main Composition ───────────────────────────────────────
export const QuoteComposition: React.FC<{
  seed?: string; quote?: string; attribution?: string;
}> = ({ seed, quote = "AIは道具。自分という軸がなければ、ただ流されるだけ。", attribution = "whoami studio" }) => {
  const frame = useCurrentFrame();
  const { width, height, fps, durationInFrames } = useVideoConfig();

  const seedStr = seed ?? new Date().toISOString().slice(0, 10);
  const rng = makePRNG(dateSeed(seedStr));

  const palette = PALETTES[Math.floor(rng() * PALETTES.length)];
  const [c0, c1, c2] = palette;
  const bgVariant = Math.floor(rng() * 4);        // 0–3: which background
  const mandalaSides = 5 + Math.floor(rng() * 4); // for variant C

  const globalOpacity =
    frame < 45 ? interpolate(frame, [0, 45], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
    : frame > durationInFrames - 45 ? interpolate(frame, [durationInFrames - 45, durationInFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
    : 1;

  const decoS   = spring({ frame: frame - 20,  fps, config: { damping: 16, stiffness: 70  }, from: 0, to: 1 });
  const quoteS  = spring({ frame: frame - 90,  fps, config: { damping: 20, stiffness: 55  }, from: 0, to: 1 });
  const attrOp  = interpolate(frame, [170, 230], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const hasJP   = /[　-鿿]/.test(quote);
  const font    = hasJP
    ? "'Noto Sans CJK JP', 'Noto Sans JP', 'Hiragino Kaku Gothic ProN', sans-serif"
    : "'Georgia', serif";

  const cx = width / 2;

  // Shared rng snapshot for spirograph (consume before render to keep deterministic)
  const rngForSpiro = makePRNG(dateSeed(seedStr + "spiro"));

  return (
    <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 40%, #0d0928 0%, #050510 70%)" }}>
      <svg width={width} height={height} style={{ position: "absolute" }}>
        {/* Particle field */}
        <Particles frame={frame} width={width} height={height} opacity={globalOpacity} color={c0} cols={9} rows={18} />

        {/* Background variant */}
        {bgVariant === 0 && <BgOrbits    frame={frame} width={width} height={height} c0={c0} c1={c1} c2={c2} globalOpacity={globalOpacity} />}
        {bgVariant === 1 && <BgSpiro     frame={frame} width={width} height={height} c0={c0} c1={c1} globalOpacity={globalOpacity} rng={rngForSpiro} />}
        {bgVariant === 2 && <BgMandala   frame={frame} width={width} height={height} c0={c0} c1={c1} c2={c2} globalOpacity={globalOpacity} sides={mandalaSides} />}
        {bgVariant === 3 && <BgPulseWaves frame={frame} width={width} height={height} c0={c0} c1={c1} c2={c2} globalOpacity={globalOpacity} />}

        {/* Decorative lines */}
        <line x1={80} y1={350} x2={width - 80} y2={350}
          stroke={c0} strokeWidth={0.8} opacity={globalOpacity * decoS * 0.55}
          style={{ filter: `drop-shadow(0 0 6px ${c0})` }} />
        <line x1={80} y1={height - 350} x2={width - 80} y2={height - 350}
          stroke={c0} strokeWidth={0.8} opacity={globalOpacity * decoS * 0.55}
          style={{ filter: `drop-shadow(0 0 6px ${c0})` }} />

        {/* Corner diamonds */}
        {[{ x: cx, y: 265 }, { x: cx, y: height - 265 }].map(({ x, y }, i) => (
          <polygon key={i}
            points={`${x},${y - 18 * decoS} ${x + 18 * decoS},${y} ${x},${y + 18 * decoS} ${x - 18 * decoS},${y}`}
            fill="none" stroke={c1} strokeWidth={1.5} opacity={globalOpacity * decoS}
            style={{ filter: `drop-shadow(0 0 10px ${c1})` }} />
        ))}
      </svg>

      {/* Quote text */}
      <div style={{
        position: "absolute", inset: 0,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        padding: "0 80px", opacity: globalOpacity,
      }}>
        <div style={{
          fontSize: 48, color: c0, marginBottom: 56,
          opacity: decoS, transform: `scale(${decoS})`,
          textShadow: `0 0 20px ${c0}`, fontFamily: "serif",
        }}>✦</div>

        <div style={{
          fontFamily: font,
          fontSize: hasJP ? 56 : 48,
          fontWeight: 700,
          color: "#ffffff",
          textAlign: "center",
          lineHeight: 1.75,
          letterSpacing: hasJP ? "0.05em" : "0.02em",
          textShadow: `0 0 40px ${c0}88, 0 0 80px ${c0}44, 0 2px 12px #000`,
          opacity: quoteS,
          transform: `translateY(${(1 - quoteS) * 40}px) scale(${0.92 + 0.08 * quoteS})`,
        }}>
          {quote}
        </div>

        <div style={{
          marginTop: 72,
          fontFamily: "'Courier New', monospace",
          fontSize: 30,
          color: c1,
          letterSpacing: "0.18em",
          textShadow: `0 0 20px ${c1}`,
          opacity: attrOp * globalOpacity,
        }}>
          — {attribution}
        </div>
      </div>

      <Audio src={staticFile("ambient.wav")} volume={0.6} />
    </AbsoluteFill>
  );
};
