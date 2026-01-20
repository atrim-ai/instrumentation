# Effect Unplugin: Span Name Format Implementation Spec

## Overview

Add a `nameFormat` option to control how span names are generated. The default should use **function/variable names** instead of file:line locations, making traces more readable.

---

## API Change

### types.ts

```typescript
/**
 * Span name format options.
 * @since 4.0.0-source-tracing.10
 */
export type SpanNameFormat = "function" | "location" | "full"

/**
 * Options for auto-instrumentation with withSpan.
 */
export interface SpanInstrumentationOptions {
  /**
   * Enable auto-instrumentation with withSpan.
   * @default false
   */
  readonly enabled?: boolean | undefined

  /**
   * Effect combinators to instrument. Defaults to all supported combinators.
   */
  readonly include?: ReadonlyArray<InstrumentableEffect> | undefined

  /**
   * Effect combinators to exclude from instrumentation.
   */
  readonly exclude?: ReadonlyArray<InstrumentableEffect> | undefined

  /**
   * Span name format.
   * - "function": `effect.gen (fetchUser)` - combinator + function name (DEFAULT)
   * - "location": `effect.gen (index.ts:23)` - combinator + file:line
   * - "full": `effect.gen (fetchUser @ index.ts:23)` - all info
   * @default "function"
   */
  readonly nameFormat?: SpanNameFormat | undefined
}
```

---

## Implementation

### sourceTrace.ts

#### 1. Add name format helper

```typescript
function formatSpanName(
  combinator: string,           // "effect.gen", "effect.all", etc.
  functionName: string | null,  // "fetchUser", "program", etc.
  filename: string,             // "index.ts"
  line: number,                 // 23
  format: SpanNameFormat        // "function" | "location" | "full"
): string {
  switch (format) {
    case "function":
      // effect.gen (fetchUser) or just effect.gen if no function name
      return functionName
        ? `${combinator} (${functionName})`
        : combinator

    case "location":
      // effect.gen (index.ts:23)
      return `${combinator} (${filename}:${line})`

    case "full":
      // effect.gen (fetchUser @ index.ts:23) or effect.gen (index.ts:23)
      return functionName
        ? `${combinator} (${functionName} @ ${filename}:${line})`
        : `${combinator} (${filename}:${line})`
  }
}
```

#### 2. Extract function/variable name from AST

When processing a node, extract the assigned variable name:

```typescript
function getAssignedName(path: NodePath): string | null {
  // Case 1: const fetchUser = Effect.gen(...)
  // VariableDeclarator -> id.name
  if (path.parentPath?.isVariableDeclarator()) {
    const id = path.parentPath.node.id
    if (t.isIdentifier(id)) {
      return id.name
    }
  }

  // Case 2: const fetchUser = (id) => Effect.gen(...)
  // ArrowFunctionExpression -> VariableDeclarator -> id.name
  if (path.parentPath?.isArrowFunctionExpression()) {
    const varDecl = path.parentPath.parentPath
    if (varDecl?.isVariableDeclarator()) {
      const id = varDecl.node.id
      if (t.isIdentifier(id)) {
        return id.name
      }
    }
  }

  // Case 3: function fetchUser() { return Effect.gen(...) }
  // ReturnStatement -> FunctionDeclaration -> id.name
  if (path.parentPath?.isReturnStatement()) {
    const func = path.parentPath.getFunctionParent()
    if (func?.isFunctionDeclaration() && func.node.id) {
      return func.node.id.name
    }
  }

  // Case 4: { fetchUser: Effect.gen(...) }
  // ObjectProperty -> key.name
  if (path.parentPath?.isObjectProperty()) {
    const key = path.parentPath.node.key
    if (t.isIdentifier(key)) {
      return key.name
    }
  }

  return null
}
```

#### 3. Get combinator name

```typescript
function getCombinatorName(node: t.CallExpression): string | null {
  // Effect.gen, Effect.all, Effect.forEach, etc.
  if (t.isMemberExpression(node.callee)) {
    const object = node.callee.object
    const property = node.callee.property

    if (t.isIdentifier(object) && object.name === "Effect" && t.isIdentifier(property)) {
      return `effect.${property.name}`
    }
  }
  return null
}
```

#### 4. Update withSpan generation

Current code (location-based):
```typescript
const spanName = `${filename}:${line}`
// or
const spanName = `${combinator} (${filename}:${line})`
```

New code (format-aware):
```typescript
const nameFormat = options.spans?.nameFormat ?? "function"
const combinator = getCombinatorName(node)
const functionName = getAssignedName(path)
const spanName = formatSpanName(combinator, functionName, filename, line, nameFormat)
```

---

## Generated Code Examples

### Input
```typescript
const fetchUser = (id: string) =>
  Effect.gen(function* () {
    yield* Console.log(`Fetching user ${id}...`)
    return { id, name: `User ${id}` }
  })

const program = Effect.gen(function* () {
  const users = yield* Effect.all([
    fetchUser('alice'),
    fetchUser('bob')
  ])
  return users
})
```

### Output with `nameFormat: "function"` (DEFAULT)

```typescript
const fetchUser = (id: string) =>
  Effect.withSpan(
    Effect.gen(function* () {
      yield* Console.log(`Fetching user ${id}...`)
      return { id, name: `User ${id}` }
    }),
    "effect.gen (fetchUser)",
    {
      attributes: {
        "code.filepath": "src/index.ts",
        "code.lineno": 22,
        "code.column": 2,
        "code.function": "fetchUser"
      }
    }
  )

const program = Effect.withSpan(
  Effect.gen(function* () {
    const users = yield* Effect.withSpan(
      Effect.all([fetchUser('alice'), fetchUser('bob')]),
      "effect.all",  // No function name for inline usage
      {
        attributes: {
          "code.filepath": "src/index.ts",
          "code.lineno": 29,
          "code.column": 18,
          "code.function": "effect.all"
        }
      }
    )
    return users
  }),
  "effect.gen (program)",
  {
    attributes: {
      "code.filepath": "src/index.ts",
      "code.lineno": 27,
      "code.column": 16,
      "code.function": "program"
    }
  }
)
```

### Output with `nameFormat: "location"`

```typescript
Effect.withSpan(
  Effect.gen(...),
  "effect.gen (index.ts:22)",
  { attributes: { "code.filepath": "src/index.ts", "code.lineno": 22, ... } }
)
```

### Output with `nameFormat: "full"`

```typescript
Effect.withSpan(
  Effect.gen(...),
  "effect.gen (fetchUser @ index.ts:22)",
  { attributes: { "code.filepath": "src/index.ts", "code.lineno": 22, ... } }
)
```

---

## Expected Trace Output

### With `nameFormat: "function"` (Default)

```
effect.gen (program)
├── effect.all
│   ├── effect.gen (fetchUser)
│   ├── effect.gen (fetchUser)
│   └── effect.gen (fetchUser)
├── effect.forEach
│   ├── effect.gen (fetchOrders)
│   ├── effect.gen (fetchOrders)
│   └── effect.gen (fetchOrders)
├── effect.forkChild
│   └── effect.gen (backgroundTask)
└── effect.forEach
    ├── effect.gen (processOrder)
    ├── effect.gen (processOrder)
    └── effect.gen (processOrder)
```

**Note:** Source location is always available in span **attributes** (`code.filepath`, `code.lineno`) for drilling down.

---

## Usage

```typescript
// build.ts
import effectPlugin from '@clayroach/effect-unplugin/esbuild'

effectPlugin({
  sourceTrace: true,
  spans: {
    enabled: true,
    nameFormat: "function"  // "function" (default) | "location" | "full"
  }
})
```

---

## Test Cases

1. **Variable declaration**: `const foo = Effect.gen(...)` → `effect.gen (foo)`
2. **Arrow function**: `const foo = () => Effect.gen(...)` → `effect.gen (foo)`
3. **Inline usage**: `yield* Effect.all([...])` → `effect.all`
4. **Object property**: `{ foo: Effect.gen(...) }` → `effect.gen (foo)`
5. **Function declaration**: `function foo() { return Effect.gen(...) }` → `effect.gen (foo)`
6. **Nested**: `const foo = Effect.gen(() => Effect.all([...]))` → outer: `effect.gen (foo)`, inner: `effect.all`

---

## Backward Compatibility

- Default to `"function"` format (new behavior)
- Users who prefer the old behavior can set `nameFormat: "location"`
- Span attributes always include full source location regardless of format
