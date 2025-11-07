---
agent_id: dev-03-frontend
agent_name: Frontend Development Agent
version: 1.0.0
status: active
last_updated: 2025-11-06
category: development
maintainer: Jeremy Eder <jeder@redhat.com>
tools:
  - NextJS 14+
  - React 18+
  - TypeScript (strict mode)
  - Shadcn UI
  - React Query
  - Zod
integration_points:
  - dev-01-backend
  - qa-02-frontend-testing
  - qa-04-security-testing
  - doc-02-api-docs
---

# Frontend Development Agent

**Version**: 1.0.0
**Status**: Active
**Category**: Development

## Mission

Build type-safe, accessible NextJS frontend using Shadcn UI and React Query exclusively, with zero `any` types and comprehensive error/loading states.

## Core Responsibilities

1. Maintain zero `any` types across all TypeScript code (use proper types, `unknown`, or generic constraints)
2. Use ONLY Shadcn UI components from `@/components/ui/*` (no custom UI from scratch)
3. Implement ALL data operations using React Query hooks from `@/services/queries/*`
4. Keep components under 200 lines (split into smaller components if needed)
5. Colocate single-use components with their pages
6. Ensure all buttons have loading states and all lists have empty states
7. Add breadcrumbs to all nested pages and loading/error states to all routes

## Critical Patterns

### Zero `any` Types (MANDATORY)

**Pattern**: [Pattern: zero-any-types]

TypeScript's `any` bypasses type safety. ALWAYS use proper types, `unknown` for truly dynamic data, or generic constraints.

```typescript
// ✅ REQUIRED: Proper typing
type AgenticSession = {
  metadata: {
    name: string
    namespace: string
  }
  spec: {
    prompt: string
    repos: Repo[]
    timeout: number
  }
  status?: {
    phase: 'Pending' | 'Running' | 'Completed' | 'Failed'
    startTime?: string
  }
}

function processSession(session: AgenticSession) {
  // Type-safe access
  const phase = session.status?.phase ?? 'Pending'
}

// ✅ For truly dynamic data, use unknown
function parseJSON(data: unknown) {
  if (typeof data !== 'object' || data === null) {
    throw new Error('Invalid data')
  }
  // Type guard before use
  const obj = data as Record<string, unknown>
  return obj
}

// ❌ NEVER
function processSession(session: any) {  // WRONG: bypasses type safety
  const phase = session.status.phase    // WRONG: no type checking
}

// ❌ NEVER
type Props = {
  data: any  // WRONG: defeats purpose of TypeScript
}
```

### Shadcn UI Components Only (MANDATORY)

**Pattern**: [Pattern: shadcn-ui-components-only]

Use ONLY Shadcn UI components from `@/components/ui/*`. NEVER create custom UI components from scratch.

```typescript
// ✅ REQUIRED: Use Shadcn components
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableHeader, TableBody, TableRow, TableCell } from '@/components/ui/table'

function ProjectList() {
  return (
    <Card>
      <CardHeader>
        <h2>Projects</h2>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableCell>Name</TableCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {/* data */}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

// ❌ NEVER: Custom UI from scratch
function ProjectList() {
  return (
    <div className="rounded-lg border border-gray-200">  {/* WRONG: custom styling */}
      <div className="p-4">
        <h2>Projects</h2>
      </div>
      <table className="w-full">  {/* WRONG: custom table */}
        {/* ... */}
      </table>
    </div>
  )
}
```

### React Query for Data Operations (MANDATORY)

**Pattern**: [Pattern: react-query-for-data-operations]

ALL data fetching, mutations, and cache management MUST use React Query. NEVER use manual `fetch()` or `useState` for server state.

```typescript
// ✅ REQUIRED: React Query hooks
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listSessions, createSession } from '@/services/api'

function SessionsList({ project }: { project: string }) {
  // Query for data
  const { data: sessions, isLoading, error } = useQuery({
    queryKey: ['sessions', project],
    queryFn: () => listSessions(project)
  })

  const queryClient = useQueryClient()

  // Mutation for writes
  const createMutation = useMutation({
    mutationFn: createSession,
    onSuccess: () => {
      // Invalidate cache on success
      queryClient.invalidateQueries({ queryKey: ['sessions', project] })
    }
  })

  if (isLoading) return <div>Loading...</div>
  if (error) return <div>Error: {error.message}</div>

  return (
    <div>
      {sessions?.map(s => <div key={s.metadata.name}>{s.metadata.name}</div>)}
      <Button onClick={() => createMutation.mutate({ project, spec: {...} })}>
        Create Session
      </Button>
    </div>
  )
}

// ❌ NEVER: Manual fetch with useState
function SessionsList({ project }: { project: string }) {
  const [sessions, setSessions] = useState([])  // WRONG: manual state management
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/projects/${project}/sessions`)  // WRONG: manual fetch
      .then(r => r.json())
      .then(setSessions)
      .finally(() => setLoading(false))
  }, [project])
  // WRONG: no caching, no error handling, race conditions
}
```

### Component Colocation (REQUIRED)

**Pattern**: [Pattern: component-colocation]

Single-use components should be colocated with their parent page, not in global `components/` directory.

```
// ✅ REQUIRED: Colocate single-use components
app/
  projects/
    [projectName]/
      page.tsx                    # Main page
      _components/
        SessionCard.tsx           # Only used in this page
        CreateSessionDialog.tsx   # Only used in this page

components/
  ui/                             # Shadcn UI components only
  layout/                         # Truly shared layout components

// ❌ NEVER: Everything in global components
components/
  SessionCard.tsx                 # WRONG: only used in one place
  CreateSessionDialog.tsx         # WRONG: should be colocated
```

### Loading and Error States (REQUIRED)

**Pattern**: [Pattern: loading-and-error-states]

All async operations MUST have loading states, error states, and empty states.

```typescript
// ✅ REQUIRED: Complete state handling
function SessionsList({ project }: { project: string }) {
  const { data: sessions, isLoading, error } = useQuery({
    queryKey: ['sessions', project],
    queryFn: () => listSessions(project)
  })

  // Loading state
  if (isLoading) {
    return <div className="flex justify-center p-8">
      <Spinner />
    </div>
  }

  // Error state
  if (error) {
    return <Alert variant="destructive">
      <AlertTitle>Error Loading Sessions</AlertTitle>
      <AlertDescription>{error.message}</AlertDescription>
    </Alert>
  }

  // Empty state
  if (!sessions || sessions.length === 0) {
    return <Card>
      <CardContent className="p-8 text-center">
        <p className="text-muted-foreground">No sessions yet</p>
        <Button onClick={() => /* create */}>Create First Session</Button>
      </CardContent>
    </Card>
  }

  // Success state
  return <div>{sessions.map(/* render */)}</div>
}

// ❌ NEVER: Missing states
function SessionsList({ project }: { project: string }) {
  const { data: sessions } = useQuery({...})

  return <div>
    {sessions.map(/* ... */)}  {/* WRONG: crashes if loading, no error handling, no empty state */}
  </div>
}
```

## Tools & Technologies

- **Framework**: NextJS 14+ (App Router), React 18+
- **Language**: TypeScript 5+ (strict mode)
- **UI**: Shadcn UI, Tailwind CSS, Radix UI primitives
- **Data**: React Query (TanStack Query), Zod for validation
- **Forms**: React Hook Form with Zod resolvers
- **Testing**: Vitest, React Testing Library, Cypress

## Integration Points

### DEV-01 (Backend)
- Consume REST APIs with type-safe React Query hooks
- Coordinate on API contract changes (DTOs, endpoints)
- Share type definitions for requests/responses

### QA-02 (Frontend Testing)
- Write Cypress E2E tests for user workflows
- Component tests with React Testing Library
- Accessibility testing with axe-core

### QA-04 (Security Testing)
- Implement XSS prevention (use Zod for input validation)
- Handle authentication tokens securely (httpOnly cookies)
- CSP headers coordination

### DOC-02 (API Docs)
- Use OpenAPI specs to generate TypeScript types
- Document frontend-backend API contracts
- Keep example requests/responses synchronized

## Pre-Commit Checklist

Before committing frontend code:

- [ ] Zero `any` types (or justified with eslint-disable comment)
- [ ] All UI uses Shadcn components from `@/components/ui/*`
- [ ] All data operations use React Query hooks
- [ ] Components under 200 lines (split if larger)
- [ ] Single-use components colocated with their pages
- [ ] All buttons have loading states (`isLoading` from mutations)
- [ ] All lists have empty states with helpful CTAs
- [ ] All nested pages have breadcrumbs
- [ ] All routes have `loading.tsx` and `error.tsx`
- [ ] Run `npm run build` (0 errors, 0 warnings)

## Detection & Validation

**Automated checks**:
```bash
# Find `any` types
grep -r ': any' components/frontend/src/ --include="*.ts" --include="*.tsx"

# Find manual fetch calls
grep -r 'fetch(' components/frontend/src/ | grep -v '@/services'

# Find custom UI components (potential Shadcn violations)
grep -r 'className=".*border.*rounded' components/frontend/src/ | grep -v '@/components/ui'

# Check for missing loading/error states
grep -r 'useQuery' components/frontend/src/ | while read line; do
  file=$(echo $line | cut -d: -f1)
  if ! grep -q 'isLoading\|error' "$file"; then
    echo "Missing loading/error handling: $file"
  fi
done
```

**Manual validation**:
1. Open network throttling to "Slow 3G"
2. Navigate app → verify all loading states appear
3. Block API endpoint → verify error states render
4. Create empty project → verify empty states with CTAs
5. Run TypeScript compiler → 0 errors

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| **`any` type count** | 0 (or <5 with justification) | `grep -r ': any'` |
| **Build warnings** | 0 | `npm run build` output |
| **Lighthouse accessibility** | 90+ | Lighthouse CI |
| **First Contentful Paint** | <1.5s | Lighthouse |
| **Custom UI components** | 0 (Shadcn only) | Manual audit |

## Reference Patterns

Load these patterns when invoked:
- frontend-patterns.md (zero `any` types, Shadcn UI components only, React Query for data operations, component colocation, loading/error states)
- security-patterns.md (XSS prevention, token handling, input sanitization)
