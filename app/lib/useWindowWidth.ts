"use client";

import { useEffect, useState } from "react";
import { isPhoneScreen } from "./screenClass";

/** Width below which the layout drops secondary tabs — including the game board. */
export const SmallScreenWidth = 600;

/** Tracks `window.innerWidth`, shared by every responsive part of the app. */
export function useWindowWidth(fallback: number = 1200): number {
  const [windowWidth, setWindowWidth] = useState<number>(
    typeof window !== "undefined" ? window.innerWidth : fallback,
  );

  useEffect(() => {
    const handleResize = () => { setWindowWidth(window.innerWidth); };
    window.addEventListener("resize", handleResize);
    handleResize();
    return () => { window.removeEventListener("resize", handleResize); };
  }, []);

  return windowWidth;
}

/**
 * Whether the window is too narrow for the game board. Small screens hide the game tab
 * entirely, so anything that would send the user there has to check this first.
 */
export function useIsSmallScreen(): boolean {
  return useWindowWidth() < SmallScreenWidth;
}

/**
 * Whether the browser is running on a handheld phone, which has no game board. Read during the
 * first render like `useWindowWidth`, so the header and the join link agree; the rule uses the
 * screen rather than the viewport, because a phone held sideways is wider than a tablet is tall.
 */
export function useIsPhone(): boolean {
  const [isPhone, setIsPhone] = useState<boolean>(() => (
    typeof window === "undefined" ? false : isPhoneScreen(window.screen.width, window.screen.height)
  ));

  useEffect(() => {
    const update = () => {
      setIsPhone(isPhoneScreen(window.screen.width, window.screen.height));
    };
    window.addEventListener("resize", update);
    update();
    return () => { window.removeEventListener("resize", update); };
  }, []);

  return isPhone;
}

/**
 * Whether the game board is offered on this device: the window has to be wide enough to lay the
 * board out, and the screen has to be a tablet's or a desktop's rather than a phone's.
 */
export function useCanPlayGame(): boolean {
  const isSmallScreen = useIsSmallScreen();
  const isPhone = useIsPhone();
  return !isSmallScreen && !isPhone;
}
