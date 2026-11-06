// A rating is stars, from half a star to five, in halves: the server checks
// ratings against these, and the app's stars are picked by them.

/** The most stars a recipe can have. */
export const MAX_STARS = 5

/** Ratings go up in halves, and half a star is the lowest. */
export const STAR_STEP = 0.5
