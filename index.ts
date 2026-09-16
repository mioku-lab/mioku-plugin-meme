import {
  definePlugin,
  type MiokuContext,
  getService,
  Services,
} from "mioku";
import { MEME_BASE_CONFIG } from "./configs/base";
import { MEME_FILTER_CONFIG } from "./configs/filters";
import { MemePluginRuntime, replyWithParts } from "./shared";
import type { MemeBaseConfig, MemeFilterConfig } from "./types";
import { createMemeSkills } from "./skills/meme";

function cloneConfig<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function stripCommandPrefix(
  text: string,
  prefixes: string[],
): { value: string; hasPrefix: boolean } {
  const trimmed = String(text || "").trim();
  for (const prefix of prefixes) {
    if (trimmed.startsWith(prefix)) {
      return {
        value: trimmed.slice(prefix.length).trim(),
        hasPrefix: true,
      };
    }
  }
  return { value: trimmed, hasPrefix: false };
}

const memePlugin = definePlugin({
  name: "meme",

  async setup(ctx: MiokuContext) {
    const configService = getService(ctx, Services.Config);
    const aiService = getService(ctx, Services.AI);

    let baseConfig = cloneConfig(MEME_BASE_CONFIG);
    let filterConfig = cloneConfig(MEME_FILTER_CONFIG);

    if (configService) {
      await configService.registerConfig("meme", "base", baseConfig);
      await configService.registerConfig("meme", "filters", filterConfig);

      const nextBase = await configService.getConfig("meme", "base");
      const nextFilters = await configService.getConfig("meme", "filters");
      if (nextBase) {
        baseConfig = nextBase as MemeBaseConfig;
      }
      if (nextFilters) {
        filterConfig = nextFilters as MemeFilterConfig;
      }
    } else {
      ctx.logger.warn("config-service 未加载，meme 插件将使用内置默认配置");
    }

    const notifyByAIRuntime = async (
      event: any,
      instruction: string,
      fallbackMessage?: string,
      error?: unknown,
    ) => {
      if (error != null) {
        ctx.logger.error(
          `[meme] ${instruction}\n执行错误: ${normalizeErrorMessage(error)}`,
        );
      }
      const rawText = ctx.text(event)?.trim() ?? "";
      const hasSlashPrefix = baseConfig.trigger.prefixes.some((p: string) => rawText.startsWith(p));
      if (!hasSlashPrefix) {
        return;
      }
      const chatRuntime = aiService?.getChatRuntime();
      if (chatRuntime) {
        try {
          await chatRuntime.generateNotice({
            event,
            instruction,
            send: true,
            promptInjections: [
              {
                title: "Meme Plugin Notice",
                content:
                  "A meme-related action was triggered. Judge whether the user likely intended this action or triggered it accidentally. If it looks accidental or like a casual mention, weave a natural reply into the conversation without mentioning the plugin, tools, or commands. If the user seems to want this feature, respond helpfully. Keep it brief and natural.",
              },
            ],
          });
          return;
        } catch (noticeError) {
          ctx.logger.error(`meme notice 发送失败 ${noticeError}`);
        }
      }

      await replyWithParts({
        ctx,
        event,
        parts: [fallbackMessage || "请求处理失败，请稍后重试"],
        quoteReply: baseConfig.behavior.quoteReply,
      });
    };

    const runtime = new MemePluginRuntime({
      logger: ctx.logger,
      baseConfig,
      filterConfig,
    });

    try {
      await runtime.initialize();
    } catch (error) {
      ctx.logger.warn(
        `meme 插件初始化缓存失败，首次使用时会再尝试拉取: ${error}`,
      );
    }

    if (aiService) {
      for (const skill of createMemeSkills(runtime)) aiService.registerSkill(skill);
    }

    const disposers: Array<() => void> = [];
    if (configService) {
      disposers.push(
        configService.onConfigChange("meme", "base", (next) => {
          baseConfig = next as MemeBaseConfig;
          runtime.updateBaseConfig(baseConfig);
        }),
      );
      disposers.push(
        configService.onConfigChange("meme", "filters", (next) => {
          filterConfig = next as MemeFilterConfig;
          runtime.updateFilterConfig(filterConfig);
        }),
      );
    }

    ctx.command({
      name: "/meme 菜单",
      match: /^(?:(?:表情|meme)包?(?:菜单|展示|制作(?:列表)?)|meme\s+(?:菜单|列表|展示))$/i,
      prefixes: baseConfig.trigger.prefixes,
      description: "查看已同步的表情菜单",
      usage: "/meme 菜单",
      handler: ({ event }) => runtime.sendMenu(ctx, event),
    });
    ctx.command({
      name: "/随机表情",
      match: /^随机(?:表情|meme)(?:包)?$/i,
      prefixes: baseConfig.trigger.prefixes,
      description: "随机生成一个头像类表情",
      usage: "/随机表情",
      handler: ({ event }) => runtime.sendRandom(ctx, event),
    });
    ctx.command({
      name: "/meme 帮助",
      match: /^(?:(?:头像|文字)?(?:表情|meme)包?(?:制作(?:菜单|教程)?|帮助|说明|指令|使用说明)|(?:头像|文字)(?:表情|meme)包?|meme\s+帮助)$/i,
      prefixes: baseConfig.trigger.prefixes,
      description: "查看表情制作教程与参数说明",
      usage: "/meme 帮助",
      handler: ({ event }) => runtime.sendHelp(ctx, event),
    });
    ctx.command({
      name: "/meme 搜索",
      match: /^(?:表情|meme)包?(?:搜索|检索)\s*(.*)$/i,
      prefixes: baseConfig.trigger.prefixes,
      description: "搜索相关表情关键词",
      usage: "/meme 搜索 摸",
      handler: async ({ event, match }) => {
        const query = String(match?.[1] ?? "").trim();
        if (!query) {
          await notifyByAIRuntime(
            event,
            "用户发起了 meme 搜索但没有给关键词。请自然提醒他补一个搜索词",
            "你想搜什么？",
          );
          return;
        }
        await runtime.sendSearch(ctx, event, query);
      },
    });
    ctx.command({
      name: "/meme 详情",
      match: /^meme包?\s+详情\s+(.+)$/i,
      prefixes: baseConfig.trigger.prefixes,
      description: "查看表情参数和预览",
      usage: "/meme 详情 摸头",
      handler: async ({ event, match }) => {
        const keyword = String(match?.[1] ?? "").trim();
        if (!runtime.getDetail(keyword)) {
          await notifyByAIRuntime(
            event,
            `用户查询了不存在的表情详情关键词 "${keyword}"。请自然提醒先搜索可用关键词`,
            `未找到表情关键词：${keyword}`,
          );
          return;
        }
        await runtime.sendDetail(ctx, event, keyword);
      },
    });
    ctx.command({
      name: "/meme 更新",
      match: /^(?:(?:表情|meme)包?更新|meme\s+更新)$/i,
      prefixes: baseConfig.trigger.prefixes,
      permission: baseConfig.permissions.ownerOnlyUpdate ? "master" : "member",
      description: "刷新远端表情缓存",
      usage: "/meme 更新",
      handler: async ({ event }) => {
        await replyWithParts({
          ctx,
          event,
          parts: ["开始刷新 meme 缓存，请稍等..."],
          quoteReply: baseConfig.behavior.quoteReply,
        });
        try {
          await runtime.refreshCache();
          await runtime.sendMenu(ctx, event);
        } catch (error) {
          await notifyByAIRuntime(
            event,
            `meme 缓存刷新失败，错误信息：${error}。请自然告知用户稍后重试或让管理员检查 meme API 服务状态。`,
            `刷新 meme 缓存失败：${error}`,
            error,
          );
        }
      },
    });

    ctx.handle("message", async (event) => {
      const rawText = ctx.text(event)?.trim();
      if (!rawText) {
        return;
      }

      const stripResult = stripCommandPrefix(
        rawText,
        baseConfig.trigger.prefixes,
      );
      const prefixedText = stripResult.value;
      const commandText =
        stripResult.hasPrefix || !baseConfig.trigger.requirePrefix
          ? prefixedText
          : "";
      const directText = stripResult.hasPrefix
        ? prefixedText
        : baseConfig.trigger.directKeywordNeedPrefix
          ? ""
          : rawText;

      try {
        const genericGenerateMatch = commandText.match(
          /^meme包?\s+(?:生成|制作)\s+(.+)$/i,
        );
        if (genericGenerateMatch) {
          const result = await runtime.generateFromInput(
            ctx,
            event,
            genericGenerateMatch[1],
            {
              send: true,
            },
          );
          if (!result.ok && result.shouldNotice) {
            await notifyByAIRuntime(
              event,
              result.noticeInstruction || `meme 生成失败：${result.message}`,
              result.message,
            );
          }
          return;
        }

        const genericPassThroughMatch = commandText.match(/^meme包?\s+(.+)$/i);
        if (genericPassThroughMatch) {
          const passThrough = genericPassThroughMatch[1].trim();
          if (!passThrough) {
            return;
          }

          if (/(详情|帮助|成分)$/.test(passThrough)) {
            const keyword = passThrough.replace(/(详情|帮助|成分)$/, "").trim();
            if (!runtime.getDetail(keyword)) {
              await notifyByAIRuntime(
                event,
                `用户查询了不存在的表情详情关键词 "${keyword}"。请自然提醒先搜索可用关键词`,
                `未找到表情关键词：${keyword}`,
              );
              return;
            }
            await runtime.sendDetail(ctx, event, keyword);
            return;
          }

          const result = await runtime.generateFromInput(
            ctx,
            event,
            passThrough,
            {
              send: true,
            },
          );
          if (!result.ok && result.shouldNotice) {
            await notifyByAIRuntime(
              event,
              result.noticeInstruction || `meme 生成失败：${result.message}`,
              result.message,
            );
          }
          return;
        }

        if (!directText) {
          return;
        }

        const directMatch = runtime.findMatch(directText);
        if (!directMatch) {
          return;
        }

        if (/(详情|帮助|成分)$/.test(directMatch.rest)) {
          if (!runtime.getDetail(directMatch.keyword)) {
            await notifyByAIRuntime(
              event,
              `用户查询了不存在的表情详情关键词 "${directMatch.keyword}"。请自然提醒先搜索可用关键词`,
              `未找到表情关键词：${directMatch.keyword}`,
            );
            return;
          }
          await runtime.sendDetail(ctx, event, directMatch.keyword);
          return;
        }

        const directResult = await runtime.generateFromInput(
          ctx,
          event,
          directText,
          {
            send: true,
          },
        );
        if (!directResult.ok && directResult.shouldNotice) {
          await notifyByAIRuntime(
            event,
            directResult.noticeInstruction ||
              `meme 生成失败：${directResult.message}`,
            directResult.message,
          );
        }
      } catch (error) {
        await notifyByAIRuntime(
          event,
          `meme 插件执行失败，错误信息：${error}。请自然告诉用户当前处理失败并建议稍后重试`,
          `meme 插件执行失败：${error}`,
          error,
        );
      }
    });

    return () => {
      for (const dispose of disposers) dispose();
      if (aiService) aiService.removeSkill("meme");
      ctx.logger.info("meme 插件已卸载");
    };
  },
});

export default memePlugin;
