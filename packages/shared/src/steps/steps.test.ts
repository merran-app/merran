import { describe, expect, test } from "vitest"
import { firstDuration, splitDurations } from "./durations.ts"
import { foodNames, ingredientsInStep } from "./step-ingredients.ts"
import { notesInStep } from "./step-notes.ts"

describe("times in a step", () => {
  test("are split out with their length in seconds", () => {
    expect(splitDurations("Bake 25 minutes, then rest 30 secs.")).toEqual([
      { type: "text", text: "Bake " },
      { type: "duration", text: "25 minutes", seconds: 1500, upTo: null },
      { type: "text", text: ", then rest " },
      { type: "duration", text: "30 secs", seconds: 30, upTo: null },
      { type: "text", text: "." },
    ])
  })

  test("start a range at the low end, and keep its high end", () => {
    expect(firstDuration("Simmer 5–7 min until thick")).toEqual({
      type: "duration",
      text: "5–7 min",
      seconds: 300,
      upTo: 420,
    })
    expect(firstDuration("Roast for 10 to 12 mins")).toMatchObject({
      seconds: 600,
      upTo: 720,
    })
  })

  test("read halves, decimals and hours", () => {
    expect(firstDuration("Braise 1½ hours")?.seconds).toBe(5400)
    expect(firstDuration("Chill 1.5 hrs")?.seconds).toBe(5400)
    expect(firstDuration("Rest ½ hour")?.seconds).toBe(1800)
    expect(firstDuration("Cook 2 hours")?.seconds).toBe(7200)
  })

  test("read a minute, an hour and half an hour in words", () => {
    expect(firstDuration("Stir for a minute.")).toEqual({
      type: "duration",
      text: "a minute",
      seconds: 60,
      upTo: null,
    })
    expect(firstDuration("Simmer for an hour, stirring")?.seconds).toBe(3600)
    expect(firstDuration("Rest for half an hour")).toEqual({
      type: "duration",
      text: "half an hour",
      seconds: 1800,
      upTo: null,
    })
    expect(firstDuration("Cook a few minutes, in a pan")).toBeUndefined()
  })

  test("leave a step without one as it is", () => {
    const step = "Season to taste and serve at 2 o'clock."
    expect(splitDurations(step)).toEqual([{ type: "text", text: step }])
    expect(firstDuration(step)).toBeUndefined()
    expect(splitDurations("Bake 0 minutes")).toEqual([
      { type: "text", text: "Bake 0 minutes" },
    ])
  })
})

describe("ingredients in a step", () => {
  const ingredients = [
    { id: "garlic", food: "garlic cloves" },
    { id: "oil", food: "olive oil" },
    { id: "tomatoes", food: "can chopped tomatoes" },
    { id: "onion", food: "red onion" },
    { id: "seasoning", food: "Salt and pepper" },
    { id: "unknown", food: null },
  ]

  test("are found by the words a step uses for them", () => {
    expect(
      ingredientsInStep(
        "Heat the oil, then add the onion and a clove of garlic.",
        ingredients
      )
    ).toEqual(new Set(["oil", "onion", "garlic"]))
    expect(ingredientsInStep("Tip in the tomato.", ingredients)).toEqual(
      new Set(["tomatoes"])
    )
    expect(ingredientsInStep("Season with salt.", ingredients)).toEqual(
      new Set(["seasoning"])
    )
  })

  test("aren't found from words that only describe them", () => {
    expect(
      ingredientsInStep("You can add red wine if you like.", ingredients)
    ).toEqual(new Set())
    expect(foodNames("large fresh eggs")).toEqual([["egg"]])
    expect(foodNames("cornflour / cornstarch")).toEqual([
      ["cornflour"],
      ["cornstarch"],
    ])
  })

  test("are the whole food a step names before a word of another", () => {
    const lines = [
      { id: "rice", food: "White rice" },
      { id: "vinegar", food: "rice vinegar" },
      { id: "onion", food: "onion" },
      { id: "powder", food: "onion powder" },
    ]
    expect(
      ingredientsInStep("Serve over rice with a little onion.", lines)
    ).toEqual(new Set(["rice", "onion"]))
    expect(ingredientsInStep("Stir in the onion powder.", lines)).toEqual(
      new Set(["powder"])
    )
  })

  test("leave out what an except names", () => {
    const lines = [
      { id: "juice", food: "orange juice" },
      { id: "garlic", food: "garlic cloves" },
    ]
    expect(
      ingredientsInStep("Mix the juice with everything but not garlic.", lines)
    ).toEqual(new Set(["juice"]))
  })
})

describe("ingredients in a step of a recipe with sections", () => {
  // RecipeTin Eats' orange chicken: soy sauce, ginger and cornflour for
  // the chicken and again for its sauce.
  const lines = [
    { id: "chicken", food: "boneless skinless chicken thighs or breast" },
    { id: "soy", food: "light soy sauce", quantity: 2, unit: "tablespoon" },
    { id: "ginger", food: "finely grated ginger", quantity: 0.5 },
    { id: "pepper", food: "white pepper" },
    {
      id: "mix",
      food: "cornflour / cornstarch",
      quantity: 2,
      unit: "tablespoon",
    },
    { id: "coat", food: "cornflour / cornstarch", quantity: 0.75, unit: "cup" },
    { id: "oil", food: "vegetable oil" },
    ...[
      { id: "zest", food: "orange zest" },
      { id: "juice", food: "orange juice" },
      { id: "sauceFlour", food: "cornflour / cornstarch", quantity: 1.5 },
      { id: "wine", food: "Chinese cooking wine" },
      { id: "sugar", food: "white sugar" },
      { id: "sauceSoy", food: "light soy sauce" },
      { id: "sauceGinger", food: "ginger" },
      { id: "garlic", food: "garlic cloves" },
    ].map((line) => ({ ...line, section: "Orange sauce" })),
    { id: "rice", food: "White rice", section: "For serving" },
    { id: "onion", food: "green onion", section: "For serving" },
  ]
  const steps = [
    {
      text: "Orange sauce - Whisk the cornflour and soy sauce until lump free. Then whisk in everything else except garlic and orange zest.",
    },
    {
      text: "Coat chicken - Mix the chicken with the soy sauce, ginger, pepper and the 2 tablespoons of cornflour. Add the 3/4 cup cornflour and toss.",
    },
    {
      text: "Sauté - Pour out all but 2 tablespoons of the oil. Sauté garlic until light golden.",
      section: "Orange sauce",
    },
    {
      text: "Thicken sauce - Give the sauce a whisk, then simmer. Stir in zest.",
      section: "Orange sauce",
    },
    {
      text: "Toss - Toss the chicken in the sauce. Serve over rice, garnished with green onion.",
      section: "Orange sauce",
    },
  ]
  const inStep = (at: number) =>
    [...ingredientsInStep(steps[at]!, lines, steps)].sort()

  test("are its section's, for a step about that section", () => {
    // Named by its first words, and "everything else" is the rest of it.
    expect(inStep(0)).toEqual(
      ["juice", "sauceFlour", "wine", "sugar", "sauceSoy", "sauceGinger"].sort()
    )
    expect(inStep(2)).toEqual(["garlic", "oil"])
  })

  test("are the ones no section's steps claim, with the amounts it gives", () => {
    expect(inStep(1)).toEqual(
      ["chicken", "coat", "ginger", "mix", "pepper", "soy"].sort()
    )
  })

  test("don't count the sauce being made as soy sauce", () => {
    expect(inStep(3)).toEqual(["zest"])
    expect(inStep(4)).toEqual(["chicken", "onion", "rice"])
    // A section for a food, not something made, still finds it.
    expect(
      ingredientsInStep("Shred the chicken.", [
        { id: "chicken", food: "rotisserie chicken", section: "Chicken" },
      ])
    ).toEqual(new Set(["chicken"]))
  })
})

describe("notes a step points to", () => {
  const notes = [
    "1. Soy sauce – not dark soy.",
    "3. Crispy coating – press the cornflour on.",
    "Note 12: Freezes well.",
    "Leftovers keep for 3 days.",
  ].join("\n\n")

  test("are the notes with the numbers it gives", () => {
    expect(
      notesInStep("Shake off the excess cornflour. (Note 3)", notes)
    ).toEqual(["3. Crispy coating – press the cornflour on."])
    expect(notesInStep("See notes 12 and note 1.", notes)).toEqual([
      "Note 12: Freezes well.",
      "1. Soy sauce – not dark soy.",
    ])
  })

  test("are none for a note the recipe hasn't got, or a step with none", () => {
    expect(notesInStep("Fry it (Note 2).", notes)).toEqual([])
    expect(notesInStep("Serve.", notes)).toEqual([])
    expect(notesInStep("Fry it (Note 1).", null)).toEqual([])
  })
})
