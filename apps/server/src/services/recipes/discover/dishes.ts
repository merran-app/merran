// Telling one dish from another by the words in a recipe's name.

/** Words in recipe names that don't say which dish it is. */
const FILLER = new Set(
  "a an and the with my our best easy quick simple homemade perfect ultimate favorite favourite classic recipe ingredient minute".split(
    " "
  )
)

/** The words in a recipe's name that say which dish it is. */
function dishWords(name: string) {
  return new Set(
    name
      .toLowerCase()
      .split(/[^\p{L}]+/u)
      .filter((word) => word.length > 1 && !FILLER.has(word))
  )
}

/**
 * Whether two names are takes on one dish: "Easy Honey Garlic Salmon" and
 * "Honey Garlic Glazed Salmon".
 */
export function sameDish(a: string, b: string) {
  const one = dishWords(a)
  const two = dishWords(b)
  const both = [...one].filter((word) => two.has(word)).length
  const either = one.size + two.size - both
  return either > 0 && both / either >= 0.6
}
