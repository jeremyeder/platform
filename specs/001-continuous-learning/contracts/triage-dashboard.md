# Contract: Triage Dashboard "Learned" Section

## GitHub API Functions

### fetchLearnedPRs(org, repo, token) -> LearnedPR[]

**File**: `~/repos/dashboards/triage/src/lib/github.ts`

```typescript
type LearnedPR = {
  number: number;
  title: string;
  author: string;
  created_at: string;
  branch: string;
  files: string[];  // paths of changed files
};

async function fetchLearnedPRs(
  org: string,
  repo: string,
  token: string,
): Promise<LearnedPR[]>
```

**Implementation**: GitHub Search API — `GET /search/issues?q=repo:{org}/{repo}+is:pr+is:open+is:draft+label:continuous-learning`

### fetchPRFileContent(org, repo, pr, token) -> string

**File**: `~/repos/dashboards/triage/src/lib/github.ts`

```typescript
async function fetchPRFileContent(
  org: string,
  repo: string,
  prNumber: number,
  token: string,
): Promise<string>
```

**Implementation**:
1. `GET /repos/{org}/{repo}/pulls/{pr}/files` → get filename + sha
2. `GET /repos/{org}/{repo}/git/blobs/{sha}` → get content (base64 decode)

## UI Components

### LearnedContentPreview

**File**: `~/repos/dashboards/triage/src/components/learned-content.tsx`

```typescript
type LearnedContentPreviewProps = {
  content: string;   // raw markdown
  title: string;
  author: string;
  date: string;
};
```

Renders markdown content inline with metadata header. Uses existing card/badge components.

### Section Integration

**File**: `~/repos/dashboards/triage/src/components/pr-section.tsx`

Add to `sectionColors`:
```typescript
learned: {
  border: "border-l-violet-500",
  badge: "bg-violet-50 text-violet-800",
}
```

### Dashboard Data Flow

**File**: `~/repos/dashboards/triage/src/components/dashboard.tsx`

New state:
```typescript
const [learnedPRs, setLearnedPRs] = useState<LearnedPR[]>([]);
```

In `refreshData()`:
```typescript
const learned = await fetchLearnedPRs(org, repo, token);
setLearnedPRs(learned);
```

New section added to sections array with:
- `id: "learned"`
- `title: "Learned Knowledge"`
- `defaultAction: "merge"` (most common triage action is to keep)
- PRs from `learnedPRs` state

### Actions

| Action | GitHub Operation | Notes |
|--------|-----------------|-------|
| merge | `PUT /repos/{o}/{r}/pulls/{n}/merge` (squash) | Same as existing merge |
| close | `PATCH /repos/{o}/{r}/pulls/{n}` + comment | Comment: "Discarded via triage" |
| skip | No-op | PR remains for later review |
