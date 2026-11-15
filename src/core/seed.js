import { hasRows, saveRows } from './storage.js'

export function parseSeed(raw) {
    const rows = []
    const seen = new Set()
    const skipped = []

    raw.split(/\r?\n/).forEach((line) => {
        const text = line.replace(/[\u200e\u200f]/g, '').trim()
        if (!text) return

        // آخر رقم في السطر هو رقم الدليل، وما قبله اسم الحساب
        const match = text.match(/^(.*?)\s+(\d[\d/]*)$/)
        if (!match) {
            skipped.push(text)
            return
        }

        const name = match[1].trim()
        const number = match[2].trim()
        if (!name || seen.has(number)) {
            skipped.push(text)
            return
        }

        seen.add(number)
        rows.push({ id: `s${number}`, number, name })
    })

    if (skipped.length) console.warn('أسطر لم يتم استيرادها:', skipped)
    return rows
}

// تُنفَّذ مرة واحدة: إذا لا توجد بيانات محفوظة نحمّل الافتراضية
export function seedIfEmpty(cfg) {
    if (!hasRows(cfg.storeKey, 'all')) {
        saveRows(cfg.storeKey, 'all', parseSeed(cfg.seed))
    }
}