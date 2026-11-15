export const $ = (selector, root = document) => root.querySelector(selector)

// توحيد الحروف العربية لتسهيل البحث (أ إ آ = ا، ة = ه، ى = ي، وحذف التشكيل)
export const normalize = (s) =>
    s
        .toLowerCase()
        .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
        .replace(/[أإآ]/g, 'ا')
        .replace(/ى/g, 'ي')
        .replace(/ة/g, 'ه')

// ترتيب شجري: 11 ثم 111 ثم 1111 ... ، والأرقام بعد "/" تُرتب رقمياً
export function compareNumbers(a, b) {
    const [a1, a2 = ''] = a.split('/')
    const [b1, b2 = ''] = b.split('/')
    if (a1 !== b1) return a1 < b1 ? -1 : 1
    return a2.localeCompare(b2, undefined, { numeric: true })
}