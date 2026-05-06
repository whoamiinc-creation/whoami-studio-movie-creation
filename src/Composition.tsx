import {
  AbsoluteFill,
  Audio,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

// ── Seeded PRNG (xorshift32) ───────────────────────────────
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

// ── Color palettes ─────────────────────────────────────────
const PALETTES = [
  ["#00f5ff", "#bf00ff", "#ff0080", "#0040ff"],
  ["#00ff88", "#ff6600", "#ffee00", "#00aaff"],
  ["#ff69b4", "#da70d6", "#e0e0ff", "#7b68ee"],
  ["#39ff14", "#ff073a", "#ff9f00", "#bc13fe"],
];

// ── Phrase pool ────────────────────────────────────────────
const PHRASE_POOL = [
  { text: "現実が、揺れている",      lang: "ja" as const },
  { text: "意識が、ほどけていく",    lang: "ja" as const },
  { text: "世界は、振動している",    lang: "ja" as const },
  { text: "静けさの中で、目が覚める", lang: "ja" as const },
  { text: "時間が、溶けていく",      lang: "ja" as const },
  { text: "見えないものが動く",      lang: "ja" as const },
  { text: "集中と、解放",            lang: "ja" as const },
  { text: "ARE YOU SEEING THIS?",    lang: "en" as const },
  { text: "SOMETHING IS AWAKE",      lang: "en" as const },
  { text: "BREATHE IN. BREATHE OUT.", lang: "en" as const },
  { text: "YOUR MIND IS CLEAR",      lang: "en" as const },
  { text: "LET IT FLOW",             lang: "en" as const },
  { text: "THE PATTERN SPEAKS",      lang: "en" as const },
  { text: "PRESENCE IS POWER",       lang: "en" as const },
];

// ── Math helpers ───────────────────────────────────────────
function gcd(a: number, b: number): number {
  return b < 0.5 ? a : gcd(b, a % b);
}

function polygonPoints(cx: number, cy: number, r: number, sides: number, angleDeg: number): string {
  return Array.from({ length: sides }, (_, i) => {
    const a = (i / sides) * 2 * Math.PI + (angleDeg * Math.PI) / 180;
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  }).join(" ");
}

function starPoints(cx: number, cy: number, outerR: number, innerR: number, pts: number, angleDeg: number): string {
  return Array.from({ length: pts * 2 }, (_, i) => {
    const r = i % 2 === 0 ? outerR : innerR;
    const a = (i / (pts * 2)) * 2 * Math.PI + (angleDeg * Math.PI) / 180;
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  }).join(" ");
}

// Hypotrochoid spirograph path
function spirographPath(cx: number, cy: number, R: number, r: number, d: number): string {
  const periods = Math.round(r / gcd(R, r));
  const steps   = Math.max(400, periods * 120);
  const pts = Array.from({ length: steps + 1 }, (_, i) => {
    const t = (i / steps) * 2 * Math.PI * periods;
    const x = cx + (R - r) * Math.cos(t) + d * Math.cos(((R - r) / r) * t);
    const y = cy + (R - r) * Math.sin(t) - d * Math.sin(((R - r) / r) * t);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return "M " + pts.join(" L ") + " Z";
}

// Spirograph presets [R_units, r_units, d_ratio_of_r]
const SPIRO_PRESETS = [
  [7, 3, 0.5], [5, 3, 0.8], [7, 2, 0.9],
  [8, 3, 0.6], [11, 4, 0.7], [9, 4, 0.8],
];

// ── Particle Field ─────────────────────────────────────────
function ParticleField({
  frame, width, height, globalOpacity, cols, rows, color,
}: {
  frame: number; width: number; height: number;
  globalOpacity: number; cols: number; rows: number; color: string;
}) {
  const colSpacing = width / cols;
  const rowSpacing = height / rows;
  const particles: React.ReactNode[] = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const i = row * cols + col;
      const cx = colSpacing * (col + 0.5);
      const cy = rowSpacing * (row + 0.5);
      const phase = (i * 0.31) % (2 * Math.PI);
      const pulse = (Math.sin(frame / 22 + phase) + 1) / 2;
      const r = 1.2 + 0.8 * ((Math.sin(i * 1.37) + 1) / 2);
      particles.push(
        <circle key={i} cx={cx} cy={cy} r={r} fill={color} opacity={globalOpacity * (0.08 + 0.35 * pulse)} />
      );
    }
  }
  return <>{particles}</>;
}

// ── Pulsing Circle ─────────────────────────────────────────
function PulsingCircle({
  frame, cx, cy, minR, maxR, phase, speed, color, strokeWidth = 2, globalOpacity,
}: {
  frame: number; cx: number; cy: number; minR: number; maxR: number;
  phase: number; speed: number; color: string; strokeWidth?: number; globalOpacity: number;
}) {
  const t = Math.sin(frame / speed + phase);
  const r = minR + ((t + 1) / 2) * (maxR - minR);
  return (
    <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={strokeWidth}
      opacity={globalOpacity * (0.5 + 0.5 * ((t + 1) / 2))}
      style={{ filter: `drop-shadow(0 0 12px ${color})` }} />
  );
}

// ── Orbiting Polygon ───────────────────────────────────────
function OrbitingPolygon({
  frame, cx, cy, radius, sides, rotationSpeed, color, strokeWidth = 1.5, globalOpacity,
}: {
  frame: number; cx: number; cy: number; radius: number; sides: number;
  rotationSpeed: number; color: string; strokeWidth?: number; globalOpacity: number;
}) {
  return (
    <polygon points={polygonPoints(cx, cy, radius, sides, (frame * rotationSpeed) % 360)}
      fill="none" stroke={color} strokeWidth={strokeWidth} opacity={globalOpacity}
      style={{ filter: `drop-shadow(0 0 8px ${color})` }} />
  );
}

// ── Star Polygon ───────────────────────────────────────────
function StarPolygon({
  frame, fps, cx, cy, outerR, innerR, pts, rotSpeed, color, delay, globalOpacity,
}: {
  frame: number; fps: number; cx: number; cy: number; outerR: number; innerR: number;
  pts: number; rotSpeed: number; color: string; delay: number; globalOpacity: number;
}) {
  const s = spring({ frame: frame - delay, fps, config: { damping: 14, stiffness: 80, mass: 1 }, from: 0, to: 1 });
  const angle = (frame * rotSpeed) % 360;
  return (
    <polygon points={starPoints(cx, cy, outerR * s, innerR * s, pts, angle)}
      fill="none" stroke={color} strokeWidth={1.5} opacity={globalOpacity * Math.min(s, 1)}
      style={{ filter: `drop-shadow(0 0 10px ${color})` }} />
  );
}

// ── Concentric Mandala (alternating rotation polygons) ─────
function ConcentricMandala({
  frame, cx, cy, count, baseR, sides, color0, color1, globalOpacity,
}: {
  frame: number; cx: number; cy: number; count: number; baseR: number; sides: number;
  color0: string; color1: string; globalOpacity: number;
}) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const r   = baseR * (1 + i * 0.32);
        const dir = i % 2 === 0 ? 1 : -1;
        const spd = 0.18 - i * 0.025;
        const col = i % 2 === 0 ? color0 : color1;
        return (
          <polygon key={i}
            points={polygonPoints(cx, cy, r, sides + i, (frame * spd * dir) % 360)}
            fill="none" stroke={col} strokeWidth={1} opacity={globalOpacity * (1 - i * 0.15)}
            style={{ filter: `drop-shadow(0 0 5px ${col})` }} />
        );
      })}
    </>
  );
}

// ── Spirograph ─────────────────────────────────────────────
function Spirograph({
  frame, cx, cy, R, r, d, color, startFrame, globalOpacity,
}: {
  frame: number; cx: number; cy: number; R: number; r: number; d: number;
  color: string; startFrame: number; globalOpacity: number;
}) {
  const fadeIn = interpolate(frame, [startFrame, startFrame + 60], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const rotAngle = frame * 0.06;
  const pathD = spirographPath(cx, cy, R, r, d);
  return (
    <g transform={`rotate(${rotAngle}, ${cx}, ${cy})`}>
      <path d={pathD} fill="none" stroke={color} strokeWidth={1}
        opacity={globalOpacity * fadeIn * 0.65}
        style={{ filter: `drop-shadow(0 0 6px ${color})` }} />
    </g>
  );
}

// ── Ring Burst ─────────────────────────────────────────────
function RingBurst({
  frame, cx, cy, count, maxR, color, globalOpacity,
}: {
  frame: number; cx: number; cy: number; count: number; maxR: number;
  color: string; globalOpacity: number;
}) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const phase = (i / count) * 60;
        const t = ((frame + phase) % 90) / 90;
        return (
          <circle key={i} cx={cx} cy={cy} r={t * maxR}
            fill="none" stroke={color} strokeWidth={1}
            opacity={globalOpacity * (1 - t) * 0.55} />
        );
      })}
    </>
  );
}

// ── Sweeping Line ──────────────────────────────────────────
function SweepingLine({
  frame, cx, cy, length, startFrame, endFrame, speed, color, globalOpacity,
}: {
  frame: number; cx: number; cy: number; length: number;
  startFrame: number; endFrame: number; speed: number; color: string; globalOpacity: number;
}) {
  const fadeIn  = interpolate(frame, [startFrame, startFrame + 30], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
  const fadeOut = interpolate(frame, [endFrame - 30, endFrame],     [1, 0], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
  const rad = ((frame * speed) % 360) * Math.PI / 180;
  return (
    <line x1={cx} y1={cy} x2={cx + Math.cos(rad) * length} y2={cy + Math.sin(rad) * length}
      stroke={color} strokeWidth={1} opacity={globalOpacity * Math.min(fadeIn, fadeOut)}
      style={{ filter: `drop-shadow(0 0 6px ${color})` }} />
  );
}

// ── Spring Rect ────────────────────────────────────────────
function SpringRect({
  frame, fps, cx, cy, w, h, delay, color, globalOpacity,
}: {
  frame: number; fps: number; cx: number; cy: number; w: number; h: number;
  delay: number; color: string; globalOpacity: number;
}) {
  const s = spring({ frame: frame - delay, fps, config: { damping: 10, stiffness: 60, mass: 1 }, from: 0, to: 1 });
  return (
    <rect x={cx - (w / 2) * s} y={cy - (h / 2) * s} width={w * s} height={h * s}
      fill="none" stroke={color} strokeWidth={1.5}
      opacity={globalOpacity * interpolate(s, [0, 0.1], [0, 1], { extrapolateRight: "clamp" })}
      style={{ filter: `drop-shadow(0 0 8px ${color})` }} />
  );
}

// ── Text Phrase ────────────────────────────────────────────
function TextPhrase({
  frame, fps, text, start, end, lang,
}: {
  frame: number; fps: number; text: string; start: number; end: number; lang: "ja" | "en";
}) {
  if (frame < start - 5 || frame > end + 5) return null;
  const s = spring({ frame: frame - start, fps, config: { damping: 18, stiffness: 120, mass: 1 }, from: 0, to: 1 });
  const fadeOut = interpolate(frame, [end - 20, end], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{
      position: "absolute", bottom: "18%", left: 0, right: 0, textAlign: "center",
      opacity: Math.min(s, fadeOut),
      transform: `scale(${0.85 + 0.15 * s})`,
      fontFamily: lang === "ja" ? "'Hiragino Kaku Gothic ProN', 'Noto Sans JP', sans-serif" : "'Courier New', monospace",
      fontSize: lang === "ja" ? 62 : 52,
      fontWeight: 700, color: "#ffffff",
      letterSpacing: lang === "en" ? "0.12em" : "0.06em",
      textShadow: "0 0 30px #00f5ff, 0 0 60px #00f5ff88, 0 2px 8px #000000cc",
      padding: "0 40px", lineHeight: 1.2,
    }}>
      {text}
    </div>
  );
}

// ── Main Composition ───────────────────────────────────────
export const MyComposition: React.FC<{ seed?: string }> = ({ seed }) => {
  const frame = useCurrentFrame();
  const { width, height, fps, durationInFrames } = useVideoConfig();

  // Seeded randomization — same values for every frame of the same day
  const seedStr = seed ?? new Date().toISOString().slice(0, 10);
  const rng = makePRNG(dateSeed(seedStr));

  const palette = PALETTES[Math.floor(rng() * PALETTES.length)];
  const [c0, c1, c2, c3] = palette;

  // Spirograph params
  const spiroPreset = SPIRO_PRESETS[Math.floor(rng() * SPIRO_PRESETS.length)];
  const spiroUnit   = width * 0.056; // ~60px
  const spiroR      = spiroPreset[0] * spiroUnit;
  const spiroSmallR = spiroPreset[1] * spiroUnit;
  const spiroD      = spiroPreset[2] as number * spiroSmallR;

  // Mandala sides (5–8)
  const mandalaSides = 5 + Math.floor(rng() * 4);

  // Extra polygon ring count (2–4)
  const extraRings = 2 + Math.floor(rng() * 3);

  // Particle density
  const pCols = 14 + Math.floor(rng() * 6); // 14–19
  const pRows = 28 + Math.floor(rng() * 8); // 28–35

  // Pick 5 random phrases (alternating ja/en)
  const jaPool = PHRASE_POOL.filter(p => p.lang === "ja");
  const enPool = PHRASE_POOL.filter(p => p.lang === "en");
  const shuffle = <T,>(arr: T[]) => [...arr].sort(() => rng() - 0.5);
  const jaShuffled = shuffle(jaPool);
  const enShuffled = shuffle(enPool);
  const phrases = [
    { ...jaShuffled[0], start: 30,  end: 180 },
    { ...enShuffled[0], start: 210, end: 360 },
    { ...jaShuffled[1], start: 390, end: 540 },
    { ...enShuffled[1], start: 570, end: 720 },
    { ...jaShuffled[2], start: 750, end: 870 },
  ];

  // Layout
  const cx = width / 2;
  const cy = height / 2;
  const u  = width / 2; // 540

  const globalOpacity =
    frame < 150 ? interpolate(frame, [0, 150], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
    : frame > 750 ? interpolate(frame, [750, durationInFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
    : 1;

  const polyOpacity = interpolate(frame, [150, 250], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  }) * globalOpacity;

  const rectOpacity =
    frame < 300 ? 0
    : interpolate(frame, [300, 380], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) * globalOpacity;

  const topCy  = height * 0.2;
  const botCy  = height * 0.8;
  const leftCx = width * 0.15;
  const rightCx = width * 0.85;

  return (
    <AbsoluteFill style={{ background: "#050510" }}>
      <svg width={width} height={height} style={{ position: "absolute" }}>

        {/* Particle field */}
        <ParticleField frame={frame} width={width} height={height}
          globalOpacity={globalOpacity} cols={pCols} rows={pRows} color={c0} />

        {/* Spirograph — large background pattern */}
        <Spirograph frame={frame} cx={cx} cy={cy}
          R={spiroR} r={spiroSmallR} d={spiroD}
          color={c1} startFrame={60} globalOpacity={globalOpacity} />

        {/* Ring bursts */}
        <RingBurst frame={frame}      cx={cx}    cy={cy}    count={6} maxR={u * 0.95} color={c3} globalOpacity={globalOpacity * 0.35} />
        <RingBurst frame={frame + 20} cx={cx}    cy={topCy} count={4} maxR={u * 0.5}  color={c1} globalOpacity={globalOpacity * 0.30} />
        <RingBurst frame={frame + 10} cx={cx}    cy={botCy} count={4} maxR={u * 0.5}  color={c0} globalOpacity={globalOpacity * 0.30} />

        {/* Concentric mandala */}
        <ConcentricMandala frame={frame} cx={cx} cy={cy}
          count={6} baseR={u * 0.15} sides={mandalaSides}
          color0={c0} color1={c2} globalOpacity={polyOpacity} />

        {/* Pulsing circles — center */}
        <PulsingCircle frame={frame} cx={cx} cy={cy} minR={u*0.12} maxR={u*0.20} phase={0}   speed={35} color={c0} strokeWidth={2}   globalOpacity={globalOpacity} />
        <PulsingCircle frame={frame} cx={cx} cy={cy} minR={u*0.34} maxR={u*0.44} phase={1.2} speed={50} color={c1} strokeWidth={1.5} globalOpacity={globalOpacity} />
        <PulsingCircle frame={frame} cx={cx} cy={cy} minR={u*0.60} maxR={u*0.72} phase={2.4} speed={45} color={c2} strokeWidth={1}   globalOpacity={globalOpacity * 0.65} />
        <PulsingCircle frame={frame} cx={cx} cy={cy} minR={u*0.82} maxR={u*0.92} phase={3.6} speed={55} color={c3} strokeWidth={0.8} globalOpacity={globalOpacity * 0.40} />
        {/* Focal */}
        <PulsingCircle frame={frame} cx={cx} cy={topCy} minR={u*0.08} maxR={u*0.18} phase={0.8} speed={28} color={c0} strokeWidth={1.5} globalOpacity={globalOpacity * 0.85} />
        <PulsingCircle frame={frame} cx={cx} cy={botCy} minR={u*0.08} maxR={u*0.18} phase={1.9} speed={32} color={c2} strokeWidth={1.5} globalOpacity={globalOpacity * 0.85} />
        <PulsingCircle frame={frame} cx={leftCx}  cy={cy} minR={u*0.05} maxR={u*0.11} phase={3.1} speed={40} color={c1} strokeWidth={1} globalOpacity={globalOpacity * 0.55} />
        <PulsingCircle frame={frame} cx={rightCx} cy={cy} minR={u*0.05} maxR={u*0.11} phase={0.5} speed={38} color={c3} strokeWidth={1} globalOpacity={globalOpacity * 0.55} />

        {/* Star polygons */}
        <StarPolygon frame={frame} fps={fps} cx={cx} cy={cy}
          outerR={u*0.25} innerR={u*0.10} pts={6} rotSpeed={0.18}
          color={c0} delay={180} globalOpacity={polyOpacity} />
        <StarPolygon frame={frame} fps={fps} cx={cx} cy={cy}
          outerR={u*0.50} innerR={u*0.22} pts={5} rotSpeed={-0.12}
          color={c2} delay={220} globalOpacity={polyOpacity * 0.7} />

        {/* Orbiting polygons */}
        <OrbitingPolygon frame={frame} cx={cx} cy={cy} radius={u*0.28} sides={6}  rotationSpeed={0.30}  color={c0}              globalOpacity={polyOpacity} />
        <OrbitingPolygon frame={frame} cx={cx} cy={cy} radius={u*0.52} sides={3}  rotationSpeed={-0.20} color={c1} strokeWidth={2} globalOpacity={polyOpacity} />
        <OrbitingPolygon frame={frame} cx={cx} cy={cy} radius={u*0.72} sides={8}  rotationSpeed={0.15}  color={c2}              globalOpacity={polyOpacity * 0.7} />
        <OrbitingPolygon frame={frame} cx={cx} cy={cy} radius={u*0.90} sides={12} rotationSpeed={0.08}  color={c3} strokeWidth={1} globalOpacity={polyOpacity * 0.45} />
        {/* Extra randomized rings */}
        {Array.from({ length: extraRings }, (_, i) => (
          <OrbitingPolygon key={`extra-${i}`} frame={frame} cx={cx} cy={cy}
            radius={u * (0.35 + i * 0.15)} sides={4 + i * 2}
            rotationSpeed={(i % 2 === 0 ? 1 : -1) * (0.25 - i * 0.04)}
            color={palette[i % 4]} strokeWidth={0.8}
            globalOpacity={polyOpacity * 0.55} />
        ))}
        {/* Focal polygons */}
        <OrbitingPolygon frame={frame} cx={cx} cy={topCy} radius={u*0.17} sides={5} rotationSpeed={-0.50} color={c3} globalOpacity={polyOpacity * 0.9} />
        <OrbitingPolygon frame={frame} cx={cx} cy={botCy} radius={u*0.17} sides={4} rotationSpeed={0.40}  color={c1} globalOpacity={polyOpacity * 0.9} />

        {/* Sweeping lines */}
        <SweepingLine frame={frame} cx={cx} cy={cy} length={u*1.0}  startFrame={150} endFrame={750} speed={0.8}  color={c0} globalOpacity={globalOpacity * 0.30} />
        <SweepingLine frame={frame} cx={cx} cy={cy} length={u*0.78} startFrame={200} endFrame={780} speed={-0.6} color={c2} globalOpacity={globalOpacity * 0.25} />
        <SweepingLine frame={frame} cx={cx} cy={topCy} length={u*0.40} startFrame={180} endFrame={760} speed={1.2}  color={c1} globalOpacity={globalOpacity * 0.45} />
        <SweepingLine frame={frame} cx={cx} cy={botCy} length={u*0.40} startFrame={220} endFrame={750} speed={-1.0} color={c3} globalOpacity={globalOpacity * 0.45} />

        {/* Spring rects */}
        <SpringRect frame={frame} fps={fps} cx={cx} cy={cy} w={u*0.44} h={u*0.44} delay={300} color={c0}              globalOpacity={rectOpacity} />
        <SpringRect frame={frame} fps={fps} cx={cx} cy={cy} w={u*0.88} h={u*0.88} delay={340} color={c1}              globalOpacity={rectOpacity * 0.7} />
        <SpringRect frame={frame} fps={fps} cx={cx} cy={cy} w={u*1.28} h={u*1.28} delay={380} color={c2}              globalOpacity={rectOpacity * 0.4} />
        <SpringRect frame={frame} fps={fps} cx={cx} cy={topCy} w={u*0.22} h={u*0.22} delay={350} color={c3} globalOpacity={rectOpacity} />
        <SpringRect frame={frame} fps={fps} cx={cx} cy={botCy} w={u*0.22} h={u*0.22} delay={370} color={c2} globalOpacity={rectOpacity} />
      </svg>

      <Audio src={staticFile("ambient.wav")} volume={0.7} />

      {phrases.map((p) => (
        <TextPhrase key={p.start} frame={frame} fps={fps}
          text={p.text} start={p.start} end={p.end} lang={p.lang} />
      ))}
    </AbsoluteFill>
  );
};
