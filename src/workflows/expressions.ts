/**
 * Safe recursive-descent expression parser for the workflow template system.
 *
 * Templates like `{{uppercase(symbol)}}` or `{{if(price > 100, "high", "low")}}`
 * are parsed and evaluated WITHOUT `eval` or `Function`. The parser handles the
 * expression INSIDE the `{{ }}` delimiters.
 *
 * Operator precedence (lowest → highest):
 *   1. Ternary    ? :
 *   2. Logical OR ||
 *   3. Logical AND &&
 *   4. Equality   == !=
 *   5. Comparison > < >= <=
 *   6. Addition   + -
 *   7. Multiply   * / %
 *   8. Unary      ! (negate)
 *   9. Call / member access  fn() obj.key
 *
 * Safety limits:
 *   - Max expression length: 10 000 chars
 *   - Max recursion depth: 50
 *   - Max operations: 100 000
 *   - Max string length: 1 MB
 *   - No prototype traversal (Object.hasOwn only)
 */

// ── Safety constants ─────────────────────────────────────────────────

const MAX_EXPRESSION_LENGTH = 10_000;
const MAX_RECURSION_DEPTH = 50;
const MAX_OPERATIONS = 100_000;
const MAX_STRING_LENGTH = 1_048_576;

// ── Error class ──────────────────────────────────────────────────────

/** Error thrown during expression parsing or evaluation. */
export class ExpressionError extends Error {
  constructor(
    message: string,
    public position?: number,
  ) {
    super(message);
    this.name = "ExpressionError";
  }
}

// ── Token types ──────────────────────────────────────────────────────

type TokenType =
  | "NUMBER"
  | "STRING"
  | "BOOLEAN"
  | "NULL"
  | "IDENTIFIER"
  | "OPERATOR"
  | "LPAREN"
  | "RPAREN"
  | "COMMA"
  | "DOT"
  | "QUESTION"
  | "COLON"
  | "EOF";

type Token = {
  type: TokenType;
  value: string;
  position: number;
};

// ── AST node types ───────────────────────────────────────────────────

type NumberLiteral = { kind: "NumberLiteral"; value: number };
type StringLiteral = { kind: "StringLiteral"; value: string };
type BooleanLiteral = { kind: "BooleanLiteral"; value: boolean };
type NullLiteral = { kind: "NullLiteral" };
type Identifier = { kind: "Identifier"; name: string };
type MemberAccess = { kind: "MemberAccess"; object: ASTNode; property: string };
type FunctionCall = { kind: "FunctionCall"; name: string; args: ASTNode[] };
type UnaryOp = { kind: "UnaryOp"; operator: string; operand: ASTNode };
type BinaryOp = { kind: "BinaryOp"; operator: string; left: ASTNode; right: ASTNode };
type TernaryOp = { kind: "TernaryOp"; condition: ASTNode; consequent: ASTNode; alternate: ASTNode };

type ASTNode =
  | NumberLiteral
  | StringLiteral
  | BooleanLiteral
  | NullLiteral
  | Identifier
  | MemberAccess
  | FunctionCall
  | UnaryOp
  | BinaryOp
  | TernaryOp;

// ── Tokenizer ────────────────────────────────────────────────────────

const OPERATOR_CHARS = new Set(["+", "-", "*", "/", "%", "=", "!", ">", "<", "&", "|"]);

const TWO_CHAR_OPERATORS = new Set(["==", "!=", ">=", "<=", "&&", "||"]);

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    const ch = input[i];

    // Skip whitespace
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      i++;
      continue;
    }

    // String literals
    if (ch === '"' || ch === "'") {
      const quote = ch;
      const start = i;
      i++; // skip opening quote
      let value = "";
      while (i < input.length && input[i] !== quote) {
        if (input[i] === "\\") {
          i++;
          if (i >= input.length) {
            throw new ExpressionError("Unterminated string escape", i);
          }
          const escaped = input[i];
          switch (escaped) {
            case "n":
              value += "\n";
              break;
            case "t":
              value += "\t";
              break;
            case "\\":
              value += "\\";
              break;
            case '"':
              value += '"';
              break;
            case "'":
              value += "'";
              break;
            default:
              value += escaped;
          }
        } else {
          value += input[i];
        }
        i++;
      }
      if (i >= input.length) {
        throw new ExpressionError("Unterminated string literal", start);
      }
      i++; // skip closing quote
      tokens.push({ type: "STRING", value, position: start });
      continue;
    }

    // Numbers
    if (
      (ch >= "0" && ch <= "9") ||
      (ch === "." && i + 1 < input.length && input[i + 1] >= "0" && input[i + 1] <= "9")
    ) {
      const start = i;
      let num = "";
      while (i < input.length && ((input[i] >= "0" && input[i] <= "9") || input[i] === ".")) {
        num += input[i];
        i++;
      }
      if (isNaN(Number(num))) {
        throw new ExpressionError(`Invalid number: ${num}`, start);
      }
      tokens.push({ type: "NUMBER", value: num, position: start });
      continue;
    }

    // Identifiers, keywords (true, false, null)
    if ((ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || ch === "_") {
      const start = i;
      let ident = "";
      while (
        i < input.length &&
        ((input[i] >= "a" && input[i] <= "z") ||
          (input[i] >= "A" && input[i] <= "Z") ||
          (input[i] >= "0" && input[i] <= "9") ||
          input[i] === "_")
      ) {
        ident += input[i];
        i++;
      }
      if (ident === "true" || ident === "false") {
        tokens.push({ type: "BOOLEAN", value: ident, position: start });
      } else if (ident === "null") {
        tokens.push({ type: "NULL", value: ident, position: start });
      } else {
        tokens.push({ type: "IDENTIFIER", value: ident, position: start });
      }
      continue;
    }

    // Two-char operators
    if (i + 1 < input.length && TWO_CHAR_OPERATORS.has(input[i] + input[i + 1])) {
      tokens.push({ type: "OPERATOR", value: input[i] + input[i + 1], position: i });
      i += 2;
      continue;
    }

    // Single-char operators
    if (OPERATOR_CHARS.has(ch)) {
      tokens.push({ type: "OPERATOR", value: ch, position: i });
      i++;
      continue;
    }

    // Punctuation
    if (ch === "(") {
      tokens.push({ type: "LPAREN", value: ch, position: i });
      i++;
      continue;
    }
    if (ch === ")") {
      tokens.push({ type: "RPAREN", value: ch, position: i });
      i++;
      continue;
    }
    if (ch === ",") {
      tokens.push({ type: "COMMA", value: ch, position: i });
      i++;
      continue;
    }
    if (ch === ".") {
      tokens.push({ type: "DOT", value: ch, position: i });
      i++;
      continue;
    }
    if (ch === "?") {
      tokens.push({ type: "QUESTION", value: ch, position: i });
      i++;
      continue;
    }
    if (ch === ":") {
      tokens.push({ type: "COLON", value: ch, position: i });
      i++;
      continue;
    }

    throw new ExpressionError(`Unexpected character: ${ch}`, i);
  }

  tokens.push({ type: "EOF", value: "", position: i });
  return tokens;
}

// ── Parser ───────────────────────────────────────────────────────────

class Parser {
  private tokens: Token[];
  private pos: number;
  private depth: number;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
    this.pos = 0;
    this.depth = 0;
  }

  parse(): ASTNode {
    const node = this.parseTernary();
    if (this.current().type !== "EOF") {
      throw new ExpressionError(
        `Unexpected token: ${this.current().value}`,
        this.current().position,
      );
    }
    return node;
  }

  private current(): Token {
    return this.tokens[this.pos];
  }

  private advance(): Token {
    const token = this.tokens[this.pos];
    this.pos++;
    return token;
  }

  private expect(type: TokenType, value?: string): Token {
    const token = this.current();
    if (token.type !== type || (value !== undefined && token.value !== value)) {
      throw new ExpressionError(
        `Expected ${value ?? type}, got ${token.value || "end of expression"}`,
        token.position,
      );
    }
    return this.advance();
  }

  private enterRecursion(): void {
    this.depth++;
    if (this.depth > MAX_RECURSION_DEPTH) {
      throw new ExpressionError("Maximum recursion depth exceeded (50)");
    }
  }

  private exitRecursion(): void {
    this.depth--;
  }

  // ── Precedence levels ──────────────────────────────────────────

  /** Level 1: Ternary `condition ? consequent : alternate` */
  private parseTernary(): ASTNode {
    this.enterRecursion();
    try {
      let node = this.parseOr();
      if (this.current().type === "QUESTION") {
        this.advance(); // consume ?
        const consequent = this.parseTernary();
        this.expect("COLON");
        const alternate = this.parseTernary();
        node = { kind: "TernaryOp", condition: node, consequent, alternate };
      }
      return node;
    } finally {
      this.exitRecursion();
    }
  }

  /** Level 2: Logical OR `||` */
  private parseOr(): ASTNode {
    let left = this.parseAnd();
    while (this.current().type === "OPERATOR" && this.current().value === "||") {
      const op = this.advance().value;
      const right = this.parseAnd();
      left = { kind: "BinaryOp", operator: op, left, right };
    }
    return left;
  }

  /** Level 3: Logical AND `&&` */
  private parseAnd(): ASTNode {
    let left = this.parseEquality();
    while (this.current().type === "OPERATOR" && this.current().value === "&&") {
      const op = this.advance().value;
      const right = this.parseEquality();
      left = { kind: "BinaryOp", operator: op, left, right };
    }
    return left;
  }

  /** Level 4: Equality `==`, `!=` */
  private parseEquality(): ASTNode {
    let left = this.parseComparison();
    while (
      this.current().type === "OPERATOR" &&
      (this.current().value === "==" || this.current().value === "!=")
    ) {
      const op = this.advance().value;
      const right = this.parseComparison();
      left = { kind: "BinaryOp", operator: op, left, right };
    }
    return left;
  }

  /** Level 5: Comparison `>`, `<`, `>=`, `<=` */
  private parseComparison(): ASTNode {
    let left = this.parseAddition();
    while (
      this.current().type === "OPERATOR" &&
      (this.current().value === ">" ||
        this.current().value === "<" ||
        this.current().value === ">=" ||
        this.current().value === "<=")
    ) {
      const op = this.advance().value;
      const right = this.parseAddition();
      left = { kind: "BinaryOp", operator: op, left, right };
    }
    return left;
  }

  /** Level 6: Addition `+`, `-` */
  private parseAddition(): ASTNode {
    let left = this.parseMultiplication();
    while (
      this.current().type === "OPERATOR" &&
      (this.current().value === "+" || this.current().value === "-")
    ) {
      const op = this.advance().value;
      const right = this.parseMultiplication();
      left = { kind: "BinaryOp", operator: op, left, right };
    }
    return left;
  }

  /** Level 7: Multiplication `*`, `/`, `%` */
  private parseMultiplication(): ASTNode {
    let left = this.parseUnary();
    while (
      this.current().type === "OPERATOR" &&
      (this.current().value === "*" || this.current().value === "/" || this.current().value === "%")
    ) {
      const op = this.advance().value;
      const right = this.parseUnary();
      left = { kind: "BinaryOp", operator: op, left, right };
    }
    return left;
  }

  /** Level 8: Unary `!`, unary `-` */
  private parseUnary(): ASTNode {
    if (this.current().type === "OPERATOR" && this.current().value === "!") {
      const op = this.advance().value;
      const operand = this.parseUnary();
      return { kind: "UnaryOp", operator: op, operand };
    }
    if (this.current().type === "OPERATOR" && this.current().value === "-") {
      const op = this.advance().value;
      const operand = this.parseUnary();
      return { kind: "UnaryOp", operator: op, operand };
    }
    return this.parseCall();
  }

  /** Level 9: Function call `fn(args)` and member access `obj.key` */
  private parseCall(): ASTNode {
    let node = this.parsePrimary();

    while (true) {
      if (this.current().type === "LPAREN" && node.kind === "Identifier") {
        // Function call
        this.advance(); // consume (
        const args: ASTNode[] = [];
        if (this.current().type !== "RPAREN") {
          args.push(this.parseTernary());
          while (this.current().type === "COMMA") {
            this.advance(); // consume ,
            args.push(this.parseTernary());
          }
        }
        this.expect("RPAREN");
        node = { kind: "FunctionCall", name: node.name, args };
      } else if (this.current().type === "DOT") {
        this.advance(); // consume .
        const prop = this.expect("IDENTIFIER");
        node = { kind: "MemberAccess", object: node, property: prop.value };
      } else {
        break;
      }
    }

    return node;
  }

  /** Primaries: literals, identifiers, grouped expressions */
  private parsePrimary(): ASTNode {
    const token = this.current();

    switch (token.type) {
      case "NUMBER": {
        this.advance();
        return { kind: "NumberLiteral", value: Number(token.value) };
      }
      case "STRING": {
        this.advance();
        return { kind: "StringLiteral", value: token.value };
      }
      case "BOOLEAN": {
        this.advance();
        return { kind: "BooleanLiteral", value: token.value === "true" };
      }
      case "NULL": {
        this.advance();
        return { kind: "NullLiteral" };
      }
      case "IDENTIFIER": {
        this.advance();
        return { kind: "Identifier", name: token.value };
      }
      case "LPAREN": {
        this.advance(); // consume (
        const expr = this.parseTernary();
        this.expect("RPAREN");
        return expr;
      }
      default:
        throw new ExpressionError(
          `Unexpected token: ${token.value || "end of expression"}`,
          token.position,
        );
    }
  }
}

// ── Evaluator ────────────────────────────────────────────────────────

class Evaluator {
  private context: Record<string, unknown>;
  private operations: number;

  constructor(context: Record<string, unknown>) {
    this.context = context;
    this.operations = 0;
  }

  evaluate(node: ASTNode): unknown {
    this.tick();

    switch (node.kind) {
      case "NumberLiteral":
        return node.value;
      case "StringLiteral":
        return node.value;
      case "BooleanLiteral":
        return node.value;
      case "NullLiteral":
        return null;
      case "Identifier":
        return this.resolveIdentifier(node.name);
      case "MemberAccess":
        return this.evaluateMemberAccess(node);
      case "FunctionCall":
        return this.evaluateFunctionCall(node);
      case "UnaryOp":
        return this.evaluateUnaryOp(node);
      case "BinaryOp":
        return this.evaluateBinaryOp(node);
      case "TernaryOp":
        return this.evaluateTernaryOp(node);
    }
  }

  private tick(): void {
    this.operations++;
    if (this.operations > MAX_OPERATIONS) {
      throw new ExpressionError("Maximum operation count exceeded (100000)");
    }
  }

  private resolveIdentifier(name: string): unknown {
    if (Object.hasOwn(this.context, name)) {
      return this.context[name];
    }
    return undefined;
  }

  private evaluateMemberAccess(node: MemberAccess): unknown {
    const obj = this.evaluate(node.object);
    if (obj == null || typeof obj !== "object") {
      return undefined;
    }
    if (!Object.hasOwn(obj as Record<string, unknown>, node.property)) {
      return undefined;
    }
    return (obj as Record<string, unknown>)[node.property];
  }

  private evaluateFunctionCall(node: FunctionCall): unknown {
    const fn = builtinFunctions.get(node.name);
    if (!fn) {
      throw new ExpressionError(`Unknown function: ${node.name}`);
    }
    const args = node.args.map((arg) => this.evaluate(arg));
    return fn(...args);
  }

  private evaluateUnaryOp(node: UnaryOp): unknown {
    const operand = this.evaluate(node.operand);
    switch (node.operator) {
      case "!":
        return !operand;
      case "-":
        return -(operand as number);
      default:
        throw new ExpressionError(`Unknown unary operator: ${node.operator}`);
    }
  }

  private evaluateBinaryOp(node: BinaryOp): unknown {
    // Short-circuit for logical operators
    if (node.operator === "&&") {
      const left = this.evaluate(node.left);
      if (!left) {
        return left;
      }
      return this.evaluate(node.right);
    }
    if (node.operator === "||") {
      const left = this.evaluate(node.left);
      if (left) {
        return left;
      }
      return this.evaluate(node.right);
    }

    const left = this.evaluate(node.left);
    const right = this.evaluate(node.right);

    switch (node.operator) {
      // Arithmetic
      case "+": {
        if (typeof left === "string" || typeof right === "string") {
          const result = String(left) + String(right);
          checkStringLength(result);
          return result;
        }
        return (left as number) + (right as number);
      }
      case "-":
        return (left as number) - (right as number);
      case "*":
        return (left as number) * (right as number);
      case "/": {
        if ((right as number) === 0) {
          throw new ExpressionError("Division by zero");
        }
        return (left as number) / (right as number);
      }
      case "%": {
        if ((right as number) === 0) {
          throw new ExpressionError("Division by zero");
        }
        return (left as number) % (right as number);
      }

      // Equality
      case "==":
        return left === right;
      case "!=":
        return left !== right;

      // Comparison
      case ">":
        return (left as number) > (right as number);
      case "<":
        return (left as number) < (right as number);
      case ">=":
        return (left as number) >= (right as number);
      case "<=":
        return (left as number) <= (right as number);

      default:
        throw new ExpressionError(`Unknown operator: ${node.operator}`);
    }
  }

  private evaluateTernaryOp(node: TernaryOp): unknown {
    const condition = this.evaluate(node.condition);
    return condition ? this.evaluate(node.consequent) : this.evaluate(node.alternate);
  }
}

// ── Safety helpers ───────────────────────────────────────────────────

function checkStringLength(str: string): void {
  if (str.length > MAX_STRING_LENGTH) {
    throw new ExpressionError(`String exceeds maximum length (${MAX_STRING_LENGTH} chars)`);
  }
}

// ── Built-in function registry ───────────────────────────────────────

function buildRegistry(): Map<string, (...args: unknown[]) => unknown> {
  const fns = new Map<string, (...args: unknown[]) => unknown>();

  // ── String functions ───────────────────────────────────────────

  fns.set("uppercase", (str: unknown) => {
    const s = String(str);
    return s.toUpperCase();
  });

  fns.set("lowercase", (str: unknown) => {
    const s = String(str);
    return s.toLowerCase();
  });

  fns.set("trim", (str: unknown) => {
    const s = String(str);
    return s.trim();
  });

  fns.set("replace", (str: unknown, search: unknown, replacement: unknown) => {
    const s = String(str);
    const result = s.replace(String(search), String(replacement));
    checkStringLength(result);
    return result;
  });

  fns.set("substring", (str: unknown, start: unknown, end?: unknown) => {
    const s = String(str);
    return end !== undefined && end !== null
      ? s.substring(Number(start), Number(end))
      : s.substring(Number(start));
  });

  fns.set("length", (val: unknown) => {
    if (typeof val === "string") {
      return val.length;
    }
    if (Array.isArray(val)) {
      return val.length;
    }
    return 0;
  });

  fns.set("split", (str: unknown, delimiter: unknown) => {
    const s = String(str);
    return s.split(String(delimiter));
  });

  fns.set("startsWith", (str: unknown, prefix: unknown) => {
    return String(str).startsWith(String(prefix));
  });

  fns.set("endsWith", (str: unknown, suffix: unknown) => {
    return String(str).endsWith(String(suffix));
  });

  // ── Array functions ────────────────────────────────────────────

  fns.set("join", (arr: unknown, delimiter: unknown) => {
    if (!Array.isArray(arr)) {
      throw new ExpressionError("join() expects an array as first argument");
    }
    const result = arr.join(String(delimiter));
    checkStringLength(result);
    return result;
  });

  fns.set("first", (arr: unknown) => {
    if (!Array.isArray(arr)) {
      throw new ExpressionError("first() expects an array");
    }
    return arr.length > 0 ? arr[0] : undefined;
  });

  fns.set("last", (arr: unknown) => {
    if (!Array.isArray(arr)) {
      throw new ExpressionError("last() expects an array");
    }
    return arr.length > 0 ? arr[arr.length - 1] : undefined;
  });

  fns.set("contains", (collection: unknown, value: unknown) => {
    if (Array.isArray(collection)) {
      return collection.includes(value);
    }
    if (typeof collection === "string") {
      return collection.includes(String(value));
    }
    return false;
  });

  fns.set("count", (arr: unknown) => {
    if (!Array.isArray(arr)) {
      throw new ExpressionError("count() expects an array");
    }
    return arr.length;
  });

  // ── Math functions ─────────────────────────────────────────────

  fns.set("add", (a: unknown, b: unknown) => {
    return Number(a) + Number(b);
  });

  fns.set("subtract", (a: unknown, b: unknown) => {
    return Number(a) - Number(b);
  });

  fns.set("multiply", (a: unknown, b: unknown) => {
    return Number(a) * Number(b);
  });

  fns.set("divide", (a: unknown, b: unknown) => {
    const divisor = Number(b);
    if (divisor === 0) {
      throw new ExpressionError("divide() cannot divide by zero");
    }
    return Number(a) / divisor;
  });

  fns.set("round", (n: unknown, decimals?: unknown) => {
    const num = Number(n);
    const places = decimals !== undefined && decimals !== null ? Number(decimals) : 0;
    const factor = Math.pow(10, places);
    return Math.round(num * factor) / factor;
  });

  fns.set("min", (a: unknown, b: unknown) => {
    return Math.min(Number(a), Number(b));
  });

  fns.set("max", (a: unknown, b: unknown) => {
    return Math.max(Number(a), Number(b));
  });

  fns.set("abs", (n: unknown) => {
    return Math.abs(Number(n));
  });

  fns.set("floor", (n: unknown) => {
    return Math.floor(Number(n));
  });

  fns.set("ceil", (n: unknown) => {
    return Math.ceil(Number(n));
  });

  // ── Date functions ─────────────────────────────────────────────

  fns.set("now", () => {
    return Date.now();
  });

  fns.set("formatDate", (epochMs: unknown, format?: unknown) => {
    const ms = Number(epochMs);
    const date = new Date(ms);
    const fmt = format !== undefined && format !== null ? String(format as string) : "iso";
    switch (fmt) {
      case "iso":
        return date.toISOString();
      case "date":
        return date.toISOString().split("T")[0];
      case "time":
        return date.toISOString().split("T")[1].replace("Z", "");
      case "datetime":
        return date.toISOString().replace("T", " ").replace("Z", "");
      default:
        return date.toISOString();
    }
  });

  // ── Logic functions ────────────────────────────────────────────

  fns.set("if", (condition: unknown, trueVal: unknown, falseVal: unknown) => {
    return condition ? trueVal : falseVal;
  });

  fns.set("isEmpty", (val: unknown) => {
    if (val == null) {
      return true;
    }
    if (val === "") {
      return true;
    }
    if (Array.isArray(val) && val.length === 0) {
      return true;
    }
    return false;
  });

  fns.set("isNotEmpty", (val: unknown) => {
    if (val == null) {
      return false;
    }
    if (val === "") {
      return false;
    }
    if (Array.isArray(val) && val.length === 0) {
      return false;
    }
    return true;
  });

  fns.set("coalesce", (...args: unknown[]) => {
    for (const arg of args) {
      if (arg !== null && arg !== undefined) {
        return arg;
      }
    }
    return null;
  });

  // ── Type functions ─────────────────────────────────────────────

  fns.set("toNumber", (val: unknown) => {
    const n = Number(val);
    if (isNaN(n)) {
      throw new ExpressionError(`toNumber() cannot convert value to number: ${String(val)}`);
    }
    return n;
  });

  fns.set("toString", (val: unknown) => {
    return String(val);
  });

  fns.set("toBoolean", (val: unknown) => {
    return Boolean(val);
  });

  fns.set("parseJSON", (str: unknown) => {
    try {
      return JSON.parse(String(str)) as unknown;
    } catch {
      throw new ExpressionError(`parseJSON() failed: invalid JSON`);
    }
  });

  // Name the function "typeof" — it is a reserved word but fine as a map key
  fns.set("typeof", (val: unknown) => {
    if (val === null) {
      return "null";
    }
    if (Array.isArray(val)) {
      return "array";
    }
    return typeof val;
  });

  return fns;
}

/** The built-in function registry for testing/extension. */
export const builtinFunctions: ReadonlyMap<string, (...args: unknown[]) => unknown> =
  buildRegistry();

// ── Public API ───────────────────────────────────────────────────────

/**
 * Evaluate an expression string against a data context.
 *
 * @param expression - The expression to evaluate (the text inside `{{ }}`).
 * @param context    - A record of key/value pairs available as identifiers.
 * @returns The result of evaluating the expression.
 * @throws {ExpressionError} On syntax errors, safety limit violations, or runtime errors.
 *
 * @example
 * ```ts
 * evaluateExpression('uppercase(symbol)', { symbol: 'aapl' });
 * // => 'AAPL'
 *
 * evaluateExpression('if(price > 100, "high", "low")', { price: 150 });
 * // => 'high'
 *
 * evaluateExpression('event.payload.reason', { event: { payload: { reason: 'filled' } } });
 * // => 'filled'
 * ```
 */
export function evaluateExpression(expression: string, context: Record<string, unknown>): unknown {
  if (expression.length > MAX_EXPRESSION_LENGTH) {
    throw new ExpressionError(`Expression exceeds maximum length (${MAX_EXPRESSION_LENGTH} chars)`);
  }

  const trimmed = expression.trim();
  if (trimmed === "") {
    return undefined;
  }

  const tokens = tokenize(trimmed);
  const parser = new Parser(tokens);
  const ast = parser.parse();
  const evaluator = new Evaluator(context);
  return evaluator.evaluate(ast);
}

/**
 * Check if an expression string contains complex syntax (functions, operators, ternary).
 *
 * Returns `true` for anything beyond a simple identifier or dot-path:
 * - Function calls: `uppercase(field)`
 * - Arithmetic: `a + b`
 * - Comparisons: `a > b`
 * - Logical operators: `a && b`
 * - Ternary: `a ? b : c`
 *
 * Returns `false` for:
 * - Simple identifiers: `symbol`
 * - Dot-paths: `event.payload.reason`
 *
 * @param expression - The expression string to analyze.
 */
export function isComplexExpression(expression: string): boolean {
  const trimmed = expression.trim();
  if (trimmed === "") {
    return false;
  }

  // Quick scan: complex if it contains any of ( ) + - * / % = ! > < & | ?
  // (excluding the leading `-` for negative numbers that are just a literal)
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch === "(" || ch === ")") {
      return true;
    }
    if (ch === "+" || ch === "*" || ch === "/" || ch === "%") {
      return true;
    }
    if (ch === "=" || ch === "!" || ch === ">" || ch === "<") {
      return true;
    }
    if (ch === "&" || ch === "|") {
      return true;
    }
    if (ch === "?") {
      return true;
    }
    // A `-` is complex only if it's not just a negative number literal
    if (ch === "-" && i > 0) {
      return true;
    }
  }

  return false;
}
