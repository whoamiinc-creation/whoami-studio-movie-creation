import {
  AbsoluteFill, Audio, interpolate, staticFile,
  useCurrentFrame, useVideoConfig,
} from "remotion";
import { useMemo } from "react";

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
  ["#00ffff", "#ff00ff", "#00ff88", "#ff4500"],
  ["#e040fb", "#7c4dff", "#40c4ff", "#69f0ae"],
  ["#ff6e40", "#ffd740", "#40ffd7", "#448aff"],
];

const TRAIL_LENGTH = 26;
const PARTICLE_COUNT = 55;

export const FlowFieldComposition: React.FC<{ seed?: string }> = ({ seed }) => {
  const frame = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();

  const seedStr = seed ?? new Date().toISOString().slice(0, 10);
  const rng = makePRNG(dateSeed(seedStr));
  const palette = PALETTES[Math.floor(rng() * PALETTES.length)];

  const particles = useMemo(() => {
    const r = makePRNG(dateSeed(seedStr + "flow"));
    return Array.from({ length: PARTICLE_COUNT }, () => {
      const cx     = width  * (0.12 + r() * 0.76);
      const cy     = height * (0.12 + r() * 0.76);
      const rx     = width  * (0.05 + r() * 0.30);
      const ry     = height * (0.05 + r() * 0.30);
      const a      = 1 + Math.floor(r() * 4);
      const b      = 1 + Math.floor(r() * 4);
      const phaseX = r() * Math.PI * 2;
      const phaseY = r() * Math.PI * 2;
      const speed  = 0.006 + r() * 0.016;
      const color  = palette[Math.floor(r() * palette.length)];
      const size   = 1.8 + r() * 3.5;
      return { cx, cy, rx, ry, a, b, phaseX, phaseY, speed, color, size };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedStr, width, height]);

  const globalOpacity =
    frame < 60
      ? interpolate(frame, [0, 60], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
      : frame > durationInFrames - 60
      ? interpolate(frame, [durationInFrames - 60, durationInFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
      : 1;

  const getPos = (p: typeof particles[0], f: number) => ({
    x: p.cx + p.rx * Math.sin(p.a * f * p.speed + p.phaseX),
    y: p.cy + p.ry * Math.sin(p.b * f * p.speed + p.phaseY),
  });

  return (
    <AbsoluteFill style={{ background: "#050510" }}>
      <svg width={width} height={height} style={{ position: "absolute" }}>
        {particles.map((p, i) => {
          const trailLen = Math.min(frame, TRAIL_LENGTH);
          const trail = Array.from({ length: trailLen + 1 }, (_, j) =>
            getPos(p, frame - (trailLen - j))
          );
          const head = trail[trail.length - 1];
          const fadeIn = interpolate(frame, [i * 2, i * 2 + 50], [0, 1], {
            extrapolateLeft: "clamp", extrapolateRight: "clamp",
          });

          return (
            <g key={i}>
              {trail.length > 1 && trail.map((pt, j) => {
                if (j === 0) return null;
                const prev = trail[j - 1];
                const alpha = (j / trail.length) * 0.55;
                const sw = p.size * (0.25 + 0.75 * (j / trail.length));
                return (
                  <line key={j}
                    x1={prev.x} y1={prev.y} x2={pt.x} y2={pt.y}
                    stroke={p.color}
                    strokeWidth={sw}
                    opacity={globalOpacity * alpha * fadeIn}
                    strokeLinecap="round"
                  />
                );
              })}
              <circle
                cx={head.x} cy={head.y} r={p.size}
                fill={p.color}
                opacity={globalOpacity * 0.95 * fadeIn}
                style={{ filter: `drop-shadow(0 0 ${p.size * 2.5}px ${p.color})` }}
              />
            </g>
          );
        })}
      </svg>

      <div style={{
        position: "absolute", bottom: "12%", left: 0, right: 0, textAlign: "center",
        opacity: interpolate(frame, [90, 150], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) * globalOpacity,
        fontFamily: "'Courier New', monospace",
        fontSize: 28,
        color: palette[1],
        letterSpacing: "0.2em",
        textShadow: `0 0 20px ${palette[1]}`,
      }}>
        FLOW FIELD / {seedStr}
      </div>

      <Audio src={staticFile("ambient.wav")} volume={0.7} />
    </AbsoluteFill>
  );
};
