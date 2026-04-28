import type { AIService } from "../../src/services/ai/types";
import type { ConfigService } from "../../src/services/config/tpyes";
import { definePlugin, type MiokiContext } from "mioki";
import { MEME_BASE_CONFIG } from "./configs/base";
import { MEME_FILTER_CONFIG } from "./configs/filters";
import { MemePluginRuntime, replyWithParts } from "./shared";
import { resetMemeRuntimeState, setMemeRuntimeState } from "./runtime";
import type { MemeBaseConfig, MemeFilterConfig } from "./types";

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
  version: "1.0.0",
  description: "基于 meme-generator API 的表情包制作插件",

  async setup(ctx: MiokiContext) {
    const configService = ctx.services?.config as ConfigService | undefined;
    const aiService = ctx.services?.ai as AIService | undefined;

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
      const chatRuntime = aiService?.getChatRuntime();
      if (chatRuntime) {
        try {
          await chatRuntime.generateNotice({
            event,
            instruction,
            send: true,
            promptInjections: [
              {
                title: "Meme Plugin Error Handling",
                content:
                  "You are responding for meme plugin validation or execution failure. Keep it brief, natural, and actionable.",
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

    setMemeRuntimeState({ runtime });

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

    ctx.handle("message", async (event: any) => {
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
        if (
          commandText &&
          (/^(?:表情|meme)包?(?:菜单|展示|制作(?:列表)?)$/i.test(commandText) ||
            /^meme\s+(?:菜单|列表|展示)$/i.test(commandText))
        ) {
          await runtime.sendMenu(ctx, event);
          return;
        }

        if (commandText && /^随机(?:表情|meme)(?:包)?$/i.test(commandText)) {
          await runtime.sendRandom(ctx, event);
          return;
        }

        if (
          commandText &&
          (/^(?:(?:头像|文字)?(?:表情|meme)包?(?:制作(?:菜单|教程)?|帮助|说明|指令|使用说明)|(?:头像|文字)(?:表情|meme)包?)$/i.test(
            commandText,
          ) ||
            /^meme\s+帮助$/i.test(commandText))
        ) {
          await runtime.sendHelp(ctx, event);
          return;
        }

        const searchMatch = commandText.match(
          /^(?:表情|meme)包?(?:搜索|检索)\s*(.*)$/i,
        );
        if (searchMatch) {
          const query = (searchMatch[1] || "").trim();
          if (!query) {
            await notifyByAIRuntime(
              event,
              "用户发起了 meme 搜索但没有给关键词。请自然提醒他补一个搜索词",
              "你想搜什么？",
            );
            return;
          }
          await runtime.sendSearch(ctx, event, query);
          return;
        }

        const detailCommandMatch =
          commandText.match(/^meme包?\s+详情\s+(.+)$/i);
        if (detailCommandMatch) {
          const keyword = detailCommandMatch[1].trim();
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

        if (
          commandText &&
          (/^(?:表情|meme)包?更新$/i.test(commandText) ||
            /^meme\s+更新$/i.test(commandText))
        ) {
          if (baseConfig.permissions.ownerOnlyUpdate && !ctx.isOwner(event)) {
            await notifyByAIRuntime(
              event,
              "用户尝试刷新 meme 缓存，但权限不足。请自然提醒该操作仅主人可用",
              "不支持小男娘使用喵",
            );
            return;
          }

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
          return;
        }

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
      for (const dispose of disposers) {
        dispose();
      }
      resetMemeRuntimeState();
      ctx.logger.info("meme 插件已卸载");
    };
  },
});

export default memePlugin;
