import {
  AbsoluteFill, Audio, interpolate, staticFile,
  useCurrentFrame, useVideoConfig,
} from "remotion";

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

// Build a sine wave polyline
function waveLine(
  width: number, height: number,
  freq: number, amp: number, phase: number,
  angle: number, offset: number, points = 120
): string {
  const cx = width / 2, cy = height / 2;
  const rad = (angle * Math.PI) / 180;
  const len = Math.sqrt(width * width + height * height);

  return Array.from({ length: points + 1 }, (_, i) => {
    const t = (i / points) * len - len / 2;
    const wave = Math.sin(t * freq + phase) * amp;
    // Perpendicular displacement
    const px = cx + t * Math.cos(rad) - wave * Math.sin(rad);
    const py = cy + t * Math.sin(rad) + wave * Math.cos(rad);
    return `${px.toFixed(1)},${py.toFixed(1)}`;
  }).join(" ");
}

export const WaveComposition: React.FC<{ seed?: string }> = ({ seed }) => {
  const frame = useCurrentFrame();
  const { width, height, fps, durationInFrames } = useVideoConfig();

  const seedStr = seed ?? new Date().toISOString().slice(0, 10);
  const rng = makePRNG(dateSeed(seedStr));

  const palette = PALETTES[Math.floor(rng() * PALETTES.length)];
  const [c0, c1, c2, c3] = palette;

  // Generate wave configs from seed
  const WAVE_COUNT = 22;
  const waves = Array.from({ length: WAVE_COUNT }, () => ({
    freq:   0.004 + rng() * 0.012,
    amp:    40  + rng() * 120,
    angle:  rng() * 180,
    speed:  (rng() - 0.5) * 0.08,
    color:  palette[Math.floor(rng() * 4)],
    alpha:  0.3 + rng() * 0.5,
    thick:  0.6 + rng() * 1.4,
    offset: rng() * Math.PI * 2,
  }));

  const globalOpacity =
    frame < 60
      ? interpolate(frame, [0, 60], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
      : frame > durationInFrames - 60
      ? interpolate(frame, [durationInFrames - 60, durationInFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
      : 1;

  // Radial pulse overlay
  const pulseR = ((frame * 3) % (width * 0.9));
  const pulseOp = (1 - pulseR / (width * 0.9)) * 0.25 * globalOpacity;

  return (
    <AbsoluteFill style={{ background: "#050510" }}>
      <svg width={width} height={height} style={{ position: "absolute" }}>

        {/* Background radial pulse */}
        <circle cx={width / 2} cy={height / 2} r={pulseR}
          fill="none" stroke={c0} strokeWidth={1.5} opacity={pulseOp} />
        <circle cx={width / 2} cy={height / 2} r={((frame * 3 + 200) % (width * 0.9))}
          fill="none" stroke={c2} strokeWidth={1} opacity={pulseOp * 0.6} />

        {/* Sine wave lines */}
        {waves.map((w, i) => {
          const phase = w.offset + frame * w.speed;
          const fadeIn = interpolate(frame, [i * 8, i * 8 + 40], [0, 1], {
            extrapolateLeft: "clamp", extrapolateRight: "clamp",
          });
          return (
            <polyline
              key={i}
              points={waveLine(width, height, w.freq, w.amp, phase, w.angle, w.offset)}
              fill="none"
              stroke={w.color}
              strokeWidth={w.thick}
              opacity={globalOpacity * w.alpha * fadeIn}
              style={{ filter: `drop-shadow(0 0 4px ${w.color})` }}
            />
          );
        })}

        {/* Center crosshair */}
        <circle cx={width / 2} cy={height / 2} r={8}
          fill={c0} opacity={globalOpacity * 0.8}
          style={{ filter: `drop-shadow(0 0 12px ${c0})` }} />
        <line x1={width / 2 - 40} y1={height / 2} x2={width / 2 + 40} y2={height / 2}
          stroke={c0} strokeWidth={1} opacity={globalOpacity * 0.5} />
        <line x1={width / 2} y1={height / 2 - 40} x2={width / 2} y2={height / 2 + 40}
          stroke={c0} strokeWidth={1} opacity={globalOpacity * 0.5} />
      </svg>

      {/* Frequency indicator text */}
      <div style={{
        position: "absolute", bottom: "12%", left: 0, right: 0, textAlign: "center",
        opacity: interpolate(frame, [120, 180], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) * globalOpacity,
        fontFamily: "'Courier New', monospace",
        fontSize: 28,
        color: c1,
        letterSpacing: "0.2em",
        textShadow: `0 0 20px ${c1}`,
      }}>
        WAVE INTERFERENCE / {seedStr}
      </div>

      <Audio src={staticFile("ambient.wav")} volume={0.7} />
    </AbsoluteFill>
  );
};
