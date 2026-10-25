/**
 * Device classification for the game board, which needs a tablet-sized screen rather than a
 * phone. Everything here is pure so the rules can be tested without a browser.
 */

/**
 * The shortest screen side that still counts as a tablet. Phones stay below it in every
 * orientation, which is why the rule reads the screen instead of the viewport: a phone held
 * sideways is wider than this, and a desktop window can be narrower than a tablet.
 */
export const GameMinShortSide = 600;

/** Whether a screen of this CSS-pixel size belongs to a handheld phone. */
export function isPhoneScreen(screenWidth: number, screenHeight: number): boolean {
  return Math.min(screenWidth, screenHeight) < GameMinShortSide;
}
