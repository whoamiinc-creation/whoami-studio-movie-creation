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
  ["#00ffff", "#ff00ff", "#00ff88", "#ff4500"],
  ["#e040fb", "#7c4dff", "#40c4ff", "#69f0ae"],
  ["#b2ff59", "#ea80fc", "#80d8ff", "#ffd180"],
];

const CRYSTAL_COUNT = 28;

export const CrystalComposition: React.FC<{ seed?: string }> = ({ seed }) => {
  const frame = useCurrentFrame();
  const { width, height, fps, durationInFrames } = useVideoConfig();

  const seedStr = seed ?? new Date().toISOString().slice(0, 10);
  const rng = makePRNG(dateSeed(seedStr));
  const palette = PALETTES[Math.floor(rng() * PALETTES.length)];

  const crystals = useMemo(() => {
    const r = makePRNG(dateSeed(seedStr + "crystal"));
    return Array.from({ length: CRYSTAL_COUNT }, (_, i) => {
      const x      = width  * (0.05 + r() * 0.9);
      const y      = height * (0.05 + r() * 0.9);
      const sides  = 4 + Math.floor(r() * 5);       // 4–8 sides
      const radius = 28 + r() * 90;
      const rot    = r() * Math.PI * 2;
      const color  = palette[Math.floor(r() * palette.length)];
      const delay  = Math.floor(r() * 180);          // staggered entry 0–180f
      const slowRot = (r() - 0.5) * 0.008;           // slow continuous rotation
      return { x, y, sides, radius, rot, color, delay, slowRot };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedStr, width, height]);

  const globalOpacity =
    frame < 60
      ? interpolate(frame, [0, 60], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
      : frame > durationInFrames - 60
      ? interpolate(frame, [durationInFrames - 60, durationInFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
      : 1;

  return (
    <AbsoluteFill style={{ background: "#050510" }}>
      <svg width={width} height={height} style={{ position: "absolute" }}>
        {crystals.map((c, ci) => {
          const grow = spring({
            frame: frame - c.delay,
            fps,
            config: { damping: 16, stiffness: 60 },
            from: 0, to: 1,
          });
          if (grow < 0.01) return null;

          const currentRot = c.rot + c.slowRot * frame;
          const pulse = 0.85 + 0.15 * Math.sin(frame * 0.04 + ci * 0.7);
          const r = c.radius * grow * pulse;

          // Polygon vertices
          const verts = Array.from({ length: c.sides }, (_, i) => {
            const angle = currentRot + (i / c.sides) * Math.PI * 2;
            return [c.x + r * Math.cos(angle), c.y + r * Math.sin(angle)] as [number, number];
          });

          const outerPath = verts.map((v, i) => `${i === 0 ? "M" : "L"}${v[0]},${v[1]}`).join(" ") + " Z";

          // Facets: triangles from center to each edge, alternating opacity
          const facets = verts.map((v, i) => {
            const next = verts[(i + 1) % verts.length];
            const facetOpacity = i % 2 === 0 ? 0.18 : 0.07;
            return (
              <polygon key={`f${i}`}
                points={`${c.x},${c.y} ${v[0]},${v[1]} ${next[0]},${next[1]}`}
                fill={c.color}
                opacity={globalOpacity * facetOpacity * grow}
              />
            );
          });

          // Inner refraction lines (from center to each vertex)
          const refractions = verts.map((v, i) => (
            <line key={`ref${i}`}
              x1={c.x} y1={c.y} x2={v[0]} y2={v[1]}
              stroke={c.color} strokeWidth={0.5}
              opacity={globalOpacity * 0.25 * grow}
            />
          ));

          return (
            <g key={ci}>
              {facets}
              {refractions}
              {/* Outer glowing edge */}
              <path d={outerPath}
                fill="none"
                stroke={c.color}
                strokeWidth={1.5}
                opacity={globalOpacity * 0.85 * grow}
                style={{ filter: `drop-shadow(0 0 6px ${c.color})` }}
              />
              {/* Center highlight */}
              <circle cx={c.x} cy={c.y} r={3 * grow}
                fill={c.color}
                opacity={globalOpacity * 0.7 * grow}
                style={{ filter: `drop-shadow(0 0 8px ${c.color})` }}
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
        CRYSTAL / {seedStr}
      </div>

      <Audio src={staticFile("ambient.wav")} volume={0.7} />
    </AbsoluteFill>
  );
};
