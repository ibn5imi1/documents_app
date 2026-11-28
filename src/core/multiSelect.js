import { $ } from "./utils.js";

// قائمة منسدلة متعددة الاختيار (علامة اختيار لكل عنصر) بتصميم قوائم النافبار.
// options: مصفوفة نصوص. unit: كلمة تُعرض مع العدد (مثل: 3 أنواع محددة)
export function createMultiSelect({
  options,
  placeholder = "اختر",
  unit = "عناصر",
  onChange = () => {},
}) {
  const root = document.createElement("div");
  root.className = "multi-select";
  root.innerHTML = `
    <button type="button" class="ms-button">
      <span class="ms-text"></span>
      <span class="ms-arrow">▾</span>
    </button>
    <div class="ms-panel hidden">
      <div class="ms-tools">
        <button type="button" class="ms-all">تحديد الكل</button>
        <button type="button" class="ms-clear">مسح</button>
      </div>
      <ul class="ms-list"></ul>
    </div>
  `;
  const button = $(".ms-button", root);
  const panel = $(".ms-panel", root);
  const list = $(".ms-list", root);
  const selected = new Set();

  // عناصر القائمة
  const boxes = options.map((text) => {
    const item = document.createElement("li");
    const label = document.createElement("label");
    const box = document.createElement("input");
    box.type = "checkbox";
    const span = document.createElement("span");
    span.textContent = text;
    label.append(box, span);
    item.append(label);
    list.append(item);

    box.addEventListener("change", () => {
      if (box.checked) selected.add(text);
      else selected.delete(text);
      refreshText();
      onChange();
    });
    return { text, box };
  });

  function refreshText() {
    const values = getValues();
    $(".ms-text", root).textContent =
      values.length === 0
        ? placeholder
        : values.length <= 2
          ? values.join("، ")
          : `${values.length} ${unit} محددة`;
    button.classList.toggle("has-value", values.length > 0);
  }

  const getValues = () => options.filter((text) => selected.has(text));

  function setAll(checked) {
    for (const { text, box } of boxes) {
      box.checked = checked;
      if (checked) selected.add(text);
      else selected.delete(text);
    }
    refreshText();
    onChange();
  }

  button.addEventListener("click", () => panel.classList.toggle("hidden"));
  $(".ms-all", root).addEventListener("click", () => setAll(true));
  $(".ms-clear", root).addEventListener("click", () => setAll(false));

  // الإغلاق عند الضغط خارج القائمة
  document.addEventListener("click", (e) => {
    if (!e.composedPath().includes(root)) panel.classList.add("hidden");
  });

  refreshText();

  return {
    el: root,
    getValues,
    clear() {
      for (const { text, box } of boxes) {
        box.checked = false;
        selected.delete(text);
      }
      panel.classList.add("hidden");
      refreshText();
    },
  };
}
