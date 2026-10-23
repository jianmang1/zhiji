export default defineAppConfig({
  // 按页面实际使用注入原生组件，减少启动时加载的组件代码。
  lazyCodeLoading: 'requiredComponents',
  pages: [
    'pages/login/index',
    'pages/entry/index',
    'pages/dashboard/index',
    'pages/funnel/index',
    'pages/plans/index',
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
