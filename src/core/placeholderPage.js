// صفحة مؤقتة لحين كتابة الصفحة الحقيقية
export function createPlaceholderPage({ id, title }) {
    const el = document.createElement('section')
    el.id = id
    el.className = 'page hidden'
    el.innerHTML = `
    <h2 class="page-title">${title}</h2>
    <p class="empty-note">هذه الصفحة قيد التطوير.</p>
  `
    return { id, el, render() { } }
}