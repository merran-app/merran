let active: (() => void) | undefined

/** A little reward for finishing, independent of the page or dialog that follows. */
export function celebrate() {
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)")
  if (motion.matches || !Element.prototype.animate || active) return

  const layer = document.createElement("div")
  layer.setAttribute("aria-hidden", "true")
  layer.style.cssText =
    "position:fixed;inset:0;overflow:hidden;pointer-events:none;z-index:100"
  document.body.append(layer)

  const animations: Animation[] = []
  const stop = () => {
    animations.forEach((animation) => animation.cancel())
    layer.remove()
    motion.removeEventListener("change", stop)
    window.clearTimeout(timeout)
    active = undefined
  }
  active = stop
  motion.addEventListener("change", stop)
  const timeout = window.setTimeout(stop, 4600)

  // Each celebration rains down: paper confetti, stars, or rounded petals.
  const kind = Math.floor(Math.random() * 3)
  const colors = [
    "--chart-1",
    "--chart-2",
    "--chart-3",
    "--chart-4",
    "--chart-5",
  ]
  const height = window.innerHeight
  for (let i = 0; i < 100; i++) {
    // Separate falling from fluttering so pieces sway rather than travel in a line.
    const falling = document.createElement("span")
    const piece = document.createElement("span")
    const size = 7 + Math.random() * 9
    const start = 24 + Math.random() * 140
    const drift = (Math.random() - 0.5) * 180
    const sway = 15 + Math.random() * 35
    const spin = Math.random() * 360
    const direction = Math.random() < 0.5 ? -1 : 1
    const duration = 2400 + Math.random() * 900
    const delay = Math.random() * 1100
    falling.style.cssText = `position:absolute;left:${Math.random() * 100}%;top:-${start}px`
    piece.style.cssText = `display:block;width:${size}px;height:${kind === 0 ? size * 0.55 : size}px;background:var(${colors[i % colors.length]});border-radius:${kind === 2 ? "80% 0 80% 0" : "1px"}`
    if (kind === 1) {
      piece.style.clipPath =
        "polygon(50% 0%,61% 35%,98% 35%,68% 57%,79% 95%,50% 72%,21% 95%,32% 57%,2% 35%,39% 35%)"
    }
    falling.append(piece)
    layer.append(falling)
    animations.push(
      falling.animate(
        [
          { transform: "translate3d(0, 0, 0)", opacity: 1 },
          { opacity: 1, offset: 0.85 },
          {
            transform: `translate3d(${drift}px, ${height + start + 40}px, 0)`,
            opacity: 0,
          },
        ],
        {
          duration,
          delay,
          easing: "cubic-bezier(0.35, 0.15, 0.65, 0.85)",
          fill: "both",
        }
      ),
      piece.animate(
        Array.from({ length: 5 }, (_, step) => ({
          transform: `translateX(${Math.sin((step * Math.PI) / 2) * sway}px) rotate(${spin + step * direction * 90}deg) rotateY(${step * 180}deg)`,
        })),
        { duration: 1400 + Math.random() * 800, iterations: Infinity }
      )
    )
  }
}
