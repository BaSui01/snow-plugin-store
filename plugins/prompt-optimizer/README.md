# 提示词优化 / Prompt Optimizer 1.1.0

Snow App ESM 插件，参考 [Issue #162](https://github.com/MayDay-wpf/snow-app/issues/162)。**右侧面板负责配置，输入栏魔杖负责执行**，不读取 API 密钥，不自行适配供应商，不自动发送消息。

## 使用

### 首次启用

启动包含本次宿主增强的 Snow App **新构建**，然后进入「插件 → 插件列表 → 面板插件」，对提示词优化点击「重新读取清单」。仅刷新旧应用或安装插件不能加载新增 native / IPC / renderer 能力。旧宿主登记数据未保留 `chatInputAction` 等新字段时，必须在增强版中重新读取清单或重新安装。

### 一次配置

点击输入工具栏魔杖旁的**齿轮**，或从顶栏加号菜单的插件分组打开「优化提示词配置」。面板仅包含配置，不是优化操作台：

| 配置 | 默认值 / 说明 |
| --- | --- |
| 策略 | 保真增强；可选择结构化任务、精简去冗余、自定义 |
| 优化提示词 | 可编辑的 meta-prompt，用于指导优化模型，不是聊天草稿 |
| 上下文 | 当前会话最近 3 轮文本，可选 1–10 轮或仅草稿 |
| 模型 | 留空使用宿主 basic model，支持模型覆盖 |
| 长度 | 尽量保持原长度，可适度展开已有信息或精简 |
| 表达结构 | 自然段落，可按已有信息分节 / 列点 |
| 回填 | 默认成功后自动回填；关闭后在输入区小预览确认应用 |

编辑后点击「保存配置」。未保存的修改不影响输入栏动作；每次执行会读取最新已保存配置。「查看实际发送的优化规则」可预览当前 meta-prompt 与策略、长度和表达偏好的组合。恢复默认配置需要在面板二次确认，且不修改聊天草稿。

升级旧 1.0 配置时保留已有模型与上下文轮数，其他新配置采用上述默认值；旧对比显示偏好不再使用。

### 日常一键使用

1. 在聊天输入框写好草稿。
2. 点击右下工具栏中**模型选择器左侧的魔杖**，不是输入框顶部右上角。无需打开配置面板。
3. 首次使用或实际历史共享模式变化时，宿主 Modal 提示 API 服务、草稿 / 历史共享范围及费用。确认后开始；关闭 / 拒绝则不请求模型。确认记录仅保存版本与历史共享模式。
4. 生成期间原稿保持不变，魔杖显示执行状态；再次点击仅取消本次优化，不停止普通聊天。
5. 默认成功后自动回填输入框，旁边显示显眼「还原」。附件与引用 chip 原样保留，按原顺序放在文本末尾。**发送始终由用户决定。**
6. 若关闭自动回填，结果在输入区小预览中显示，点击「应用」后同样提供还原；不必回到配置面板。

用户在生成期间编辑草稿时，令牌校验拒绝覆盖，并把结果作为只读预览供复制，不重新捕获新草稿强行应用。切换会话 / 项目、API 参数变化、开始运行、插件更新 / 禁用、输入区卸载会取消旧操作并失效回调；已有结果可保留为仅复制的预览。

应用和还原令牌单次使用、5 分钟有效。编辑过优化后的草稿则不能强行还原，以保护新内容。再次点击优化会丢弃上次还原记录，以当时草稿为新原文。打开配置齿轮会失效上次 Action（包含待应用 / 还原回调），避免旧策略继续回填。

新会话没有历史，仅优化草稿。空输入 / 只有附件 / API 不可用 / 流式、停止、压缩中时执行按钮禁用；齿轮仍可配置。

## 隐私与边界

- 模块 import、面板打开、配置保存和订阅都不调用 AI。只有用户点击魔杖才执行 Action。
- 声明 `messages`，仅供已确认的上下文策略读取指定会话文本。默认上下文模式也须先确认历史共享。
- 不读取附件、文件、图片、思维链、工具结果或 API 密钥。宿主请求不保存为会话消息，不注入普通聊天 ROLE，不执行工具。
- 仅持久化配置与费用确认；不持久化草稿、历史、结果或应用 / 还原令牌。
- 自定义 meta-prompt 最多 7000 Unicode 码点，完整策略最多 8000 码点；仍受宿主只改写、不执行、不编造的固定规则约束。
- 这是宿主提示约束，不是对所有模型输出质量的绝对保证，发送前仍应检查结果。
- 仅 ESM 支持 Action，不支持 iframe，也不提供 DOM / 普通聊天 fallback。

## 宿主契约

按 `D:/code/snow-app/docs/zh-CN/2-使用指南/24-插件开发与安装.md` §6.1 实现：

```text
panels[].chatInput = true
panels[].chatInputAction = "optimizeDraft"
panels[].chatInputTitle = 本地化执行标题

export async optimizeDraft({ api, signal, onStatus, confirm })
  -> { message?, preview?, apply?, undo? }
```

生成接口使用 `api.ai.optimizePrompt({ draft, conversationId?, model?, contextRounds?, includeContext?, optimizationInstructions?, signal? })`。回填与还原仅通过 `chatInput.captureDraft`、`chatInput.applyDraft`、`chatInput.restoreDraft` 进行，不猜写 DOM。

这些能力是本次在宿主源码新增的，旧版 `0.4.15` 不保证具备。版本号相同不能表示运行代码已经更新，需要完整新构建及清单重读。

## 安装与验证

源码目录：`D:/code/snow-plugin-store/plugins/prompt-optimizer`，ID：`com.snow.prompt-optimizer`。已有插件使用相同目录原地更新并保留启用状态：

```text
config-set scope=plugins key=com.snow.prompt-optimizer value={sourceDir: "D:/code/snow-plugin-store/plugins/prompt-optimizer"}
```

入口直接使用宿主 React，无需打包或下载依赖。`npm run check` 仅检查 JS 语法；三语资源与清单另做静态检查。没有新增测试。真实供应商联网、取消、自动回填、失效保护、还原和配置保存后生效仍需在增强版桌面端人工验收，静态检查不等同业务验收。本任务未发布 Release、修改市场索引或部署运行中的应用。

## English

The right panel is **settings only**. Configure and save the meta-prompt, strategy, context, model, length, presentation and fill mode. Defaults: faithful refinement, three recent context rounds, basic model and automatic fill on success.

Use the input-toolbar **wand** to optimize without opening settings. First use or a history-sharing mode change asks for API/fee acknowledgment. The input stays unchanged during generation; click the wand again to cancel. Successful output fills the input, with **Undo** and no auto-send. An optional input-area preview mode offers **Apply**. Newer user edits are never overwritten with stale output.

Requires the latest host enhancements plus a manifest reload. The configuration gear remains available with an empty draft or unavailable API. No provider keys, draft persistence, automatic execution or ordinary-chat fallback.
