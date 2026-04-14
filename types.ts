export interface MemeApiConfig {
  baseUrl: string;
  timeoutMs: number;
}

export interface MemeTriggerConfig {
  requirePrefix: boolean;
  prefixes: string[];
  directKeywordNeedPrefix: boolean;
}

export interface MemeBehaviorConfig {
  quoteReply: boolean;
  useSenderAvatarFallback: boolean;
  includePreviewInDetail: boolean;
  maxSearchResults: number;
}

export interface MemeCacheConfig {
  refreshOnStartup: boolean;
}

export interface MemePermissionConfig {
  ownerOnlyUpdate: boolean;
}

export interface MemeBaseConfig {
  api: MemeApiConfig;
  trigger: MemeTriggerConfig;
  behavior: MemeBehaviorConfig;
  cache: MemeCacheConfig;
  permissions: MemePermissionConfig;
}

export interface MemeFilterConfig {
  enabled: boolean;
  blockedKeywords: string[];
  replyOnBlocked: boolean;
}

export type MemeImageSourceType = "auto" | "user_avatar" | "message_image";

export interface MemeImageSourceOptions {
  type?: MemeImageSourceType;
  qq?: number;
  messageId?: number;
}

export interface MemeInfoParams {
  min_images?: number;
  max_images?: number;
  min_texts?: number;
  max_texts?: number;
  default_texts?: string[];
}

export interface MemeInfo {
  key: string;
  keywords: string[];
  params?: MemeInfoParams;
  params_type?: MemeInfoParams;
}

export interface MemeKeywordMatch {
  keyword: string;
  key: string;
  info: MemeInfo;
  rest: string;
}

export interface MemeUserInfo {
  name: string;
  gender: string;
}

export interface MemeGenerateOptions {
  keyword: string;
  text?: string;
  args?: string;
  send?: boolean;
  quoteReply?: boolean;
  randomLabel?: string;
  imageSource?: MemeImageSourceOptions;
}

export interface MemeGenerateResult {
  ok: boolean;
  message: string;
  keyword?: string;
  key?: string;
  shouldNotice?: boolean;
  noticeInstruction?: string;
}
