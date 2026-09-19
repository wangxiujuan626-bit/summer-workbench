# Summer 工作台桌面版

桌面版把工作台页面、本地同步服务和更新能力打进一个应用中。

普通用户只需要安装一次。之后从桌面图标打开，应用会自动启动本地服务；更新由 GitHub Releases 提供，记录和头像保存在系统用户数据目录，不会写进安装包，也不会在更新时被覆盖。

## 构建

在 `desktop/` 目录安装依赖后执行：

```bash
npm install
npm run dist -- --mac
npm run dist -- --win
```

正式发布由 `.github/workflows/desktop-release.yml` 在 GitHub Actions 中完成。打 `v*` 标签后，工作流分别生成 macOS 安装包和 Windows 安装包，并创建 GitHub Release。

## 数据与隐私

桌面应用使用每台电脑独立的用户数据目录，不会把作者的记录、头像或昵称打进安装包。手机和另一台电脑仍通过工作台内的“连接设备”按原有配对流程同步。
