import type { MemePluginRuntime } from "./shared";
import {
  getPluginRuntimeState,
  resetPluginRuntimeState,
  setPluginRuntimeState,
} from "mioku";

export interface MemeRuntimeState {
  runtime?: MemePluginRuntime;
}

const MEME_PLUGIN_NAME = "meme";

export function setMemeRuntimeState(
  nextState: MemeRuntimeState,
): MemeRuntimeState {
  return setPluginRuntimeState(MEME_PLUGIN_NAME, nextState) as MemeRuntimeState;
}

export function getMemeRuntimeState(): MemeRuntimeState {
  return getPluginRuntimeState(MEME_PLUGIN_NAME) as MemeRuntimeState;
}

export function resetMemeRuntimeState(): void {
  resetPluginRuntimeState(MEME_PLUGIN_NAME);
}
