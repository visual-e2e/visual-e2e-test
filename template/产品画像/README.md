# 产品画像

在此目录按模块编写场景 Markdown，层级与 `scenarios/` 一致。

示例：`login/登录成功.md` → 运行 `node scripts/profile-to-scenario.mjs login` 生成 `scenarios/login/` 下 JSON。

已内置模板场景：`scenarios/login/login_success.json`（通用登录流程，需配置 `.env` 与 `variables.json`）。
