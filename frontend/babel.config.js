// Taro 4 + React + TypeScript preset.
module.exports = {
  presets: [
    [
      'taro',
      {
        framework: 'react',
        ts: true,
        compiler: 'webpack5',
        reactJsxRuntime: 'automatic',
      },
    ],
  ],
}