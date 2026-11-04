<p align="center">
  <img src="icon.svg?v=2" width="96" height="96" alt="dsh-egm 标志：大象的前半身与金鱼的尾巴，在分割处切开">
</p>

<h1 align="center">dsh-egm</h1>

<p align="center"><a href="README.md">English</a> &ensp;·&ensp; 简体中文</p>

<p align="center">
  <sub>本页为自动翻译，可能存在不准确之处；欢迎提交 PR 修正语法或含义。</sub>
</p>

<p align="center"><strong>用大象做设计，用金鱼做评审。</strong></p>

<p align="center">
  <a href="#安装">安装</a> &ensp;·&ensp;
  <a href="#快速开始">快速开始</a> &ensp;·&ensp;
  <a href="#工作原理">工作原理</a> &ensp;·&ensp;
  <a href="#示例运行">示例运行</a> &ensp;·&ensp;
  <a href="VERIFICATION.md">验证</a> &ensp;·&ensp;
  <a href="CHANGELOG.md">更新日志</a> &ensp;·&ensp;
  <a href="#许可证与署名">许可证</a>
</p>

<p align="center">
  <a href="LICENSE"><img alt="许可证：Apache-2.0" src="https://img.shields.io/badge/license-Apache--2.0-blue.svg"></a>
  <a href="https://github.com/dryw/dsh-egm/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/dryw/dsh-egm/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://dsh-plugin.org/plugins/dryw/dsh-egm"><img alt="已收录于 dsh-plugin.org" src="https://dsh-plugin.org/badges/listed.svg"></a>
  <a href="https://www.npmjs.com/package/dsh-egm"><img alt="npm: dsh-egm" src="https://img.shields.io/npm/v/dsh-egm"></a>
  <img alt="DeepSeek Harness 0.2.x" src="https://img.shields.io/badge/DSH-0.2.x-4c1.svg">
  <img alt="node --test" src="https://img.shields.io/badge/gate-node%20--test-brightgreen.svg">
</p>

<p align="center">
  <sub>Google 的 Elephant-Goldfish Model 的独立社区移植版。与 Google 无隶属关系，也未获其认可。</sub>
</p>

`dsh-egm` 以原生插件的形式，将 [Elephant-Goldfish Model](https://github.com/google/elephant-goldfish-model)（EGM）引入 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)。一个上下文丰富的 **Elephant** 会话会先向你提问，再起草设计文档；随后，使用全新上下文的只读 **Goldfish** 评审者会挑出其中的歧义、隐藏假设和实现缺口；**你**负责做出取舍，并在编写任何代码之前批准设计规格。

当一项改动需要先做设计决策时，使用它；对于小而明确的缺陷修复，沿用你平常的编码流程。

## 工作原理

![Elephant Goldfish 简化工作流](diagrams/workflow.svg)

*大象记住上下文，金鱼从头开始。
最后由你拍板。*

| 角色 | 上下文 | 职责 |
|---|---|---|
| **Elephant** | 你的项目、需求以及此前的决策 | 探索问题、讨论取舍，并起草设计规格。 |
| **Goldfish** | 文档及其引用的源材料，不含此前的对话 | 找出缺失的假设、不明确的需求和实现风险。 |
| **你** | 真正重要的目标与约束 | 权衡取舍、批准设计，并决定要构建什么。 |

上游的技能、角色设定和标准都是从锁定的上游提交中**逐字**内置的（见 [ADAPTATIONS.md](ADAPTATIONS.md)）；DeepSeek Harness 的机制则放在一个小型集成层里，宿主插件注册技能时会把这段说明插在技能正文前面。评审者通过插件的 `egm_reviewer` 工具启动，该工具会让它们在随包提供的只读 `egm-reviewer` agent 预设中运行：它们可以读取和搜索文件，但没有写入、编辑、命令、向用户提问、读取会话或委派工具。普通 `subagent` 会继承父会话的工具集，因此绝不用于评审；在同一上下文中进行的评审不算 Goldfish 评审。隔离由宿主强制执行，不靠角色设定中的文字；相关机制、测试和复现命令见 [VERIFICATION.md](VERIFICATION.md)。

## 要求

- `0.2.x` 系列中 `0.2.1-rc.5` 或更新版本的 DeepSeek Harness（`engines.dsh`）；已记录的端到端运行使用的是 `0.2.1-rc.5`。DSH 在评估该范围时会启用 SemVer 预发布匹配。
- Node.js 22 或 24（已通过 CI 测试；`engines.node` 为 `>=22 <25`）。DSH `0.2.2` alpha 系列自行声明了 `node >=24.9` 的要求，因此运行该 DSH 系列时请使用 Node 24.9 及以上版本。
- Linux、macOS 或 Windows。CI 在 Ubuntu 上以 Node 22 和 24 运行测试套件，在 Windows 上以 Node 24 运行。
- 一个 Harness 组合，包含技能注册表、工具注册表、subagent 服务、agent 预设服务和进程内的 `spawn` subagent 提供方。插件会安装 `egm-reviewer` 预设以及选择该预设的 `egm_reviewer` 工具。

## 安装

安装到某个 profile 中——示例使用 `web`，请替换为你启动时使用的 profile：

```sh
# from npm: shortest install, and the form the DSH Plugin Hub lists
dsh plugin --profile web add dsh-egm

# from GitHub (before npm, or to pin a revision)
dsh plugin --profile web add github:dryw/dsh-egm#<sha>

# from a local checkout
dsh plugin --profile web add /path/to/dsh-egm

# from a packed tarball
pnpm pack
dsh plugin --profile web add ./dsh-egm-0.2.3.tgz
```

首次安装后重启 Harness，然后在**设置 → 插件**中查看插件条目和图标。

## 快速开始

挑一个需要做设计决策的功能，例如 webhook 投递：当一次投递失败，或者同一个事件到达两次时，应该发生什么？

1. **探索想法** —— 输入 `/egm-brainstorm Add webhook delivery to this project.`，然后讨论需求与取舍。全新的评审者会质疑这个提案，达成一致的方向会保存为 `concepts_brief.md`。
2. **起草设计规格** —— `/egm-draft` 会把简报变成 `docs/designs/` 下的一份逐节展开的设计文档，每写完一节就暂停，等待你在聊天中反馈。
3. **评审草稿** —— `/egm-review docs/designs/webhook-delivery/DESIGN.md` 会依次运行五个 Goldfish 评审阶段，最后再进行一轮综合。用 `/egm-resolve` 选择要处理哪些发现。
4. **人工评审，然后实现** —— 把设计送交人工评审，然后告诉 agent 按已批准的方案实现。

你可以单独使用每项技能；不必遵循完整的顺序。

## 示例运行

仓库中的 [`examples/e2e-verification/`](https://github.com/dryw/dsh-egm/tree/main/examples/e2e-verification) 是对一个小型 fixture 项目的一次已记录运行：来自 `/egm-brainstorm` 的概念简报、来自 `/egm-draft` 的设计，以及来自 `/egm-review` 的全部五份 Goldfish 阶段报告，harness 环境和评审者激活 ID 记录在 [E2E-VERIFICATION.md](https://github.com/dryw/dsh-egm/blob/main/E2E-VERIFICATION.md) 中。它只存在于仓库中，不属于 npm tarball 的一部分。

下面是该次运行中的一条阶段 5 发现，以及它在设计中促成的解决方案：

> **重大 —— 缺少锁接口（设计 §Technical Plan、§Detailed Implementation Plan）。** sweep 需要 `Inventory` 的私有锁覆盖 snapshot → claim → emit 整个过程，但没有为跨模块的锁访问设计任何接口。inventory 应当对外提供加锁的 snapshot，或者提供一个供 sweep 使用的上下文管理器，而不是直接伸进 store 的锁里。
>
> **修订后的设计中记录的解决方案：** 在 `Inventory` 上提供加锁的 snapshot 上下文管理器；契约以不变式和注入端口的形式表述；以 SQLite ledger 为权威来源，JSONL sink 明确为 best-effort。
>
> —— [`examples/e2e-verification/reviews/zoom_out_report.md`](https://github.com/dryw/dsh-egm/blob/main/examples/e2e-verification/reviews/zoom_out_report.md)

## 五阶段协议

下图是完整的五阶段流程（包含可选的 bootstrap 步骤）。

![详细的 Elephant-Goldfish 五阶段协议流程图](diagrams/protocol.svg)

头脑风暴阶段会并行运行六位评审者，每位负责一个视角；正式设计评审则依次运行五个阶段。

### 阶段

- **可选步骤 —— 引导现有项目（`/egm-bootstrap`）。** 当现有代码库缺少文档时，Elephant 梳理代码库、生成 README/`EGM.md` 上下文，并请你验证生成的契约。
- **阶段 1 —— 探索想法（`/egm-brainstorm`）。** Elephant 探索架构并质疑你的假设；你设定目标与约束。随后 Elephant 启动**六位独立、各自使用全新上下文的评审者**，每位对应一个头脑风暴视角：逆向思维 / YAGNI、成本 / 配额 / Token 经济学、UX / 开发者体验（ergonomics）、迁移 / 兼容性、可观测性 / SRE、技术债 / 可维护性。综合后的评审意见会保存为 `concepts_brief.md`。
- **阶段 2 —— 撰写规格（`/egm-draft`）。** Elephant 将简报转化为 `design_draft.md`，并在你评审与决策的同时逐节迭代。
- **阶段 3 —— 挑战设计（`/egm-review`）。** 不带父会话历史的全新评审者阅读设计、相关标准以及明确划定范围的源代码，然后依次执行五个阶段：Initial Zoom Out（视角拉远）、Comprehension（理解力测试）、Design Critique（设计批评）、Intermediate Zoom Out（中间视角拉远）和 Implementation Readiness（实现就绪度）。报告会被保存，发现会呈现给你。
- **阶段 4 —— 解决与批准（`/egm-resolve`）。** 你逐条分类处理发现的问题，获批准的修订会被应用。该过程会反复迭代，直到设计被接受，期间可选择进行一次独立的复审。之后你批准最终规格。阶段 1-4 中不编写任何代码。
- **阶段 5 —— 构建与验证。** 实现遵循已批准的设计；Elephant 实现、测试并汇报结果，你依据规格进行验证。

### 产物

| 产物 | 产生于 | 用途 |
|---|---|---|
| `concepts_brief.md` | 阶段 1 | 达成共识的问题陈述、备选方案以及带入起草阶段的决策。 |
| `design_draft.md` | 阶段 2 | 逐节推进的工作规格。 |
| `docs/designs/` 下的设计文档 | 阶段 2/4 末尾 | 实现所依据的已批准规格。 |
| 各阶段评审报告 | 阶段 3/4 | 每个阶段的 Goldfish 发现。 |
| `goldfish_review_report.md` | 阶段 4 | 解决过程中归类为“有争议 / 升级 / 建议修复 / 拒绝”的发现。 |

## 技能

| 技能 | 调用 | 用于… |
|---|---|---|
| 头脑风暴 | `/egm-brainstorm` | 检验一个想法，并写出概念简报。 |
| 起草 | `/egm-draft` | 把简报或现有笔记变成设计文档。 |
| 评审 | `/egm-review` | 用全新的只读 Goldfish agent 分五个阶段评审一份设计。 |
| 评审循环 | `/egm-review-loop` | 针对特定的评审任务运行一组配置好的评审者。 |
| 解决 | `/egm-resolve` | 逐条处理评审发现，并就修改达成一致。 |
| 引导（bootstrap） | `/egm-bootstrap` | 为现有代码库创建或更新 README 和代码库上下文。 |
| 漂移报告 | `/egm-drift-report` | 将签入的设计文档与当前源代码进行比较。 |

全部七项技能都由用户调用，与上游 EGM 完全一致：agent 不会自行决定启动一次设计会话或一次开销很大的评审。输入 `/egm-…` 名称即可启动；上游指令会连同 DeepSeek Harness 集成说明一起注入那一轮对话。

## 项目布局

当设计产物存放在仓库中时，EGM 效果最好：

```text
path/to/project
├── .agents/skills/<project>-elephant/SKILL.md   # optional: project context loader
└── docs/
    └── designs/
        ├── SITEMAP.md                          # index of design artifacts
        └── <feature>/DESIGN.md                 # design specification
```

设计文档、概念简报和评审报告都是写入你工作目录的纯 Markdown 文件，因此可以像任何其他改动一样在 pull request 中评审。项目上下文技能由 DeepSeek Harness 从 `<repo>/.agents/skills/` 中发现。

若要让 EGM 的工作产物不进入仓库根目录，同时设计仍位于 `docs/designs/`，请在项目的 `AGENTS.md` 中加入下面这一行，并把该文件夹加入 gitignore：

```text
EGM artifact directory: .dev/docs
```

## 包布局

```
dsh-egm/
├── index.js            # package entry; re-exports the integration layer
├── skills-host.js      # DSH integration layer: registers skills + injects the preamble
├── reviewer-host.js    # egm_reviewer tool: fresh child in the read-only preset
├── reviewer-tools.js   # preset tool guard: read/search allowlist, deny everything else
├── cordis.patch.yml    # bundle patch: host rows + the egm-reviewer agent preset
├── VERIFICATION.md     # isolation tests, commands, evidence
├── CHANGELOG.md        # release history
├── ADAPTATIONS.md      # upstream/adapter split and provenance
├── EGM.md              # agent-facing codebase blueprint
├── upstream.lock.json  # pinned upstream commit + SHA-256 of every vendored file
├── scripts/            # check-upstream.mjs: upstream drift check
├── diagrams/           # D2 sources + rendered SVGs for both diagrams
├── ADAPTER-NOTES.md    # adapter notes for direct SKILL.md reads
├── E2E-VERIFICATION.md # recorded brainstorm -> draft -> review verification run
├── examples/           # repository-only: the recorded end-to-end run
├── skills/             # seven upstream SKILL.md files, verbatim
├── agents/             # nine upstream reviewer/orchestrator personas, verbatim
├── resources/          # upstream standards, execution instructions and README, verbatim
├── locale/             # plugin display metadata (en, zh)
└── icon.svg
```

适配器模块是这个包唯一新增的运行时代码。

## 开发

```sh
node --test                            # unit and content suite: manifest, engines, vendored content, adapter, reviewer isolation, upstream parity, extra-file integrity
node scripts/check-upstream.mjs        # reports whether upstream EGM moved since the pinned commit
```

无需推理密钥的真实 Harness 集成测试使用独立、锁定版本的 Python/pytest 和 Node 测试环境，
初始支持 Linux、Node 24 和 Python 3.12。它验证评审者实际输入的隔离、只读限制，以及脚本化的
brainstorm → draft → review 流程。安装步骤和两个场景的选择命令见
[`tests/integration/README.md`](tests/integration/README.md)。现有 JavaScript 单元与内容测试仍然
无需安装依赖；集成测试依赖不会进入 npm 发布包。回放验证宿主行为，
[已记录的手动运行](E2E-VERIFICATION.md) 则保留为独立的真实模型证据。

图示源文件位于 [`diagrams/`](diagrams/README.md)，编辑 `.d2` 后用 `node diagrams/render.mjs` 重新渲染。

在编辑内置内容之后（仅当你重新适配新的上游提交时），用 `node scripts/check-upstream.mjs --update-lock` 更新锁定文件。安装插件后若要继续迭代，请重启 Harness（或切换插件条目），以便宿主插件重新读取随包文件。

## 与上游保持同步

[`upstream.lock.json`](upstream.lock.json) 锁定上游提交（`a119668d7dc5d558664ba711d4671d11fb7270a8`）和每个内置文件的 SHA-256。

[`scripts/check-upstream.mjs`](scripts/check-upstream.mjs) 会把锁定的上游提交与上游的默认分支进行比较，并报告哪些内置文件发生了变化：

```sh
node scripts/check-upstream.mjs                # clean = exit 0, drift = exit 1
node scripts/check-upstream.mjs --json         # machine-readable drift report
node scripts/check-upstream.mjs --update-lock  # after refreshing the vendored files
```

一个每日运行的 GitHub Actions 工作流（[`.github/workflows/upstream-sync.yml`](.github/workflows/upstream-sync.yml)）会运行该检查：发现漂移时新建或更新 re-vendor issue，检查本身出错时新建或更新第二个 issue 并附上捕获的输出。它只负责报告，由维护者手动重新引入上游内容。完整流程见 [`scripts/README.md`](scripts/README.md)。

## 许可证与署名

本项目依据 Apache License, Version 2.0 授权。技能、评审者角色设定、标准和模板均随包内置，取自 [google/elephant-goldfish-model](https://github.com/google/elephant-goldfish-model)，Copyright Google LLC，采用 Apache License, Version 2.0；参见 [NOTICE](NOTICE) 和 [ADAPTATIONS.md](ADAPTATIONS.md)。DeepSeek Harness 适配器、bundle 和评审者预设均为本包原创。

本项目不是 Google 官方支持的产品。
