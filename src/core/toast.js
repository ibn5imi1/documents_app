let container = null

// kind: success (أخضر) | edit (أزرق) | delete (أحمر)
export function showToast(text, kind = 'success') {
    if (!container) {
        container = document.createElement('div')
        container.className = 'toast-container'
        document.body.appendChild(container)
    }

    const toast = document.createElement('div')
    toast.className = `toast toast-${kind}`
    toast.textContent = text
    container.append(toast)

    setTimeout(() => {
        toast.classList.add('leaving')
        setTimeout(() => toast.remove(), 300)
    }, 4000)
}