import { Composition } from "remotion";
import { MyComposition } from "./Composition";
import { QuoteComposition } from "./QuoteComposition";

const today = new Date().toISOString().slice(0, 10);

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="GeometricComp"
        component={MyComposition}
        durationInFrames={900}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{ seed: today }}
      />
      <Composition
        id="QuoteComp"
        component={QuoteComposition}
        durationInFrames={900}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          seed: today,
          quote: "AIは道具。自分という軸がなければ、ただ流されるだけ。",
          attribution: "whoami studio",
        }}
      />
    </>
  );
};
