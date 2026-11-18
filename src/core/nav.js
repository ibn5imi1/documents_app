// يسمح لأي صفحة بالانتقال لصفحة أخرى بدون استيراد main.js
let handler = () => { }

export const setNavigator = (fn) => {
    handler = fn
}
export const navigate = (pageId) => handler(pageId)