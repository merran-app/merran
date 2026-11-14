import * as React from "react"

/** Whether the browser makes a box as tall as its text by itself. */
function sizesItself() {
  return typeof CSS !== "undefined" && CSS.supports("field-sizing", "content")
}

/** As tall as the text in it, borders included. */
function fit(box: HTMLTextAreaElement) {
  box.style.height = "auto"
  const borders = box.offsetHeight - box.clientHeight
  box.style.height = `${box.scrollHeight + borders}px`
}

/**
 * Makes a box as tall as its text where the browser doesn't do it itself
 * (`field-sizing: content` isn't in every browser yet). A step's box starts
 * one line high, so without this the rest of a long step would be hidden.
 */
export function useGrowWithText(box: HTMLTextAreaElement | null, text: string) {
  React.useLayoutEffect(() => {
    if (box && !sizesItself()) fit(box)
  }, [box, text])

  // Narrower or wider, the text wraps onto more or fewer lines.
  React.useEffect(() => {
    if (!box || sizesItself()) return
    let width = box.clientWidth
    const observer = new ResizeObserver(() => {
      if (box.clientWidth === width) return
      width = box.clientWidth
      fit(box)
    })
    observer.observe(box)
    return () => observer.disconnect()
  }, [box])
}
