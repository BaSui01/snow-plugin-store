# 会话文件统计 / Session File Count

支持消息结束插槽与右侧详情面板的只读 Snow App 插件。只订阅 `runtime`，只读取当前 `conversationId` 的记录；不自行扫描 Git、不执行命令、不读取消息正文、不联网、不持久化路径或差异。

## 使用

在支持插槽的 Snow App 中启用本插件，**Agent 本轮结束后的最新回复正文下方、消息操作按钮之前** 自动显示紧凑文件卡片：默认四条路径，可展开全部；运行、暂停或停止中不显示。卡片由插件 `footer.js` 提供，不是宿主原生文件统计 UI，也不需要打开插件面板。禁用或卸载插件会移除卡片、样式与订阅；底层数据采集与历史记录仍由宿主提供。显示当前会话累计记录，含该会话的子代理；新增/删除行数只来自各文件最后一条已知 diff，不冒称累计净差异。终端没有行级 diff 时显示「行数未采集」。

右侧插件面板作为详细查询入口：

1. 安装后打开顶栏加号 → 插件 → **会话文件统计**。
2. 在聊天区打开一个已有会话，面板自动跟随该会话。
3. 本轮运行结束后自动展示累计数量；继续追问继续累计，切换会话不混算。
4. 可按路径、来源筛选。展开「采集范围与缺口」查看未采集或超限原因。
5. 父会话包含它发起的子代理记录；打开子代理会话则只显示该子代理。

插件包：`plugin.json`、`index.js`（详情面板）、`footer.js`（结束卡片）、`style.css`、`footer.css`、`assets/icon.svg`、`locales/{zh-CN,zh-TW,en}.json`。版本 `1.1.0` 起展示层完全由插件提供。

## 应用能力要求

增强后的 Snow App 提供：

- `api.ui.messageFooterVersion === 1`：通用消息结束插槽，旧宿主缺少时仅显示面板并提示升级。
- `runtime.conversation.fileChangeTrackingVersion === 1`
- `fileChangeStats[conversationId]`：原始累计文件记录，使用 `fileKey ?? filePath` 去重。
- `fileChangeCoverage[conversationId]`：工具采集覆盖记录，与文件数独立。

应用源码增强位于 `D:/code/snow-app`，必须构建并运行增强后的应用才能生效。插件安装不会自动部署应用源码。

旧版本可显示已有文件工具记录，但会明确提示升级；没有增强契约时不声称终端采集或路径已规范化。应用 `minAppVersion` 不是能力探测，本插件直接检查契约版本。

## 统计口径与边界

- **已记录唯一文件**：所有可用记录去重后的总数，不是最终净 Git 改动数，也不是编辑次数。
- **文件工具确认**：专用文件工具成功写入记录，有规范化身份键。
- **终端检测（部分）**：真实执行目录对应采集根在命令执行前后的内容指纹变化；同文件可与文件工具来源重叠，来源计数不能直接相加。
- **旧记录**：缺少规范化身份或来源，保留原路径显示，可能无法合并不同写法。
- 分支不是归属键：共享目录按 Snow 受控写入协调；独立工作树按实际物理路径隔离。
- 终端最多为部分覆盖：人工/外部进程并发、既有后台/PTY、外部路径、修改后在同一命令中恢复原样等不保证归属或覆盖。detach/SSH 未完整采集。
- Git 扫描范围为已跟踪和未跟踪、排除 ignored。非 Git 扫描排除常见 build/dependency 目录与 symlink。
- 应用默认上限：每轮 2048 文件、8192 枚举条目、单文件 4 MiB、总内容 32 MiB、3 秒；Git 清单 1 MiB，返回变更 256 文件。超限有理由标记，缺失不能视为未修改。
- 插件列表最多展示 500 个匹配文件；上方数量按全部可用记录计算。路径筛选可查其他已取得记录。
- 历史从实际工具结果恢复；隐私过滤、工具结果截断、旧历史可能使记录不可用。没有记录不代表没有修改。
- 不提供 OS 级审计，也不展示“绝对准确／完整”的终端计数。

## 本地安装

使用 Snow App 配置工具：

```text
config-set scope=plugins key=new
value={"sourceDir":"D:/code/snow-plugin-store/plugins/session-file-count"}
```

重复安装同 ID 会替换已安装插件目录；后续更新前应确认覆盖对象。源目录修改不会自动更新已安装副本。

## 插槽与生命周期

`plugin.json` 的顶层 `contributions.messageFooters` 声明 `{ id: "files", entry: "footer.js", exportName: "mountFooter" }`。宿主提供通用插槽，不编码本插件 ID，也不负责文件列表布局。

`mountFooter(container, api, context, signal)` 在专属容器中同步挂载，并返回清理函数；`context` 包含冻结的会话、回复与已知目录身份，不传消息正文。插槽 API 仅有元数据、资源、翻译和 UI 等只读能力，仍遵守原隐私声明；不暴露写入、AI、网络或持久化接口。

`metadata.subscribe` 返回 Promise，面板和卡片都等待订阅句柄；禁用、卸载、切会话、新 run 或语言切换后，宿主取消 signal 并回收订阅、样式及 DOM。插件也清理自身监听。迟到的订阅不再挂回界面。ESM 仍是可信本地代码，不是沙箱隔离；本插件只操作传入容器，不查询或注入聊天 DOM。

## English

With this plugin enabled on a host supporting `api.ui.messageFooterVersion === 1`, a compact card appears below the latest completed Agent reply, before message actions. The card is provided by this plugin's `footer.js`, not by a native statistics component. It defaults to four files and can expand. Disabling or uninstalling removes its card, styles and subscriptions; host collection and history remain intact.

Open **+ → Plugins → Session Files** for the detail panel. Both views follow only the focused conversation and include its own sub-agents. Counts are cumulative across runs, not repository-wide or net Git diffs. Source counts overlap; the total deduplicates by the host's `fileKey`. Line counts represent the latest known diff fragments, not cumulative net changes.

The host and data contracts are detected at runtime. Older hosts show an upgrade warning without a DOM-injection fallback. Terminal collection is bounded before/after content comparison, not OS auditing; background, external and manual writes may be untracked or unattributable. Expand coverage details. Installing this plugin does not build or deploy the enhanced Snow App.

## 验证说明

仅可运行现有静态检查、构建与相关既有测试。本任务不新增测试或临时测试脚本。插件语法/资源检查、应用编译、安装登记与实机端到端验收是不同证据；未进行的验收不得宣称通过。
