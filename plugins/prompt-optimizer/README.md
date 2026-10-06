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
| 模型服务 | 首次或没有明确选择时，元数据加载后默认选中唯一 `isActive` 服务；仍可手动切换，已保存明确选择不随活动服务回退 |
| 模型 | 仅选择该服务的 `basicModel` / `advancedModel`，去重且不含视觉模型，不提供手填入口 |
| 长度 | 尽量保持原长度，可适度展开已有信息或精简 |
| 表达结构 | 自然段落，可按已有信息分节 / 列点 |
| 回填 | 默认成功后自动回填；关闭后在输入区小预览确认应用 |

配置页按优化规则、上下文与模型、结果回填分组，短字段在宽面板显示两列、窄面板单列；meta-prompt 计数使用 Unicode 码点。长说明默认折叠，底部固定显示保存动作和状态。读取失败可重新读取。

编辑后点击「保存配置」。未保存的修改不影响输入栏动作；每次执行会读取最新已保存配置。「查看实际发送的优化规则」可预览当前 meta-prompt 与策略、长度和表达偏好的组合。恢复默认配置需要在面板二次确认，且不修改聊天草稿。

首次或 `apiProfile` 与 `model` 均为空时，配置读取成功且元数据加载后，面板默认选中唯一活动服务的 `basicModel`；这是未保存选择，不自动写数据库，需点击保存后才实际执行。已有明确选择（包括部分选择或失效值）不被覆盖、不静默回退。缺少唯一活动服务或基础模型时明确提示，不能自动假选高级模型；仍可手动选择服务及其有效模型。切换服务时选该服务基础模型，缺基础模型则留空，需手动选择。重新读取服务不会丢失正在编辑的其他配置。每次执行重新读取档案并校验已保存服务与模型，失效或读取失败即报错，不回退其他服务。没有旧配置迁移或手填模型兼容分支。恢复默认配置保留当前有效服务与模型，只恢复优化规则等偏好。

### 配置存储与实际生效

配置由 `api.storage.setJson("preferences", value)` 保存为 JSON 字符串，位于宿主 SQLite 的 `app_plugin_values` 表：`plugin_id = com.snow.prompt-optimizer`、`key = preferences`，复合主键为 `(plugin_id, key)`。默认数据库路径是 `~/.snowapp/snowapp.db`，不是插件目录里的配置文件；`app_plugins` 只登记插件清单和安装信息。偏好不按项目或会话分开。实际运行数据库、已安装版本及当前保存值需另行核实。

`defaults()` 从当前界面语言包的 `defaultPrompt` 提供优化提示词；保存的 `optimizationPrompt` 字符串优先，改变源码默认值不会覆盖已保存值。每次点击魔杖，宿主创建 fresh API 读取数据库值，再由插件 `normalize()` 只保留上述有效字段；不迁移旧字段。配置面板的预览使用当前编辑值，执行使用已保存值。

`buildInstructions()` 将优化提示词、策略、长度和表达结构合并为 `optimizationInstructions`。宿主 `native/src/api/prompt_optimization.rs` 的 `build_request()` 将它追加到固定 `META_PROMPT` 后的 system 消息，固定安全规则仍有效；user 消息是包含 `draft` 和可选 `history` 的 JSON 数据。模型服务与模型决定请求服务，上下文模式与轮数决定历史范围，自动回填只控制结果应用，不改变优化指令。

### 优化网络搜索功能的提示词

此插件没有独立的网络搜索优化提示词或搜索配置，也不读取宿主搜索工具提示词。要改写用于网络搜索功能的提示词，需将其文本放入聊天输入草稿，点击魔杖；仍使用同一套已保存优化规则，可选择「仅优化草稿」排除会话历史。优化请求设置 `skip_context = true`、`disable_tools = true`，只改写文本，不执行网络搜索，也不保存或安装改写结果为宿主搜索配置。

### 日常一键使用

1. 在聊天输入框写好草稿。
2. 点击右下工具栏中**模型选择器左侧的魔杖**，不是输入框顶部右上角。无需打开配置面板。
3. 点击即按最新已保存配置直接执行，不弹确认窗，也不写入确认记录。配置页常驻披露草稿 / 所选上下文共享与可能产生的 API 费用。
4. 生成期间原稿保持不变，魔杖显示执行状态；再次点击仅取消本次优化，不停止普通聊天。
5. 默认成功后自动回填输入框，旁边显示显眼「还原」。附件与引用 chip 原样保留，按原顺序放在文本末尾。**发送始终由用户决定。**
6. 若关闭自动回填，结果在输入区小预览中显示，点击「应用」后同样提供还原；不必回到配置面板。

用户在生成期间编辑草稿时，令牌校验拒绝覆盖，并把结果作为只读预览供复制，不重新捕获新草稿强行应用。切换会话 / 项目、API 参数变化、开始运行、插件更新 / 禁用、输入区卸载会取消旧操作并失效回调；已有结果可保留为仅复制的预览。

应用和还原令牌单次使用、5 分钟有效。编辑过优化后的草稿则不能强行还原，以保护新内容。再次点击优化会丢弃上次还原记录，以当时草稿为新原文。打开配置齿轮会失效上次 Action（包含待应用 / 还原回调），避免旧策略继续回填。

新会话没有历史，仅优化草稿。空输入 / 只有附件 / API 不可用 / 流式、停止、压缩中时执行按钮禁用；齿轮仍可配置。

## 隐私与边界

- 模块 import、面板打开、配置保存和订阅都不调用 AI。只有用户点击魔杖才执行 Action。
- 声明 `messages`，仅按最新已保存的上下文策略读取指定会话文本；新会话没有历史时仅处理草稿。
- 不读取附件、文件、图片、思维链、工具结果或 API 密钥。宿主请求不保存为会话消息，不注入普通聊天 ROLE，不执行工具。
- 仅持久化配置；不读取或写入费用 / 隐私确认记录，不持久化草稿、历史、结果或应用 / 还原令牌。旧版本已有确认记录不参与执行，亦不伪造或更新。
- 自定义 meta-prompt 最多 7000 Unicode 码点，完整策略最多 8000 码点；仍受宿主只改写、不执行、不编造的固定规则约束。
- 这是宿主提示约束，不是对所有模型输出质量的绝对保证，发送前仍应检查结果。
- 仅 ESM 支持 Action，不支持 iframe，也不提供 DOM / 普通聊天 fallback。

## 宿主契约

按 `D:/code/snow-app/docs/zh-CN/2-使用指南/24-插件开发与安装.md` §6.1 实现：

```text
panels[].chatInput = true
panels[].chatInputAction = "optimizeDraft"
panels[].chatInputTitle = 本地化执行标题

export async optimizeDraft({ api, signal, onStatus })
  -> { message?, preview?, apply?, undo? }
```

生成接口使用 `api.ai.optimizePrompt({ draft, conversationId?, apiProfile, model, contextRounds?, includeContext?, optimizationInstructions?, signal? })`。`apiProfile` 明确传入所选档案的 `profileName`，`model` 传入该档案的有效模型。宿主须保证显式档案优先于会话绑定且显式档案不存在时报错，不回退其他服务；上下文仍由 `conversationId` 定位。回填与还原仅通过 `chatInput.captureDraft`、`chatInput.applyDraft`、`chatInput.restoreDraft` 进行，不猜写 DOM。

模型服务通过 `api.metadata.get("apiProfiles")` 获取，读取 `response.domains.apiProfiles` 数组，仅投影 `profileName`、`displayName`、`isActive`、`basicModel`、`advancedModel`，不声明 `apiKeys`。非实时域在面板打开、手动重读和每次执行时重新读取；响应为空数组与读取失败 / `null` 分别处理。

这些能力是本次在宿主源码新增的，旧版 `0.4.15` 不保证具备。版本号相同不能表示运行代码已经更新，需要完整新构建及清单重读。

## 安装与验证

源码目录：`D:/code/snow-plugin-store/plugins/prompt-optimizer`，ID：`com.snow.prompt-optimizer`。已有插件使用相同目录原地更新并保留启用状态：

```text
config-set scope=plugins key=com.snow.prompt-optimizer value={sourceDir: "D:/code/snow-plugin-store/plugins/prompt-optimizer"}
```

入口直接使用宿主 React，无需打包或下载依赖。`npm run check` 仅检查 JS 语法；三语资源与清单另做静态检查。没有新增测试。真实供应商联网、取消、自动回填、失效保护、还原和配置保存后生效仍需在增强版桌面端人工验收，静态检查不等同业务验收。本任务未发布 Release、修改市场索引或部署运行中的应用。

## English

The right panel is **settings only**. Configure and save the meta-prompt, strategy, context, model service, model, length, presentation and fill mode. With no explicit selection, the panel defaults to the unique active host service's basic model after metadata loads; saving is required and never automatic. Existing explicit selections are preserved and invalid ones fail closed. Missing active/basic metadata never falls back to an advanced model. Services and their basic/advanced models remain manually selectable; no vision models, manual model input or legacy migration. Switching services selects its basic model or leaves the model empty for manual selection. Every run reloads and validates the saved service/model. Defaults: faithful refinement, three recent context rounds and automatic fill on success. Reset keeps the selected service and model.

Use the input-toolbar **wand** to optimize without opening settings. Every explicit click runs immediately with the latest saved settings, without an acknowledgment dialog or acknowledgment persistence. The settings page discloses draft/context sharing and potential API charges. The input stays unchanged during generation; click the wand again to cancel. Successful output fills the input, with **Undo** and no auto-send. An optional input-area preview mode offers **Apply**. Newer user edits are never overwritten with stale output.

Requires the latest host enhancements plus a manifest reload. The configuration gear remains available with an empty draft or unavailable API. No provider keys, draft persistence, automatic execution or ordinary-chat fallback.
