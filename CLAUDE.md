# Aarogya Ruchi

## Project Overview
Go REST API + WebSocket application serving ~2,000 users.

## Tech Stack
- **Language:** Go
- **API:** REST + WebSocket
- **Database ORM:** sqlc (type-safe SQL)
- **Cache:** Valkey (Redis-compatible fork)
- **Database:** PostgreSQL
- **Containerization:** Docker + Docker Compose

## Architecture

### Local Development
```bash
cp .env.local .env     # Copy local config
docker-compose up -d   # Starts PostgreSQL + Valkey locally
go run cmd/server/main.go
```

### Production (Hetzner (redacted))
- **Go app + Valkey** → Hetzner VPS (same instance)
- **PostgreSQL** → Supabase/Neon (external, managed backups)

```
┌─────────────────────────────────────┐
│  Hetzner VPS ((redacted))        │
│  ┌─────────────┐  ┌─────────────┐   │
│  │   Go App    │  │   Valkey    │   │
│  │  REST + WS  │◄─┤   Cache     │   │
│  └──────┬──────┘  └─────────────┘   │
└─────────┼───────────────────────────┘
          │
          ▼
┌─────────────────────────────────────┐
│  Supabase/Neon (External)           │
│  PostgreSQL + Auto Backups          │
└─────────────────────────────────────┘
```

## Deployment Infrastructure

### Server Details
| Item | Value |
|------|-------|
| Provider | Hetzner (reliable, 99.9%+ uptime) |
| Plan | CAX11 |
| CPU | 2 vCPU (ARM Ampere) |
| RAM | 4 GB |
| Storage | 40 GB SSD |
| Traffic | 20 TB |
| Location | Helsinki (eu-central) |
| IP | (redacted) |
| OS | Docker CE (Ubuntu-based) |
| Cost | $3.99/month (~₹332) |

### SSH Access
```bash
ssh root@(redacted)
```

SSH key location: `/Users/lohit/.ssh/id_ed25519`

### Why Hetzner?
- German company, operating since 2003
- 99.9%+ uptime SLA
- Best price/reliability ratio for budget hosting
- Latency from India: ~130-150ms (acceptable)

## Database Strategy
Run Go + Redis on Hetzner VPS. Use managed PostgreSQL for:
- Automatic backups
- No maintenance overhead
- Data safety

Recommended free tiers:
- **Supabase** - 500MB, 2 projects, auto backups
- **Neon** - 512MB storage, serverless

## Resource Usage Estimates
- Go app: ~50-100MB RAM
- Valkey: ~50-200MB RAM
- Remaining: ~3.5GB for OS and overhead

## Deployment Checklist
- [ ] Connect to server: `ssh root@(redacted)`
- [ ] Verify Docker: `docker --version`
- [ ] Create docker-compose.yml for Go + Valkey
- [ ] Set up reverse proxy (Caddy) for HTTPS
- [ ] Point domain to (redacted)
- [ ] Set up Supabase/Neon for PostgreSQL
- [ ] Configure environment variables
- [ ] Run sqlc generate for type-safe queries

## Alternative Providers Considered
| Provider | Price | Notes |
|----------|-------|-------|
| Oracle Cloud | Free | 4 ARM CPU, 24GB RAM - best free tier |
| Contabo | ~$5/month | 4 vCPU, 8GB - oversold, less reliable |
| Fly.io | Free tier | Easy deploys, limited resources |
| AWS EC2 | ~$15-30/month | Overkill for this use case |
| DigitalOcean | ~$6/month | Reliable but pricier |

## Notes
- Go compiles natively for both ARM64 and x86 - either works
- For India users, Singapore location would have better latency (~50-80ms) but costs more ($6.99/month)
- Backups on Hetzner add 20% (~$0.70/month) - optional but recommended

# Ultracite Code Standards

This project uses **Ultracite**, a zero-config preset that enforces strict code quality standards through automated formatting and linting.

## Quick Reference

- **Format code**: `bun x ultracite fix`
- **Check for issues**: `bun x ultracite check`
- **Diagnose setup**: `bun x ultracite doctor`

Biome (the underlying engine) provides robust linting and formatting. Most issues are automatically fixable.

---

## Core Principles

Write code that is **accessible, performant, type-safe, and maintainable**. Focus on clarity and explicit intent over brevity.

### Type Safety & Explicitness

- Use explicit types for function parameters and return values when they enhance clarity
- Prefer `unknown` over `any` when the type is genuinely unknown
- Use const assertions (`as const`) for immutable values and literal types
- Leverage TypeScript's type narrowing instead of type assertions
- Use meaningful variable names instead of magic numbers - extract constants with descriptive names

### Modern JavaScript/TypeScript

- Use arrow functions for callbacks and short functions
- Prefer `for...of` loops over `.forEach()` and indexed `for` loops
- Use optional chaining (`?.`) and nullish coalescing (`??`) for safer property access
- Prefer template literals over string concatenation
- Use destructuring for object and array assignments
- Use `const` by default, `let` only when reassignment is needed, never `var`

### Async & Promises

- Always `await` promises in async functions - don't forget to use the return value
- Use `async/await` syntax instead of promise chains for better readability
- Handle errors appropriately in async code with try-catch blocks
- Don't use async functions as Promise executors

### React & JSX

- Use function components over class components
- Call hooks at the top level only, never conditionally
- Specify all dependencies in hook dependency arrays correctly
- Use the `key` prop for elements in iterables (prefer unique IDs over array indices)
- Nest children between opening and closing tags instead of passing as props
- Don't define components inside other components
- Use semantic HTML and ARIA attributes for accessibility:
  - Provide meaningful alt text for images
  - Use proper heading hierarchy
  - Add labels for form inputs
  - Include keyboard event handlers alongside mouse events
  - Use semantic elements (`<button>`, `<nav>`, etc.) instead of divs with roles

### Error Handling & Debugging

- Remove `console.log`, `debugger`, and `alert` statements from production code
- Throw `Error` objects with descriptive messages, not strings or other values
- Use `try-catch` blocks meaningfully - don't catch errors just to rethrow them
- Prefer early returns over nested conditionals for error cases

### Code Organization

- Keep functions focused and under reasonable cognitive complexity limits
- Extract complex conditions into well-named boolean variables
- Use early returns to reduce nesting
- Prefer simple conditionals over nested ternary operators
- Group related code together and separate concerns

### Security

- Add `rel="noopener"` when using `target="_blank"` on links
- Avoid `dangerouslySetInnerHTML` unless absolutely necessary
- Don't use `eval()` or assign directly to `document.cookie`
- Validate and sanitize user input

### Performance

- Avoid spread syntax in accumulators within loops
- Use top-level regex literals instead of creating them in loops
- Prefer specific imports over namespace imports
- Avoid barrel files (index files that re-export everything)
- Use proper image components (e.g., Next.js `<Image>`) over `<img>` tags

### Framework-Specific Guidance

**Next.js:**
- Use Next.js `<Image>` component for images
- Use `next/head` or App Router metadata API for head elements
- Use Server Components for async data fetching instead of async Client Components

**React 19+:**
- Use ref as a prop instead of `React.forwardRef`

**Solid/Svelte/Vue/Qwik:**
- Use `class` and `for` attributes (not `className` or `htmlFor`)

---

## Testing

- Write assertions inside `it()` or `test()` blocks
- Avoid done callbacks in async tests - use async/await instead
- Don't use `.only` or `.skip` in committed code
- Keep test suites reasonably flat - avoid excessive `describe` nesting

## When Biome Can't Help

Biome's linter will catch most issues automatically. Focus your attention on:

1. **Business logic correctness** - Biome can't validate your algorithms
2. **Meaningful naming** - Use descriptive names for functions, variables, and types
3. **Architecture decisions** - Component structure, data flow, and API design
4. **Edge cases** - Handle boundary conditions and error states
5. **User experience** - Accessibility, performance, and usability considerations
6. **Documentation** - Add comments for complex logic, but prefer self-documenting code

---

Most formatting and common issues are automatically fixed by Biome. Run `bun x ultracite fix` before committing to ensure compliance.
