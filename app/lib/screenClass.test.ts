import { describe, expect, it } from "vitest";
import { isPhoneScreen } from "./screenClass";

describe("isPhoneScreen", () => {
  it("recognises a phone in portrait", () => {
    expect(isPhoneScreen(390, 844)).toBe(true);
    expect(isPhoneScreen(360, 800)).toBe(true);
  });

  it("recognises a phone held sideways, where the viewport is tablet wide", () => {
    expect(isPhoneScreen(844, 390)).toBe(true);
    expect(isPhoneScreen(932, 430)).toBe(true);
  });

  it("accepts a tablet in either orientation", () => {
    expect(isPhoneScreen(768, 1024)).toBe(false);
    expect(isPhoneScreen(1024, 768)).toBe(false);
    expect(isPhoneScreen(600, 1024)).toBe(false);
  });

  it("accepts a desktop screen", () => {
    expect(isPhoneScreen(1280, 720)).toBe(false);
    expect(isPhoneScreen(1920, 1080)).toBe(false);
  });
});
