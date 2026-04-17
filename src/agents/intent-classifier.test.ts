import { describe, expect, it } from "vitest";
import { classifyMessageIntent, type IntentCategory } from "./intent-classifier.js";

function expectIntent(body: string, expected: IntentCategory) {
  const result = classifyMessageIntent(body);
  expect(result.intent).toBe(expected);
  expect(result.confidence).toBe("high");
}

describe("classifyMessageIntent", () => {
  describe("code intent", () => {
    it("detects code fences", () => {
      expectIntent("Can you fix this?\n```js\nconst x = 1;\n```", "code");
    });

    it("detects write code requests", () => {
      expectIntent("Write a function to sort an array", "code");
      expectIntent("write me a script to parse CSV", "code");
      expectIntent("Write code to connect to a database", "code");
    });

    it("detects debug requests", () => {
      expectIntent("Debug this error please", "code");
      expectIntent("debug the login function", "code");
    });

    it("detects refactor requests", () => {
      expectIntent("Refactor this component to use hooks", "code");
    });

    it("detects fix bug requests", () => {
      expectIntent("Fix the bug in the auth module", "code");
      expectIntent("fix the error in production", "code");
    });

    it("detects error type names", () => {
      expectIntent("I'm getting a TypeError: undefined is not a function", "code");
      expectIntent("NullPointerException on line 42", "code");
    });

    it("detects import statements", () => {
      expectIntent("import { useState } from 'react'", "code");
    });

    it("detects code review / git", () => {
      expectIntent("Review this pull request", "code");
      expectIntent("Help me with this git merge conflict", "code");
    });
  });

  describe("search intent", () => {
    it("detects search requests", () => {
      expectIntent("search for restaurants near me", "search");
      expectIntent("Look up the capital of France", "search");
    });

    it("detects current events", () => {
      expectIntent("What's happening in Ukraine today?", "search");
      expectIntent("what's happening with the economy", "search");
    });

    it("detects latest/current/today queries", () => {
      expectIntent("latest Bitcoin price", "search");
      expectIntent("current stock price of Tesla", "search");
      expectIntent("today's headlines", "search");
    });

    it("detects who won queries", () => {
      expectIntent("Who won the Super Bowl?", "search");
      expectIntent("Who scored in the last match?", "search");
    });

    it("detects weather queries", () => {
      expectIntent("Weather in New York tomorrow", "search");
      expectIntent("What's the forecast for this week?", "search");
    });

    it("detects news queries", () => {
      expectIntent("News about the election", "search");
    });

    it("detects price queries", () => {
      expectIntent("How much does a PS5 cost these days?", "search");
    });
  });

  describe("reasoning intent", () => {
    it("detects explain why", () => {
      expectIntent("Explain why the sky is blue", "reasoning");
    });

    it("detects compare and contrast", () => {
      expectIntent("Compare and contrast TCP vs UDP", "reasoning");
      expectIntent("Compare React and Vue", "reasoning");
    });

    it("detects analysis requests", () => {
      expectIntent("Analyze this business proposal", "reasoning");
      expectIntent("Analyze these financial results", "reasoning");
    });

    it("detects proof requests", () => {
      expectIntent("Prove that the square root of 2 is irrational", "reasoning");
    });

    it("detects calculations", () => {
      expectIntent("Calculate the monthly payment on a $300k mortgage", "reasoning");
    });

    it("detects step by step", () => {
      expectIntent("Walk me through this step by step", "reasoning");
    });

    it("detects pros/cons requests", () => {
      expectIntent("What are the pros and cons of remote work?", "reasoning");
      expectIntent("What are the implications of this policy?", "reasoning");
    });

    it("detects math terms", () => {
      expectIntent("Find the integral of x squared", "reasoning");
      expectIntent("Solve this equation for x", "reasoning");
    });

    it("detects hypothetical reasoning", () => {
      expectIntent("What would happen if interest rates doubled?", "reasoning");
    });
  });

  describe("creative intent", () => {
    it("detects story writing", () => {
      expectIntent("Write a story about a dragon", "creative");
      expectIntent("Write me a short story", "creative");
    });

    it("detects poem requests", () => {
      expectIntent("Write a poem about autumn", "creative");
    });

    it("detects song requests", () => {
      expectIntent("Write a song about friendship", "creative");
    });

    it("detects essay requests", () => {
      expectIntent("Write an essay on climate change", "creative");
    });

    it("detects creative writing", () => {
      expectIntent("Help me with some creative writing", "creative");
    });

    it("detects imagination prompts", () => {
      expectIntent("Imagine a world where cats can talk", "creative");
      expectIntent("Imagine that you are a pirate captain", "creative");
    });

    it("detects once upon a time", () => {
      expectIntent("Once upon a time in a land far away...", "creative");
    });

    it("detects specific forms", () => {
      expectIntent("Write me a haiku about the ocean", "creative");
      expectIntent("Write a screenplay for a heist movie", "creative");
    });

    it("detects story continuation", () => {
      expectIntent("Continue the story from where we left off", "creative");
    });
  });

  describe("general intent (default)", () => {
    it("classifies greetings as general", () => {
      expectIntent("Hello!", "general");
      expectIntent("Hi, how are you?", "general");
      expectIntent("Good morning", "general");
    });

    it("classifies generic questions as general", () => {
      expectIntent("What time is it?", "general");
      expectIntent("Thank you", "general");
      expectIntent("Can you help me?", "general");
    });

    it("classifies translations as general", () => {
      expectIntent("Translate this to Spanish", "general");
    });

    it("classifies reminders as general", () => {
      expectIntent("Remind me to buy groceries", "general");
    });

    it("classifies short messages as general", () => {
      expectIntent("ok", "general");
      expectIntent("yes", "general");
      expectIntent("no", "general");
    });

    it("classifies empty/whitespace as general", () => {
      expectIntent("", "general");
      expectIntent("   ", "general");
    });
  });

  describe("edge cases", () => {
    it("is case insensitive", () => {
      expectIntent("SEARCH FOR restaurants", "search");
      expectIntent("WRITE A POEM", "creative");
      expectIntent("EXPLAIN WHY this works", "reasoning");
    });

    it("code beats search for ambiguous messages", () => {
      // "search for Python code" has both search and code patterns
      // but "write code" patterns are checked first
      expectIntent("Write a Python script to search for files", "code");
    });

    it("handles very long messages (truncated to 2000 chars for safety)", () => {
      // Pattern within the 2000-char cap is detected
      const withinCap = "search for " + "x".repeat(1500);
      expect(classifyMessageIntent(withinCap).intent).toBe("search");

      // Pattern beyond the 2000-char cap is safely ignored (classified as general)
      const beyondCap = "x".repeat(2500) + " search for something";
      expect(classifyMessageIntent(beyondCap).intent).toBe("general");
    });

    it("handles non-English text as general", () => {
      expectIntent("Bonjour, comment allez-vous?", "general");
      expectIntent("Hola, que tal?", "general");
      expectIntent("こんにちは", "general");
    });
  });

  describe("performance", () => {
    it("classifies 1000 messages quickly", () => {
      const messages = [
        "Hello, how are you?",
        "Search for the latest news",
        "Write a Python function",
        "Explain why the sky is blue",
        "Write me a poem about love",
        "What time is it?",
        "Debug this error",
        "Compare TCP and UDP",
        "Latest bitcoin price",
        "Imagine a world without gravity",
      ];

      const start = performance.now();
      for (let i = 0; i < 100; i++) {
        for (const msg of messages) {
          classifyMessageIntent(msg);
        }
      }
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(50);
    });
  });
});
