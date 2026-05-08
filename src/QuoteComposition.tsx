import {
  AbsoluteFill,
  Audio,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

// ── Shared utils (inline to avoid breaking Composition.tsx) ──
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

// ── Sparse particle background ─────────────────────────────
function Particles({ frame, width, height, opacity, color }: {
  frame: number; width: number; height: number; opacity: number; color: string;
}) {
  const cols = 8, rows = 16;
  const cw = width / cols, rh = height / rows;
  return (
    <>
      {Array.from({ length: cols * rows }, (_, i) => {
        const col = i % cols, row = Math.floor(i / cols);
        const phase = (i * 0.37) % (2 * Math.PI);
        const pulse = (Math.sin(frame / 25 + phase) + 1) / 2;
        return (
          <circle key={i} cx={cw * (col + 0.5)} cy={rh * (row + 0.5)} r={1.5}
            fill={color} opacity={opacity * (0.05 + 0.2 * pulse)} />
        );
      })}
    </>
  );
}

// ── Decorative diamond ─────────────────────────────────────
function Diamond({ cx, cy, size, color, opacity }: {
  cx: number; cy: number; size: number; color: string; opacity: number;
}) {
  const pts = `${cx},${cy - size} ${cx + size},${cy} ${cx},${cy + size} ${cx - size},${cy}`;
  return (
    <polygon points={pts} fill="none" stroke={color} strokeWidth={1.5}
      opacity={opacity} style={{ filter: `drop-shadow(0 0 10px ${color})` }} />
  );
}

// ── Main Composition ───────────────────────────────────────
export const QuoteComposition: React.FC<{
  seed?: string;
  quote?: string;
  attribution?: string;
}> = ({
  seed,
  quote = "AIは道具。自分という軸がなければ、ただ流されるだけ。",
  attribution = "whoami studio",
}) => {
  const frame = useCurrentFrame();
  const { width, height, fps, durationInFrames } = useVideoConfig();

  const seedStr = seed ?? new Date().toISOString().slice(0, 10);
  const rng = makePRNG(dateSeed(seedStr));
  const palette = PALETTES[Math.floor(rng() * PALETTES.length)];
  const [c0, c1] = palette;

  const globalOpacity =
    frame < 45 ? interpolate(frame, [0, 45], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
    : frame > durationInFrames - 45 ? interpolate(frame, [durationInFrames - 45, durationInFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
    : 1;

  // Decorative elements spring in
  const decoS = spring({ frame: frame - 20, fps, config: { damping: 16, stiffness: 70 }, from: 0, to: 1 });

  // Quote text springs in
  const quoteS = spring({ frame: frame - 80, fps, config: { damping: 20, stiffness: 60 }, from: 0, to: 1 });

  // Attribution fades in
  const attrOpacity = interpolate(frame, [160, 220], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  // Detect Japanese text for font choice
  const hasJapanese = /[　-鿿]/.test(quote);
  const fontFamily = hasJapanese
    ? "'Hiragino Kaku Gothic ProN', 'Noto Sans JP', sans-serif"
    : "'Georgia', 'Times New Roman', serif";

  const cx = width / 2;

  return (
    <AbsoluteFill style={{
      background: "radial-gradient(ellipse at 50% 40%, #0d0928 0%, #050510 70%)",
    }}>
      <svg width={width} height={height} style={{ position: "absolute" }}>
        {/* Particle background */}
        <Particles frame={frame} width={width} height={height} opacity={globalOpacity} color={c0} />

        {/* Horizontal decorative lines */}
        <line x1={80} y1={340} x2={width - 80} y2={340}
          stroke={c0} strokeWidth={0.8} opacity={globalOpacity * decoS * 0.6}
          style={{ filter: `drop-shadow(0 0 6px ${c0})` }} />
        <line x1={80} y1={height - 340} x2={width - 80} y2={height - 340}
          stroke={c0} strokeWidth={0.8} opacity={globalOpacity * decoS * 0.6}
          style={{ filter: `drop-shadow(0 0 6px ${c0})` }} />

        {/* Corner diamonds */}
        <Diamond cx={cx}           cy={260}          size={18 * decoS} color={c1} opacity={globalOpacity * decoS} />
        <Diamond cx={cx}           cy={height - 260} size={18 * decoS} color={c1} opacity={globalOpacity * decoS} />
        <Diamond cx={120}          cy={340}          size={10 * decoS} color={c0} opacity={globalOpacity * decoS * 0.7} />
        <Diamond cx={width - 120}  cy={340}          size={10 * decoS} color={c0} opacity={globalOpacity * decoS * 0.7} />
      </svg>

      {/* Quote text */}
      <div style={{
        position: "absolute", inset: 0,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        padding: "0 80px",
        opacity: globalOpacity,
      }}>
        {/* Decorative symbol */}
        <div style={{
          fontSize: 48, color: c0, marginBottom: 56,
          opacity: decoS,
          transform: `scale(${decoS})`,
          textShadow: `0 0 20px ${c0}`,
          fontFamily: "serif",
        }}>
          ✦
        </div>

        {/* Main quote */}
        <div style={{
          fontFamily,
          fontSize: hasJapanese ? 58 : 50,
          fontWeight: 700,
          color: "#ffffff",
          textAlign: "center",
          lineHeight: 1.7,
          letterSpacing: hasJapanese ? "0.05em" : "0.02em",
          textShadow: `0 0 40px ${c0}88, 0 0 80px ${c0}44, 0 2px 12px #000`,
          opacity: quoteS,
          transform: `translateY(${(1 - quoteS) * 40}px) scale(${0.92 + 0.08 * quoteS})`,
        }}>
          {quote}
        </div>

        {/* Attribution */}
        <div style={{
          marginTop: 72,
          fontFamily: "'Courier New', monospace",
          fontSize: 30,
          color: c1,
          letterSpacing: "0.18em",
          textShadow: `0 0 20px ${c1}`,
          opacity: attrOpacity * globalOpacity,
        }}>
          — {attribution}
        </div>
      </div>

      <Audio src={staticFile("ambient.wav")} volume={0.6} />
    </AbsoluteFill>
  );
};
