import { defineConfig } from '@tarojs/cli'
import type { UserConfigExport } from '@tarojs/cli'

/**
 * 双端编译：微信小程序（weapp）+ H5。
 * 设计稿宽度 375（AntD Mobile / H5 习惯），小程序侧由 pxtransform 换算。
 */
const config: UserConfigExport = {
  projectName: 'zhiji-frontend',
  date: '2026-10-20',
  designWidth: 375,
  deviceRatio: { 375: 2, 640: 1.17, 750: 1, 828: 0.905 },
  sourceRoot: 'src',
  // 双端产物分开落盘，互不覆盖，便于分别验证/上传。
  outputRoot: process.env.TARO_OUTPUT_ROOT ?? (process.env.TARO_ENV === 'weapp'
    ? 'dist/weapp-staging'
    : `dist/${process.env.TARO_ENV}`),
  plugins: [],
  defineConstants: {},
  copy: { patterns: [], options: {} },
  framework: 'react',
  compiler: {
    type: 'webpack5',
    prebundle: { enable: false },
  },
  cache: { enable: false },
  mini: {
    compile: {
      // CloudBase SDK's distributed bundles include optional chaining/nullish
      // coalescing that the WeChat simulator parser may not accept directly.
      include: [
        (filename: string) => /node_modules[\\/](?:@cloudbase[\\/]|@mattiasbuelens[\\/]|bson[\\/]|jwt-decode[\\/]|web-streams-polyfill[\\/]|text-encoding-shim[\\/]|zod[\\/])/.test(filename),
      ],
    },
    postcss: {
      pxtransform: { enable: true, config: {} },
      cssModules: { enable: false },
    },
  },
  h5: {
    publicPath: '/',
    staticDirectory: 'static',
    output: {
      filename: 'js/[name].[hash:8].js',
      chunkFilename: 'js/[name].[chunkhash:8].js',
    },
    miniCssExtractPluginOption: {
      ignoreOrder: true,
      filename: 'css/[name].[hash].css',
      chunkFilename: 'css/[name].[chunkhash].css',
    },
    postcss: {
      autoprefixer: { enable: true, config: {} },
      cssModules: { enable: false },
    },
    webpackChain(chain) {
      // @cloudbase/js-sdk 声明了 `"miniprogram": "miniprogram_dist"` 字段，H5 构建若把它
      // 当作 mainField 会打包进小程序版本（内含 wx.* 调用）。这里固定 H5 走 Web 构建。
      chain.resolve.mainFields.clear().merge(['browser', 'module', 'main'])
    },
  },
}

export default defineConfig(async (merge) => merge({}, config))
