/**
 * 跳绳打卡云端同步配置
 *
 * 使用 GitHub Gist 存储，电脑和手机打开同一网址即可共享数据。
 * githubToken 需要「gist」权限的 Personal Access Token（不要勾选 repo）。
 */
window.CHECKIN_CONFIG = {
  // 已创建的数据仓库（不要改）
  gistId: "28cec0bd06549afc96073735cb97243d",

  // 在下面填入你的 GitHub Token（以 ghp_ 或 github_pat_ 开头）
  // 创建地址：https://github.com/settings/tokens/new?scopes=gist&description=jump-rope-checkin-sync
  githubToken: "YOUR_GITHUB_TOKEN",
};
