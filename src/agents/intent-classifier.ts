/**
 * Fast, stateless, regex-based intent classification for model routing.
 * Zero LLM calls, zero I/O. Purely synchronous.
 *
 * Classification priority (first match wins):
 *   code > search > reasoning > creative > general
 */

export type IntentCategory = "search" | "reasoning" | "code" | "creative" | "general";

export type ClassificationResult = {
  intent: IntentCategory;
  confidence: "high" | "medium";
  matchedPattern?: string;
};

// Static patterns compiled once at module load.

const CODE_PATTERNS: RegExp[] = [
  /```[\s\S]/,
  /\bwrite\s+(?:(?:a|an|me)\s+)?(?:\w+\s+)*?(?:code|script|function|program|class|method|module|component|api|endpoint)\b/i,
  /\b(?:debug|fix|refactor|implement|compile|transpile|lint|parse)\s+(?:this|the|my|a|an)\b/i,
  /\b(?:fix|resolve)\s+(?:the\s+)?(?:bug|error|issue|crash|exception|warning)\b/i,
  /\bsyntax\s+error\b/i,
  /\b(?:import|export|require)\s*[{(]/,
  /\b(?:TypeError|ReferenceError|SyntaxError|RuntimeError|NullPointerException|StackOverflow)\b/,
  /\bpull\s+request\b|\bcode\s+review\b|\bgit\s+(?:commit|merge|rebase|diff)\b/i,
];

const SEARCH_PATTERNS: RegExp[] = [
  /\b(?:search|google|find\s+(?:out|me|information))\s+(?:for|about)\b/i,
  /\blook\s+up\b/i,
  /\bwhat(?:'s|s|\s+is)\s+happening\s+(?:in|with|at)\b/i,
  /\b(?:latest|recent|current|today'?s|this\s+week'?s)\s+(?:news|price|score|results?|updates?|status|events?|headlines?)\b/i,
  /\bwho\s+(?:won|scored|leads?|is\s+winning)\b/i,
  /\b(?:weather|forecast)\s+(?:in|for|at|today|tomorrow|this\s+week)\b/i,
  /\bnews\s+(?:about|on|from|regarding)\b/i,
  /\b(?:stock|crypto|bitcoin|btc|eth|market)\s+price\b/i,
  /\bwhat\s+(?:time|day)\s+is\s+it\s+in\b/i,
  /\bhow\s+much\s+(?:does|is|are|did)\b.{0,200}\bcost\b/i,
];

const REASONING_PATTERNS: RegExp[] = [
  /\bexplain\s+(?:why|how|the\s+(?:difference|reason|logic|concept))\b/i,
  /\bcompare\s+(?:and\s+)?contrast\b/i,
  /\bcompare\b.{0,100}\b(?:and|vs\.?|versus|with|to)\b/i,
  /\banalyz[ei]\s+(?:this|the|my|these|those)\b/i,
  /\bprove\s+(?:that|this|it|the)\b/i,
  /\bcalculate\s+(?:the|this|my)\b/i,
  /\bstep\s+by\s+step\b/i,
  /\b(?:what|how)\s+(?:are|is|would\s+be)\s+the\s+(?:pros|cons|implications|consequences|tradeoffs?|trade-offs?|advantages|disadvantages)\b/i,
  /\b(?:mathematical|theorem|equation|integral|derivative|matrix|eigenvalue)\b/i,
  /\bsolve\s+(?:this|the|for)\b/i,
  /\bderive\s+(?:the|a|an)\b/i,
  /\bwhat\s+(?:would|will)\s+happen\s+if\b/i,
];

const CREATIVE_PATTERNS: RegExp[] = [
  /\bwrite\s+(?:(?:a|an|me)\s+)?(?:\w+\s+)*?(?:story|poem|song|essay|article|fiction|novel|letter|speech|script|dialogue|monologue)\b/i,
  /\bcreative\s+writing\b/i,
  /\bimagine\s+(?:a|that|if|you)\b/i,
  /\bonce\s+upon\s+a\s+time\b/i,
  /\b(?:haiku|limerick|sonnet|screenplay|short\s+story)\b/i,
  /\bmake\s+(?:up|me)\s+a\s+(?:story|poem|joke|song)\b/i,
  /\bcontinue\s+(?:the|this)\s+story\b/i,
];

function matchPatterns(
  body: string,
  patterns: RegExp[],
  intent: IntentCategory,
): ClassificationResult | null {
  for (const pattern of patterns) {
    if (pattern.test(body)) {
      return { intent, confidence: "high", matchedPattern: pattern.source };
    }
  }
  return null;
}

// Cap input length to prevent regex performance degradation on very long messages.
const MAX_CLASSIFY_LENGTH = 2000;

export function classifyMessageIntent(body: string): ClassificationResult {
  if (!body || !body.trim()) {
    return { intent: "general", confidence: "high" };
  }

  const trimmed = body.trim().slice(0, MAX_CLASSIFY_LENGTH);

  // Priority order: code > search > reasoning > creative > general
  return (
    matchPatterns(trimmed, CODE_PATTERNS, "code") ??
    matchPatterns(trimmed, SEARCH_PATTERNS, "search") ??
    matchPatterns(trimmed, REASONING_PATTERNS, "reasoning") ??
    matchPatterns(trimmed, CREATIVE_PATTERNS, "creative") ?? {
      intent: "general",
      confidence: "high",
    }
  );
}
