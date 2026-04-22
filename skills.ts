import type { AISkill, AITool } from "../../src";
import type { MemeImageSourceOptions } from "./types";
import { getMemeRuntimeState } from "./runtime";

function parseImageSource(args: any): {
  ok: boolean;
  source?: MemeImageSourceOptions;
  message?: string;
} {
  const sourceType = String(args?.source_type || "").trim();
  if (!sourceType) {
    return {
      ok: false,
      message: "缺少 source_type。可选值: user_avatar 或 message_image。",
    };
  }

  if (sourceType === "user_avatar") {
    const qq = Number(args?.qq);
    if (!Number.isFinite(qq) || qq <= 0) {
      return {
        ok: false,
        message: "source_type=user_avatar 时必须提供有效的 qq。",
      };
    }
    return {
      ok: true,
      source: {
        type: "user_avatar",
        qq,
      },
    };
  }

  if (sourceType === "message_image") {
    const messageId = Number(args?.message_id);
    if (!Number.isFinite(messageId) || messageId <= 0) {
      return {
        ok: false,
        message: "source_type=message_image 时必须提供有效的 message_id。",
      };
    }
    return {
      ok: true,
      source: {
        type: "message_image",
        messageId,
      },
    };
  }

  return {
    ok: false,
    message: "source_type 无效。只能是 user_avatar 或 message_image。",
  };
}

const memeSkills: AISkill[] = [
  {
    name: "meme",
    description:
      "搜索,制作和发送各种各样的表情包,可以使用聊天中的图片或用户头像制作,如制作摸别人活其他的表情",
    permission: "member",
    tools: [
      {
        name: "search_memes",
        description: "按关键词搜索可用的 meme 表情关键词",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "搜索关键词，可以是中文或英文片段",
            },
          },
          required: ["query"],
        },
        handler: async (args: any) => {
          const runtime = getMemeRuntimeState().runtime;
          if (!runtime) {
            return "meme 插件尚未初始化";
          }

          await runtime.ensureCache();
          const hits = runtime.searchKeywords(String(args?.query || ""));
          return hits.length > 0
            ? hits.join("、")
            : "没有找到匹配的 meme 关键词";
        },
      } as AITool,
      {
        name: "send_meme",
        description:
          "发送 meme。必须指定图片来源：用户头像(qq)或聊天图片(message_id)。",
        parameters: {
          type: "object",
          properties: {
            keyword: {
              type: "string",
              description: "要生成的 meme 关键词",
            },
            text: {
              type: "string",
              description: "文本内容，多段文本用 / 分隔",
            },
            args: {
              type: "string",
              description: "额外参数，例如 圆、左、循环 等",
            },
            source_type: {
              type: "string",
              description: "图片来源类型，只能是 user_avatar 或 message_image",
              enum: ["user_avatar", "message_image"],
            },
            qq: {
              type: "number",
              description: "source_type=user_avatar 时必填，头像对应 QQ 号",
            },
            message_id: {
              type: "number",
              description:
                "source_type=message_image 时必填，包含图片的消息 message_id",
            },
          },
          required: ["keyword", "source_type"],
        },
        handler: async (args: any, runtimeCtx?: any) => {
          const runtime = getMemeRuntimeState().runtime;
          const ctx = runtimeCtx?.ctx;
          const event = runtimeCtx?.event || runtimeCtx?.rawEvent;
          if (!runtime) {
            return "meme 插件尚未初始化";
          }
          if (!ctx || !event) {
            return "当前上下文不支持发送 meme";
          }

          const source = parseImageSource(args);
          if (!source.ok) {
            return source.message || "图片来源参数不合法";
          }

          const result = await runtime.generateByKeyword(ctx, event, {
            keyword: String(args?.keyword || ""),
            text: args?.text ? String(args.text) : "",
            args: args?.args ? String(args.args) : "",
            imageSource: source.source,
            send: true,
          });
          return result.message;
        },
      } as AITool,
    ],
  },
];

export default memeSkills;
