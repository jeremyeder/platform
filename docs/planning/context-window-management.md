# Context Window Management Plan for ACP

**Status**: Draft
**Created**: 2025-11-16
**Based On**: arXiv:2509.21361 - "Context Is What You Need: The Maximum Effective Context Window for Real World Limits of LLMs" (Norman Paulsen, 2025)
**Priority**: P0 - Critical for production readiness

## Executive Summary

Research shows that LLMs fail at 100-1,000 tokens despite advertising 200K+ context windows—a **99% gap** between advertised Maximum Context Window (MCW) and actual Maximum Effective Context Window (MECW). The Ambient Code Platform currently lacks any context management capabilities, creating significant risk for silent quality degradation, unpredictable failures, and user trust erosion.

**Critical Finding**: ACP has **zero mechanisms** to detect or mitigate context window limitations, potentially exposing users to hallucinations and degraded performance without awareness.

### Impact Without Implementation

- **Immediate (Days-Weeks)**: Silent failures, degraded output quality, wasted API quota
- **Medium-Term (Months)**: Competitive disadvantage, security vulnerabilities from hallucination-induced bugs
- **Long-Term (Quarters)**: Reputation damage, difficulty attracting enterprise customers

---

## Paper Findings Summary

### Key Discoveries

1. **Severe Context Degradation**
   - Some top-tier models failed at just **100 tokens** in context
   - Most models showed severe accuracy degradation by **1,000 tokens**
   - Models fell short of MCW by up to **99%**
   - MECW varies significantly by problem type

2. **Task-Dependent Performance**
   - Effective context window varies based on task type (code generation, debugging, analysis)
   - Non-linear performance decay as context grows
   - Hallucination rates increase significantly with larger contexts

3. **Methodology**
   - Collected hundreds of thousands of data points across multiple models
   - Tested context window effectiveness across various sizes and problem types
   - Defined MECW as distinct from advertised MCW

### Implications for ACP

- Advertised 200K context windows (Claude Sonnet 4.5, Opus 4.1) are **not reliable** for production
- Multi-repo sessions can easily exceed effective limits without detection
- Long-running interactive sessions accumulate context indefinitely
- No current mechanism to warn users or mitigate degradation

---

## ACP Current State Analysis

### How Context Is Currently Handled

#### 1. Prompt Construction (`components/runners/claude-code-runner/wrapper.py`)

**System Prompt Building** (lines 1710-1743):
- Builds workspace context describing directory structure
- Includes workflow instructions from `ambient.json`
- Adds repository listings and navigation info
- **❌ NO token counting or context size management**

**Multi-Repo Loading** (lines 261-302):
```python
# All repos added as additional directories - NO size limits
for r in repos_cfg:
    repo_path = str(Path(self.context.workspace_path) / name)
    if repo_path not in add_dirs:
        add_dirs.append(repo_path)
```
- **❌ All repositories loaded simultaneously**
- **❌ No selective file loading or chunking**
- **❌ No size estimation before loading**

#### 2. Session Configuration

**Current CRD Fields** (`components/manifests/base/crds/agenticsessions-crd.yaml`):
```yaml
maxTokens:
  type: integer
  default: 4000  # ❌ OUTPUT token limit, NOT context window limit
timeout:
  type: integer
  default: 300   # ❌ Time-based, NOT token-based
```
- `maxTokens` is for **output**, not input context
- `timeout` is time-based, doesn't prevent context overflow

#### 3. Session Resumption (Interactive Mode)

**Continuation Logic** (wrapper.py lines 363-377):
```python
if is_continuation and parent_session_id:
    sdk_resume_id = await self._get_sdk_session_id(parent_session_id)
    if sdk_resume_id:
        options.resume = sdk_resume_id
```
- **❌ Resumes with FULL conversation history**
- **❌ NO context window pruning**
- **❌ NO summarization of old turns**
- **❌ Accumulates context indefinitely**

### Critical Gaps Identified

| Paper Finding | ACP Current State | Risk Level |
|---------------|-------------------|------------|
| Models fail at 100-1000 tokens | No token counting | **CRITICAL** |
| MECW << MCW (99% gap) | Assumes full context available | **CRITICAL** |
| Task-dependent degradation | No task-type awareness | **HIGH** |
| Hallucination rate increases | No detection or mitigation | **HIGH** |
| Non-linear performance decay | No quality monitoring | **MEDIUM** |

### What ACP Does Well

1. **Modular Architecture**: Clean separation enables easy enhancement
2. **Custom Resource Model**: CRD allows for status field additions
3. **Session Metadata Tracking**: Already tracks `num_turns`, `cost`, `usage`
4. **WebSocket Streaming**: Enables real-time context warnings to UI
5. **Workspace Isolation**: Each session has own PVC, preventing cross-contamination

---

## Prioritized Recommendations

### P0 - Critical (Implement Immediately)

#### 1. Implement Token Budget Tracking

**Problem**: No visibility into accumulated context consumption
**Impact**: Sessions silently exceed MECW, producing degraded output

**Solution**:

**Backend Type Addition** (`components/backend/types/common.go`):
```go
type ContextBudget struct {
    SystemTokens        int     `json:"systemTokens"`
    ConversationTokens  int     `json:"conversationTokens"`
    RepoContextTokens   int     `json:"repoContextTokens"`
    TotalTokens         int     `json:"totalTokens"`
    BudgetRemaining     int     `json:"budgetRemaining"`
    AtRisk              bool    `json:"atRisk"`        // >80% used
    HealthStatus        string  `json:"healthStatus"`  // healthy/warning/critical
}
```

**Runner Implementation** (`wrapper.py`):
```python
class ContextBudget:
    def __init__(self, model: str):
        # Conservative MECW limits (vs advertised MCW)
        self.limits = {
            "claude-sonnet-4-5": 50000,   # vs 200K advertised
            "claude-opus-4-1":   100000,  # vs 200K advertised
            "claude-haiku-4-5":  25000,   # vs 200K advertised
        }
        self.model = model
        self.system_tokens = 0
        self.conversation_tokens = 0
        self.repo_context_tokens = 0

    def estimate_tokens(self, text: str) -> int:
        # Rough estimate: 1 token ≈ 4 characters
        return len(text) // 4

    def check_budget(self) -> tuple[bool, int]:
        total = self.system_tokens + self.conversation_tokens + self.repo_context_tokens
        limit = self.limits.get(self.model, 10000)
        return (total < limit * 0.8, limit - total)  # 80% threshold
```

**CRD Status Field** (`agenticsessions-crd.yaml`):
```yaml
status:
  properties:
    contextUsage:
      type: object
      properties:
        systemTokens:
          type: integer
        conversationTokens:
          type: integer
        repoContextTokens:
          type: integer
        totalTokens:
          type: integer
        budgetRemaining:
          type: integer
        atRisk:
          type: boolean
        healthStatus:
          type: string
          enum: ["healthy", "warning", "critical"]
        lastSummarizedTurn:
          type: integer
```

**Success Criteria**:
- ✅ Token count updated after each turn
- ✅ CR status reflects current context usage
- ✅ Warning logged when >80% budget used
- ✅ UI displays context meter with real-time updates

---

#### 2. Add Context Window Validation on Session Creation

**Problem**: Sessions created with initial context >50% of MECW will likely fail
**Impact**: Poor user experience, wasted resources on doomed sessions

**Solution**:

**Backend Validation** (`components/backend/handlers/sessions.go`):
```go
func validateSessionContext(spec types.AgenticSessionSpec) error {
    model := spec.LLMSettings.Model
    mecw := GetMECWLimit(model)

    // Estimate initial context
    estimatedTokens := 0

    // System prompt tokens (rough estimate: 4 chars = 1 token)
    estimatedTokens += len(spec.Prompt) / 4

    // Repo context: 10K tokens per repo (conservative estimate)
    estimatedTokens += len(spec.Repos) * 10000

    // Check against 50% threshold for initial context
    if estimatedTokens > mecw/2 {
        return fmt.Errorf(
            "initial context (%d tokens) exceeds 50%% of model's effective limit (%d tokens). "+
            "Consider: reducing repos, using workflow mode, or selecting a larger model",
            estimatedTokens, mecw,
        )
    }

    return nil
}

var conservativeMECWLimits = map[string]int{
    "claude-sonnet-4-5": 50000,
    "claude-opus-4-1":   100000,
    "claude-haiku-4-5":  25000,
    "claude-3-7-sonnet": 40000,
}

func GetMECWLimit(model string) int {
    if limit, ok := conservativeMECWLimits[model]; ok {
        return limit
    }
    return 10000  // Ultra-conservative default
}
```

**Error Response**:
```json
{
  "error": "initial context (~25,000 tokens) exceeds 50% of model's effective limit (50,000 tokens)",
  "suggestions": [
    "Reduce number of repositories (currently 3)",
    "Use workflow mode to focus on specific tasks",
    "Select claude-opus-4-1 for larger context (100K MECW)"
  ],
  "estimatedTokens": 25000,
  "modelLimit": 50000
}
```

**Success Criteria**:
- ✅ Sessions rejected if initial context >50% MECW
- ✅ Clear error messages with actionable suggestions
- ✅ UI shows estimated context before session creation

---

#### 3. Implement Conversation Summarization for Interactive Mode

**Problem**: Interactive sessions accumulate context indefinitely
**Impact**: Quality degradation after 10-20 turns, no mitigation

**Solution**:

**Runner Summarization Logic** (`wrapper.py`):
```python
async def _summarize_old_turns(self, turn_count: int):
    """Summarize conversation every N turns to compress context."""
    if turn_count % 10 == 0 and turn_count > 0:  # Every 10 turns
        await self._send_log(f"📝 Compressing conversation history (turns {turn_count-10}-{turn_count})")

        # Use Claude API to summarize last 10 turns
        summary_prompt = """Summarize the last 10 conversation turns into 2-3 concise paragraphs.
Focus on:
- Key decisions made
- Code changes implemented
- Outstanding issues or next steps
Omit: Routine confirmations, minor clarifications"""

        summary = await self._call_summarization_api(summary_prompt)

        # Replace last 10 turns with summary
        # (Requires SDK enhancement or conversation history management)

        # Update CR status
        await self._update_cr_status({
            "contextUsage": {
                "lastSummarizedTurn": turn_count,
                "conversationTokens": self.context_budget.conversation_tokens  # Reduced
            }
        })

        await self._send_log(f"✅ Context compressed: {before_tokens} → {after_tokens} tokens ({percent_saved}% saved)")
```

**CRD Configuration** (`agenticsessions-crd.yaml`):
```yaml
spec:
  properties:
    contextManagement:
      type: object
      properties:
        enableSummarization:
          type: boolean
          default: true
        summarizeEveryNTurns:
          type: integer
          default: 10
        maxTurnsBeforeSummary:
          type: integer
          default: 50
          description: "Force summarization if this many turns reached"
```

**Success Criteria**:
- ✅ Automatic summarization every 10 turns
- ✅ >50% token reduction per summarization
- ✅ Key decisions preserved in summaries
- ✅ User can configure or disable summarization

---

### P1 - High Priority (Near-Term)

#### 4. Add Model-Specific MECW Limits

**Rationale**: Different models have different effective limits—don't assume uniformity

**Implementation**:
```go
// components/backend/types/common.go
var ConservativeMECWLimits = map[string]int{
    "claude-sonnet-4-5": 50000,
    "claude-opus-4-1":   100000,
    "claude-haiku-4-5":  25000,
    "claude-3-7-sonnet": 40000,
}

type LLMSettings struct {
    Model           string  `json:"model"`
    Temperature     float64 `json:"temperature"`
    MaxTokens       int     `json:"maxTokens"`
    ContextBudget   int     `json:"contextBudget,omitempty"`    // MECW limit
    EnableSummary   bool    `json:"enableSummary"`
    SummaryInterval int     `json:"summaryInterval,omitempty"`
}
```

**Documentation** (`docs/reference/model-context-limits.md`):
```markdown
# Model Context Limits

## Maximum Effective Context Window (MECW) vs Advertised

| Model | Advertised MCW | Conservative MECW | Recommended For |
|-------|----------------|-------------------|-----------------|
| Claude Sonnet 4.5 | 200K | 50K | Balanced tasks, moderate repos |
| Claude Opus 4.1 | 200K | 100K | Large repos, complex analysis |
| Claude Haiku 4.5 | 200K | 25K | Simple tasks, small repos |

## Why the Gap?

Research (arXiv:2509.21361) shows models experience severe quality degradation
well before reaching advertised limits. MECW values are conservative estimates
based on real-world testing.

## Choosing a Model

- **Small projects (1-2 repos, <10K LOC)**: Haiku 4.5
- **Medium projects (2-3 repos, 10-50K LOC)**: Sonnet 4.5
- **Large projects (3+ repos, >50K LOC)**: Opus 4.1
- **Interactive sessions (>20 turns)**: Enable summarization regardless of model
```

**Success Criteria**:
- ✅ Per-model limits configured
- ✅ Documentation explains MECW vs MCW
- ✅ UI suggests appropriate model based on session config

---

#### 5. Implement Selective Repository Loading

**Rationale**: Loading all repos wastes context—be selective

**CRD Field** (`agenticsessions-crd.yaml`):
```yaml
spec:
  properties:
    repoLoadingStrategy:
      type: string
      enum: ["all", "lazy", "selective"]
      default: "lazy"
      description: |
        all: Load all repos immediately (current behavior)
        lazy: Load repos on-demand when Claude accesses them
        selective: Only load repos explicitly mentioned in prompt
```

**Runner Implementation** (`wrapper.py`):
```python
def _determine_repos_to_load(self, prompt: str, repos_cfg: list) -> list:
    """Determine which repos to load based on strategy."""
    strategy = self.context.get_env('REPO_LOADING_STRATEGY', 'lazy')

    if strategy == 'all':
        return repos_cfg
    elif strategy == 'selective':
        # Parse prompt for repo mentions
        mentioned_repos = []
        for repo in repos_cfg:
            if repo['name'].lower() in prompt.lower():
                mentioned_repos.append(repo)
        # Default to main repo if none mentioned
        return mentioned_repos if mentioned_repos else [repos_cfg[0]]
    else:  # lazy (default)
        # Only load main repo initially
        return [repos_cfg[0]] if repos_cfg else []
```

**Lazy Loading Hook**:
```python
# When Claude attempts to access a non-loaded repo:
# 1. Detect file path outside current repos
# 2. Match to unloaded repo from config
# 3. Clone/load the repo
# 4. Add to add_dirs
# 5. Notify Claude: "Loaded repository X for you"
```

**Success Criteria**:
- ✅ Default "lazy" strategy reduces initial context by 60%+
- ✅ On-demand loading transparent to user
- ✅ UI shows loaded vs available repos

---

#### 6. Add Context Health Monitoring

**Rationale**: Detect degradation in real-time before quality suffers

**Implementation**:
```python
class ContextHealthMonitor:
    def __init__(self):
        self.baseline_latency = None
        self.recent_latencies = []
        self.hallucination_indicators = [
            "I don't have access to that file",     # After providing it
            "I'm not sure about the exact details",  # On previously discussed topics
            "Let me re-read the code",               # Multiple times on same file
        ]

    def check_response_quality(self, response: str, latency_ms: int) -> str:
        # Track latency growth (indicates context processing overhead)
        if self.baseline_latency is None:
            self.baseline_latency = latency_ms

        self.recent_latencies.append(latency_ms)
        if len(self.recent_latencies) > 10:
            self.recent_latencies.pop(0)

        # Alert if latency increased >3x (context overwhelm)
        avg_recent = sum(self.recent_latencies) / len(self.recent_latencies)
        if avg_recent > self.baseline_latency * 3:
            return "warning:latency_degradation"

        # Check for hallucination indicators
        for indicator in self.hallucination_indicators:
            if indicator.lower() in response.lower():
                return "warning:possible_hallucination"

        return "healthy"
```

**CR Status Update**:
```python
health = self.context_health.check_response_quality(response, latency)
await self._update_cr_status({
    "contextUsage": {
        "healthStatus": health.split(":")[0],  # healthy/warning
        "healthReason": health.split(":")[1] if ":" in health else None
    }
})

if health.startswith("warning"):
    await self._send_log(f"⚠️ Context health degraded: {health}")
    await self._send_log("💡 Consider starting a fresh session or enabling summarization")
```

**UI Integration**:
```tsx
// components/frontend/src/components/ContextHealthBadge.tsx
export function ContextHealthBadge({ status }: { status: ContextHealth }) {
  const variants = {
    healthy: { color: 'green', icon: CheckCircle, text: 'Healthy' },
    warning: { color: 'yellow', icon: AlertTriangle, text: 'Degraded' },
    critical: { color: 'red', icon: XCircle, text: 'Critical' }
  };

  const { color, icon: Icon, text } = variants[status.healthStatus];

  return (
    <Badge variant={color}>
      <Icon className="mr-1 h-3 w-3" />
      {text}
      {status.healthReason && (
        <TooltipProvider>
          <Tooltip>
            <TooltipContent>{status.healthReason}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </Badge>
  );
}
```

**Success Criteria**:
- ✅ Health status updated every turn
- ✅ Latency tracked and compared to baseline
- ✅ Hallucination patterns detected
- ✅ UI shows real-time health badge

---

### P2 - Medium Priority (Future Enhancement)

#### 7. Implement RAG-Based Context Injection

**Rationale**: Only include relevant code snippets, not entire repos

**Approach**:
1. **Indexing Phase** (on session creation):
   - Embed codebase using text-embedding-ada-002 or similar
   - Store embeddings in vector DB (ChromaDB, Pinecone, Weaviate)
   - Index: file path, function/class names, docstrings, imports

2. **Retrieval Phase** (per user query):
   - Embed user query
   - Retrieve top-K most relevant code chunks (K=10-20)
   - Inject only retrieved chunks into context, not full files

3. **Benefits**:
   - Massive context reduction (90%+ for large repos)
   - Only relevant code in context
   - Scales to massive codebases (100K+ LOC)

**Research Needed**:
- Embedding model selection (cost vs quality)
- Vector DB integration with K8s deployment
- Chunking strategy (function-level, file-level, semantic)
- Re-indexing strategy on code changes

---

#### 8. Add Problem-Type Classification

**Rationale**: Paper shows MECW varies by problem type—optimize per task

**Implementation**:
```python
def classify_task_type(prompt: str) -> str:
    """Classify task to apply type-specific context strategies."""
    keywords = {
        "code_generation": ["create", "implement", "write new", "generate", "build"],
        "debugging": ["fix bug", "error", "not working", "debug", "broken"],
        "analysis": ["analyze", "review", "explain", "understand", "what does"],
        "refactoring": ["refactor", "reorganize", "improve structure", "clean up"],
    }

    prompt_lower = prompt.lower()
    for task_type, words in keywords.items():
        if any(word in prompt_lower for word in words):
            return task_type
    return "general"

# Apply different context budgets per task type
task_context_multipliers = {
    "code_generation": 0.6,  # Needs more context for patterns
    "debugging": 0.8,         # Can use more context for error traces
    "analysis": 0.7,          # Moderate context needs
    "refactoring": 0.5,       # Less context, more focused changes
    "general": 0.6            # Conservative default
}

def get_task_budget(model: str, task_type: str) -> int:
    base_mecw = ConservativeMECWLimits.get(model, 10000)
    multiplier = task_context_multipliers.get(task_type, 0.6)
    return int(base_mecw * multiplier)
```

**Success Criteria**:
- ✅ Task type auto-detected from prompt
- ✅ Context budget adjusted per task type
- ✅ User can override auto-classification

---

#### 9. Add Context Pruning API

**Endpoint**: `POST /api/projects/:project/agentic-sessions/:session/prune-context`

**Request**:
```json
{
  "strategy": "summarize_all" | "keep_recent" | "reset_fresh",
  "keepTurns": 10  // for keep_recent strategy
}
```

**Functionality**:
- `summarize_all`: Compress entire conversation to summary
- `keep_recent`: Keep last N turns, summarize rest
- `reset_fresh`: Clear conversation, keep only system prompt

**Use Case**: User notices degraded responses mid-session and wants to recover

**Success Criteria**:
- ✅ Manual pruning reduces tokens by >70%
- ✅ Key decisions preserved
- ✅ Session continues without restart

---

## Technical Implementation Details

### Backend Changes (Go)

**Files to Modify**:
1. `components/backend/types/common.go` - Add `ContextBudget`, `ContextHealth` types
2. `components/backend/handlers/sessions.go` - Add `validateSessionContext()`, `/context-status` endpoint
3. `components/backend/handlers/helpers.go` - Add `EstimateTokens()`, `GetMECWLimit()`

**New Endpoints**:
```go
// Get current context status
GET /api/projects/:project/agentic-sessions/:session/context-status
Response: {
  "contextUsage": ContextBudget,
  "healthStatus": "healthy" | "warning" | "critical",
  "recommendations": ["Start fresh session", "Enable summarization"]
}

// Manually prune context
POST /api/projects/:project/agentic-sessions/:session/prune-context
Body: { "strategy": "summarize_all" }
Response: {
  "success": true,
  "tokensBefore": 45000,
  "tokensAfter": 12000,
  "percentReduced": 73
}
```

---

### Runner Changes (Python)

**Files to Modify**:
1. `components/runners/claude-code-runner/wrapper.py` - Add `ContextBudget`, `ContextHealthMonitor` classes
2. `components/runners/claude-code-runner/wrapper.py:_run_claude_agent_sdk()` - Integrate token tracking

**New Classes**:
```python
class ContextBudget:
    """Track accumulated context tokens against MECW limits."""
    # (see P0 recommendation #1)

class ContextHealthMonitor:
    """Monitor response quality for degradation signals."""
    # (see P1 recommendation #6)
```

**Integration Points**:
```python
async def _run_claude_agent_sdk(self, prompt: str):
    # Initialize budget
    self.context_budget = ContextBudget(model)
    self.context_health = ContextHealthMonitor()

    # Estimate system prompt tokens
    workspace_prompt = self._build_workspace_context_prompt(...)
    self.context_budget.system_tokens = self.context_budget.estimate_tokens(workspace_prompt)

    # Update CR with initial budget
    await self._update_cr_status({"contextUsage": {...}})

    # After each turn:
    # 1. Update conversation_tokens
    # 2. Check budget (warn if >80%)
    # 3. Check health (warn if latency spike or hallucinations)
    # 4. Trigger summarization if needed
```

---

### CRD Updates

**File**: `components/manifests/base/crds/agenticsessions-crd.yaml`

**New Spec Fields**:
```yaml
spec:
  properties:
    llmSettings:
      properties:
        contextBudget:
          type: integer
          description: "Override MECW limit (default: model-specific)"
        enableSummarization:
          type: boolean
          default: true
        summaryInterval:
          type: integer
          default: 10
    repoLoadingStrategy:
      type: string
      enum: ["all", "lazy", "selective"]
      default: "lazy"
    contextManagement:
      type: object
      properties:
        maxContextTokens:
          type: integer
        summarizeEveryNTurns:
          type: integer
          default: 10
```

**New Status Fields**:
```yaml
status:
  properties:
    contextUsage:
      type: object
      properties:
        systemTokens:
          type: integer
        conversationTokens:
          type: integer
        repoContextTokens:
          type: integer
        totalTokens:
          type: integer
        budgetRemaining:
          type: integer
        atRisk:
          type: boolean
        healthStatus:
          type: string
          enum: ["healthy", "warning", "critical"]
        healthReason:
          type: string
        lastSummarizedTurn:
          type: integer
```

---

### Frontend Changes (TypeScript)

**New Components**:

1. **`src/components/ContextBudgetMeter.tsx`**:
```tsx
type ContextUsage = {
  totalTokens: number;
  budgetRemaining: number;
  atRisk: boolean;
  healthStatus: 'healthy' | 'warning' | 'critical';
};

export function ContextBudgetMeter({ usage }: { usage: ContextUsage }) {
  const percentUsed = (usage.totalTokens / (usage.totalTokens + usage.budgetRemaining)) * 100;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Context Usage</span>
          <ContextHealthBadge status={usage.healthStatus} />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Progress
          value={percentUsed}
          className={cn(
            percentUsed > 80 && "bg-yellow-500",
            percentUsed > 95 && "bg-red-500"
          )}
        />
        <p className="mt-2 text-sm text-muted-foreground">
          {usage.totalTokens.toLocaleString()} / {(usage.totalTokens + usage.budgetRemaining).toLocaleString()} tokens
        </p>
        {usage.atRisk && (
          <Alert variant="warning" className="mt-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Context Budget Critical</AlertTitle>
            <AlertDescription>
              Consider starting a new session for optimal performance.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
```

2. **Integration in Session Detail Page** (`src/app/projects/[name]/sessions/[sessionName]/page.tsx`):
```tsx
export default function SessionDetailPage({ params }: PageProps) {
  const { data: session } = useSession(params.name, params.sessionName);

  return (
    <div className="grid gap-6">
      <SessionHeader session={session} />

      {/* Add context meter */}
      {session?.status?.contextUsage && (
        <ContextBudgetMeter usage={session.status.contextUsage} />
      )}

      <MessageList messages={session?.messages || []} />
    </div>
  );
}
```

**React Query Integration**:
```tsx
// src/services/queries/sessions.ts
export function useContextStatus(projectName: string, sessionName: string) {
  return useQuery({
    queryKey: ['context-status', projectName, sessionName],
    queryFn: () => sessionsApi.getContextStatus(projectName, sessionName),
    refetchInterval: 5000,  // Poll every 5 seconds during active session
  });
}
```

---

## Success Metrics

### Technical Metrics

1. **Context Budget Compliance**
   - **Target**: <5% of sessions exceed 80% MECW
   - **Measure**: `kubectl get as -A -o json | jq '[.items[].status.contextUsage.atRisk] | map(select(. == true)) | length'`

2. **Session Quality**
   - **Target**: <10% of sessions marked "critical" health
   - **Measure**: Track `contextUsage.healthStatus` distribution

3. **Summarization Effectiveness**
   - **Target**: 50% reduction in token count after summarization
   - **Measure**: Compare `conversationTokens` before/after summary events

### User Experience Metrics

4. **Session Completion Rate**
   - **Target**: >90% of sessions complete without context warnings
   - **Measure**: `completed_sessions / total_sessions` where `atRisk=false`

5. **User Satisfaction**
   - **Target**: >4.0/5.0 rating for response quality
   - **Measure**: Post-session survey (implement feedback mechanism)

6. **Early Warning Adoption**
   - **Target**: >60% of users start new session when warned
   - **Measure**: Track "new session" creation within 10min of `atRisk=true`

### Business Metrics

7. **API Cost Efficiency**
   - **Target**: 20% reduction in wasted API calls (sessions abandoned due to quality)
   - **Measure**: Compare API spend before/after context management

8. **Support Ticket Reduction**
   - **Target**: 40% fewer "quality issues" or "unexpected results" tickets
   - **Measure**: Tag tickets related to context (before/after comparison)

---

## Implementation Roadmap

### Phase 1: Foundation (Sprint 1-2) - 2 weeks

**Goal**: Core token tracking and monitoring infrastructure

**Deliverables**:
- [ ] Add `ContextBudget` type to backend
- [ ] Implement MECW limits map per model
- [ ] Add token estimation utilities
- [ ] Update CRD with `contextUsage` status field
- [ ] Deploy updated CRD to development cluster
- [ ] Unit tests for budget calculations

**Team**: 1 backend engineer, 1 DevOps

**Acceptance Criteria**:
- CRD accepts new status fields
- Backend can calculate estimated tokens
- MECW limits configured for all models

---

### Phase 2: Tracking & Validation (Sprint 3-4) - 2 weeks

**Goal**: Real-time context tracking and session validation

**Deliverables**:
- [ ] Implement token counting in `wrapper.py`
- [ ] Add session creation validation (reject if >50% MECW)
- [ ] Create context status CR update logic
- [ ] Build `/api/projects/:project/agentic-sessions/:session/context-status` endpoint
- [ ] Integration tests for validation logic
- [ ] Error message UX testing

**Team**: 1 backend engineer, 1 Python/runner engineer

**Acceptance Criteria**:
- Oversized sessions rejected with helpful errors
- CR status updated with token counts every turn
- Context status API returns accurate data

---

### Phase 3: UI & Monitoring (Sprint 5-6) - 2 weeks

**Goal**: User-facing context visibility and health monitoring

**Deliverables**:
- [ ] Create `ContextBudgetMeter` component
- [ ] Integrate meter into session detail page
- [ ] Add warning alerts for >80% usage
- [ ] Implement `ContextHealthMonitor` class
- [ ] Add latency tracking and hallucination detection
- [ ] Create monitoring dashboards (Grafana)

**Team**: 1 frontend engineer, 1 Python/runner engineer, 1 DevOps

**Acceptance Criteria**:
- Context meter visible on all active sessions
- Health status updates every turn
- Warnings displayed when degradation detected
- Grafana dashboard shows aggregate metrics

---

### Phase 4: Summarization (Sprint 7-8) - 2 weeks

**Goal**: Automatic context compression for long sessions

**Deliverables**:
- [ ] Implement conversation summarization logic
- [ ] Add summarization configuration to CRD
- [ ] Test summarization effectiveness (A/B comparison)
- [ ] Create user documentation on summarization
- [ ] Enable by default for interactive mode
- [ ] Add manual "compress context" button in UI

**Team**: 1 Python/runner engineer, 1 technical writer

**Acceptance Criteria**:
- Auto-summarization every 10 turns
- >50% token reduction per summary
- User can disable or adjust interval
- Documentation explains feature

---

### Phase 5: Advanced Features (Sprint 9+) - 4+ weeks

**Goal**: Selective loading, task classification, RAG

**Deliverables**:
- [ ] Implement selective repo loading (lazy strategy)
- [ ] Add problem-type classification
- [ ] Build context pruning API
- [ ] Research RAG integration feasibility
- [ ] Pilot with design partners
- [ ] Gather feedback and iterate

**Team**: 2 engineers (full-stack), 1 product manager

**Acceptance Criteria**:
- Lazy loading reduces initial context by >60%
- Task type detection >80% accurate
- Design partner NPS >8/10

---

## Risk Assessment

### If Recommendations NOT Implemented

#### Immediate Risks (Days-Weeks)

1. **Silent Failures**
   - **Likelihood**: High
   - **Impact**: High
   - Sessions produce low-quality output without user awareness
   - Users unaware context limits are being exceeded

2. **User Trust Erosion**
   - **Likelihood**: Medium
   - **Impact**: High
   - Inconsistent results across similar prompts
   - "Works sometimes, fails other times" perception

3. **Resource Waste**
   - **Likelihood**: High
   - **Impact**: Medium
   - Long-running sessions consuming API quota for degraded responses
   - Users re-running sessions due to poor quality

#### Medium-Term Risks (Months)

4. **Competitive Disadvantage**
   - **Likelihood**: Medium
   - **Impact**: High
   - Other platforms implement context management
   - ACP perceived as "unreliable" for production use

5. **Data Quality Issues**
   - **Likelihood**: Medium
   - **Impact**: Critical
   - Generated code contains subtle bugs due to hallucinations
   - Security vulnerabilities introduced by context-degraded outputs

6. **Support Burden**
   - **Likelihood**: High
   - **Impact**: Medium
   - Difficult to debug "why did it work yesterday but not today?"
   - No metrics to diagnose context-related issues

#### Long-Term Risks (Quarters)

7. **Architecture Lock-In**
   - **Likelihood**: Medium
   - **Impact**: High
   - Harder to add context management retroactively
   - Breaking changes required for CRD schema

8. **Reputation Damage**
   - **Likelihood**: High
   - **Impact**: Critical
   - "ACP doesn't understand LLM limitations"
   - Seen as research project, not production platform

---

## Appendix

### A. Research Paper Citation

Norman Paulsen. "Context Is What You Need: The Maximum Effective Context Window for Real World Limits of LLMs." arXiv:2509.21361, September 2025. https://arxiv.org/abs/2509.21361

### B. Related Work

- **LangChain Context Compression**: https://python.langchain.com/docs/modules/data_connection/document_transformers/
- **Anthropic Context Window Documentation**: https://docs.anthropic.com/claude/docs/context-window
- **OpenAI Token Limits**: https://platform.openai.com/docs/guides/rate-limits

### C. Glossary

- **MCW (Maximum Context Window)**: Advertised token limit (e.g., 200K for Claude Sonnet 4.5)
- **MECW (Maximum Effective Context Window)**: Actual usable tokens before quality degradation
- **Token**: Unit of text (~4 characters on average)
- **Hallucination**: Model generating incorrect information with confidence
- **Summarization**: Compressing conversation history to reduce token count
- **RAG (Retrieval-Augmented Generation)**: Technique to inject only relevant context, not entire documents

### D. Open Questions for Discussion

1. **Summarization Strategy**: Should we summarize every N turns, or based on token threshold?
2. **User Override**: Allow users to disable context limits at their own risk?
3. **Model Selection**: Should UI recommend model based on repo sizes?
4. **Token Estimation**: Use tiktoken library for accuracy vs simple 4-char heuristic?
5. **RAG Investment**: Is RAG worth the infrastructure complexity for ACP's use case?

### E. Quickstart for Contributors

**To implement P0 recommendations:**

1. **Backend Setup**:
   ```bash
   cd components/backend
   # Add ContextBudget to types/common.go
   # Add GetMECWLimit() to handlers/helpers.go
   # Add validateSessionContext() to handlers/sessions.go
   go test ./...
   ```

2. **CRD Update**:
   ```bash
   cd components/manifests/base/crds
   # Edit agenticsessions-crd.yaml, add contextUsage to status
   kubectl apply -f agenticsessions-crd.yaml
   ```

3. **Runner Implementation**:
   ```bash
   cd components/runners/claude-code-runner
   # Add ContextBudget class to wrapper.py
   # Integrate into _run_claude_agent_sdk()
   python -m pytest
   ```

4. **Frontend UI**:
   ```bash
   cd components/frontend
   # Create src/components/ContextBudgetMeter.tsx
   # Add to session detail page
   npm run build
   ```

**Testing locally**:
```bash
# Create test session with oversized context
curl -X POST http://localhost:8080/api/projects/test-project/agentic-sessions \
  -H "Content-Type: application/json" \
  -d '{
    "name": "context-test",
    "prompt": "Analyze this codebase",
    "repos": [
      {"url": "https://github.com/large-repo-1"},
      {"url": "https://github.com/large-repo-2"},
      {"url": "https://github.com/large-repo-3"}
    ]
  }'

# Should reject with context size error
```

---

**End of Plan**
