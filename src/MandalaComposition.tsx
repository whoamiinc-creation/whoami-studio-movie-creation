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
  ["#ffd700", "#ff4081", "#00e5ff", "#76ff03"],
];

const RING_COUNT = 7;

export const MandalaComposition: React.FC<{ seed?: string }> = ({ seed }) => {
  const frame = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();

  const seedStr = seed ?? new Date().toISOString().slice(0, 10);
  const rng = makePRNG(dateSeed(seedStr));
  const palette = PALETTES[Math.floor(rng() * PALETTES.length)];

  const baseRadius = Math.min(width, height) * 0.065;

  const rings = useMemo(() => {
    const r = makePRNG(dateSeed(seedStr + "mandala"));
    return Array.from({ length: RING_COUNT }, (_, i) => {
      const radius    = baseRadius * (1.2 + i * 1.45);
      const elemCount = 6 + i * 2;
      const dir       = i % 2 === 0 ? 1 : -1;
      const rotSpeed  = dir * (0.25 + r() * 0.55) * ((RING_COUNT - i) / RING_COUNT);
      const color     = palette[i % palette.length];
      const elemSize  = 7 + r() * 14;
      const shape     = Math.floor(r() * 3); // 0=diamond, 1=circle, 2=triangle
      return { radius, elemCount, rotSpeed, color, elemSize, shape };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedStr, baseRadius]);

  const cx = width  / 2;
  const cy = height / 2;

  const globalOpacity =
    frame < 60
      ? interpolate(frame, [0, 60], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
      : frame > durationInFrames - 60
      ? interpolate(frame, [durationInFrames - 60, durationInFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
      : 1;

  // Render a small shape at position (ex, ey) rotated by `angle`
  const renderElem = (
    key: string,
    ex: number, ey: number,
    size: number,
    angle: number,
    shape: number,
    color: string,
    opacity: number
  ) => {
    const s = size / 2;
    const rotate = (px: number, py: number) => {
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      return [ex + px * cos - py * sin, ey + px * sin + py * cos] as [number, number];
    };
    const glowStyle = { filter: `drop-shadow(0 0 5px ${color})` };

    if (shape === 1) {
      return <circle key={key} cx={ex} cy={ey} r={s * 0.7} fill={color} opacity={opacity} style={glowStyle} />;
    }
    if (shape === 2) {
      const pts = [rotate(0, -s), rotate(s * 0.87, s * 0.5), rotate(-s * 0.87, s * 0.5)];
      return <polygon key={key} points={pts.map(p => p.join(",")).join(" ")} fill={color} opacity={opacity} style={glowStyle} />;
    }
    // diamond
    const pts = [rotate(0, -s), rotate(s, 0), rotate(0, s), rotate(-s, 0)];
    return <polygon key={key} points={pts.map(p => p.join(",")).join(" ")} fill={color} opacity={opacity} style={glowStyle} />;
  };

  return (
    <AbsoluteFill style={{ background: "#050510" }}>
      <svg width={width} height={height} style={{ position: "absolute" }}>

        {/* Ring circle guides */}
        {rings.map((ring, ri) => {
          const fadeIn = interpolate(frame, [ri * 20, ri * 20 + 50], [0, 1], {
            extrapolateLeft: "clamp", extrapolateRight: "clamp",
          });
          return (
            <circle key={`guide${ri}`} cx={cx} cy={cy} r={ring.radius}
              fill="none" stroke={ring.color} strokeWidth={0.4}
              opacity={globalOpacity * 0.15 * fadeIn} />
          );
        })}

        {/* Spoke lines from center to first ring */}
        {Array.from({ length: 12 }, (_, i) => {
          const angle = (i / 12) * Math.PI * 2 + frame * 0.003;
          const outerR = rings[RING_COUNT - 1]?.radius ?? 400;
          return (
            <line key={`spoke${i}`}
              x1={cx} y1={cy}
              x2={cx + outerR * Math.cos(angle)}
              y2={cy + outerR * Math.sin(angle)}
              stroke={palette[i % palette.length]}
              strokeWidth={0.4}
              opacity={globalOpacity * 0.1}
            />
          );
        })}

        {/* Rings */}
        {rings.map((ring, ri) => {
          const baseAngle = (frame * ring.rotSpeed * Math.PI) / 180;
          const fadeIn = interpolate(frame, [ri * 20, ri * 20 + 60], [0, 1], {
            extrapolateLeft: "clamp", extrapolateRight: "clamp",
          });
          const pulse = 0.65 + 0.35 * Math.sin(frame * 0.045 + ri * 0.9);

          return Array.from({ length: ring.elemCount }, (_, ei) => {
            const angle = baseAngle + (ei / ring.elemCount) * Math.PI * 2;
            const ex = cx + ring.radius * Math.cos(angle);
            const ey = cy + ring.radius * Math.sin(angle);
            return renderElem(
              `r${ri}e${ei}`,
              ex, ey,
              ring.elemSize,
              angle,
              ring.shape,
              ring.color,
              globalOpacity * fadeIn * pulse
            );
          });
        })}

        {/* Center core */}
        <circle cx={cx} cy={cy}
          r={18 + 7 * Math.sin(frame * 0.07)}
          fill={palette[0]}
          opacity={globalOpacity * 0.95}
          style={{ filter: `drop-shadow(0 0 30px ${palette[0]})` }} />
        <circle cx={cx} cy={cy}
          r={9 + 3 * Math.sin(frame * 0.12 + 1)}
          fill={palette[2]}
          opacity={globalOpacity * 0.9}
          style={{ filter: `drop-shadow(0 0 15px ${palette[2]})` }} />

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
        MANDALA / {seedStr}
      </div>

      <Audio src={staticFile("ambient.wav")} volume={0.7} />
    </AbsoluteFill>
  );
};
