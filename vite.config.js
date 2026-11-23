export default {
  // الخادم المحلي يقدّم البرنامج من الجذر، فلا نحتاج base
  build: { target: 'esnext' },
  server: {
    proxy: { '/api': 'http://127.0.0.1:3000' },
  },
}