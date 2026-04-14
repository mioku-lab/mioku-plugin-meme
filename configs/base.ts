import type { MemeBaseConfig } from "../types";

export const MEME_BASE_CONFIG: MemeBaseConfig = {
  api: {
    baseUrl: "http://127.0.0.1:2233",
    timeoutMs: 15000,
  },
  trigger: {
    requirePrefix: true,
    prefixes: ["/", "#"],
    directKeywordNeedPrefix: false,
  },
  behavior: {
    quoteReply: false,
    useSenderAvatarFallback: true,
    includePreviewInDetail: true,
    maxSearchResults: 20,
  },
  cache: {
    refreshOnStartup: false,
  },
  permissions: {
    ownerOnlyUpdate: true,
  },
};
