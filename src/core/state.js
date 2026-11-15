export const DEPARTMENTS = {
    all: 'الكل',
    pharmacy: 'الصيدلة',
    mechanical: 'الميكانيك',
}

// القسم الحالي، يتشاركه كل الملفات
export const state = {
    dept: Object.keys(DEPARTMENTS)[0],
}