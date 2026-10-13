/** Scales an ingredient quantity from the meal's base servings to a target number of servings (AC-8). */
export function scaleQuantity(quantity: number, baseServings: number, targetServings: number): number {
  return (quantity * targetServings) / baseServings;
}
