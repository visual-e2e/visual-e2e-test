# Cursor 项目配置

该目录用于存放项目级 Cursor 配置，供团队共享 Agent 行为。

## 目录结构

- `rules/`：由 Cursor 加载的项目持久化规则（`.mdc`）。
- `skills/`：可复用的项目技能（`<skill-name>/SKILL.md`）。

## 当前规则

- `rules/karpathy-guidelines.mdc`：行为基线规则（全局生效）。
- `rules/skills-loading.mdc`：优先加载匹配的项目技能。

## 来源说明

- `karpathy-guidelines` 来源于开源仓库 [forrestchang/andrej-karpathy-skills](https://github.com/forrestchang/andrej-karpathy-skills)。
- 当前项目已结合本仓库规范做中文化与本地化调整。

## 规则生效方式

- `alwaysApply: true` 的规则会在每次会话中生效。
- 配置了 `globs` 的规则仅在匹配文件时生效。

## 新增 Rule

1. 创建 `.cursor/rules/<rule-name>.mdc`。
2. 添加 frontmatter：

```md
---
description: 规则简介
alwaysApply: true
---
```

3. 内容尽量聚焦、可执行。

## 当前 Skill

| Skill | 用途 |
|-------|------|
| `karpathy-guidelines` | 编码行为基线（与 rules 联动） |

## 新增 Skill

1. 创建 `.cursor/skills/<skill-name>/SKILL.md`。
2. 使用必填元数据：

```md
---
name: your-skill-name
description: 说明它做什么，以及何时使用
---
```

3. 将核心步骤写在 `SKILL.md`，必要时再补充参考文档。

## 注意事项

- 优先使用 `.cursor/` 下的项目级配置，保证团队一致性。
- 不要把自定义 skill 放到 `~/.cursor/skills-cursor/`（该目录保留给内置能力）。