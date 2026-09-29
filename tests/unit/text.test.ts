import { describe, expect, it } from "vitest";
import { buildTsQuery, normalizeForSearch, requireText, slugify } from "@/lib/text";

describe("normalizeForSearch", () => {
  it("strips ʻokina and kahakō", () => {
    expect(normalizeForSearch("ʻŌlelo Hawaiʻi")).toBe("olelo hawaii");
    expect(normalizeForSearch("Moʻolelo")).toBe("moolelo");
    expect(normalizeForSearch("kāne wahine")).toBe("kane wahine");
  });
  it("treats apostrophe stand-ins for ʻokina the same", () => {
    expect(normalizeForSearch("Hawai'i")).toBe("hawaii");
    expect(normalizeForSearch("Hawai‘i")).toBe("hawaii");
    expect(normalizeForSearch("Hawai`i")).toBe("hawaii");
  });
});

describe("slugify", () => {
  it("produces ASCII slugs", () => {
    expect(slugify("ʻŌlelo Hawaiʻi")).toBe("olelo-hawaii");
    expect(slugify("Moʻolelo Hawaiʻi")).toBe("moolelo-hawaii");
    expect(slugify("  Intro: Sounds & Letters! ")).toBe("intro-sounds-letters");
  });
  it("never returns an empty slug", () => {
    expect(slugify("!!!")).toBe("item");
  });
});

describe("buildTsQuery", () => {
  it("builds prefix terms", () => {
    expect(buildTsQuery("ʻŌlelo Hawaiʻi")).toBe("olelo:* & hawaii:*");
  });
  it("drops tsquery operators", () => {
    expect(buildTsQuery("a & b | !c")).toBe("a:* & b:* & c:*");
  });
  it("returns null for empty input", () => {
    expect(buildTsQuery("  ʻ  ")).toBeNull();
  });
});

describe("requireText", () => {
  it("validates length", () => {
    expect(requireText("  hi there ", "Title", 2, 20)).toBe("hi there");
    expect(() => requireText("x", "Title", 2, 20)).toThrow(/at least 2/);
    expect(() => requireText("x".repeat(21), "Title", 2, 20)).toThrow(/at most 20/);
    expect(() => requireText(undefined, "Title", 1, 20)).toThrow();
  });
});

import { safePath } from "@/lib/action";

describe("safePath", () => {
  it("allows same-site paths only", () => {
    expect(safePath("/c/olelo-hawaii")).toBe("/c/olelo-hawaii");
    expect(safePath("//evil.example/x")).toBe("/");
    expect(safePath("/\\evil.example")).toBe("/");
    expect(safePath("https://evil.example")).toBe("/");
    expect(safePath("", "/admin")).toBe("/admin");
  });
});
