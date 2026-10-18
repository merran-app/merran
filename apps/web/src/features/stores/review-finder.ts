import { createContext } from "react"

export type ReviewFinder = {
  title: string
  description: string
  back: () => void
  returnFocus: HTMLElement | null
}

/** A desktop finder can use the review's dialog without unmounting its basket. */
export const ReviewFinderContext = createContext<{
  target: HTMLDivElement | null
  show: (finder: ReviewFinder | null) => void
} | null>(null)
