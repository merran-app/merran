# Mobile gestures

Planned November 8, 2026. Merran is made for a phone on the kitchen counter, but on a phone today everything is a tap: a "⋯" menu, then an item. This plan adds the gestures people expect from apps on their phone, so the common things are a swipe away. It doesn't take any tap away: every gesture has another way to do the same thing.

What's there already, and stays:

- **A long press starts selecting** on things on the list, pantry items, meals on the plan and recipe cards (`useLongPress` in `features/select/use-selection.ts`). It gives up once a finger moves more than 10px, so it never fights a swipe.
- **Drawers close with a swipe down** ([platform.md](platform.md#mobile-overlays)).
- **Cooking swipes between steps**, and **the plan drags meals** between days, each with its own pointer code.
- **Right-click menus** ignore touch ([platform.md](platform.md#context-menus)).

## What's in this round

Decided with the user, November 8, 2026:

| Gesture | Where | Decision |
|---|---|---|
| Swipe a row | Things on the shopping list, pantry items | A short swipe shows a button; a long swipe does it at once, with Undo |
| Pull to refresh | Every page, in the installed app | Only where the browser doesn't already do it |
| Swipe back from the left edge | Every page, in the installed app on iOS | Only where the phone doesn't already do it |

Not this round: swiping meals on the plan (they drag already), recipe editor lines, and swiping between days or lists.

## How it's built

Three hooks of our own on pointer events, in `apps/web/src/features/gestures/`, in the style of the cooking view's swipe and the plan's drag. No gesture library: the hard parts are how a gesture gets along with long presses, select mode, scrolling and drawers, and a library doesn't do those for us. We looked at `@use-gesture/react` (good maths, still another dependency) and `motion` (heavy for three gestures).

The maths (which way a finger's going, how far is far enough, how fast is a flick) is in one file of plain functions, `swipe-math.ts`, with tests run by `node --test` like the plan's `optimistic-move.test.ts`.

### Swiping a row

`useSwipeRow` and a `<SwipeRow>` that wraps a row's content, with an action on each side.

- **Touch and pen only.** A mouse never swipes; a computer has the "⋯" menu and right clicks. Below 768px only, and never while selecting, when a tap picks the row.
- **Scrolling stays the phone's own.** The row is `touch-action: pan-y`. It only becomes a swipe once a finger has gone 10px sideways, and further sideways than up or down; until then it's a scroll, and a long press can still start.
- **A short swipe** of more than 72px opens the row on its action's button, and it stays open. A tap on the button does it. A tap anywhere else, a scroll, or opening another row closes it: one row is open at a time.
- **A long swipe,** past half the row's width or a quick flick, does the action as the finger lifts. The phone buzzes (10ms, as a long press does) when the swipe goes past halfway, so you know letting go will do it, and dragging back cancels.
- **Every action is one that's there already,** with the message and **Undo** it already has:

| Row | Swipe left (red) | Swipe right |
|---|---|---|
| A thing on the list | **Remove** (`useListActions().remove`) | Check it off, or back on (`change`) |
| A pantry item | **Used up** (`usePantryActions().remove`, with **Put on the list** when meals counted on it) | Put it on the list (`toList`) |

- **Screen readers** don't swipe: the revealed buttons are hidden from them, and the row's "⋯" menu does the same things.

### Pull to refresh

`usePullToRefresh`, mounted once in the app's layout.

- **Only in the installed app** (`display-mode: standalone`, the same test as `features/install/install.ts`). Chrome on Android and Safari in a tab pull to refresh by themselves, and two would fight. In the installed app the page is `overscroll-behavior-y: contain`.
- **Only from the top:** the page is scrolled all the way up, no drawer or dialog is open, and the finger is going down.
- **The pull resists** (it moves less than the finger), and a spinner comes down with it. Let go past 64px and Merran fetches everything on screen again (`queryClient.refetchQueries({ type: "active" })`); the spinner stays until it's done. Let go sooner and it slides back.

### Swiping back from the edge

`useEdgeBack`, in the app's layout too.

- **Only in the installed app on iOS,** which has no back button and no back gesture. Android phones have their own, and Safari in a tab swipes back by itself.
- **From the left edge:** a touch that starts within 20px of it and goes 80px right goes back (`router.history.back()`). A chevron follows the finger, so it's clear what letting go will do.
- **Not** when there's nowhere to go back to, when a drawer or dialog is open, while cooking (which swipes between steps), or when the touch began on a row that swipes.

## Checking it

- The tests for `swipe-math.ts`, added to the web app's `test` script.
- By hand in the dev server with a phone-sized window and touch on, then on a real iPhone and Android phone, installed and in the browser: rows swipe and scroll, long presses still select, pull to refresh and the edge swipe only where they should be.

## Keeping it current

When it's built: [platform.md](platform.md) gets a "Mobile gestures" section with the rules above, [features.md](features.md) its row, and the "Shopping and pantry" guide says what swiping a row does, with the labels as the app shows them.
