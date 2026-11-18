import { MONTHS, WEEKDAYS_SHORT, pad, daysInMonth, todayISO, formatDate } from './dates.js'

// حقل تاريخ بتقويم عربي: يعيد { el, getValue, setValue }
export function createDateField() {
    const root = document.createElement('div')
    root.className = 'date-field'
    root.innerHTML = `
    <input class="date-input" type="text" readonly placeholder="اختر التاريخ" autocomplete="off" />
    <div class="date-popup hidden"></div>
  `
    const input = root.querySelector('.date-input')
    const popup = root.querySelector('.date-popup')

    let value = '' // بصيغة 2026-11-19
    let viewYear = 0
    let viewMonth = 0 // 0 - 11

    function setValue(iso) {
        value = iso || ''
        input.value = formatDate(value)
    }

    function renderPopup() {
        // السبت = 0 ... الجمعة = 6
        const firstOffset = (new Date(viewYear, viewMonth, 1).getDay() + 1) % 7
        const total = daysInMonth(viewYear, viewMonth)
        const today = todayISO()

        const monthOptions = MONTHS.map(
            (name, i) => `<option value="${i}" ${i === viewMonth ? 'selected' : ''}>${name}</option>`
        ).join('')

        let yearOptions = ''
        for (let y = Math.min(2000, viewYear); y <= Math.max(2100, viewYear); y++) {
            yearOptions += `<option value="${y}" ${y === viewYear ? 'selected' : ''}>${y}</option>`
        }

        let cells = '<span></span>'.repeat(firstOffset)
        for (let day = 1; day <= total; day++) {
            const iso = `${viewYear}-${pad(viewMonth + 1)}-${pad(day)}`
            const cls = `dp-day${iso === value ? ' selected' : ''}${iso === today ? ' today' : ''}`
            cells += `<button type="button" class="${cls}" data-iso="${iso}">${day}</button>`
        }

        popup.innerHTML = `
      <div class="dp-head">
        <button type="button" class="dp-nav" data-nav="-1">▶</button>
        <select class="dp-month">${monthOptions}</select>
        <select class="dp-year">${yearOptions}</select>
        <button type="button" class="dp-nav" data-nav="1">◀</button>
      </div>
      <div class="dp-week">${WEEKDAYS_SHORT.map((w) => `<span>${w}</span>`).join('')}</div>
      <div class="dp-grid">${cells}</div>
      <div class="dp-foot">
        <button type="button" class="dp-today">اليوم</button>
        <button type="button" class="dp-clear">مسح</button>
      </div>
    `
    }

    function open() {
        const [y, m] = (value || todayISO()).split('-').map(Number)
        viewYear = y
        viewMonth = m - 1
        renderPopup()
        popup.classList.remove('hidden')
    }

    const close = () => popup.classList.add('hidden')

    input.addEventListener('click', () => {
        popup.classList.contains('hidden') ? open() : close()
    })
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            popup.classList.contains('hidden') ? open() : close()
        }
        if (e.key === 'Escape') close()
    })

    popup.addEventListener('click', (e) => {
        const nav = e.target.closest('.dp-nav')
        const day = e.target.closest('.dp-day')

        if (nav) {
            viewMonth += Number(nav.dataset.nav)
            if (viewMonth < 0) { viewMonth = 11; viewYear-- }
            if (viewMonth > 11) { viewMonth = 0; viewYear++ }
            renderPopup()
        } else if (day) {
            setValue(day.dataset.iso)
            close()
        } else if (e.target.closest('.dp-today')) {
            setValue(todayISO())
            close()
        } else if (e.target.closest('.dp-clear')) {
            setValue('')
            close()
        }
    })

    popup.addEventListener('change', (e) => {
        if (e.target.classList.contains('dp-month')) viewMonth = Number(e.target.value)
        if (e.target.classList.contains('dp-year')) viewYear = Number(e.target.value)
        renderPopup()
    })

    // الإغلاق عند الضغط خارج التقويم
    document.addEventListener('click', (e) => {
        if (!e.composedPath().includes(root)) close()
    })

    return { el: root, getValue: () => value, setValue }
}