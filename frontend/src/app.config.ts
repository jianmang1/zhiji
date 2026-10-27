export default defineAppConfig({
  // 按页面实际使用注入原生组件，减少启动时加载的组件代码。
  lazyCodeLoading: 'requiredComponents',
  pages: [
    // 首页 = 打卡页（游客可浏览）：微信审核要求"未登录不得强制授权，须先可体验功能"，
    // 登录页仅在实际需要登录的动作（提交打卡/生成方案）时经 guard.requireLogin 引导进入。
    'pages/entry/index',
    'pages/dashboard/index',
    'pages/funnel/index',
    'pages/plans/index',
    'pages/login/index',
  ],
  window: {
    backgroundTextStyle: 'dark',
    navigationBarBackgroundColor: '#FFF9E8',
    navigationBarTitleText: '执己',
    navigationBarTextStyle: 'black',
  },
  tabBar: {
    color: '#000000',
    selectedColor: '#000000',
    backgroundColor: '#FFF9E8',
    borderStyle: 'black',
    list: [
      { pagePath: 'pages/entry/index', text: '打卡' },
      { pagePath: 'pages/dashboard/index', text: '看板' },
      { pagePath: 'pages/funnel/index', text: '漏斗' },
      { pagePath: 'pages/plans/index', text: '方案' },
    ],
  },
})
