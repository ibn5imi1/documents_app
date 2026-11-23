import { state, DEPARTMENTS } from './state.js'

// للتخزين وضعان، يُختار أحدهما تلقائياً عند فتح البرنامج:
//  1) وضع الخادم: عند فتحه عبر localhost (npm start) تُحفظ البيانات في ملف
//     على الكمبيوتر، وتشترك فيه كل المتصفحات.
//  2) وضع المتصفح: عند فتحه من رابط عادي (مثل GitHub Pages) تُحفظ بيانات كل
//     شخص في متصفحه على جهازه فقط، ولا يراها أحد غيره.
// البيانات تُحمَّل في الذاكرة عند الفتح، فتبقى دوال القراءة متزامنة وسريعة.

let cache = {}
let mode = 'local' // 'server' | 'local'
let pendingWrites = 0
let writeQueue = Promise.resolve()

const dbKey = (storeKey, scope) => `docs:${storeKey}:${scope}`

/* ================== الاتصال بالخادم (وضع الخادم) ================== */
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

// وضع الخادم: الكتابات تُرسل بالترتيب واحدة بعد الأخرى
function persistToServer(key, rows) {
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

// وضع المتصفح: الحفظ مباشرة في localStorage
function persistToBrowser(key, rows) {
  try {
    localStorage.setItem(key, JSON.stringify(rows))
    setSaveBanner('')
  } catch {
    setSaveBanner('تعذّر حفظ البيانات في المتصفح (المساحة ممتلئة أو التخزين محظور).')
  }
}

/* ================== قراءة localStorage ================== */
function readBrowserData() {
  const data = {}
  for (const key of Object.keys(localStorage)) {
    if (!key.startsWith('docs:')) continue
    try {
      const rows = JSON.parse(localStorage.getItem(key))
      if (Array.isArray(rows)) data[key] = rows
    } catch {
      // مفتاح تالف: نتجاوزه
    }
  }
  return data
}

// وضع الخادم: نقل بيانات localStorage القديمة مرة واحدة لكل متصفح
const MIGRATED_FLAG = 'docs-migrated-to-server'

async function migrateFromLocalStorage() {
  if (localStorage.getItem(MIGRATED_FLAG)) return

  for (const [key, rows] of Object.entries(readBrowserData())) {
    if (key in cache) continue // لا نكتب فوق بيانات موجودة في الخادم
    try {
      await putKey(key, rows)
      cache[key] = rows
    } catch {
      // نتجاوز المفتاح الذي فشل
    }
  }
  localStorage.setItem(MIGRATED_FLAG, '1')
}

/* ================== اختيار الوضع عند فتح البرنامج ================== */
// على localhost نتوقع وجود الخادم. وفي غير ذلك (GitHub Pages مثلاً) نستعمل المتصفح
const expectServer = ['localhost', '127.0.0.1'].includes(location.hostname)

let serverData = null
try {
  const data = await fetchAll()
  if (data && typeof data === 'object' && !Array.isArray(data)) serverData = data
} catch {
  serverData = null
}

if (serverData) {
  mode = 'server'
  cache = serverData
  await migrateFromLocalStorage()
} else if (expectServer) {
  // نحن على localhost لكن الخادم متوقف: لا نكمل حتى لا تتفرق بياناتك بين مكانين
  document.body.innerHTML = `
    <div style="font-family:Tahoma,Arial,sans-serif;direction:rtl;max-width:520px;margin:80px auto;
                padding:24px;border:1px solid #d5dbe3;border-radius:12px;line-height:1.9">
      <h2 style="color:#c0392b;margin-bottom:10px">تعذّر الاتصال بخادم البيانات</h2>
      <p>شغّل البرنامج بالأمر <b dir="ltr">npm start</b>
         ثم افتح <b dir="ltr">http://localhost:3000</b></p>
    </div>`
  throw new Error('data server is not running')
} else {
  mode = 'local'
  cache = readBrowserData()
}

export const getStorageMode = () => mode

/* ================== تحديث البيانات عند تعديلها من مكان آخر ================== */
const sameData = (a, b) => {
  const ka = Object.keys(a).sort()
  const kb = Object.keys(b).sort()
  return (
    ka.length === kb.length &&
    ka.every((k, i) => k === kb[i] && JSON.stringify(a[k]) === JSON.stringify(b[k]))
  )
}

// وضع الخادم: إذا عدّلت من متصفح آخر، نأخذ آخر نسخة عند العودة للنافذة
export async function refreshFromServer() {
  if (mode !== 'server' || pendingWrites > 0) return
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

if (mode === 'server') {
  window.addEventListener('focus', refreshFromServer)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshFromServer()
  })
} else {
  // وضع المتصفح: تعديل من تبويب آخر في نفس المتصفح
  window.addEventListener('storage', (e) => {
    if (!e.key?.startsWith('docs:')) return
    try {
      if (e.newValue === null) delete cache[e.key]
      else cache[e.key] = JSON.parse(e.newValue)
      window.dispatchEvent(new Event('data-refreshed'))
    } catch {
      // قيمة تالفة: نتجاهلها
    }
  })
}

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
  if (mode === 'server') persistToServer(key, copy)
  else persistToBrowser(key, copy)
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