import { state, DEPARTMENTS } from './state.js'

// التخزين: ملف على الكمبيوتر يديره الخادم المحلي (server/server.js).
// كل المتصفحات (Chrome وBrave وغيرهما) تقرأ وتكتب في نفس الملف.
// البيانات تُحمَّل في الذاكرة عند فتح البرنامج، فتبقى دوال القراءة سريعة
// ومتزامنة كما كانت، والكتابة تُرسل للخادم في الخلفية.

let cache = {}
let pendingWrites = 0
let writeQueue = Promise.resolve()

const dbKey = (storeKey, scope) => `docs:${storeKey}:${scope}`

/* ================== الاتصال بالخادم ================== */
async function fetchAll() {
  const res = await fetch('/api/data', { cache: 'no-store' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

async function putKey(key, rows) {
  const res = await fetch(`/api/data/${encodeURIComponent(key)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(rows),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
}

/* ================== تنبيه فشل الحفظ ================== */
function setSaveBanner(text) {
  let banner = document.getElementById('save-error')
  if (!text) return banner?.remove()
  if (!banner) {
    banner = document.createElement('div')
    banner.id = 'save-error'
    banner.style.cssText =
      'position:fixed;top:0;left:0;right:0;z-index:9999;background:#c0392b;color:#fff;' +
      'padding:12px;text-align:center;font-weight:700;font-family:Tahoma,Arial,sans-serif'
    document.body.appendChild(banner)
  }
  banner.textContent = text
}

// الكتابات تُرسل بالترتيب واحدة بعد الأخرى
function persist(key, rows) {
  pendingWrites++
  writeQueue = writeQueue
    .then(() => putKey(key, rows))
    .then(() => setSaveBanner(''))
    .catch(() =>
      setSaveBanner('تعذّر حفظ البيانات على الجهاز! تأكد أن الخادم يعمل (npm start) ولا تغلقه.')
    )
    .finally(() => {
      pendingWrites--
    })
}

/* ================== نقل بيانات localStorage القديمة (مرة واحدة لكل متصفح) ================== */
const MIGRATED_FLAG = 'docs-migrated-to-server'

async function migrateFromLocalStorage() {
  if (localStorage.getItem(MIGRATED_FLAG)) return

  const keys = Object.keys(localStorage).filter((k) => k.startsWith('docs:'))
  for (const key of keys) {
    if (key in cache) continue // لا نكتب فوق بيانات موجودة في الخادم
    try {
      const rows = JSON.parse(localStorage.getItem(key))
      if (!Array.isArray(rows)) continue
      await putKey(key, rows)
      cache[key] = rows
    } catch {
      // مفتاح تالف: نتجاوزه
    }
  }
  localStorage.setItem(MIGRATED_FLAG, '1')
}

/* ================== التحميل عند فتح البرنامج ================== */
try {
  cache = await fetchAll()
  await migrateFromLocalStorage()
} catch (error) {
  document.body.innerHTML = `
    <div style="font-family:Tahoma,Arial,sans-serif;direction:rtl;max-width:520px;margin:80px auto;
                padding:24px;border:1px solid #d5dbe3;border-radius:12px;line-height:1.9">
      <h2 style="color:#c0392b;margin-bottom:10px">تعذّر الاتصال بخادم البيانات</h2>
      <p>شغّل البرنامج بالأمر <b dir="ltr">npm start</b>
         ثم افتح <b dir="ltr">http://localhost:3000</b></p>
    </div>`
  throw error
}

/* ================== تحديث البيانات عند العودة للنافذة ================== */
// إذا عدّلت من متصفح آخر، يأخذ هذا المتصفح آخر نسخة عند العودة إليه
const sameData = (a, b) => {
  const ka = Object.keys(a).sort()
  const kb = Object.keys(b).sort()
  return (
    ka.length === kb.length &&
    ka.every((k, i) => k === kb[i] && JSON.stringify(a[k]) === JSON.stringify(b[k]))
  )
}

export async function refreshFromServer() {
  if (pendingWrites > 0) return // عندنا حفظ لم يكتمل
  try {
    const next = await fetchAll()
    if (pendingWrites > 0) return
    if (!sameData(next, cache)) {
      cache = next
      window.dispatchEvent(new Event('data-refreshed'))
    }
  } catch {
    // الخادم متوقف: نبقى على آخر نسخة
  }
}

window.addEventListener('focus', refreshFromServer)
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refreshFromServer()
})

/* ================== واجهة التخزين (كما كانت) ================== */
// نطاق التخزين: "all" للصفحات العامة (مثل الدليل المحاسبي)، وإلا القسم الحالي
export const scopeOf = (cfg) => (cfg.global ? 'all' : state.dept)

export function hasRows(storeKey, scope) {
  return dbKey(storeKey, scope) in cache
}

// نرجع نسخة، فلا يغيّر أحد البيانات المخزنة بالخطأ قبل الحفظ
export function loadRows(storeKey, scope) {
  return structuredClone(cache[dbKey(storeKey, scope)] ?? [])
}

export function saveRows(storeKey, scope, rows) {
  const key = dbKey(storeKey, scope)
  const copy = structuredClone(rows)
  cache[key] = copy
  persist(key, copy)
}

// الأقسام التي تظهر سجلاتها عند اختيار القسم scope:
// - قسم محدد: سجلاته + سجلات "الكل"
// - الكل: سجلات كل الأقسام
export const visibleScopes = (scope) =>
  scope === 'all' ? Object.keys(DEPARTMENTS) : [scope, 'all']

// تحميل السجلات الظاهرة، وكل سجل يحمل scope = القسم الذي حُفظ فيه فعلاً
export function loadVisible(storeKey, scope) {
  return visibleScopes(scope).flatMap((s) =>
    loadRows(storeKey, s).map((row) => ({ ...row, scope: s }))
  )
}