// مؤشر تحميل يظهر فوق الجدول، ورسم الصفوف الكثيرة على دفعات
// كي لا تتجمد الشاشة. يُستعمل في كل كشف أو تقرير أو جدول قد يكبر.

export function createLoader(anchor) {
    const el = document.createElement('div')
    el.className = 'loader hidden'
    el.innerHTML = '<div class="spinner"></div><span class="loader-text">جاري التحميل...</span>'
    anchor.before(el) // يوضع قبل عنصر الجدول مباشرة

    return {
        show(text = 'جاري التحميل...') {
            el.querySelector('.loader-text').textContent = text
            el.classList.remove('hidden')
        },
        hide() {
            el.classList.add('hidden')
        },
    }
}

// ننتظر حتى يرسم المتصفح الشاشة (ليظهر اللودر فعلاً)
export const nextFrame = () =>
    new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)))

// items: البيانات، buildRow(item, index): يرجع عنصر <tr>
// السجلات القليلة (حتى threshold) تُرسم فوراً بدون لودر،
// والكثيرة تُرسم على دفعات مع لودر يعرض التقدم.
export function createRowRenderer({ tbody, loader, threshold = 200, chunkSize = 100 }) {
    let current = 0

    return async function drawRows(items, buildRow) {
        const id = ++current
        tbody.replaceChildren()

        if (items.length <= threshold) {
            loader.hide()
            const fragment = document.createDocumentFragment()
            items.forEach((item, index) => fragment.append(buildRow(item, index)))
            tbody.append(fragment)
            return
        }

        loader.show(`جاري تحميل ${items.length} سجل...`)
        await nextFrame()

        for (let start = 0; start < items.length; start += chunkSize) {
            if (id !== current) return // بدأ عرض أحدث، نتوقف عن هذا
            const end = Math.min(start + chunkSize, items.length)
            const fragment = document.createDocumentFragment()
            for (let index = start; index < end; index++) {
                fragment.append(buildRow(items[index], index))
            }
            tbody.append(fragment)
            loader.show(`جاري التحميل... ${end} من ${items.length}`)
            await nextFrame()
        }

        if (id === current) loader.hide()
    }
}