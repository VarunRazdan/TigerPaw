import { describe, expect, it } from "vitest";
import {
  cleanOwnerEntries,
  isPlausibleOwnerEntry,
  looksChannelPrefixed,
  looksLikeE164,
  readOwnerEntriesFromConfig,
} from "../owner-page-helpers.js";

describe("looksLikeE164", () => {
  it("accepts a typical international number", () => {
    expect(looksLikeE164("+85290263757")).toBe(true);
    expect(looksLikeE164("+14155551234")).toBe(true);
  });

  it("trims whitespace before validating", () => {
    expect(looksLikeE164("  +85290263757  ")).toBe(true);
  });

  it("rejects values without leading +", () => {
    expect(looksLikeE164("85290263757")).toBe(false);
  });

  it("rejects values starting with 0 (invalid country code)", () => {
    expect(looksLikeE164("+085290263757")).toBe(false);
  });

  it("rejects too-short and too-long numbers", () => {
    expect(looksLikeE164("+12345")).toBe(false); // 5 digits — below 7-digit floor
    expect(looksLikeE164("+1234567890123456")).toBe(false); // 16 digits — above E.164 cap
  });

  it("rejects numbers with spaces, dashes, or parens", () => {
    expect(looksLikeE164("+1 415 555 1234")).toBe(false);
    expect(looksLikeE164("+1-415-555-1234")).toBe(false);
    expect(looksLikeE164("+1(415)5551234")).toBe(false);
  });
});

describe("looksChannelPrefixed", () => {
  it("accepts channel-prefixed forms", () => {
    expect(looksChannelPrefixed("whatsapp:+85290263757")).toBe(true);
    expect(looksChannelPrefixed("telegram:@user")).toBe(true);
    expect(looksChannelPrefixed("discord:1234567890")).toBe(true);
  });

  it("rejects entries without a channel before the colon", () => {
    expect(looksChannelPrefixed(":+85290263757")).toBe(false);
    expect(looksChannelPrefixed("+85290263757:")).toBe(false);
    expect(looksChannelPrefixed("+85290263757")).toBe(false);
  });

  it("rejects channel names that don't start with a letter", () => {
    expect(looksChannelPrefixed("1channel:value")).toBe(false);
    expect(looksChannelPrefixed("-channel:value")).toBe(false);
  });
});

describe("isPlausibleOwnerEntry", () => {
  it("is true for E.164 or channel-prefixed", () => {
    expect(isPlausibleOwnerEntry("+85290263757")).toBe(true);
    expect(isPlausibleOwnerEntry("telegram:@user")).toBe(true);
  });

  it("is false for free-form text we don't recognize", () => {
    expect(isPlausibleOwnerEntry("hello")).toBe(false);
    expect(isPlausibleOwnerEntry("85290263757")).toBe(false);
  });
});

describe("cleanOwnerEntries", () => {
  it("trims whitespace and drops empties", () => {
    expect(cleanOwnerEntries(["  +85290263757  ", "", "   ", "+14155551234"])).toEqual([
      "+85290263757",
      "+14155551234",
    ]);
  });

  it("dedupes while preserving order", () => {
    expect(
      cleanOwnerEntries([
        "+85290263757",
        "+14155551234",
        "+85290263757",
        "  +14155551234  ",
        "+447700900000",
      ]),
    ).toEqual(["+85290263757", "+14155551234", "+447700900000"]);
  });

  it("returns an empty array for an empty input", () => {
    expect(cleanOwnerEntries([])).toEqual([]);
  });
});

describe("readOwnerEntriesFromConfig", () => {
  it("returns [] when the config has no commands.ownerAllowFrom", () => {
    expect(readOwnerEntriesFromConfig({})).toEqual([]);
    expect(readOwnerEntriesFromConfig({ commands: {} })).toEqual([]);
    expect(readOwnerEntriesFromConfig(null)).toEqual([]);
    expect(readOwnerEntriesFromConfig("not an object")).toEqual([]);
  });

  it("reads string entries", () => {
    expect(
      readOwnerEntriesFromConfig({
        commands: { ownerAllowFrom: ["+85290263757", "  +14155551234  "] },
      }),
    ).toEqual(["+85290263757", "+14155551234"]);
  });

  it("coerces numeric entries to strings (schema is Array<string|number>)", () => {
    expect(
      readOwnerEntriesFromConfig({
        commands: { ownerAllowFrom: [85290263757, "+14155551234"] },
      }),
    ).toEqual(["85290263757", "+14155551234"]);
  });

  it("filters out empties and non-string/non-number entries", () => {
    expect(
      readOwnerEntriesFromConfig({
        commands: { ownerAllowFrom: ["+85290263757", "", null, true, { foo: "bar" }] },
      }),
    ).toEqual(["+85290263757"]);
  });

  it("returns [] when ownerAllowFrom is not an array", () => {
    expect(readOwnerEntriesFromConfig({ commands: { ownerAllowFrom: "+85290263757" } })).toEqual(
      [],
    );
  });
});
