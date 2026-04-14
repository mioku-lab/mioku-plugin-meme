import type { MemePluginRuntime } from "./shared";
import {
  getPluginRuntimeState,
  resetPluginRuntimeState,
  setPluginRuntimeState,
} from "../../src";

export interface MemeRuntimeState {
  runtime?: MemePluginRuntime;
}

const MEME_PLUGIN_NAME = "meme";

export function setMemeRuntimeState(
  nextState: MemeRuntimeState,
): MemeRuntimeState {
  return setPluginRuntimeState<MemeRuntimeState>(MEME_PLUGIN_NAME, nextState);
}

export function getMemeRuntimeState(): MemeRuntimeState {
  return getPluginRuntimeState<MemeRuntimeState>(MEME_PLUGIN_NAME);
}

export function resetMemeRuntimeState(): void {
  resetPluginRuntimeState(MEME_PLUGIN_NAME);
}
