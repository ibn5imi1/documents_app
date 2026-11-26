import { loadRows, saveRows, loadVisible, visibleScopes } from './storage.js'

// ترقيم متسلسل لأي نوع مستند:
// - يبدأ من 1 ويزيد واحداً مع كل مستند جديد.
// - الأرقام المحذوفة لا تعود: نحفظ آخر رقم صُرف في سجل خاص (counterStore).
// - المستندات التي تظهر معاً في قسم واحد (قسمه + "الكل") لا يتكرر رقمها.
export function createNumbering({ docsStore, counterStore }) {
    const lastIssued = (scope) => loadRows(counterStore, scope)[0]?.last ?? 0

    // أكبر رقم موجود فعلاً (يحمي المستندات المحفوظة قبل وجود العداد)
    const highestExisting = (scope) =>
        Math.max(0, ...loadVisible(docsStore, scope).map((doc) => parseInt(doc.number, 10) || 0))

    return {
        // الرقم القادم في القسم scope
        next(scope) {
            const counters = visibleScopes(scope).map(lastIssued)
            return Math.max(highestExisting(scope), ...counters) + 1
        },

        // تسجيل أن الرقم صُرف (عند الحفظ أو الحذف) حتى لا يُستعمل مرة ثانية
        reserve(scope, number) {
            const n = parseInt(number, 10)
            if (Number.isFinite(n) && n > lastIssued(scope)) {
                saveRows(counterStore, scope, [{ last: n }])
            }
        },
    }
}