import { state, DEPARTMENTS } from './state.js'

// مؤقت: localStorage. عند التحويل لقاعدة بيانات نغيّر هذا الملف فقط.

// نطاق التخزين: "all" للصفحات العامة (مثل الدليل المحاسبي)، وإلا القسم الحالي
export const scopeOf = (cfg) => (cfg.global ? 'all' : state.dept)

const dbKey = (storeKey, scope) => `docs:${storeKey}:${scope}`

export function hasRows(storeKey, scope) {
    return localStorage.getItem(dbKey(storeKey, scope)) !== null
}

export function loadRows(storeKey, scope) {
    try {
        return JSON.parse(localStorage.getItem(dbKey(storeKey, scope))) || []
    } catch {
        return []
    }
}

export function saveRows(storeKey, scope, rows) {
    localStorage.setItem(dbKey(storeKey, scope), JSON.stringify(rows))
}

// الأقسام التي تظهر سجلاتها عند اختيار القسم scope:
// - قسم محدد: سجلاته + سجلات "الكل"
// - الكل: سجلات كل الأقسام
export const visibleScopes = (scope) =>
    scope === 'all' ? Object.keys(DEPARTMENTS) : [scope, 'all']

// تحميل السجلات الظاهرة، وكل سجل يحمل scope = القسم الذي حُفظ فيه فعلاً
// (نحتاجه عند التعديل والحذف، وليس مخزَّناً مع السجل)
export function loadVisible(storeKey, scope) {
    return visibleScopes(scope).flatMap((s) =>
        loadRows(storeKey, s).map((row) => ({ ...row, scope: s }))
    )
}