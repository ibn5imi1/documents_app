export default {
  // مسارات نسبية: يعمل البرنامج من أي رابط (GitHub Pages أو الخادم المحلي)
  base: './',
  build: { target: 'esnext' },
  
  server: {
    proxy: { '/api': 'http://127.0.0.1:3000' },
  },
}