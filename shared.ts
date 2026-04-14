import * as fs from "node:fs";
import * as path from "node:path";
import type {
  MemeBaseConfig,
  MemeFilterConfig,
  MemeGenerateOptions,
  MemeGenerateResult,
  MemeImageSourceOptions,
  MemeInfo,
  MemeInfoParams,
  MemeKeywordMatch,
  MemeUserInfo,
} from "./types";

interface LoggerLike {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sampleOne<T>(items: T[]): T | undefined {
  if (items.length === 0) {
    return undefined;
  }
  return items[randomInt(0, items.length - 1)];
}

function normalizeApiBaseUrl(baseUrl: string): string {
  return String(baseUrl || "").replace(/\/+$/, "");
}

function toMemesApiBase(baseUrl: string): string {
  return `${normalizeApiBaseUrl(baseUrl)}/memes`;
}

function uniqueStrings(items: string[]): string[] {
  return Array.from(new Set(items.filter(Boolean)));
}

function isLocalFilePath(value: string): boolean {
  if (!value) {
    return false;
  }
  if (value.startsWith("base64://")) {
    return false;
  }
  if (/^https?:\/\//i.test(value)) {
    return false;
  }
  return path.isAbsolute(value) || value.startsWith(".");
}

async function imageBufferToBase64(buffer: Buffer): Promise<string> {
  return `base64://${buffer.toString("base64")}`;
}

function resolveMemeParams(info: MemeInfo): MemeInfoParams {
  return info.params || info.params_type || {};
}

function getSenderName(event: any): string {
  return (
    event?.sender?.card ||
    event?.sender?.nickname ||
    String(event?.user_id || "用户")
  );
}

function getAvatarUrl(userId: number | string | undefined): string {
  return `https://q1.qlogo.cn/g?b=qq&s=640&nk=${userId || 0}`;
}

function extractTextAndArgs(input: string): { text: string; args: string } {
  const raw = String(input || "").trim();
  if (!raw) {
    return { text: "", args: "" };
  }

  const hashIndex = raw.indexOf("#");
  if (hashIndex >= 0) {
    return {
      text: raw.slice(0, hashIndex).trim(),
      args: raw.slice(hashIndex + 1).trim(),
    };
  }

  const pipeIndex = raw.indexOf("|");
  if (pipeIndex >= 0) {
    return {
      text: raw.slice(0, pipeIndex).trim(),
      args: raw.slice(pipeIndex + 1).trim(),
    };
  }

  return { text: raw, args: "" };
}

function getAtUserIds(message: any[]): number[] {
  const ids: number[] = [];
  for (const seg of message || []) {
    if (seg?.type !== "at") {
      continue;
    }
    const rawValue =
      seg.qq ?? seg.data?.qq ?? seg.data?.id ?? seg.data?.user_id;
    if (rawValue == null || rawValue === "all" || rawValue === "everyone") {
      continue;
    }
    const id = Number(rawValue);
    if (Number.isFinite(id)) {
      ids.push(id);
    }
  }
  return uniqueStrings(ids.map(String)).map((value) => Number(value));
}

function extractImageUrls(message: any[]): string[] {
  const urls: string[] = [];
  for (const seg of message || []) {
    if (seg?.type !== "image") {
      continue;
    }
    const url = seg.url || seg.data?.url;
    if (typeof url === "string" && url.trim()) {
      urls.push(url.trim());
    }
  }
  return urls;
}

function getSupportedArgsText(code: string): string {
  const common = {
    yuan: "是否圆形头像，输入圆即可。如：#圆",
    pos: "位置参数，支持左、右、两边。如：#两边",
    direction: "方向参数，支持上、下、左、右。如：#下",
    time: "指定时间文本。如：#2020/02/02",
    name: "指定名字文本。如：#Miku",
    message: "指定扫码或消息内容。如：#你干嘛",
  };

  return (
    {
      alipay: common.message,
      always: "模式参数，支持循环、套娃、默认。如：#循环",
      atri_pillow: "模式参数，支持 yes 或 no。如：#yes",
      bubble_tea: common.pos,
      certificate: common.time,
      clown: "输入爷可启用爷爷头轮廓。如：#爷",
      clown_mask: "遮罩位置，支持前、后。如：#前",
      crawl: "图片编号 1-92。如：#11",
      dog_dislike: common.yuan,
      firefly_holdsign: "图片编号 1-21。如：#11",
      genshin_eat: "角色支持八重、胡桃、妮露、可莉、刻晴、钟离。如：#刻晴",
      guichu: common.direction,
      gun: common.pos,
      jiji_king: common.yuan,
      kaleidoscope: common.yuan,
      kirby_hammer: common.yuan,
      left_right_jump: "跑动方向，支持左右、右左。如：#左右",
      look_flat: "看扁率数字。如：#3",
      loop: common.direction,
      mourning: "输入黑白或灰启用黑白图。如：#灰",
      my_friend: common.name,
      my_wife: "格式为 受益人/称呼。如：#我/老婆",
      note_for_leave: common.time,
      panda_dragon_figure: common.name,
      petpet: common.yuan,
      pixelate: "像素化大小，默认 10。如：#22",
      steam_message: common.name,
      symmetric: common.direction,
      wechat_pay: common.message,
    }[code] || ""
  );
}

export async function replyWithParts(options: {
  ctx: any;
  event: any;
  parts: any[];
  quoteReply?: boolean;
}): Promise<void> {
  const { event, parts, quoteReply = false } = options;
  const payload = [...parts];
  if (quoteReply && event?.message_id != null) {
    payload.unshift({ type: "reply", id: String(event.message_id) });
  }
  await event.reply(payload.length === 1 ? payload[0] : payload);
}

export async function replyWithImage(options: {
  ctx: any;
  event: any;
  image: string;
  caption?: string;
  quoteReply?: boolean;
}): Promise<void> {
  const { ctx, event, image, caption, quoteReply = false } = options;
  const parts: any[] = [];
  if (caption) {
    parts.push(caption);
  }

  const imageSegment = ctx?.segment?.image
    ? ctx.segment.image(image)
    : { type: "image", file: image };
  parts.push(imageSegment);

  try {
    await replyWithParts({ ctx, event, parts, quoteReply });
    return;
  } catch (error) {
    if (!isLocalFilePath(image)) {
      throw error;
    }
  }

  const imageBuffer = await fs.promises.readFile(image);
  const base64Image = await imageBufferToBase64(imageBuffer);
  const fallbackParts: any[] = [];
  if (caption) {
    fallbackParts.push(caption);
  }
  fallbackParts.push(
    ctx?.segment?.image
      ? ctx.segment.image(base64Image)
      : { type: "image", file: base64Image },
  );
  await replyWithParts({ ctx, event, parts: fallbackParts, quoteReply });
}

export async function sendSkillImage(options: {
  ctx: any;
  event: any;
  image: string;
  caption?: string;
  quoteReply?: boolean;
}): Promise<void> {
  const { ctx, event, image, caption, quoteReply = false } = options;
  const selfId = event?.self_id != null ? Number(event.self_id) : undefined;
  const bot =
    selfId != null && typeof ctx?.pickBot === "function"
      ? ctx.pickBot(selfId)
      : undefined;

  if (!bot) {
    throw new Error("当前上下文不支持发送图片");
  }

  const buildPayload = (file: string) => {
    const payload: any[] = [];
    if (quoteReply && event?.message_id != null) {
      payload.push({ type: "reply", id: String(event.message_id) });
    }
    if (caption) {
      payload.push(caption);
    }
    payload.push(
      ctx?.segment?.image ? ctx.segment.image(file) : { type: "image", file },
    );
    return payload;
  };

  const sendPayload = async (file: string) => {
    const payload = buildPayload(file);
    if (event?.message_type === "group" && event?.group_id != null) {
      await bot.sendGroupMsg(event.group_id, payload);
      return;
    }
    if (event?.user_id != null) {
      await bot.sendPrivateMsg(event.user_id, payload);
      return;
    }
    throw new Error("当前上下文不支持发送图片");
  };

  try {
    await sendPayload(image);
    return;
  } catch (error) {
    if (!isLocalFilePath(image)) {
      throw error;
    }
  }

  const imageBuffer = await fs.promises.readFile(image);
  const base64Image = await imageBufferToBase64(imageBuffer);
  await sendPayload(base64Image);
}

export class MemePluginRuntime {
  private baseConfig: MemeBaseConfig;
  private filterConfig: MemeFilterConfig;
  private readonly dataDir: string;
  private readonly keyMapPath: string;
  private readonly infosPath: string;
  private readonly menuImagePath: string;
  private keyMap: Record<string, string> = {};
  private infos: Record<string, MemeInfo> = {};

  constructor(options: {
    logger: LoggerLike;
    baseConfig: MemeBaseConfig;
    filterConfig: MemeFilterConfig;
  }) {
    this.logger = options.logger;
    this.baseConfig = cloneJson(options.baseConfig);
    this.filterConfig = cloneJson(options.filterConfig);
    this.dataDir = path.join(process.cwd(), "data", "meme");
    this.keyMapPath = path.join(this.dataDir, "key-map.json");
    this.infosPath = path.join(this.dataDir, "infos.json");
    this.menuImagePath = path.join(this.dataDir, "menu.jpg");
  }

  private readonly logger: LoggerLike;

  updateBaseConfig(baseConfig: MemeBaseConfig): void {
    this.baseConfig = cloneJson(baseConfig);
  }

  updateFilterConfig(filterConfig: MemeFilterConfig): void {
    this.filterConfig = cloneJson(filterConfig);
  }

  getBaseConfig(): MemeBaseConfig {
    return cloneJson(this.baseConfig);
  }

  getFilterConfig(): MemeFilterConfig {
    return cloneJson(this.filterConfig);
  }

  getMenuImagePath(): string {
    return this.menuImagePath;
  }

  getMemeCount(): number {
    return Object.keys(this.infos).length;
  }

  getKeywordCount(): number {
    return Object.keys(this.keyMap).length;
  }

  async initialize(): Promise<void> {
    await this.ensureDataDir();
    const loaded = await this.loadCacheFromDisk();
    if (!loaded || this.baseConfig.cache.refreshOnStartup) {
      await this.refreshCache();
    }
  }

  async ensureCache(forceRefresh: boolean = false): Promise<void> {
    await this.ensureDataDir();
    const hasMemoryCache =
      Object.keys(this.infos).length > 0 && Object.keys(this.keyMap).length > 0;
    if (forceRefresh) {
      await this.refreshCache();
      return;
    }
    if (hasMemoryCache) {
      return;
    }
    const loaded = await this.loadCacheFromDisk();
    if (!loaded) {
      await this.refreshCache();
    }
  }

  async refreshCache(): Promise<void> {
    await this.ensureDataDir();
    this.logger.info("[meme] 开始刷新表情缓存");

    const memeBase = toMemesApiBase(this.baseConfig.api.baseUrl);
    const keys = await this.fetchJson<string[]>(`${memeBase}/keys`);
    const infosEntries = await Promise.all(
      keys.map(async (key) => {
        const info = await this.fetchJson<MemeInfo>(`${memeBase}/${key}/info`);
        return [key, info] as const;
      }),
    );

    const nextInfos: Record<string, MemeInfo> = {};
    const nextKeyMap: Record<string, string> = {};
    for (const [key, info] of infosEntries) {
      nextInfos[key] = info;
      for (const keyword of info.keywords || []) {
        nextKeyMap[String(keyword).trim()] = key;
      }
    }

    const menuResponse = await this.fetchResponse(`${memeBase}/render_list`, {
      method: "POST",
    });
    const menuBuffer = Buffer.from(await menuResponse.arrayBuffer());

    await fs.promises.writeFile(
      this.keyMapPath,
      JSON.stringify(nextKeyMap, null, 2),
      "utf-8",
    );
    await fs.promises.writeFile(
      this.infosPath,
      JSON.stringify(nextInfos, null, 2),
      "utf-8",
    );
    await fs.promises.writeFile(this.menuImagePath, menuBuffer);

    this.keyMap = nextKeyMap;
    this.infos = nextInfos;
    this.logger.info(
      `[meme] 表情缓存刷新完成: ${Object.keys(nextInfos).length} 个表情, ${Object.keys(nextKeyMap).length} 个关键词`,
    );
  }

  getHelpText(): string {
    return [
      "meme 插件命令：",
      "1. /meme 搜索 关键词",
      "2. /meme 详情 关键词",
      "3. /随机表情",
      "",
      "说明：",
      "- 文本段用 / 分隔，例如：/喜报 第一行/第二行",
      "- 额外参数用 # 或 | 分隔，例如：/rua 群主#圆",
      "- 引用一张图片、直接发图、或 @ 某人时，会自动尝试取图",
    ].join("\n");
  }

  buildMenuCaption(): string {
    return `Memes 已同步 ${this.getMemeCount()} 个表情，${this.getKeywordCount()} 个关键词`;
  }

  searchKeywords(query: string): string[] {
    const normalized = String(query || "").trim();
    if (!normalized) {
      return [];
    }

    return Object.keys(this.keyMap)
      .filter((keyword) => keyword.includes(normalized))
      .sort((a, b) => a.localeCompare(b, "zh-Hans-CN"))
      .slice(0, this.baseConfig.behavior.maxSearchResults);
  }

  findMatch(input: string): MemeKeywordMatch | null {
    const text = String(input || "").trim();
    if (!text) {
      return null;
    }

    const keywords = Object.keys(this.keyMap).sort(
      (a, b) => b.length - a.length,
    );
    const keyword = keywords.find((candidate) => text.startsWith(candidate));
    if (!keyword) {
      return null;
    }

    const key = this.keyMap[keyword];
    const info = this.infos[key];
    if (!info) {
      return null;
    }

    return {
      keyword,
      key,
      info,
      rest: text.slice(keyword.length).trim(),
    };
  }

  getDetail(keywordOrKey: string): {
    key: string;
    keyword: string;
    info: MemeInfo;
    detailText: string;
  } | null {
    const normalized = String(keywordOrKey || "").trim();
    if (!normalized) {
      return null;
    }

    let key = this.keyMap[normalized];
    let keyword = normalized;

    if (!key && this.infos[normalized]) {
      key = normalized;
      keyword = this.infos[normalized].keywords?.[0] || normalized;
    }

    if (!key) {
      const match = this.findMatch(normalized);
      if (match) {
        key = match.key;
        keyword = match.keyword;
      }
    }

    if (!key || !this.infos[key]) {
      return null;
    }

    const info = this.infos[key];
    const params = resolveMemeParams(info);
    const defaultTexts =
      params.default_texts && params.default_texts.length > 0
        ? params.default_texts.join("/")
        : "无";
    const supportArgs = getSupportedArgsText(key);

    const detailText = [
      `代码：${info.key}`,
      `指令：${(info.keywords || []).join("、") || keyword}`,
      `图片数量：${params.min_images || 0} - ${params.max_images || 0}`,
      `文本段数：${params.min_texts || 0} - ${params.max_texts || 0}`,
      `默认文本：${defaultTexts}`,
      supportArgs ? `支持参数：${supportArgs}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    return { key, keyword, info, detailText };
  }

  getPreviewUrl(key: string): string {
    return `${toMemesApiBase(this.baseConfig.api.baseUrl)}/${key}/preview`;
  }

  pickRandomKeyword(): string | null {
    const candidates = Object.values(this.infos)
      .filter((info) => {
        const params = resolveMemeParams(info);
        return (params.min_images || 0) === 1 && (params.min_texts || 0) === 0;
      })
      .map((info) => info.keywords?.[0])
      .filter((keyword): keyword is string => Boolean(keyword));

    const selected = sampleOne(candidates);
    if (selected) {
      return selected;
    }

    const fallback = sampleOne(Object.keys(this.keyMap));
    return fallback || null;
  }

  async sendMenu(ctx: any, event: any): Promise<void> {
    await this.ensureCache();
    const caption = this.buildMenuCaption();
    if (fs.existsSync(this.menuImagePath)) {
      await replyWithImage({
        ctx,
        event,
        image: this.menuImagePath,
        caption,
        quoteReply: this.baseConfig.behavior.quoteReply,
      });
      return;
    }

    await replyWithParts({
      ctx,
      event,
      parts: [caption],
      quoteReply: this.baseConfig.behavior.quoteReply,
    });
  }

  async sendHelp(ctx: any, event: any): Promise<void> {
    await replyWithParts({
      ctx,
      event,
      parts: [this.getHelpText()],
      quoteReply: this.baseConfig.behavior.quoteReply,
    });
  }

  async sendSearch(ctx: any, event: any, query: string): Promise<void> {
    await this.ensureCache();
    const hits = this.searchKeywords(query);
    const text = !query.trim()
      ? "你要搜什么？"
      : hits.length > 0
        ? `搜索结果：\n${hits.map((hit, index) => `${index + 1}. ${hit}`).join("\n")}`
        : "搜索结果：无";

    await replyWithParts({
      ctx,
      event,
      parts: [text],
      quoteReply: this.baseConfig.behavior.quoteReply,
    });
  }

  async sendDetail(ctx: any, event: any, keywordOrKey: string): Promise<void> {
    await this.ensureCache();
    const detail = this.getDetail(keywordOrKey);
    if (!detail) {
      await replyWithParts({
        ctx,
        event,
        parts: [`未找到表情关键词：${keywordOrKey}`],
        quoteReply: this.baseConfig.behavior.quoteReply,
      });
      return;
    }

    const parts: any[] = [detail.detailText];
    if (this.baseConfig.behavior.includePreviewInDetail) {
      try {
        const previewResponse = await this.fetchResponse(
          this.getPreviewUrl(detail.key),
        );
        const previewBuffer = Buffer.from(await previewResponse.arrayBuffer());
        const previewBase64 = await imageBufferToBase64(previewBuffer);
        parts.push(
          ctx?.segment?.image
            ? ctx.segment.image(previewBase64)
            : { type: "image", file: previewBase64 },
        );
      } catch (error) {
        this.logger.warn(`[meme] 获取预览失败: ${error}`);
      }
    }

    await replyWithParts({
      ctx,
      event,
      parts,
      quoteReply: this.baseConfig.behavior.quoteReply,
    });
  }

  async sendRandom(ctx: any, event: any): Promise<void> {
    await this.ensureCache();
    const keyword = this.pickRandomKeyword();
    if (!keyword) {
      await replyWithParts({
        ctx,
        event,
        parts: ["当前没有可用的随机表情"],
        quoteReply: this.baseConfig.behavior.quoteReply,
      });
      return;
    }

    await this.generateFromInput(ctx, event, keyword, {
      send: true,
      randomLabel: keyword,
    });
  }

  async generateFromInput(
    ctx: any,
    event: any,
    input: string,
    options: Partial<MemeGenerateOptions> = {},
  ): Promise<MemeGenerateResult> {
    await this.ensureCache();
    const match = this.findMatch(input);
    if (!match) {
      return {
        ok: false,
        message: `未匹配到表情关键词：${input}`,
        shouldNotice: true,
        noticeInstruction: `用户输入了 "${input}"，但没有匹配到任何可用表情关键词。请自然提醒用户先执行“meme 搜索 关键词”再尝试生成`,
      };
    }

    const rest = options.text != null || options.args != null ? "" : match.rest;
    const parsed = extractTextAndArgs(rest);

    return this.generateByKeyword(ctx, event, {
      keyword: match.keyword,
      text: options.text ?? parsed.text,
      args: options.args ?? parsed.args,
      send: options.send,
      quoteReply: options.quoteReply,
      randomLabel: options.randomLabel,
      imageSource: options.imageSource,
    });
  }

  async generateByKeyword(
    ctx: any,
    event: any,
    options: MemeGenerateOptions,
  ): Promise<MemeGenerateResult> {
    await this.ensureCache();
    const detail = this.getDetail(options.keyword);
    if (!detail) {
      return {
        ok: false,
        message: `未找到表情关键词：${options.keyword}`,
        shouldNotice: true,
        noticeInstruction: `用户请求生成表情，但关键词 "${options.keyword}" 不存在。请自然提醒先搜索可用关键词后再生成`,
      };
    }

    const blockedKeyword = this.findBlockedKeyword(detail.keyword);
    if (blockedKeyword) {
      return {
        ok: false,
        message: `关键词 ${detail.keyword} 被拦截规则命中：${blockedKeyword}`,
        keyword: detail.keyword,
        key: detail.key,
        shouldNotice: this.filterConfig.replyOnBlocked,
        noticeInstruction: `用户触发了黑名单表情关键词 "${detail.keyword}"。请自然拒绝本次请求，简短说明该关键词当前不可用，并引导用户换一个表情关键词。`,
      };
    }

    const params = resolveMemeParams(detail.info);
    const textInput = String(options.text || "").trim();
    const argsInput = String(options.args || "").trim();

    if (textInput && (params.max_texts || 0) === 0) {
      return {
        ok: false,
        message: `表情 ${detail.keyword} 不接受文字参数`,
        keyword: detail.keyword,
        key: detail.key,
        shouldNotice: true,
        noticeInstruction: `用户要生成表情 "${detail.keyword}"，但这个表情不支持文字参数。请自然提醒用户直接提供图片或改用支持文本的表情。`,
      };
    }

    const userInfos = await this.collectUserInfos(ctx, event);
    const textSegments = this.resolveTextSegments(textInput, params, userInfos);
    if (textSegments.length < (params.min_texts || 0)) {
      return {
        ok: false,
        message: `表情 ${detail.keyword} 需要至少 ${params.min_texts || 0} 段文本`,
        keyword: detail.keyword,
        key: detail.key,
        shouldNotice: true,
        noticeInstruction: `用户要生成表情 "${detail.keyword}"，但文本参数不足。请自然提醒至少需要 ${params.min_texts || 0} 段文本`,
      };
    }

    const imageUrls = await this.collectImageUrls(
      ctx,
      event,
      params,
      options.imageSource,
    );
    if (imageUrls.length < (params.min_images || 0)) {
      const sourceType = options.imageSource?.type || "auto";
      const sourceHint =
        sourceType === "user_avatar"
          ? "指定的 QQ 头像不可用"
          : sourceType === "message_image"
            ? "指定 messageId 未找到图片"
            : "当前消息里没有可用图片";
      return {
        ok: false,
        message: `表情 ${detail.keyword} 需要至少 ${params.min_images || 0} 张图片（${sourceHint}）`,
        keyword: detail.keyword,
        key: detail.key,
        shouldNotice: true,
        noticeInstruction: `用户要生成表情 "${detail.keyword}"，但图片参数不足。请自然提醒至少需要 ${params.min_images || 0} 张图片，并提示可提供 QQ 头像或包含图片的 messageId。`,
      };
    }

    const formData = new FormData();
    const limitedImages = imageUrls.slice(
      0,
      Math.max(0, params.max_images || imageUrls.length),
    );
    for (const imageUrl of limitedImages) {
      const response = await this.fetchResponse(imageUrl);
      const buffer = Buffer.from(await response.arrayBuffer());
      formData.append("images", new Blob([buffer]));
    }

    const limitedTexts = textSegments.slice(
      0,
      Math.max(0, params.max_texts || textSegments.length),
    );
    for (const text of limitedTexts) {
      formData.append("texts", text);
    }

    const argsPayload = this.buildArgsPayload(detail.key, argsInput, userInfos);
    if (argsPayload) {
      formData.set("args", argsPayload);
    }

    const renderResponse = await this.fetchResponse(
      `${toMemesApiBase(this.baseConfig.api.baseUrl)}/${detail.key}/`,
      {
        method: "POST",
        body: formData,
      },
    );
    const resultBuffer = Buffer.from(await renderResponse.arrayBuffer());
    const resultImage = await imageBufferToBase64(resultBuffer);

    if (options.send !== false) {
      const caption = options.randomLabel
        ? `随机表情：${options.randomLabel}`
        : undefined;
      await sendSkillImage({
        ctx,
        event,
        image: resultImage,
        caption,
        quoteReply: options.quoteReply ?? this.baseConfig.behavior.quoteReply,
      });
    }

    return {
      ok: true,
      message: `表情 ${detail.keyword} 生成成功`,
      keyword: detail.keyword,
      key: detail.key,
    };
  }

  private async ensureDataDir(): Promise<void> {
    await fs.promises.mkdir(this.dataDir, { recursive: true });
  }

  private async loadCacheFromDisk(): Promise<boolean> {
    try {
      if (!fs.existsSync(this.keyMapPath) || !fs.existsSync(this.infosPath)) {
        return false;
      }

      const [keyMapRaw, infosRaw] = await Promise.all([
        fs.promises.readFile(this.keyMapPath, "utf-8"),
        fs.promises.readFile(this.infosPath, "utf-8"),
      ]);

      this.keyMap = JSON.parse(keyMapRaw) as Record<string, string>;
      this.infos = JSON.parse(infosRaw) as Record<string, MemeInfo>;
      return (
        Object.keys(this.keyMap).length > 0 &&
        Object.keys(this.infos).length > 0
      );
    } catch (error) {
      this.logger.warn(`[meme] 读取本地缓存失败，将重新拉取: ${error}`);
      return false;
    }
  }

  private async fetchResponse(
    url: string,
    init?: RequestInit,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.baseConfig.api.timeoutMs,
    );

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }
      return response;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await this.fetchResponse(url, init);
    return (await response.json()) as T;
  }

  private findBlockedKeyword(keyword: string): string | null {
    if (!this.filterConfig.enabled) {
      return null;
    }
    const normalized = keyword.toLowerCase();
    const hit = this.filterConfig.blockedKeywords.find((item) =>
      normalized.includes(String(item || "").toLowerCase()),
    );
    return hit || null;
  }

  private resolveTextSegments(
    textInput: string,
    params: MemeInfoParams,
    userInfos: MemeUserInfo[],
  ): string[] {
    let value = String(textInput || "").trim();
    if (!value && (params.min_texts || 0) > 0) {
      if ((params.default_texts || []).length > 0) {
        value = (params.default_texts || []).join("/");
      } else if (userInfos.length > 0) {
        value = userInfos[0].name;
      }
    }
    if (!value) {
      return [];
    }
    return value
      .split("/")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private async collectImageUrls(
    ctx: any,
    event: any,
    params: MemeInfoParams,
    source?: MemeImageSourceOptions,
  ): Promise<string[]> {
    const sourceType = source?.type || "auto";
    if (sourceType === "user_avatar") {
      const qq = Number(source?.qq);
      if (!Number.isFinite(qq) || qq <= 0) {
        return [];
      }
      return [getAvatarUrl(qq)].slice(0, params.max_images || 1);
    }

    if (sourceType === "message_image") {
      const messageId = Number(source?.messageId);
      if (!Number.isFinite(messageId) || messageId <= 0) {
        return [];
      }
      const imageUrl = await this.getImageUrlByMessageId(ctx, event, messageId);
      return imageUrl ? [imageUrl].slice(0, params.max_images || 1) : [];
    }

    const urls: string[] = [];
    const maxImages = params.max_images || 0;

    if (maxImages <= 0) {
      return urls;
    }

    if (event?.quote_id && typeof ctx?.getQuoteMsg === "function") {
      try {
        const quoted = await ctx.getQuoteMsg(event);
        urls.push(...extractImageUrls(quoted?.message || []));
      } catch (error) {
        this.logger.warn(`[meme] 获取引用消息失败: ${error}`);
      }
    }

    urls.push(...extractImageUrls(event?.message || []));

    const atUserIds = getAtUserIds(event?.message || []);
    if (urls.length < (params.min_images || 0) && atUserIds.length > 0) {
      urls.push(...atUserIds.map((userId) => getAvatarUrl(userId)));
    }

    if (
      urls.length === 0 &&
      this.baseConfig.behavior.useSenderAvatarFallback &&
      event?.user_id != null
    ) {
      urls.push(getAvatarUrl(event.user_id));
    }

    return uniqueStrings(urls).slice(0, maxImages);
  }

  private async getImageUrlByMessageId(
    ctx: any,
    event: any,
    messageId: number,
  ): Promise<string | null> {
    try {
      const selfId = event?.self_id != null ? Number(event.self_id) : undefined;
      if (selfId == null || !ctx?.pickBot) {
        return null;
      }
      const msg = await ctx.pickBot(selfId).getMsg(messageId);
      if (!msg?.message || !Array.isArray(msg.message)) {
        return null;
      }
      const imageSeg = msg.message.find((seg: any) => seg?.type === "image");
      if (!imageSeg) {
        return null;
      }
      return (imageSeg as any).url || (imageSeg as any).data?.url || null;
    } catch (error) {
      this.logger.warn(
        `[meme] 通过 messageId ${messageId} 获取图片失败: ${error}`,
      );
      return null;
    }
  }

  private async collectUserInfos(
    ctx: any,
    event: any,
  ): Promise<MemeUserInfo[]> {
    const atUserIds = getAtUserIds(event?.message || []);
    if (event?.message_type !== "group" || atUserIds.length === 0) {
      return [
        {
          name: getSenderName(event),
          gender: String(event?.sender?.sex || "unknown"),
        },
      ];
    }

    const bot =
      event?.self_id != null && typeof ctx?.pickBot === "function"
        ? ctx.pickBot(event.self_id)
        : undefined;
    if (!bot?.getGroupMemberInfo) {
      return atUserIds.map((userId) => ({
        name: String(userId),
        gender: "unknown",
      }));
    }

    const infos = await Promise.all(
      atUserIds.map(async (userId) => {
        try {
          const member = await bot.getGroupMemberInfo(event.group_id, userId);
          return {
            name: member?.card || member?.nickname || String(userId),
            gender: String(member?.sex || "unknown"),
          } satisfies MemeUserInfo;
        } catch {
          return {
            name: String(userId),
            gender: "unknown",
          } satisfies MemeUserInfo;
        }
      }),
    );

    return infos.length > 0
      ? infos
      : [
          {
            name: getSenderName(event),
            gender: String(event?.sender?.sex || "unknown"),
          },
        ];
  }

  private buildArgsPayload(
    key: string,
    args: string,
    userInfos: MemeUserInfo[],
  ): string {
    const value = String(args || "").trim();
    const maps = {
      dir: {
        左: "left",
        右: "right",
        上: "top",
        下: "bottom",
        左右: "left_right",
        右左: "right_left",
      },
      mode: {
        循环: "loop",
        套娃: "circle",
        yes: "yes",
        no: "no",
        前: "front",
        后: "behind",
      },
      pos: {
        左: "left",
        右: "right",
        两边: "both",
        双手: "both",
        双枪: "both",
      },
      role: {
        八重: 1,
        胡桃: 2,
        妮露: 3,
        可莉: 4,
        刻晴: 5,
        钟离: 6,
      },
    } as const;

    const getCircle = () => ({ circle: /^圆/.test(value) });
    const getNumber = (min: number, max: number) => ({
      number: Number.parseInt(value, 10) || randomInt(min, max),
    });
    const getMode = (fallback: string = "normal") => ({
      mode: maps.mode[value as keyof typeof maps.mode] || fallback,
    });
    const getPosition = (fallback: string = "right") => ({
      position: maps.pos[value as keyof typeof maps.pos] || fallback,
    });
    const getDirection = (fallback: string = "left") => ({
      direction: maps.dir[value as keyof typeof maps.dir] || fallback,
    });
    const getName = () => ({
      name: value || userInfos[0]?.name || "用户",
    });
    const getMessage = () => ({
      message: value || "https://ys.mihoyo.com/cloud",
    });

    const payload =
      {
        alipay: getMessage(),
        always: getMode(),
        atri_pillow: getMode("random"),
        bubble_tea: getPosition(),
        certificate: value ? { time: value } : {},
        clown: { person: /^爷/.test(value) },
        clown_mask: getMode("front"),
        crawl: getNumber(1, 92),
        dog_dislike: getCircle(),
        firefly_holdsign: getNumber(1, 21),
        genshin_eat: {
          character: maps.role[value as keyof typeof maps.role] || 0,
        },
        guichu: getDirection(),
        gun: getPosition(),
        jiji_king: getCircle(),
        kaleidoscope: getCircle(),
        kirby_hammer: getCircle(),
        left_right_jump: getDirection("left_right"),
        look_flat: { ratio: Number.parseInt(value, 10) || 2 },
        loop: getDirection("top"),
        mourning: { black: /^(黑白|灰)/.test(value) },
        my_friend: getName(),
        my_wife: {
          pronoun: value.split("/")[0]?.replace("煌", "🐔") || "我",
          name: value.split("/")[1] || "老婆",
        },
        note_for_leave: value ? { time: value } : {},
        panda_dragon_figure: getName(),
        petpet: getCircle(),
        pixelate: { number: Number.parseInt(value, 10) || 10 },
        steam_message: getName(),
        symmetric: getDirection(),
        wechat_pay: getMessage(),
      }[key] || {};

    return JSON.stringify({
      ...payload,
      user_infos: userInfos.map((item) => ({
        name: item.name.replace(/^@/, ""),
        gender: item.gender || "unknown",
      })),
    });
  }
}
