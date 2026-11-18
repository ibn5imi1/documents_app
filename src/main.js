import './style.css'
import { state, DEPARTMENTS } from './core/state.js'
import { $ } from './core/utils.js'
import { setNavigator } from './core/nav.js'

// ===== صفحات النافبار: كل صفحة في ملفها =====
import accounts from './pages/guide/accounts.js'
import costCenters from './pages/guide/costcenters.js'
import payment from './pages/documents/payment.js'
import journal from './pages/documents/journal.js'
import receipt from './pages/documents/receipt.js'
import paymentReport from './pages/reports/paymentReport.js'
import journalReport from './pages/reports/journalReport.js'
import receiptReport from './pages/reports/receiptReport.js'

const PAGES = [
  accounts, costCenters,
  payment, journal, receipt,
  paymentReport, journalReport, receiptReport,
]

// ===== مؤقت للتجربة، لاحقاً يُستبدل بقاعدة البيانات =====
// name = اسم المحاسب الذي يظهر مسبقاً في مستند الصرف
const USERS = [{ username: 'admin', password: '1234', name: 'المدير' }]

const pageMap = {}
let currentPageId = 'page-home'

/* ================== بناء الصفحات ================== */
const content = $('#content')
for (const page of PAGES) {
  pageMap[page.id] = page
  content.appendChild(page.el)
}

/* ================== التنقل ================== */
function showScreen(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.add('hidden'))
  document.getElementById(id).classList.remove('hidden')
  if (id === 'screen-login') document.body.classList.remove('is-home')
}

function showPage(id) {
  document.querySelectorAll('.page').forEach((p) => p.classList.add('hidden'))
  document.getElementById(id).classList.remove('hidden')
  document.body.classList.toggle('is-home', id === 'page-home')
  currentPageId = id
  pageMap[id]?.render()
}

setNavigator(showPage) // ليتمكن أي ملف من الانتقال لصفحة أخرى

document.querySelectorAll('[data-page]').forEach((item) => {
  item.addEventListener('click', () => showPage(item.dataset.page))
})

/* ================== قائمة الأقسام ================== */
const deptSelect = $('#dept-select')
for (const [key, label] of Object.entries(DEPARTMENTS)) {
  const option = document.createElement('option')
  option.value = key
  option.textContent = label
  deptSelect.appendChild(option)
}

deptSelect.addEventListener('change', () => {
  state.dept = deptSelect.value
  pageMap[currentPageId]?.render()
})

/* ================== تسجيل الدخول والخروج ================== */
$('#login-form').addEventListener('submit', (e) => {
  e.preventDefault()

  const username = $('#username').value.trim()
  const password = $('#password').value

  const user = USERS.find((u) => u.username === username && u.password === password)
  if (!user) {
    $('#login-error').textContent = 'اسم المستخدم أو كلمة المرور غير صحيحة'
    return
  }

  $('#login-error').textContent = ''
  state.user = { username: user.username, name: user.name }
  state.dept = deptSelect.value
  PAGES.forEach((p) => p.reset?.()) // نماذج نظيفة باسم المحاسب الحالي
  showScreen('main-layout')
  showPage('page-home') // الصفحة البيضاء أولاً
})

$('#btn-logout').addEventListener('click', () => {
  $('#password').value = ''
  state.user = null
  PAGES.forEach((p) => p.reset?.()) // تفريغ أي مستند غير محفوظ
  showScreen('screen-login')
})