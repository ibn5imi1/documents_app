export const DEPARTMENTS = {
    all: 'الكل',
    pharmacy: 'الصيدلة',
    mechanical: 'الميكانيك',
    anesthesia: 'التخدير',
    xray: 'الاشعة',
    dentalTechnology: 'صناعة الاسنان',
    electricity: 'الكهرباء',
}

// العملات: لإضافة عملة جديدة يكفي إضافتها هنا
export const CURRENCIES = ['دينار', 'دولار']

export const state = {
    dept: Object.keys(DEPARTMENTS)[0], // القسم الحالي
    user: null, // المستخدم الحالي { username, name }
}