import { recipePhoto } from "./recipe-photos.js"

function paintDishes(root = document) {
  root.querySelectorAll("[data-dish]").forEach((el) => {
    if (!el.querySelector("img"))
      el.insertAdjacentHTML(
        "afterbegin",
        recipePhoto(el.dataset.dish, import.meta.env.BASE_URL)
      )
  })
}

// Amounts the way the app shows them: US fractions, or grams for baking.
const FRACS = [
  [0, ""],
  [1 / 8, "⅛"],
  [1 / 4, "¼"],
  [1 / 3, "⅓"],
  [3 / 8, "⅜"],
  [1 / 2, "½"],
  [5 / 8, "⅝"],
  [2 / 3, "⅔"],
  [3 / 4, "¾"],
  [7 / 8, "⅞"],
  [1, ""],
]
function frac(n) {
  let whole = Math.floor(n),
    rest = n - whole,
    best = FRACS[0]
  for (const f of FRACS)
    if (Math.abs(rest - f[0]) < Math.abs(rest - best[0])) best = f
  if (best[0] === 1) {
    whole += 1
    best = FRACS[0]
  }
  if (!whole && !best[1]) return "⅛"
  return whole ? (best[1] ? `${whole} ${best[1]}` : `${whole}`) : best[1]
}
function amount(line, scale, grams) {
  const q = line.q * scale
  if (grams && line.g) return `${Math.round(q * line.g)} g`
  const unit = line.u ? (q > 1 && line.us ? ` ${line.us}` : ` ${line.u}`) : ""
  return `${frac(q)}${unit}`
}

const $ = (s, r = document) => r.querySelector(s)
const $$ = (s, r = document) => [...r.querySelectorAll(s)]
const ic = (n, cls = "") =>
  `<svg class="ico ${cls}" aria-hidden="true"><use href="#i-${n}"></use></svg>`
const calm = matchMedia("(prefers-reduced-motion: reduce)").matches
const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
const store = {
  get(k) {
    try {
      return localStorage.getItem(k)
    } catch {
      return null
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, v)
    } catch {}
  },
}

function icons(root = document) {
  $$("i[data-i]", root).forEach((el) => {
    const t = document.createElement("template")
    t.innerHTML = ic(el.dataset.i, el.className)
    el.replaceWith(t.content)
  })
  $$("[data-stars]", root).forEach((el) => {
    const n = +el.dataset.stars
    el.innerHTML = [1, 2, 3, 4, 5]
      .map((i) => ic(i <= n ? "StarFill" : "Star", i <= n ? "" : "off"))
      .join("")
    el.setAttribute("aria-label", `${n} of 5 stars`)
  })
}

/* ---------- Palette and light/dark ---------- */
const root = document.documentElement
const PALS = {
  sage: "Sage & Cream",
  paprika: "Paprika & Linen",
  castiron: "Cast Iron & Saffron",
}
const isDark = () =>
  root.dataset.theme
    ? root.dataset.theme === "dark"
    : matchMedia("(prefers-color-scheme: dark)").matches
function setPal(p) {
  if (p === "sage") delete root.dataset.palette
  else root.dataset.palette = p
  $$("[data-pal]").forEach((b) =>
    b.setAttribute("aria-pressed", String(b.dataset.pal === p))
  )
  $("#pal-name").textContent = PALS[p]
  store.set("merran-palette", p)
}
function syncMode() {
  $$("[data-mode] use").forEach((u) =>
    u.setAttribute("href", isDark() ? "#i-Moon02" : "#i-Sun03")
  )
}

/* ---------- The app window ---------- */
function closeAccountMenus(except) {
  $$(".demo-account[open]").forEach((menu) => {
    if (menu !== except) menu.open = false
  })
}
function go(screen) {
  closeAccountMenus()
  $$("#app [data-screen]").forEach(
    (s) => (s.hidden = s.dataset.screen !== screen)
  )
  $$("#app [data-go]").forEach((b) =>
    b.dataset.go === screen
      ? b.setAttribute("aria-current", "page")
      : b.removeAttribute("aria-current")
  )
  $("#app-main").scrollTop = 0
}

/* ---------- Tabs (chapters) ---------- */
function setupTabs(feat) {
  const tabs = $$('[role="tab"]', feat)
  const note = $(".tab-note", feat)
  const select = (t, focus) => {
    tabs.forEach((x) => {
      const on = x === t
      x.setAttribute("aria-selected", String(on))
      x.tabIndex = on ? 0 : -1
    })
    const id = t.getAttribute("aria-controls")
    $$('[role="tabpanel"]', feat).forEach((p) => {
      p.hidden = p.id !== id
      if (p.id === id) p.setAttribute("aria-labelledby", t.id)
    })
    if (note) note.textContent = $("span", t)?.textContent ?? ""
    if (focus) t.focus()
    feat.dispatchEvent(new CustomEvent("tab", { detail: t }))
  }
  tabs.forEach((t, i) => {
    t.addEventListener("click", () => {
      select(t)
      const bar = t.parentElement
      if (bar.scrollWidth > bar.clientWidth)
        bar.scrollTo({
          left: t.offsetLeft - 16,
          behavior: calm ? "auto" : "smooth",
        })
    })
    t.addEventListener("keydown", (e) => {
      const d = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[
        e.key
      ]
      if (!d) return
      e.preventDefault()
      select(tabs[(i + d + tabs.length) % tabs.length], true)
    })
  })
  select(
    tabs.find((t) => t.getAttribute("aria-selected") === "true") ?? tabs[0]
  )
}

/* ---------- Recipes: swap ---------- */
function setupSwap() {
  const sw = $("#swapdemo")
  const line = $("[data-swaptext]", sw)
  const dlg = $("[data-swapdlg]", sw)
  const steps = $("[data-swapsteps]", sw)
  const s2 = $("[data-step2]", sw)
  const orig = $("[data-showorig]", sw)
  const open = $("[data-swapopen]", sw)
  const LINE = line.innerHTML
  const NEW = s2.innerHTML
  const OLD =
    "Stir in the tomato paste and red pepper flakes, and cook 3 minutes, until brick red."
  const undo = () => {
    line.innerHTML = LINE
    dlg.hidden = false
    steps.hidden = true
    open.setAttribute("aria-expanded", "true")
    s2.innerHTML = NEW
    orig.textContent = "Show the original"
  }
  $("[data-swapuse]", sw).onclick = () => {
    line.innerHTML = `<b>½ cup</b> tomato sauce, <b>1 pinch</b> sugar<span class="was">Instead of <b>2 tbsp</b> tomato paste · <button class="b b-link b-xs" data-undo>Undo</button></span>`
    dlg.hidden = true
    steps.hidden = false
    open.setAttribute("aria-expanded", "false")
    line.closest("li").classList.remove("flash")
    void line.offsetWidth
    line.closest("li").classList.add("flash")
    $("[data-undo]", sw).onclick = undo
  }
  open.onclick = () => dlg.hidden && undo()
  orig.onclick = () => {
    const showOld = orig.textContent === "Show the original"
    s2.innerHTML = showOld ? OLD : NEW
    orig.textContent = showOld ? "Show the swap" : "Show the original"
  }
}

/* ---------- Recipes: scale and grams ---------- */
const PANCAKES = [
  { q: 2, u: "cup", us: "cups", g: 120, t: "all-purpose flour" },
  { q: 2, u: "tbsp", g: 12.5, t: "sugar" },
  { q: 2, u: "tsp", g: 4, t: "baking powder" },
  { q: 1.75, u: "cup", us: "cups", g: 245, t: "buttermilk" },
  { q: 2, t: "large eggs", one: "large egg" },
  { q: 4, u: "tbsp", g: 14.2, t: "butter, melted" },
]
function setupScale() {
  const el = $("#scaledemo")
  let serv = 4,
    grams = false
  const draw = () => {
    const k = serv / 4
    $("[data-serv]", el).textContent = `${serv} serving${serv === 1 ? "" : "s"}`
    $("[data-ings]", el).innerHTML = PANCAKES.map((l) => {
      const name = l.one && l.q * k <= 1 ? l.one : l.t
      return `<li><span class="cb"></span><span><b>${amount(l, k, grams)}</b> ${name}</span></li>`
    }).join("")
    $$("[data-unit]", el).forEach((b) =>
      b.setAttribute("aria-pressed", String((b.dataset.unit === "g") === grams))
    )
  }
  $$("[data-scale]", el).forEach(
    (b) =>
      (b.onclick = () => {
        serv = Math.min(12, Math.max(1, serv + +b.dataset.scale))
        draw()
      })
  )
  $$("[data-unit]", el).forEach(
    (b) =>
      (b.onclick = () => {
        grams = b.dataset.unit === "g"
        draw()
      })
  )
  draw()
}

/* ---------- Plan: fill the week ---------- */
const FILL = [
  {
    day: "Sun · Dinner",
    opts: [
      ["Beef Stew", "stew", "Something new"],
      ["Chickpea Curry", "chickpea", "Something new"],
      ["Birria Tacos", "birria", "New in your library"],
    ],
  },
  {
    day: "Mon · Dinner",
    opts: [
      ["Creamy Tomato Soup", "soup", "Meatless night"],
      ["Greek Orzo Bowls", "orzo", "Meatless night · 20 min"],
    ],
  },
  {
    day: "Tue · Dinner",
    opts: [
      ["Fish Tacos", "fish-tacos", "Taco night"],
      ["Chicken Tinga Tacos", "tinga", "Taco night · Chicken thighs on sale"],
    ],
  },
  {
    day: "Wed · Dinner",
    opts: [
      ["Miso Salmon", "salmon", "Fish night · Uses up the salmon"],
      ["Shrimp Scampi", "scampi", "Fish night · 20 min"],
    ],
  },
]
function setupFill() {
  const el = $("#filldemo")
  const pick = FILL.map(() => 0)
  let added = false
  const draw = () => {
    $("[data-fill-rows]", el).innerHTML = FILL.map((f, i) => {
      const [name, dish, why] = f.opts[pick[i]]
      return `<li class="entry ${added ? "fresh" : ""}" style="background:var(--muted)"><div class="ph" data-dish="${dish}"></div><div class="txt"><p class="cap">${f.day}</p><p class="meal-name">${name}</p><p class="sub"><span class="chip chip-acc">${why}</span></p></div>${added ? `<span class="sent">${ic("Tick02")}Added</span>` : `<button class="b b-out b-ic b-sm" data-reroll="${i}" aria-label="Another idea for ${f.day}">${ic("Refresh")}</button>`}</li>`
    }).join("")
    paintDishes(el)
    const add = $("[data-fill-add]", el)
    add.disabled = added
    add.textContent = added ? "Added to the plan" : "Add 4 to the plan"
    $("[data-fill-undo]", el).hidden = !added
    $("[data-fill-note]", el).textContent = added
      ? "Sample: 4 dinners added. Use Add from the plan to make a shopping list."
      : "Sample suggestions; recent meals influence real results."
  }
  el.addEventListener("click", (e) => {
    const r = e.target.closest("[data-reroll]")
    if (r) {
      const i = +r.dataset.reroll
      pick[i] = (pick[i] + 1) % FILL[i].opts.length
      draw()
    }
    if (e.target.closest("[data-fill-add]")) {
      added = true
      draw()
    }
    if (e.target.closest("[data-fill-undo]")) {
      added = false
      draw()
    }
  })
  draw()
}

/* ---------- Shop: Fry's, pantry count ---------- */
function setupFrys() {
  const el = $("#frysdemo")
  const btn = $("[data-frys]", el)
  const prices = $$("[data-pr]", el).map((p) => p.innerHTML)
  const total = $("[data-frys-total]", el).innerHTML
  let sent = false
  btn.onclick = () => {
    sent = !sent
    $$("[data-pr]", el).forEach(
      (p, i) =>
        (p.innerHTML = sent
          ? `<span class="sent">${ic("Tick02")}Sent</span>`
          : prices[i])
    )
    $("[data-frys-total]", el).innerHTML = sent
      ? `<span class="mf">Preview only. In Merran, review the real cart and checkout at the retailer.</span>`
      : total
    btn.className = sent ? "b b-out b-lg" : "b b-pri b-lg"
    btn.textContent = sent ? "Reset preview" : "Preview adding 5 to Fry's cart"
  }
}
const AFTER = {
  chicken: ["", true],
  rice: [" · 1 cup"],
  limes: [" · 1 tbsp"],
  cilantro: [" · ½ bunch"],
  pb: [" · have it"],
}
function setupCount() {
  const el = $("#countdemo")
  const btn = $("[data-cookbtn]", el)
  const before = Object.fromEntries(
    $$("[data-row]", el).map((r) => [
      r.dataset.row,
      $("[data-amt]", r).textContent,
    ])
  )
  const note = $("[data-countnote]", el)
  const NOTE = note.textContent
  let cooked = false
  btn.onclick = () => {
    cooked = !cooked
    $$("[data-row]", el).forEach((r) => {
      const [amt, gone] = AFTER[r.dataset.row]
      $("[data-amt]", r).textContent = cooked
        ? gone
          ? " · used up"
          : amt
        : before[r.dataset.row]
      r.classList.toggle("gone", cooked && !!gone)
      $$(".chip-acc", r).forEach((tag) => (tag.hidden = cooked))
      r.classList.remove("flash")
      void r.offsetWidth
      if (amt !== before[r.dataset.row] || gone) r.classList.add("flash")
    })
    note.textContent = cooked
      ? "Sample deduction: chicken thighs, 1 cup rice, 2 tbsp lime juice and ½ bunch cilantro. Unmeasured peanut butter stays because it was not reserved for this meal."
      : NOTE
    btn.className = cooked ? "b b-out" : "b b-pri"
    btn.textContent = cooked ? "Back to planned" : "Mark cooked"
  }
}

/* ---------- Cook view ---------- */
const RECIPE = {
  name: "Chicken + Rice with Peanut Sauce",
  ings: [
    "<b>1 cup</b> jasmine rice",
    "<b>2 lb</b> chicken thighs",
    "<b>1 tbsp</b> neutral oil",
    "<b>⅓ cup</b> peanut butter",
    "<b>2 tbsp</b> lime juice",
    "<b>2 tbsp</b> soy sauce",
    "<b>1 clove</b> garlic, grated",
    "<b>½ bunch</b> cilantro",
  ],
  steps: [
    {
      t: "Rinse the rice, then cook it with 1 ½ cups water, covered, for {18 minutes}.",
      m: 18,
      uses: [0],
    },
    {
      t: "Pat the chicken dry and season both sides with salt and pepper.",
      uses: [1],
    },
    {
      t: "Sear the chicken in the hot oil, {6 minutes} a side, until it reads 165°F inside.",
      m: 6,
      uses: [1, 2],
    },
    {
      t: "Whisk the peanut butter, lime juice, soy sauce and garlic until smooth, then thin it with warm water.",
      uses: [3, 4, 5, 6],
    },
    {
      t: "Slice the chicken and serve it over the rice with the sauce, cilantro and lime.",
      uses: [7],
    },
  ],
}
const COOKS = []
function Cook(host, init) {
  const N = RECIPE.steps.length
  const s = {
    page: 3,
    hands: false,
    heard: "",
    timers: [],
    used: new Set(),
    ticked: new Set(),
    stars: 0,
    saved: false,
  }
  let wait = 0
  const sub = () =>
    s.page === 0
      ? "Get ready · Preview"
      : s.page > N
        ? "Done · How did it go?"
        : `Step ${s.page} of ${N} · Preview`
  const timersHTML = () =>
    `<div class="tchips">${s.timers.map((t, i) => `<span class="tchip ${t.left <= 0 ? "done" : ""}">${ic("Timer02")}<span>${t.label}</span><span data-left>${t.left <= 0 ? "Done" : mmss(t.left)}</span><button data-plus="${i}" aria-label="Add a minute">+1</button><button data-tx="${i}" aria-label="Stop timer">${ic("Cancel01")}</button></span>`).join("")}</div>`
  const stepText = (st) =>
    st.t.replace(
      /\{(.+?)\}/,
      (_, w) =>
        `<button class="tbtn" data-start="${st.m}">${ic("Timer02")}${w}</button>`
    )
  function body() {
    if (s.page === 0)
      return `<p class="caps">Get ready</p><h2>Gather everything first</h2><p class="mf">Get it all out and measured, ticking things off as you go. Makes 4 servings.</p><p class="lastnote"><b>Last time (Oct 9):</b> needed more salt</p><ul class="ilist">${RECIPE.ings.map((x, i) => `<li class="${s.ticked.has(i) ? "ck" : ""}"><button class="cb" role="checkbox" aria-checked="${s.ticked.has(i)}" data-ing="${i}" aria-label="Got it">${ic("Tick02")}</button><span>${x}</span></li>`).join("")}</ul>`
    if (s.page > N) {
      const stars = `<div class="bigstars" role="group" aria-label="Rating">${[1, 2, 3, 4, 5].map((i) => `<button data-star="${i}" aria-label="${i} stars">${ic(i <= s.stars ? "StarFill" : "Star", i <= s.stars ? "" : "off")}</button>`).join("")}</div>`
      if (!s.saved)
        return `<p class="caps">Done</p><h2>How did it go?</h2>${stars}<div class="composer" style="min-height:5.5rem;align-items:flex-start;color:var(--foreground)"><span>Needed more salt. A squeeze of lime at the end would help.</span></div><button class="b b-pri b-lg" data-save style="justify-self:start">Save</button>`
      return `<p class="caps">Done</p><h2>How did it go?</h2>${stars}<p class="resolved">${ic("Tick02")}<span>Saved. ${s.stars} stars is the recipe's rating now.</span></p><div class="prop fadein"><div class="row" style="flex-wrap:wrap"><span class="bdg bdg-sec">Suggested change</span><span class="fw5">Chicken + Rice</span></div><p class="t-sm mf">Bumps the salt to 1 ½ tsp and adds a squeeze of lime at the end.</p><div class="row"><button class="b b-pri b-sm">Apply to recipe</button><button class="b b-ghost b-sm">Dismiss</button></div></div>`
    }
    const st = RECIPE.steps[s.page - 1]
    const next = RECIPE.steps[s.page]
    return `<p class="step-txt">${stepText(st)}</p><div class="forstep"><p class="t-sm fw5 mf">For this step</p><ul>${st.uses.map((i) => `<li><button aria-pressed="${s.used.has(i)}" data-use="${i}">${RECIPE.ings[i]}</button></li>`).join("")}</ul></div>${next ? `<p class="nextp"><b>Next:</b> ${next.t.replace(/[{}]/g, "")}</p>` : ""}`
  }
  // Each change draws the view again. The button that had focus gets it back
  // (or, once a timer it stopped is gone, New timer), so keyboard users keep
  // their place.
  function focusedKey() {
    const el = document.activeElement
    if (!el || !host.contains(el)) return null
    const [name, value] = Object.entries(el.dataset)[0] ?? []
    if (!name) return null
    const attr = name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)
    return { attr, value, timer: name === "plus" || name === "tx" }
  }
  function refocus(key) {
    if (!key) return
    const same = host.querySelector(`[data-${key.attr}="${key.value}"]`)
    const fallback = key.timer ? $("[data-newtimer]", host) : null
    ;(same ?? fallback ?? $("[data-next]", host))?.focus()
  }
  function render() {
    const key = focusedKey()
    draw()
    refocus(key)
  }
  function draw() {
    const listen = s.hands
      ? `<div class="listen"><i></i><span class="fw5">Voice preview</span><span class="mf">${s.heard ? `Simulated command: “${s.heard}”` : "No microphone is active. A sample next command follows."}</span></div>`
      : ""
    const last = s.page === N
    const fwd =
      s.page === 0
        ? `Start${ic("ArrowRight02")}`
        : s.page > N
          ? "Cook it again"
          : last
            ? "Done cooking"
            : `Next${ic("ArrowRight02")}`
    host.innerHTML = `<div class="cook"><div class="cook-h"><button class="b b-out" data-exit>${ic("Cancel01")}Exit</button><div class="t"><b>${RECIPE.name}</b><span>${sub()}</span></div><div class="row"><button class="b b-ic ${s.hands ? "b-pri" : "b-out"}" data-hands aria-pressed="${s.hands}" aria-label="Hands-free">${ic("Mic01")}</button><button class="b b-out b-ic" data-newtimer aria-label="New timer">${ic("Timer02")}</button></div>${listen}${s.timers.length ? timersHTML() : ""}</div><nav class="cprog" aria-label="Progress">${Array.from({ length: N + 1 }, (_, i) => `<i class="${i <= Math.min(s.page, N) ? "on" : ""}"></i>`).join("")}</nav><div class="cook-main">${body()}</div><div class="cook-f"><button class="b b-out b-lg" data-back ${s.page === 0 ? "disabled" : ""}>${ic("ArrowLeft02")}Back</button><button class="b b-pri b-lg" data-next>${fwd}</button></div></div>`
  }
  function hear() {
    clearTimeout(wait)
    if (!s.hands || s.page < 1 || s.page >= N) return
    wait = setTimeout(
      () => {
        s.heard = "next"
        s.page += 1
        render()
      },
      calm ? 600 : 2600
    )
  }
  host.addEventListener("click", (e) => {
    const t = e.target.closest("button")
    if (!t || t.disabled) return
    const d = t.dataset
    if ("next" in d)
      ((s.page = s.page > N ? 0 : s.page + 1),
        (s.heard = ""),
        (s.saved = s.page > N ? false : s.saved))
    else if ("back" in d) ((s.page = Math.max(0, s.page - 1)), (s.heard = ""))
    else if ("exit" in d) s.page = 0
    else if ("hands" in d) {
      s.hands = !s.hands
      s.heard = ""
      hear()
    } else if ("start" in d)
      s.timers.push({ label: `${d.start} min`, left: d.start * 60 })
    else if ("newtimer" in d) s.timers.push({ label: "10 min", left: 600 })
    else if ("plus" in d)
      s.timers[+d.plus].left = Math.max(0, s.timers[+d.plus].left) + 60
    else if ("tx" in d) s.timers.splice(+d.tx, 1)
    else if ("use" in d)
      s.used.has(+d.use) ? s.used.delete(+d.use) : s.used.add(+d.use)
    else if ("ing" in d)
      s.ticked.has(+d.ing) ? s.ticked.delete(+d.ing) : s.ticked.add(+d.ing)
    else if ("star" in d) s.stars = +d.star
    else if ("save" in d) {
      s.stars ||= 4
      s.saved = true
    } else return
    render()
  })
  const api = {
    // A tab opens its part of cooking. Timers, ticks, the rating and the
    // note carry on across tabs, as they do in the app.
    set(mode) {
      clearTimeout(wait)
      s.heard = ""
      s.hands = mode === "hands"
      s.page = { ready: 0, step: 3, hands: 2, done: N + 1 }[mode] ?? s.page
      render()
      hear()
    },
    // Only the times change, in place, so focus stays where it is.
    tick() {
      if (!s.timers.length) return
      s.timers.forEach((t) => t.left > 0 && (t.left -= 1))
      $$(".tchip", host).forEach((chip, i) => {
        const t = s.timers[i]
        if (!t) return
        chip.classList.toggle("done", t.left <= 0)
        $("[data-left]", chip).textContent = t.left <= 0 ? "Done" : mmss(t.left)
      })
    },
  }
  Object.assign(s, init)
  render()
  COOKS.push(api)
  return api
}

/* ---------- Assistant ---------- */
const CONVOS = {
  tonight: {
    me: "Saturday's open. What can I make with what we have?",
    tools: ["Looked at your pantry", "Looked at your recipes"],
    bot: "<p>Saturday is pasta night, and you've got heavy cream and parmesan to use. Two from your recipes fit:</p><ul><li><b>Creamy Lemon Orzo</b>, 25 min. Everything's home.</li><li><b>Spicy Rigatoni</b>, 25 min. It needs tomato paste.</li></ul>",
    card: {
      kind: "Meal plan",
      title: "Saturday's dinner",
      rows: [["Sat · Dinner", "Creamy Lemon Orzo · 4 servings"]],
      ok: "Add to plan",
      done: "Added 1 meal to the <u>plan</u>",
    },
  },
  lunches: {
    me: "Plan easy lunches for next week",
    ctx: "About the plan for Oct 18 – 24",
    tools: ["Looked at next week's plan", "Looked at your recipes"],
    bot: "<p>Example plan using chickpeas and feta. Wednesday leaves room for leftovers.</p>",
    card: {
      kind: "Meal plan",
      title: "Lunches, Oct 19 – 23",
      rows: [
        ["Mon · Lunch", "Greek Orzo Bowls · 2 servings"],
        ["Tue · Lunch", "Chickpea Salad Wraps · 2 servings"],
        ["Wed · Lunch", "Leftovers"],
        ["Thu · Lunch", "Creamy Tomato Soup · 2 servings"],
        ["Fri · Lunch", "Black Bean Quesadillas · 2 servings"],
      ],
      ok: "Add to plan",
      done: "Added 5 meals to the <u>plan</u>",
    },
  },
  birria: {
    me: "Find me a good birria recipe",
    tools: [
      "Searched the web for birria recipes",
      "Checked that Merran can open 3 pages",
    ],
    bot: "<p>An example search result to review before importing. This preview does not search the web or verify a recipe.</p>",
    card: {
      kind: "From the web",
      site: "Example recipe site",
      title: "Birria Tacos",
      sum: "Sample recipe card with a chile broth and consommé. Actual results depend on the model and source page.",
      ok: "Import",
      alt: "Open the page",
      no: "No thanks",
      done: "Imported <u>Birria Tacos</u>",
    },
  },
  buttermilk: {
    me: "No buttermilk. What can I use?",
    ctx: "About Buttermilk Pancakes",
    tools: ["Looked at your pantry"],
    bot: "<p>Stir <b>1 ¾ tbsp lemon juice</b> into <b>1 ¾ cups milk</b> and let it sit 5 minutes. You have both. They come out a touch less tangy and just as fluffy.</p>",
    card: {
      kind: "Suggested change",
      title: "Buttermilk Pancakes",
      sum: "Swaps the buttermilk for milk and lemon juice, with a step to let it sit.",
      ok: "Save as new recipe",
      alt: "Change the original",
      done: "Saved <u>Pancakes (milk and lemon)</u>",
    },
  },
  mushrooms: {
    me: "Jamie can't stand mushrooms",
    tools: [],
    bot: "<p>Want to add mushrooms to the household's foods to avoid? Review how firmly to avoid them in Tastes.</p>",
    card: {
      kind: "Remember",
      title: "Jamie doesn't eat mushrooms",
      sum: "Adds a household taste preference. Review its avoidance level in Settings → Household → Tastes.",
      ok: "Remember",
      no: "No thanks",
      done: "Remembered: Jamie doesn't eat mushrooms",
    },
  },
}
function cardHTML(c) {
  const rows = c.rows
    ? `<div class="rows">${c.rows.map(([a, b]) => `<div><span>${a}</span><span>${b}</span></div>`).join("")}</div>`
    : ""
  const site = c.site
    ? `<p class="t-xs fw6 pri" style="text-transform:uppercase;letter-spacing:.025em">${c.site}</p>`
    : ""
  return `<div class="prop fadein" data-card><div class="row" style="flex-wrap:wrap"><span class="bdg bdg-sec">${c.kind}</span><span class="fw5">${c.title}</span></div>${site}${c.sum ? `<p class="t-sm mf">${c.sum}</p>` : ""}${rows}<div class="row" style="flex-wrap:wrap"><button class="b b-pri b-sm" data-ok>${c.ok}</button>${c.alt ? `<button class="b b-out b-sm" disabled title="Illustrative control">${c.alt}</button>` : ""}<button class="b b-ghost b-sm" data-no>${c.no ?? "Dismiss"}</button></div></div>`
}
let convoRun = 0
function playConvo(key, instant) {
  const c = CONVOS[key]
  const box = $("[data-msgs]")
  const ctx = $("[data-ctx]")
  const run = ++convoRun
  $$("[data-convo]").forEach((b) =>
    b.setAttribute("aria-pressed", String(b.dataset.convo === key))
  )
  ctx.hidden = !c.ctx
  ctx.textContent = c.ctx ?? ""
  box.innerHTML = `<div class="me fadein">${c.ctx ? `<span class="t-xs mf">${c.ctx}</span>` : ""}<p>${c.me}</p></div><div class="bot" data-bot></div>`
  const bot = $("[data-bot]", box)
  const steps = [
    ...c.tools.map(
      (t) => () =>
        bot.insertAdjacentHTML(
          "beforeend",
          `<p class="tool fadein">${ic("Tick02")}${t}</p>`
        )
    ),
    () =>
      bot.insertAdjacentHTML(
        "beforeend",
        `<div class="fadein grid" style="gap:.75rem">${c.bot}</div>`
      ),
    () => {
      bot.insertAdjacentHTML("beforeend", cardHTML(c.card))
      const card = $("[data-card]", bot)
      card.addEventListener("click", (e) => {
        const ok = e.target.closest("[data-ok]"),
          no = e.target.closest("[data-no]")
        if (ok || no)
          card.outerHTML = `<p class="resolved fadein">${ok ? ic("Tick02") : ""}<span>${ok ? c.card.done : "Dismissed"}</span></p>`
      })
    },
  ]
  if (instant || calm) return steps.forEach((f) => f())
  let i = 0
  const nextStep = () => {
    if (run !== convoRun || i >= steps.length) return
    bot.querySelector(".thinking")?.remove()
    steps[i++]()
    if (i < steps.length)
      bot.insertAdjacentHTML(
        "beforeend",
        `<p class="tool thinking"><span class="typing"><i></i><i></i><i></i></span></p>`
      )
    box.scrollTop = box.scrollHeight
    setTimeout(nextStep, 650)
  }
  setTimeout(nextStep, 500)
}

/* ---------- Boot ---------- */
icons()
paintDishes()
setPal(PALS[store.get("merran-palette")] ? store.get("merran-palette") : "sage")
syncMode()
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", syncMode)
new MutationObserver(syncMode).observe(root, {
  attributes: true,
  attributeFilter: ["data-theme"],
})
$$("[data-pal]").forEach((b) => (b.onclick = () => setPal(b.dataset.pal)))
$$("[data-mode]").forEach(
  (b) =>
    (b.onclick = () => {
      root.dataset.theme = isDark() ? "light" : "dark"
      store.set("starlight-theme", root.dataset.theme)
    })
)

const nav = $(".nav")
addEventListener(
  "scroll",
  () => nav.classList.toggle("scrolled", scrollY > 8),
  { passive: true }
)

$("[data-sidebar-toggle]").onclick = (event) => {
  const collapsed = $("#app").classList.toggle("sidebar-collapsed")
  event.currentTarget.setAttribute("aria-expanded", String(!collapsed))
}
$("#app").addEventListener("keydown", (event) => {
  if (event.key === "Escape")
    $$(".demo-account[open]").forEach((menu) => {
      menu.open = false
      menu.querySelector("summary").focus()
    })
})
// The account menu closes when something else is clicked, like a menu does.
document.addEventListener("click", (event) =>
  closeAccountMenus(event.target.closest(".demo-account"))
)
// The preview shows more buttons than it acts on. One that's only for show
// says so, rather than seeming to do nothing.
const ACTS =
  "[data-go], [data-jump], [data-mode], [data-sidebar-toggle], [data-switch], [data-check], .item .cb"
const demoNote = $("[data-demo-note]")
let demoNoteTimer = 0
$("#app").addEventListener("click", (event) => {
  const button = event.target.closest("button")
  if (!button || button.matches(ACTS)) return
  demoNote.textContent =
    "That one's only for show in this preview. It works in Merran itself."
  clearTimeout(demoNoteTimer)
  demoNoteTimer = setTimeout(() => (demoNote.textContent = ""), 3000)
})
$$("#app [data-go]").forEach((b) => (b.onclick = () => go(b.dataset.go)))
$$("[data-jump]").forEach(
  (b) =>
    (b.onclick = () =>
      document
        .getElementById(b.dataset.jump)
        .scrollIntoView({ behavior: calm ? "auto" : "smooth" }))
)
$("#app").addEventListener("click", (e) => {
  const cb = e.target.closest(".item .cb")
  if (!cb) return
  const on = cb.getAttribute("aria-checked") !== "true"
  cb.setAttribute("aria-checked", String(on))
  cb.closest(".item").classList.toggle("done", on)
})
$$("[data-switch], [data-check]").forEach(
  (b) =>
    (b.onclick = () =>
      b.setAttribute(
        "aria-checked",
        String(b.getAttribute("aria-checked") !== "true")
      ))
)

const chCook = Cook($("[data-cook='chapter']"), {
  page: 3,
  timers: [{ label: "18 min", left: 12 * 60 + 41 }],
})
$("[data-cook-tabs]").addEventListener(
  "tab",
  (e) => e.detail.dataset.mode && chCook.set(e.detail.dataset.mode)
)
$$("[data-tabs]").forEach(setupTabs)
setupSwap()
setupScale()
setupFill()
setupFrys()
setupCount()

$$("[data-convo]").forEach(
  (b) => (b.onclick = () => playConvo(b.dataset.convo))
)
playConvo("tonight", true)

// The install tabs work like the chapters' tabs, arrow keys included.
setupTabs($(".term"))
const tt = $$(".term-tab")
$("[data-copy]").addEventListener("click", (e) => {
  const tab = tt.find((t) => t.getAttribute("aria-selected") === "true")
  const panel = document.getElementById(tab.getAttribute("aria-controls"))
  const text =
    panel.tagName === "PRE"
      ? panel.textContent
          .split("\n")
          .filter((l) => l.startsWith("$ ") || l.startsWith("    "))
          .map((l) => (l.startsWith("$ ") ? l.slice(2) : l))
          .join("\n")
      : panel.innerText
  const label = $("span", e.currentTarget)
  const done = (msg) => {
    label.textContent = msg
    setTimeout(() => (label.textContent = "Copy"), 1600)
  }
  navigator.clipboard.writeText(text).then(
    () => done("Copied"),
    () => {
      const r = document.createRange()
      r.selectNodeContents(panel)
      getSelection().removeAllRanges()
      getSelection().addRange(r)
      done("Selected")
    }
  )
})

setInterval(() => {
  $$("[data-count]").forEach((el) => {
    const left = (+el.dataset.count || 342) - 1
    el.dataset.count = left > 0 ? left : 342
    el.textContent = mmss(left > 0 ? left : 342)
  })
  COOKS.forEach((c) => c.tick())
}, 1000)
