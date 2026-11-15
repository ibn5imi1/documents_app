import { state } from './state.js'

// مؤقت: localStorage. عند التحويل لقاعدة بيانات نغيّر هذا الملف فقط.

// نطاق التخزين: "all" للصفحات العامة، وإلا القسم الحالي
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