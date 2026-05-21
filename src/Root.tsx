import { Composition } from "remotion";
import { MyComposition } from "./Composition";
import { QuoteComposition } from "./QuoteComposition";
import { WaveComposition } from "./WaveComposition";
import { NeuralComposition } from "./NeuralComposition";

const today = new Date().toISOString().slice(0, 10);

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition id="GeometricComp" component={MyComposition}
        durationInFrames={900} fps={30} width={1080} height={1920}
        defaultProps={{ seed: today }} />
      <Composition id="QuoteComp" component={QuoteComposition}
        durationInFrames={900} fps={30} width={1080} height={1920}
        defaultProps={{ seed: today, quote: "AIは道具。自分という軸がなければ、ただ流されるだけ。", attribution: "whoami studio" }} />
      <Composition id="WaveComp" component={WaveComposition}
        durationInFrames={900} fps={30} width={1080} height={1920}
        defaultProps={{ seed: today }} />
      <Composition id="NeuralComp" component={NeuralComposition}
        durationInFrames={900} fps={30} width={1080} height={1920}
        defaultProps={{ seed: today }} />
    </>
  );
};
