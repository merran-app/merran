# Public website browser QA — 2026-10-17

Read-only QA of the current `codex/merran-public-site` checkout. **No fixes applied.** This report is internal and is not published with the public guides.

## Scope and environment

- Used the Codex in-app browser with explicit CSS viewport sizes: 320×740, 390×844, 768×1024, 1024×768, and 1280×900. These are responsive viewport checks, not physical phone/tablet or Safari/Firefox certification.
- Initially inspected the existing development server at `http://127.0.0.1:4321/`. Used the already-built site at `http://127.0.0.1:4322/` for production search, clipboard, API, theme persistence and further layout checks. Did not rebuild or edit the site.
- Homepage: inspected shell, all five demo screens, feature tabs, cooking controls, assistant, feature disclosures, comparison, install commands, costs and footer. Documentation: welcome, shopping/pantry guide, API quickstart, generated API overview and a long-path operation (`sethouseholdaikeycredit`).
- All three palettes in light and dark were visually inspected on the mobile homepage and tablet API documentation; persistence from homepage into docs was checked for all six combinations.
- Search and representative navigation were exercised in the browser. The existing checker additionally passed **81,718 local links/fragments/assets across 265 pages**. This does not establish external-site availability or live Merran API behavior.
- Browser screenshots were inspected during the run. Measurements below are CSS pixels; a scrollbar can make the document client width smaller than the requested viewport width.

## Findings

### QA-01 — High: installation tabs cannot be switched using the keyboard

**Where:** Homepage → Self-hosted → Compose / Docker run / Dockge or Portainer. All sizes.

**Reproduce:** Focus Compose, press Right Arrow, then Tab. Right Arrow leaves Compose selected; Tab goes straight to Copy. The other two tabs have `tabindex="-1"` and cannot be reached through normal sequential navigation.

**Impact:** Keyboard users cannot select the alternative installation instructions. The recipe/planning/shop/cook tab systems do implement arrow navigation, so behavior is inconsistent.

**Evidence:** Active element stayed `tt-cli`; all inactive `.term-tab` elements retained tabindex −1. Relevant implementation: `apps/docs/src/scripts/landing.js`, installation-tab setup near line 959.

### QA-02 — High: timer ticks discard keyboard focus

**Where:** Homepage → Cook → One step at a time. All sizes.

**Reproduce:** Focus Add a minute and press Tab to focus Stop timer. Leave focus there while the countdown ticks. Within the next tick, focus moves to `BODY` instead of remaining on Stop timer.

**Impact:** Keyboard users lose their place and cannot reliably operate the timer controls. This can also disrupt assistive-technology navigation.

**Evidence:** DOM focus read first returned `BUTTON`, aria-label `Stop timer`; the subsequent read returned `BODY`. `Cook.tick()` in `landing.js` replaces `.tchips` using `outerHTML` each second.

### QA-03 — Medium: phone Plan screen is roughly twice as wide as its scroll area

**Where:** Homepage main demo → Plan. Confirmed at 390×844 in the built preview; smaller overflow at 1024×768.

**Reproduce:** On a phone viewport, select Plan from the bottom bar. The title is visible, but header actions and the right side of day cards extend beyond the visible demo.

**Evidence:** At 390px, `#app-main` client width was **338px**, scroll width **665px**. At 1024px with expanded sidebar, those widths were **676px / 681px**. Phone screenshots show the folded week summary and Thursday card clipped on the right; the header's action group lies off-screen.

**Impact:** Important controls and meal details require unintended horizontal scrolling. The nested vertical scroller makes the hidden content easy to miss.

### QA-04 — Medium: selected store card collapses into a pill and contributes to List overflow

**Where:** Homepage main demo → List. Phone, tablet and desktop.

**Reproduce:** Open List. Compare the selected Fry's card to Costco. Fry's is a single short horizontal strip; its descriptive text runs toward/behind the neighboring card rather than forming a card body.

**Evidence:** At 1280px, `.card3.store.sel` computed to **32px high**, `display:flex`, padding `0px 12px`; Costco was **173px high**, `display:grid`, padding `20px`. At 390px, List's main scroll area was **338px wide / 744px scroll width**. At 1024px it was **676px / 747px**; at 768px, **684px / 731px**.

**Likely cause:** The later generic `.sel` rule in `landing.css` overrides card layout with compact selector styles. This is source evidence, not a fix applied during QA.

### QA-05 — Medium: AI-cost table creates whole-page horizontal overflow on phones

**Where:** Homepage → What the AI costs. 320px and 390px widths.

**Reproduce:** Load the homepage at either width and scroll to the cost table. The right-hand descriptions extend beyond the page. A horizontal scrollbar is present for the whole document; horizontal movement can offset the header and other sections as well.

**Evidence:** Document scroll width measured **411px** at both 320px and 390px viewports. The uncontained overflowing elements were `.costs table` and its rows/cells. `.costs td:last-child` has `white-space: nowrap`.

**Impact:** Rightmost text is clipped, and the page is no longer horizontally stable. The comparison table's own horizontal scrolling is contained and is a different, expected behavior.

### QA-06 — Medium: documentation header overlaps at 320px

**Where:** Documentation header, including Shopping and pantry. 320×740.

**Reproduce:** Open a documentation page at 320px. The logo, Search, full theme select and Menu compete for the same row.

**Observed:** The Menu button overlaps the theme selector; “Light” is partially obscured. At 390px these controls fit, and the menu opened/closed normally.

**Impact:** The theme and navigation controls are visually ambiguous on narrow phones.

**Relevant source:** `apps/docs/src/components/SiteHeader.astro`, small-screen header rules.

### QA-07 — Medium: a desktop-only sidebar toggle remains visible on phones

**Where:** Homepage main demo top bar. 320/390px; also the 768px page where the embedded demo is narrower than its sidebar breakpoint.

**Reproduce:** At phone width, inspect the demo's top-left corner. A sidebar icon appears before the mobile wordmark even though the sidebar is hidden and bottom tabs are in use. Activating it changes expanded state but does not reveal a sidebar at that width.

**Impact:** Wastes scarce header space and presents an apparently nonworking navigation control.

**Likely cause:** `.ui .b` has higher selector specificity than `.tb-side { display: none; }`. The control remains visible as an inline flex button.

### QA-08 — Medium: homepage content shows through the sticky header too strongly

**Where:** Homepage sticky site header, especially while reading lower sections. Observed at phone, tablet and desktop widths in light and dark modes.

**Reproduce:** Scroll until body copy or a large heading passes behind the site header. Background text remains legible through the header and overlaps the wordmark/navigation visually.

**Observed:** Large assistant headings, recipe descriptions and hero copy were visible behind the header. Light-mode body text produces particularly busy overlapping text; dark mode shows it too.

**Impact:** Navigation readability and visual separation deteriorate while scrolling. This is a visual finding; no contrast compliance claim is made.

### QA-09 — Medium: supported feature statements are still struck through

**Where:** Homepage → Bring the weekly routine together. All sizes and themes.

**Reproduce:** Read the first line in each of the four cards. “Work with your own recipe library,” “Keep track of what is already home,” “Review products before sending a list,” and “Make use of available nutrition data” are shown with line-through styling.

**Impact:** These are now affirmative descriptions of supported workflows, but the styling presents them as obsolete or undesirable behavior. This is a leftover presentation mismatch following the copy audit.

**Evidence:** `.why-list .was` still applies `text-decoration: line-through` in `landing.css`.

### QA-10 — Medium: autopilot preview overruns its phone panel

**Where:** Homepage → Planning → On autopilot. 390×844.

**Reproduce:** Select On autopilot at phone width. Inspect the right edge of the schedule card and its surrounding panel.

**Evidence:** `#p-p3` client width was **316px**, scroll width **334px**. The schedule card pushes into the right padding and its right border/corner is clipped by the preview surface.

**Impact:** The panel loses its intended inset and appears misaligned compared with the other tabs. A smaller 4px overrun was also measured on the receipt panel; that needs a closer visual follow-up before classifying it as a separate defect.

### QA-11 — Low: changing cook tabs resets timers and state

**Where:** Homepage → Cook tabs. All sizes.

**Reproduce:** In One step at a time, add a minute and start a second timer. Switch to Get ready and back to One step at a time.

**Observed:** The extra timer disappears and the original returns to the hard-coded **12:41**. The state setter also resets stars and saved-note state.

**Impact:** The preview contradicts the adjacent continuity message about timers running elsewhere in the app. These are scripted scene resets, not evidence that the real app loses timers; the reset behavior is not explained at the controls.

### QA-12 — Low: “Download OpenAPI JSON” opens an inline document

**Where:** `/docs/api/` → Download OpenAPI JSON.

**Reproduce:** Activate the link. It navigates the current tab to `/openapi.json`, rendering the JSON, instead of triggering a file download.

**Evidence:** The link has no `download` attribute. The target is valid and displays OpenAPI 3.1.0 with Merran API metadata; availability is not broken.

**Impact:** Label/action mismatch and an unexpected departure from the guide. Users can still save the JSON themselves.

### QA-13 — Low: sample account popover stays open after navigation

**Where:** Homepage main demo → account menu. Confirmed desktop.

**Reproduce:** Open the sidebar account disclosure, then select Today or another demo screen outside the popover.

**Observed:** The account `<details>` retains its `open` attribute and the popover remains over the new screen. Escape closes it and returns focus to its summary.

**Impact:** Unlike a conventional account dropdown, it does not dismiss on outside interaction or navigation. It may obscure the new content until explicitly closed.

### QA-14 — Low: main-demo actions look active despite having no action

**Where:** Homepage main demo, including Today → Start cooking / Mark cooked and various filters/edit controls.

**Reproduce:** Activate Start cooking on Today. No view change or feedback occurs. Compare with the functioning navigation, feature tabs and chapter controls.

**Impact:** The global notice says only selected controls work, but active-looking primary buttons make it unclear which controls are interactive. This is a preview usability issue, not a claim that the real application lacks these actions. Inert controls should be distinguished during a later design pass.

## Checks that passed

- Mobile docs Menu opens the navigation drawer; Escape closes it and returns focus. Sidebar links and mobile page-contents anchors navigate correctly. The tested store-connections heading cleared the sticky header at about 140px from the viewport top.
- Docs layouts at 390, 768, 1024 and 1280px were readable on the sampled pages. The long generated API path and code sample scroll within their own containers; no document overflow was measured on that operation at 390 or 768px.
- Homepage desktop sidebar collapse/expand and all five screen switches work. Phone bottom tabs switch all five screens. Account disclosure supports Enter and Escape with a visible outline.
- Homepage skip link receives visible keyboard focus and activates `#main-content`. Feature-tab Right Arrow navigation changes selection, updates the panel and moves focus; the observed focus outline was 2px solid. This does not excuse QA-01 in the separate install tabs.
- Every recipe/planning/shopping/cooking feature tab was activated. All selected states and target panels updated. Most mobile panels fit their container; exceptions are noted above.
- Scaling increased servings from 4 to 5, and Metric updated recognized quantities (example: flour to 300g). Planning re-roll changes the suggestion; Add 4 updates the sample and exposes Undo. Cart preview changes to Reset preview and resets. Mark cooked in the pantry chapter updates measured amounts and exposes Back to planned.
- Cooking countdowns decrease while staying in the same scene. Add a minute increases the remaining time; the step-duration button starts a six-minute timer; Stop removes it; New timer adds a ten-minute sample. Ingredient check state toggles. Hands-free displays the explicitly simulated voice state. Continuity/focus defects are separately listed above.
- All five assistant prompts selected their corresponding sample conversation; the sample Add to plan approval displayed “Added 1 meal to the plan.” This did not call a provider or change a real household.
- Search for `pantry` returned **36 results**, led by Shopping and pantry. Tab reached Clear and then the first result; Enter opened the guide. Focus was visibly outlined. Ctrl+K opened search; Escape returned focus to Search. A deliberately nonexistent term returned an explicit no-results message.
- Documentation and API code-copy buttons showed confirmation; an API cURL snippet was pasted successfully into local search. Homepage Compose and Docker commands were also pasted back for verification: shell prompts were removed and line breaks/continuations were preserved. No commands were executed. Clipboard reads could lag until a native paste, so copy behavior was judged from the actual paste rather than an immediate clipboard read.
- All six palette/mode combinations rendered and persisted into documentation after reload. No broken theme assets or unreadable body-text areas were observed in these samples. A measured WCAG contrast audit was not performed.
- OpenAPI JSON opened successfully; generated reference and operation links worked. The static link checker found no broken local references.

## Follow-up scope and limitations

- Fixes are intentionally deferred. No application source, site source, workflow or deployment configuration was changed during this QA pass.
- Highest-priority follow-up: keyboard access to installation alternatives and timer focus stability, then phone overflow/header collisions and the selected store-card style collision.
- Only sampled documentation pages were visually inspected; the link checker covers the full generated site, but that is not a screenshot review of all 265 pages.
- Real iOS/Android browser behavior, touch/virtual keyboard behavior, screen readers, Safari/Firefox, zoom/text-size accessibility, formally measured contrast, hosted Pages routing, live AI/retailer integrations and fresh-release installation remain separate checks.
- Publication remains manual. These findings are not a release certification.

## Fixes — 2026-10-17

All 14 findings are fixed in `apps/docs`. Each was rechecked in the dev server (Chrome in the Claude app's browser), at 320, 390, 768, 1024 and 1280px where width mattered. Docs typecheck, tests, Prettier and the build passed, and the build's checker again found no broken links among 81,718 across 265 pages.

| Finding | What changed |
| --- | --- |
| QA-01 install tabs | The three tabs have a `role="tablist"` of their own, without the Copy button, and use the chapters' tab code: Left/Right move between them and switch the panel. |
| QA-02 timer focus | A tick only updates each timer's time in place. Any other change in the cook view gives focus back to the same button, or to New timer once the stopped timer is gone. |
| QA-03 Plan overflow | Every demo screen is one column as wide as the window (`minmax(0, 1fr)`), so long rows wrap or truncate. All five screens fit at every width. |
| QA-04 store card | The selected store card is `.store.picked`, no longer colliding with the dropdown pills' `.sel`. |
| QA-05 cost table | Descriptions wrap; on phones each cost goes under what it's for. The page no longer scrolls sideways at 320 or 390px. |
| QA-06 docs header | At 30rem and under, the header's theme select is hidden; the Menu drawer has its own. |
| QA-07 sidebar toggle | `.ui .tb-side` hides it on phones; it shows only with the desktop sidebar. |
| QA-08 header see-through | The homepage header is 94% opaque, with more blur. |
| QA-09 struck-through lines | Each card's first line is its title (`.lead`, bold) and the rest its detail (`.detail`, muted). Nothing is struck through. |
| QA-10 autopilot overrun | The previews' grids are one column the panel's width, dialogs too, and settings rows wrap. The tilted receipt has room for its corners. Every chapter panel fits at 320px and up; the recipe and swap panels overran at 320px too, and are fixed the same way. |
| QA-11 cook tabs reset | Switching cook tabs keeps timers, ticked ingredients, the rating and the saved note. |
| QA-12 OpenAPI download | Both links download `merran-openapi.json`. |
| QA-13 account popover | It closes on a click outside it and when another screen opens. |
| QA-14 inert controls | Start cooking jumps to the cook demo, and Fill the week to the planning demo. Any other button that's only for show says so in a note above the bottom bar. |

The limitations above still apply: real devices, screen readers, Safari and Firefox weren't tested.
