/**
 * Whether a drawer, dialog or menu is open: page gestures leave the page
 * alone then, so a drawer's own swipe and scrolling stay its own.
 */
export function overlayOpen() {
  return (
    document.querySelector(
      '[role="dialog"], [role="alertdialog"], [role="menu"]'
    ) !== null
  )
}
