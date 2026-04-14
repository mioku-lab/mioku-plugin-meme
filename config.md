---
title: Meme 插件配置
description: 在这里调整表情包插件的配置
fields:
  - key: base.api.baseUrl
    label: Meme API 地址
    type: text
    description: meme-generator 服务地址,可自行搭建
    placeholder: http://127.0.0.1:2233

  - key: base.api.timeoutMs
    label: 请求超时毫秒
    type: number
    description: 访问 meme API 的超时时间
    placeholder: 15000

  - key: base.trigger.requirePrefix
    label: 命令是否要求前缀
    type: switch
    description: 开启后，菜单/搜索/更新等命令必须带前缀

  - key: base.trigger.prefixes
    label: 命令前缀列表
    type: json
    description: 命令识别前缀数组。默认是 [\"/\", \"#\"]。

  - key: base.trigger.directKeywordNeedPrefix
    label: 关键词是否要前缀
    type: switch
    description: 控制 `<表情关键词> [文本][#参数]` 这种是否必须带前缀

  - key: base.behavior.quoteReply
    label: 生成结果是否引用
    type: switch
    description: 发送生成图片时是否附带引用回复段

  - key: base.behavior.useSenderAvatarFallback
    label: 使用发送着头像
    type: switch
    description: 在自动取图模式下，如果消息和引用里都没有图，是否自动使用发送者头像进行制作

  - key: base.behavior.includePreviewInDetail
    label: 详情页附带预览图
    type: switch
    description: 执行“meme 详情 关键词”时是否再拉取一张预览图

  - key: base.behavior.maxSearchResults
    label: 搜索结果上限
    type: number
    description: 单次搜索返回的关键词最大条数
    placeholder: 20

  - key: base.cache.refreshOnStartup
    label: 启动自动刷新缓存
    type: switch
    description: 开启后插件每次启动都会重新拉取关键词和菜单图,关闭则优先使用本地缓存

  - key: base.permissions.ownerOnlyUpdate
    label: 更新是否仅主人可用
    type: switch
    description: 控制“meme 更新”命令的权限。开启后只有 owner 能手动刷新缓存

  - key: filters.enabled
    label: 是否启用黑名单
    type: switch
    description: 开启后命中黑名单关键词会阻止生成

  - key: filters.blockedKeywords
    label: 黑名单关键词列表
    type: json
    description: 关键词数组,命中任意一项即视为黑名单触发

  - key: filters.replyOnBlocked
    label: 黑名单命中时是否回复
    type: switch
    description: 关闭则静默拦截不回消息
---

```mioku-fields
keys:
  - base.api.baseU
  - base.api.timeoutMs
  - base.trigger.requirePrefix
  - base.trigger.prefixes
  - base.trigger.directKeywordNeedPrefix
```

```mioku-fields
keys:
  - base.behavior.quoteReply
  - base.behavior.useSenderAvatarFallback
  - base.behavior.includePreviewInDetail
  - base.behavior.maxSearchResults
  - base.cache.refreshOnStartup
  - base.permissions.ownerOnlyUpdate
```

```mioku-fields
keys:
  - filters.enabled
  - filters.blockedKeywords
  - filters.replyOnBlocked
```
