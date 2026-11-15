import './style.css'
import { state, DEPARTMENTS } from './core/state.js'
import { $ } from './core/utils.js'

// ===== صفحات النافبار: كل صفحة في ملفها =====
import accounts from './pages/guide/accounts.js'
import costCenters from './pages/guide/costcenters.js'

const PAGES = [accounts, costCenters]

// ===== مؤقت للتجربة، لاحقاً يُستبدل بقاعدة البيانات =====
const USERS = [{ username: 'admin', password: '1234' }]

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

  const ok = USERS.some((u) => u.username === username && u.password === password)
  if (!ok) {
    $('#login-error').textContent = 'اسم المستخدم أو كلمة المرور غير صحيحة'
    return
  }

  $('#login-error').textContent = ''
  state.dept = deptSelect.value
  showScreen('main-layout')
  showPage('page-home') // الصفحة البيضاء أولاً
})

$('#btn-logout').addEventListener('click', () => {
  $('#password').value = ''
  showScreen('screen-login')
})