export const MONTHS = [
    'كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران',
    'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول',
]

// الأسبوع يبدأ بالسبت
export const WEEKDAYS_SHORT = ['سبت', 'أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة']

export const pad = (n) => String(n).padStart(2, '0')

// السنة الكبيسة: تقبل القسمة على 4، ولا تقبلها على 100 إلا إذا قبلت 400
export const isLeapYear = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0

// month من 0 (كانون الثاني) إلى 11 (كانون الأول)
export const daysInMonth = (y, month) =>
    [31, isLeapYear(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month]

export function todayISO() {
    const d = new Date()
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// طريقة عرض التاريخ (يُخزَّن داخلياً بصيغة 2026-11-19)
// يظهر 2026/11/19 فيُقرأ من اليمين لليسار: يوم 19 ثم شهر 11 ثم سنة 2026
export function formatDate(iso) {
    if (!iso) return ''
    const [y, m, d] = iso.split('-')
    return `${y}/${m}/${d}`
}