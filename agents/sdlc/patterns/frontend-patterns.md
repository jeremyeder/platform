# Frontend Patterns

**Version**: 1.0.0
**Last Updated**: 2025-11-06
**Scope**: NextJS + Shadcn frontend development

Critical patterns for frontend development from `DESIGN_GUIDELINES.md`.

---

## Pattern: zero-any-types

**Pattern ID**: zero-any-types
**Version**: 1.0
**Status**: Stable
**Category**: TypeScript / Type Safety

**Location**: components/frontend/src/services/queries/sessions.ts
**Grep Anchor**: `type .*=.*\{`

**Description**:
Never use `any` type. Use proper types, `unknown` with type guards, or generic constraints. Prefer `type` over `interface`.

**Implementation**:
```typescript
// ✅ Correct: Proper types
type AgenticSession = {
  name: string
  status: {
    phase: 'Pending' | 'Running' | 'Completed' | 'Error'
    startTime?: string
  }
  spec: {
    prompt: string
    repos: Repo[]
  }
}

// ✅ Correct: unknown with type guard
async function fetchData(url: string): Promise<unknown> {
  const response = await fetch(url)
  return response.json()
}

function isSession(data: unknown): data is AgenticSession {
  return typeof data === 'object' && data !== null && 'name' in data
}

const data = await fetchData('/api/sessions')
if (isSession(data)) {
  // TypeScript knows data is AgenticSession here
  console.log(data.name)
}
```

**Anti-Patterns**:
```typescript
// ❌ NEVER use any
const data: any = await response.json()
function processData(input: any): any { }

// ❌ NEVER use interface (use type instead)
interface Session { } // WRONG: Use type
```

**Detection**:
- ❌ `grep -r ": any\|<any>" components/frontend/src/ --include="*.ts" --include="*.tsx"`

**Related Patterns**: [Pattern: react-query-for-data-operations]

**Change History**: v1.0 (2025-11-06): Initial from DESIGN_GUIDELINES.md

---

## Pattern: shadcn-ui-components-only

**Pattern ID**: shadcn-ui-components-only
**Version**: 1.0
**Status**: Stable
**Category**: UI / Component Library

**Location**: components/frontend/src/components/ui/
**Grep Anchor**: `import.*from "@/components/ui/`

**Description**:
Use only Shadcn UI components for all UI elements. Never create custom components from scratch when Shadcn provides equivalent. Import from `@/components/ui/*`.

**Implementation**:
```tsx
// ✅ Correct: Use Shadcn components
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

export function SessionCard({ session }: { session: AgenticSession }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{session.name}</CardTitle>
      </CardHeader>
      <CardContent>
        <p>Status: {session.status.phase}</p>
        <Button variant="destructive">Delete</Button>
      </CardContent>
    </Card>
  )
}
```

**Anti-Patterns**:
```tsx
// ❌ NEVER create custom button components
export function CustomButton({ children, onClick }) {
  return (
    <div className="px-4 py-2 bg-blue-500 rounded cursor-pointer" onClick={onClick}>
      {children}
    </div>
  )
}
// WRONG: Use <Button> from Shadcn instead
```

**Detection**:
- ✅ All components import from `@/components/ui/*`
- ❌ Custom UI components in non-ui directories

**Related Patterns**: [Pattern: component-colocation]

**Change History**: v1.0 (2025-11-06): Initial from DESIGN_GUIDELINES.md

---

## Pattern: react-query-for-data-operations

**Pattern ID**: react-query-for-data-operations
**Version**: 1.0
**Status**: Stable
**Category**: State Management / Data Fetching

**Location**: components/frontend/src/services/queries/sessions.ts
**Grep Anchor**: `useQuery\|useMutation`

**Description**:
Use React Query for ALL data operations. Never use manual fetch() or axios. Define hooks in `@/services/queries/*` and import in components.

**Implementation**:
```typescript
// services/queries/sessions.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/services/api'

export function useSessions(project: string) {
  return useQuery({
    queryKey: ['sessions', project],
    queryFn: () => api.get(`/api/projects/${project}/agentic-sessions`),
  })
}

export function useCreateSession(project: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (spec: AgenticSessionSpec) =>
      api.post(`/api/projects/${project}/agentic-sessions`, spec),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions', project] })
    },
  })
}

// components/SessionList.tsx
import { useSessions } from '@/services/queries/sessions'

export function SessionList({ project }: { project: string }) {
  const { data, isLoading, error } = useSessions(project)

  if (isLoading) return <div>Loading...</div>
  if (error) return <div>Error: {error.message}</div>

  return (
    <div>
      {data?.items.map(session => (
        <SessionCard key={session.name} session={session} />
      ))}
    </div>
  )
}
```

**Anti-Patterns**:
```tsx
// ❌ NEVER use manual fetch in components
export function SessionList() {
  const [sessions, setSessions] = useState([])

  useEffect(() => {
    fetch('/api/sessions')
      .then(r => r.json())
      .then(setSessions)
  }, [])
  // WRONG: Use React Query instead
}

// ❌ NEVER use axios directly
const response = await axios.get('/api/sessions') // WRONG
```

**Detection**:
- ✅ All data fetching uses `useQuery` or `useMutation`
- ❌ `grep -r "fetch(|axios." components/frontend/src/components/`

**Related Patterns**: [Pattern: zero-any-types]

**Change History**: v1.0 (2025-11-06): Initial from DESIGN_GUIDELINES.md

---

## Pattern: component-colocation

**Pattern ID**: component-colocation
**Version**: 1.0
**Status**: Stable
**Category**: File Organization

**Location**: components/frontend/src/app/
**Grep Anchor**: `app/.*/_components`

**Description**:
Colocate single-use components with their pages in `_components/` subdirectory. Only create shared components in `@/components/` when used in 3+ places.

**Implementation**:
```
app/
├── projects/
│   ├── [project]/
│   │   ├── sessions/
│   │   │   ├── _components/
│   │   │   │   ├── SessionCard.tsx      # Only used in sessions page
│   │   │   │   └── CreateSessionDialog.tsx
│   │   │   └── page.tsx
│   │   └── settings/
│   │       ├── _components/
│   │       │   └── SettingsForm.tsx
│   │       └── page.tsx
components/
└── shared/                  # Used in 3+ places
    ├── PageHeader.tsx
    └── ErrorBoundary.tsx
```

**Anti-Patterns**:
```
// ❌ WRONG: Single-use component in shared directory
components/
└── SessionCard.tsx  # Only used in sessions page - should be colocated

// ❌ WRONG: All components in root components/
components/
├── SessionCard.tsx
├── CreateSessionDialog.tsx
├── SettingsForm.tsx
└── ... (100+ components)
```

**Detection**:
- ✅ Page-specific components in `app/**/_components/`
- ❌ Many single-use components in `components/`

**Related Patterns**: [Pattern: shadcn-ui-components-only]

**Change History**: v1.0 (2025-11-06): Initial from DESIGN_GUIDELINES.md

---

## Pattern: loading-and-error-states

**Pattern ID**: loading-and-error-states
**Version**: 1.0
**Status**: Stable
**Category**: UX / State Handling

**Location**: components/frontend/src/app/projects/[project]/sessions/page.tsx

**Description**:
All data-fetching components must handle loading, error, and empty states. Use Suspense with loading.tsx for page-level loading. Show user-friendly error messages.

**Implementation**:
```tsx
// app/sessions/loading.tsx
export default function Loading() {
  return <div>Loading sessions...</div>
}

// app/sessions/error.tsx
export default function Error({ error, reset }: { error: Error, reset: () => void }) {
  return (
    <div>
      <h2>Error loading sessions</h2>
      <p>{error.message}</p>
      <button onClick={reset}>Try again</button>
    </div>
  )
}

// components
export function SessionList({ project }: { project: string }) {
  const { data, isLoading, error } = useSessions(project)

  if (isLoading) return <Skeleton className="h-20" />
  if (error) return <Alert variant="destructive">{error.message}</Alert>
  if (!data?.items.length) return <EmptyState message="No sessions yet" />

  return (
    <div>
      {data.items.map(session => <SessionCard key={session.name} session={session} />)}
    </div>
  )
}

export function CreateSessionButton() {
  const mutation = useCreateSession(project)

  return (
    <Button
      onClick={() => mutation.mutate(spec)}
      disabled={mutation.isPending}
    >
      {mutation.isPending ? 'Creating...' : 'Create Session'}
    </Button>
  )
}
```

**Anti-Patterns**:
```tsx
// ❌ NEVER skip error handling
const { data } = useSessions(project)
return <div>{data.items.map(...)}</div> // WRONG: No error/loading/empty states

// ❌ NEVER show raw errors to users
if (error) return <div>{error.stack}</div> // WRONG: Internal details

// ❌ NEVER skip loading states on buttons
<Button onClick={handleSubmit}>Submit</Button> // WRONG: No loading state
```

**Detection**:
- ✅ All routes have loading.tsx and error.tsx
- ✅ All mutations have `disabled={isPending}` and loading text
- ❌ Components without error handling

**Related Patterns**: [Pattern: react-query-for-data-operations]

**Change History**: v1.0 (2025-11-06): Initial from DESIGN_GUIDELINES.md
