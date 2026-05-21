import {
  AbsoluteFill, Audio, interpolate, spring, staticFile,
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
];

const NODE_COUNT   = 42;
const MAX_EDGE_DIST = 320;

export const NeuralComposition: React.FC<{ seed?: string }> = ({ seed }) => {
  const frame = useCurrentFrame();
  const { width, height, fps, durationInFrames } = useVideoConfig();

  const seedStr = seed ?? new Date().toISOString().slice(0, 10);
  const rng = makePRNG(dateSeed(seedStr));

  const palette = PALETTES[Math.floor(rng() * PALETTES.length)];
  const [c0, c1, c2, c3] = palette;

  // Seeded node layout (stable across frames)
  const nodes = useMemo(() => {
    const r2 = makePRNG(dateSeed(seedStr));
    // Skip palette pick
    r2(); r2(); r2(); r2(); r2();
    return Array.from({ length: NODE_COUNT }, (_, i) => {
      const margin = 80;
      // Bias toward center for portrait
      const x = margin + r2() * (width - margin * 2);
      const y = margin + r2() * (height - margin * 2);
      return {
        x, y,
        phase:      r2() * Math.PI * 2,
        pulseSpeed: 0.035 + r2() * 0.045,
        color:      palette[Math.floor(r2() * 4)],
        size:       3 + r2() * 7,
      };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedStr, width, height]);

  // Edges between nearby nodes
  const edges = useMemo(() => {
    const result: { from: number; to: number; dist: number; color: string; pulseOffset: number }[] = [];
    const r3 = makePRNG(dateSeed(seedStr + "edges"));
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[i].x - nodes[j].x;
        const dy = nodes[i].y - nodes[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < MAX_EDGE_DIST) {
          result.push({
            from: i, to: j, dist,
            color: palette[Math.floor(r3() * 4)],
            pulseOffset: r3() * 300,
          });
        }
      }
    }
    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, seedStr]);

  const globalOpacity =
    frame < 60
      ? interpolate(frame, [0, 60], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
      : frame > durationInFrames - 60
      ? interpolate(frame, [durationInFrames - 60, durationInFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
      : 1;

  return (
    <AbsoluteFill style={{ background: "#050510" }}>
      <svg width={width} height={height} style={{ position: "absolute" }}>

        {/* Edges */}
        {edges.map((e: { from: number; to: number; dist: number; color: string; pulseOffset: number }, i: number) => {
          const n0 = nodes[e.from], n1 = nodes[e.to];
          const fadeIn = interpolate(frame, [i % 60, (i % 60) + 50], [0, 1], {
            extrapolateLeft: "clamp", extrapolateRight: "clamp",
          });
          const baseAlpha = (1 - e.dist / MAX_EDGE_DIST) * 0.45;

          // Traveling pulse: dashoffset scrolls along the edge
          const dash = e.dist * 0.25;
          const gap  = e.dist * 0.75;
          const offset = e.dist - ((frame * 5 + e.pulseOffset) % e.dist);

          return (
            <g key={`e${i}`}>
              {/* Static dim edge */}
              <line
                x1={n0.x} y1={n0.y} x2={n1.x} y2={n1.y}
                stroke={e.color} strokeWidth={0.6}
                opacity={globalOpacity * baseAlpha * fadeIn}
              />
              {/* Traveling pulse */}
              <line
                x1={n0.x} y1={n0.y} x2={n1.x} y2={n1.y}
                stroke={e.color} strokeWidth={1.5}
                strokeDasharray={`${dash} ${gap}`}
                strokeDashoffset={offset}
                opacity={globalOpacity * 0.7 * fadeIn}
                style={{ filter: `drop-shadow(0 0 4px ${e.color})` }}
              />
            </g>
          );
        })}

        {/* Nodes */}
        {nodes.map((n: { x: number; y: number; phase: number; pulseSpeed: number; color: string; size: number }, i: number) => {
          const pulse = (Math.sin(frame * n.pulseSpeed + n.phase) + 1) / 2;
          const r = n.size * (0.7 + 0.3 * pulse);
          const glow = 6 + 8 * pulse;
          const fadeIn = spring({
            frame: frame - Math.floor(i * 4),
            fps,
            config: { damping: 14, stiffness: 80 },
            from: 0, to: 1,
          });

          return (
            <circle key={`n${i}`}
              cx={n.x} cy={n.y} r={r * fadeIn}
              fill={n.color}
              opacity={globalOpacity * (0.6 + 0.4 * pulse) * fadeIn}
              style={{ filter: `drop-shadow(0 0 ${glow}px ${n.color})` }}
            />
          );
        })}

        {/* Center dominant node */}
        <circle cx={width / 2} cy={height / 2}
          r={14 + 6 * Math.sin(frame * 0.06)}
          fill={c0} opacity={globalOpacity * 0.9}
          style={{ filter: `drop-shadow(0 0 20px ${c0})` }} />

      </svg>

      {/* Label */}
      <div style={{
        position: "absolute", bottom: "12%", left: 0, right: 0, textAlign: "center",
        opacity: interpolate(frame, [90, 150], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) * globalOpacity,
        fontFamily: "'Courier New', monospace",
        fontSize: 28,
        color: c1,
        letterSpacing: "0.2em",
        textShadow: `0 0 20px ${c1}`,
      }}>
        NEURAL PATTERN / {seedStr}
      </div>

      <Audio src={staticFile("ambient.wav")} volume={0.7} />
    </AbsoluteFill>
  );
};
