# 脚手架模版

新建业务项目时，工作台与 CLI 会从此目录复制内容到 `projects/{id}/`。

此目录**不是**可运行项目，不会出现在项目列表中。请在 `projects/` 下创建自己的业务项目，或通过工作台「新建项目」。

## 包含内容

- `.env.example` — 环境变量示例
- `fixtures/` — 变量与宏/规则占位
- `scenarios/` — 示例登录场景
- `产品画像/` — 画像 Markdown 示例

## 首次使用

```bash
# 通过工作台「项目管理 → 新建项目」创建，或手动复制：
cp -R template projects/my-app
# 然后编辑 projects/my-app/project.json 与 .env
```
