# Meme Plugin

Mioku 的 `meme` 插件，用来接入 `meme-generator` API，在聊天中搜索、查看和生成表情包。

## 功能

- 支持 `meme` 菜单、搜索、详情、更新
- 支持直接用表情关键词生成表情
- 支持 AI 调用 `search_memes` 和 `send_meme`
- 支持 WebUI 配置页
- 支持黑名单关键词拦截
- 支持用户头像或指定消息图片作为生成来源

## 使用

这个插件依赖一个单独运行的 `meme-generator` API 服务

默认 API 地址：

```text
http://127.0.0.1:2233
```

你可以在 WebUI 或配置文件里修改

## 搭建 Meme API

- GitHub: https://github.com/MeetWq/meme-generator
- Docker Hub: https://hub.docker.com/r/meetwq/meme-generator
