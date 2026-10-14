import { Generation, VideoJob, VideoProvider } from "./types";
import { ProviderError } from "./runway";

// Official endpoints exist, but the linked project response schema is empty.
// Keep disabled until account access and job lifecycle contracts are verified.
export const opusSetup =
  "OpusClip setup pending: verify account API access and project status contract. See docs/providers/SETUP.md.";
export class OpusClipProvider implements VideoProvider {
  async create(_input: Generation): Promise<string> {
    throw new ProviderError(opusSetup, 503);
  }
  async poll(_id: string): Promise<VideoJob> {
    throw new ProviderError(opusSetup, 503);
  }
}
