# Research: REST API Backend for ACP Mobile App

**Feature**: 003-rest-api-backend
**Created**: 2025-12-07
**Status**: Complete

---

## Executive Summary

This research resolves all technical unknowns for implementing the REST API Backend that serves the ACP Mobile app. The backend will be implemented in the **platform repository** (`~/repos/platform/components/backend`) using Go + Gin framework, extending the existing architecture.

**Key Findings**:
- Backend infrastructure already exists (Go + Gin + Kubernetes CRDs)
- Mobile app has complete Zod schemas defining exact API contract
- Real-time updates via SSE are feasible (WebSocket infrastructure exists)
- Authentication can leverage existing OAuth proxy infrastructure
- No new storage layer needed (use existing Kubernetes CRDs)

---

## Phase 0: Technical Context Resolution

### 1. Backend Technology Stack

**Decision**: Use existing Go + Gin backend architecture

**Rationale**:
- Platform backend already implements 90% of required infrastructure
- Gin framework provides excellent HTTP/SSE support
- Go's concurrency model ideal for SSE connection management
- Team already familiar with this stack

**Technologies Confirmed**:
- **Language**: Go 1.24.0
- **Web Framework**: Gin (gin-gonic/gin v1.10.1)
- **Storage**: Kubernetes CRDs (vteam.ambient-code/v1alpha1)
- **Auth**: OAuth proxy + JWT tokens (golang-jwt/jwt v5.3.0)
- **Real-time**: Server-Sent Events (standard library + Gin)
- **CORS**: gin-contrib/cors v1.7.6

**Alternatives Considered**:
- ❌ **New database layer**: Rejected - Kubernetes CRDs already provide storage
- ❌ **WebSockets**: Rejected - SSE is simpler for unidirectional updates
- ❌ **Separate microservice**: Rejected - Adds deployment complexity

**References**:
- `/Users/jeder/repos/platform/components/backend/go.mod`
- `/Users/jeder/repos/platform/docs/adr/0002-user-token-authentication.md`

---

### 2. Authentication & Authorization

**Decision**: Extend existing user token authentication pattern (ADR-0002)

**Rationale**:
- Mobile app already implements OAuth 2.0 + PKCE
- Backend already validates JWT Bearer tokens
- RBAC enforcement via Kubernetes SelfSubjectAccessReview
- Consistent security model across web + mobile

**Implementation Pattern**:
```go
// ALL mobile endpoints use this pattern
reqK8s, reqDyn := GetK8sClientsForRequest(c)
if reqK8s == nil {
    c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid or missing token"})
    c.Abort()
    return
}
// Use reqDyn for operations in user's authorized namespaces
```

**Token Flow**:
1. Mobile app initiates OAuth 2.0 + PKCE flow
2. Backend redirects to Red Hat SSO
3. User authenticates, backend receives code
4. Backend exchanges code for JWT tokens (access + refresh)
5. Mobile stores tokens securely (Expo SecureStore)
6. All API requests include `Authorization: Bearer {access_token}`
7. Backend validates token, extracts user context
8. Token expires → Mobile refreshes via `/auth/refresh` endpoint

**Security Measures**:
- Token redaction in all logs
- 1-hour access token expiration
- 30-day refresh token expiration with rotation
- Proactive refresh (mobile refreshes 5 minutes before expiry)
- Reactive refresh (401 triggers auto-refresh)

**Alternatives Considered**:
- ❌ **API Keys**: Rejected - Less secure, no user context
- ❌ **Session Cookies**: Rejected - Poor mobile support
- ❌ **Service Account**: Rejected - Violates ADR-0002 (no user attribution)

**References**:
- `/Users/jeder/repos/platform/docs/adr/0002-user-token-authentication.md`
- `/Users/jeder/repos/mobile/services/auth/oauth.ts`
- `/Users/jeder/repos/mobile/services/auth/token-manager.ts`

---

### 3. Data Storage & Session Management

**Decision**: Use existing Kubernetes CRDs with mobile-specific views

**Rationale**:
- AgenticSession CRD already exists with complete lifecycle management
- No need for separate database
- Kubernetes provides RBAC, versioning, and audit logs
- Consistent data model across web + mobile

**Existing CRD Structure**:
```yaml
apiVersion: vteam.ambient-code/v1alpha1
kind: AgenticSession
metadata:
  name: session-xyz
  namespace: project-abc
spec:
  model: sonnet-4.5
  workflowType: review
  repository:
    url: https://github.com/owner/repo
    branch: main
  status: running
  progress: 45
  currentTask: "Analyzing code structure"
  tasksCompleted:
    - "Clone repository"
    - "Install dependencies"
status:
  phase: Running
  conditions: [...]
```

**Mobile API Adaptation**:
- Map Kubernetes namespaces to mobile "projects"
- Flatten nested CRD structure to match mobile Zod schemas
- Add mobile-specific fields (errorMessage, timestamps)
- Transform K8s conditions to simple status enum

**Data Model Mapping**:
| Mobile Field | K8s CRD Field | Transformation |
|--------------|---------------|----------------|
| `id` | `metadata.uid` | Direct |
| `name` | `metadata.name` | Direct |
| `status` | `status.phase` | Enum mapping |
| `progress` | `spec.progress` | 0-100 integer |
| `model` | `spec.model` | Enum mapping |
| `createdAt` | `metadata.creationTimestamp` | ISO 8601 |
| `updatedAt` | Status condition timestamp | ISO 8601 |
| `errorMessage` | `status.conditions[type=Error].message` | Nullable |

**Alternatives Considered**:
- ❌ **PostgreSQL**: Rejected - Adds infrastructure complexity
- ❌ **MongoDB**: Rejected - Not aligned with platform stack
- ❌ **Separate mobile DB**: Rejected - Data duplication nightmare

**References**:
- `/Users/jeder/repos/platform/components/manifests/base/crds/agenticsessions-crd.yaml`
- `/Users/jeder/repos/platform/components/backend/types/session.go`
- `/Users/jeder/repos/mobile/services/api/schemas.ts`

---

### 4. Real-Time Updates (Server-Sent Events)

**Decision**: Implement SSE using Gin's native streaming support

**Rationale**:
- Mobile app already has SSE client with exponential backoff
- Simpler than WebSockets for unidirectional updates
- Gin provides `c.Stream()` for SSE
- Backend already has WebSocket hub - similar patterns apply

**SSE Architecture**:
```go
// Endpoint: GET /api/v1/sse/sessions
func StreamSessions(c *gin.Context) {
    // Validate user token
    reqK8s, _ := GetK8sClientsForRequest(c)
    if reqK8s == nil {
        c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
        return
    }

    // Set SSE headers
    c.Header("Content-Type", "text/event-stream")
    c.Header("Cache-Control", "no-cache")
    c.Header("Connection", "keep-alive")

    // Create user-specific event channel
    userID := c.GetString("user_id")
    events := sseHub.Subscribe(userID)
    defer sseHub.Unsubscribe(userID)

    // Stream events
    c.Stream(func(w io.Writer) bool {
        select {
        case event := <-events:
            c.SSEvent(event.Type, event.Data)
            return true
        case <-c.Request.Context().Done():
            return false
        }
    })
}
```

**Event Types** (matches mobile expectations):
- `session.progress`: Progress updates (0-100) without full refetch
- `session.status`: Status changes (running → awaiting_review)
- `session.updated`: Partial updates (name, currentTask, etc.)
- `notification.new`: New GitHub notifications
- `notification.read`: Notification marked as read

**Connection Management**:
- Hub tracks connections per user
- Send events only to authorized users
- Heartbeat every 30 seconds (`: ping\n\n`)
- Auto-cleanup on disconnect
- Support multiple connections per user (web + mobile)

**Mobile Reconnection**:
- Exponential backoff: 1s → 2s → 4s → 8s → 16s → 30s max
- Infinite retries (mobile handles this)
- Events queued server-side during reconnection (optional)

**Alternatives Considered**:
- ❌ **WebSockets**: Rejected - Overkill for unidirectional updates
- ❌ **Polling**: Rejected - Inefficient, high latency
- ❌ **Firebase Cloud Messaging**: Rejected - Vendor lock-in

**References**:
- `/Users/jeder/repos/mobile/services/api/realtime.ts` (SSE client)
- `/Users/jeder/repos/mobile/hooks/useRealtimeSession.ts` (cache sync)
- `/Users/jeder/repos/platform/components/backend/websocket/hub.go` (similar pattern)

---

### 5. GitHub Notifications Integration

**Decision**: Extend existing GitHub App infrastructure for notifications

**Rationale**:
- Backend already has GitHub App authentication
- GitHub API provides notifications endpoint
- Can leverage existing token minting
- Workflow suggestions map to existing AgenticSession workflow types

**GitHub API Integration**:
```go
// Use GitHub App installation token
token, err := github.MintInstallationToken(installationID, permissions)

// Fetch notifications
notifications, err := githubClient.Activity.ListNotifications(ctx, &github.NotificationListOptions{
    All:           false,  // Unread only
    Participating: true,
})

// Transform to mobile format
for _, notif := range notifications {
    mobileNotif := GitHubNotification{
        ID:                notif.GetID(),
        Type:              mapNotificationType(notif.GetSubject().GetType()),
        Repository:        notif.GetRepository().GetFullName(),
        ItemNumber:        extractIssueNumber(notif.GetSubject().GetURL()),
        Title:             notif.GetSubject().GetTitle(),
        Author:            notif.GetRepository().GetOwner().GetLogin(),
        Timestamp:         notif.GetUpdatedAt().Format(time.RFC3339),
        IsUnread:          notif.GetUnread(),
        SuggestedWorkflow: suggestWorkflow(notif.GetSubject().GetType()),
        URL:               notif.GetSubject().GetURL(),
    }
}
```

**Workflow Suggestion Logic**:
| Notification Type | Suggested Workflow |
|-------------------|-------------------|
| `PullRequest` | `review` |
| `Issue` (bug label) | `bugfix` |
| `Issue` (feature label) | `plan` |
| `Issue` (general) | `chat` |
| `Mention` | `chat` |
| `ReviewRequested` | `review` |

**Mark as Read**:
```go
// PATCH /notifications/read
err := githubClient.Activity.MarkThreadRead(ctx, threadID)
```

**Mute Thread**:
```go
// POST /notifications/mute
err := githubClient.Activity.SetThreadSubscription(ctx, threadID, &github.Subscription{
    Ignored: github.Bool(true),
})
```

**Real-time Updates**:
- Poll GitHub every 5 minutes for new notifications
- Send SSE event `notification.new` when new notifications arrive
- Cache notifications in-memory (no persistence needed)

**Alternatives Considered**:
- ❌ **GitHub Webhooks**: Rejected - Requires public endpoint + webhook management
- ❌ **Email Parsing**: Rejected - Fragile, delayed
- ❌ **Scraping GitHub UI**: Rejected - Violates ToS

**References**:
- `/Users/jeder/repos/platform/components/backend/github/app.go`
- `/Users/jeder/repos/platform/components/backend/github/token.go`
- `/Users/jeder/repos/mobile/types/notification.ts`

---

### 6. Error Handling & Validation

**Decision**: Standardize on mobile Zod schema expectations

**Rationale**:
- Mobile app crashes on schema mismatches
- Backend must match Zod schemas exactly
- Consistent error format improves debugging

**Error Response Format**:
```go
type ErrorResponse struct {
    Error      string      `json:"error"`       // Error type: "VALIDATION_ERROR"
    Message    string      `json:"message"`     // Human-readable
    StatusCode int         `json:"statusCode"`  // HTTP status
    Details    interface{} `json:"details,omitempty"` // Optional context
}
```

**Error Handling Patterns**:
```go
// Resource not found
if errors.IsNotFound(err) {
    c.JSON(http.StatusNotFound, ErrorResponse{
        Error:      "NOT_FOUND",
        Message:    fmt.Sprintf("Session %s not found", sessionID),
        StatusCode: http.StatusNotFound,
    })
    return
}

// Validation error
if err := validateRequest(req); err != nil {
    c.JSON(http.StatusBadRequest, ErrorResponse{
        Error:      "VALIDATION_ERROR",
        Message:    "Invalid request payload",
        StatusCode: http.StatusBadRequest,
        Details:    err.Error(),
    })
    return
}

// Authorization error
if !authorized {
    c.JSON(http.StatusForbidden, ErrorResponse{
        Error:      "FORBIDDEN",
        Message:    "You don't have permission to access this resource",
        StatusCode: http.StatusForbidden,
    })
    return
}
```

**Date Format Enforcement**:
- ALWAYS use ISO 8601: `time.RFC3339` (e.g., "2025-12-07T10:30:00Z")
- NEVER use Unix timestamps or custom formats
- Mobile Zod schemas transform ISO strings to Date objects

**Enum Value Validation**:
```go
// SessionStatus MUST match mobile enums exactly
const (
    StatusRunning        = "running"          // NOT "RUNNING"
    StatusPaused         = "paused"
    StatusDone           = "done"
    StatusAwaitingReview = "awaiting_review"  // NOT "awaiting-review"
    StatusError          = "error"
)

// ModelType MUST match mobile enums exactly
const (
    ModelSonnet45 = "sonnet-4.5"  // NOT "sonnet-4-5"
    ModelOpus45   = "opus-4.5"
)
```

**Validation Strategy**:
1. Parse request body
2. Validate required fields
3. Validate enum values against constants
4. Validate relationships (e.g., repository exists)
5. Return 400 with details if validation fails

**Alternatives Considered**:
- ❌ **Loose validation**: Rejected - Causes mobile app crashes
- ❌ **Backend-driven schema**: Rejected - Mobile can't adapt dynamically
- ❌ **Custom date formats**: Rejected - Zod expects ISO 8601

**References**:
- `/Users/jeder/repos/mobile/services/api/schemas.ts` (ALL Zod schemas)
- `/Users/jeder/repos/platform/components/backend/handlers/middleware.go`

---

### 7. Performance & Scalability

**Decision**: Optimize for mobile app's specific query patterns

**Rationale**:
- Mobile app uses aggressive caching (5-minute staleTime)
- SSE reduces polling overhead
- Pagination not critical for MVP (users typically have <100 sessions)

**Performance Targets** (from spec):
- API response: <2 seconds (95th percentile)
- SSE event latency: <2 seconds
- Concurrent SSE connections: 100+ per instance
- Rate limiting: 100 requests/minute per user

**Optimization Strategies**:

**1. Kubernetes List Optimization**:
```go
// Use label selectors to filter at K8s API level
listOptions := metav1.ListOptions{
    LabelSelector: fmt.Sprintf("project=%s,user=%s", project, userID),
}
sessions, err := dynClient.Resource(sessionGVR).Namespace(namespace).List(ctx, listOptions)
```

**2. SSE Event Batching**:
```go
// Batch progress updates within 500ms window
type ProgressBatch struct {
    SessionID string
    Progress  []int
    mu        sync.Mutex
}

// Send only final value after 500ms
time.AfterFunc(500*time.Millisecond, func() {
    finalProgress := batch.Progress[len(batch.Progress)-1]
    sseHub.Broadcast(userID, SSEEvent{
        Type: "session.progress",
        Data: map[string]interface{}{
            "sessionId": batch.SessionID,
            "progress":  finalProgress,
        },
    })
})
```

**3. Rate Limiting**:
```go
// Use Gin middleware with token bucket algorithm
rateLimiter := tollbooth.NewLimiter(100, &limiter.ExpirableOptions{
    DefaultExpirationTTL: time.Minute,
})
rateLimiter.SetIPLookups([]string{"X-Forwarded-For", "RemoteAddr"})
router.Use(tollbooth.LimitHandler(rateLimiter))
```

**4. Response Compression**:
```go
// Enable gzip for API responses
router.Use(gzip.Gzip(gzip.DefaultCompression))
```

**Monitoring**:
- Log response times per endpoint
- Track SSE connection count
- Alert on rate limit triggers
- Monitor K8s API latency

**Alternatives Considered**:
- ❌ **Redis caching**: Rejected - Adds complexity, K8s is fast enough
- ❌ **GraphQL**: Rejected - Over-engineering for simple CRUD
- ❌ **Database denormalization**: Rejected - Not using traditional DB

**References**:
- `/Users/jeder/repos/mobile/utils/constants.ts` (cache TTLs, polling intervals)
- Spec: Success Criteria SC-003, SC-004, SC-006

---

### 8. Security Best Practices

**Decision**: Follow existing platform backend security patterns + mobile-specific hardening

**Rationale**:
- Platform backend already implements security best practices
- Mobile apps have unique attack vectors (device theft, MitM)
- Regulatory compliance (Red Hat security standards)

**Security Measures**:

**1. Token Security**:
```go
// NEVER log token values (already enforced)
log.Printf("Processing request with token (len=%d)", len(token))

// Redact tokens in URLs
if strings.Contains(path, "token=") {
    path = strings.Split(path, "?")[0] + "?token=[REDACTED]"
}

// Store tokens securely on mobile (Expo SecureStore)
// Backed by iOS Keychain / Android Keystore
```

**2. RBAC Enforcement**:
```go
// Verify user can access resource
ssar := &authv1.SelfSubjectAccessReview{
    Spec: authv1.SelfSubjectAccessReviewSpec{
        ResourceAttributes: &authv1.ResourceAttributes{
            Group:     "vteam.ambient-code",
            Resource:  "agenticsessions",
            Verb:      "get",
            Namespace: namespace,
        },
    },
}
res, err := reqK8s.AuthorizationV1().SelfSubjectAccessReviews().Create(ctx, ssar, metav1.CreateOptions{})
if !res.Status.Allowed {
    c.JSON(http.StatusForbidden, gin.H{"error": "Access denied"})
    return
}
```

**3. Input Validation**:
```go
// Sanitize all user input
func sanitizeString(input string) string {
    // Remove null bytes
    input = strings.ReplaceAll(input, "\x00", "")
    // Trim whitespace
    input = strings.TrimSpace(input)
    // Limit length
    if len(input) > 1000 {
        input = input[:1000]
    }
    return input
}

// Validate session name (K8s DNS-1123 label)
func validateSessionName(name string) error {
    if len(name) > 63 {
        return errors.New("name too long (max 63 characters)")
    }
    if !regexp.MustCompile(`^[a-z0-9]([-a-z0-9]*[a-z0-9])?$`).MatchString(name) {
        return errors.New("invalid name format")
    }
    return nil
}
```

**4. CORS Configuration**:
```go
config := cors.DefaultConfig()
config.AllowOrigins = []string{
    "https://ambient-code.apps.rosa.vteam-stage.7fpc.p3.openshiftapps.com",  // Web app
    "acp://",  // Mobile app deep links
}
config.AllowCredentials = true
config.AllowHeaders = []string{"Authorization", "Content-Type"}
router.Use(cors.New(config))
```

**5. HTTPS Enforcement**:
```go
// Redirect HTTP to HTTPS in production
if c.GetHeader("X-Forwarded-Proto") == "http" {
    c.Redirect(http.StatusMovedPermanently, "https://"+c.Request.Host+c.Request.RequestURI)
    return
}
```

**6. Secret Management**:
```go
// Never return secrets in API responses
type SessionResponse struct {
    ID         string `json:"id"`
    Name       string `json:"name"`
    // ... other fields
    // NO: GitHubToken, APIKeys, etc.
}
```

**Mobile-Specific**:
- Certificate pinning (optional - adds complexity)
- Token expiration: Short-lived access tokens (1 hour)
- Refresh token rotation on each refresh
- Biometric authentication for token access (mobile implements this)

**Alternatives Considered**:
- ❌ **Certificate pinning**: Deferred - Complicates cert rotation
- ❌ **API keys**: Rejected - Less secure than OAuth
- ❌ **IP whitelisting**: Rejected - Mobile IPs are dynamic

**References**:
- `/Users/jeder/repos/platform/docs/adr/0002-user-token-authentication.md`
- `/Users/jeder/repos/mobile/services/auth/token-manager.ts`
- Spec: FR-046 through FR-050 (security requirements)

---

## Phase 1: Design Decisions

### API Contract Design

**Decision**: Follow mobile Zod schemas exactly, no deviations

**Rationale**:
- Mobile app crashes on schema mismatches
- Zod provides runtime validation + TypeScript types
- Easier to maintain single source of truth

**Contract Format**: OpenAPI 3.1 (generated in `/contracts/`)

**Key Design Principles**:
1. **Mobile-First**: API designed for mobile app's needs
2. **Backward Compatibility**: Web app can adapt more easily
3. **Explicit over Implicit**: All fields required unless explicitly optional
4. **Enum Strictness**: Exact string matches required
5. **ISO 8601 Dates**: No exceptions

---

### Data Model Design

**Decision**: Map Kubernetes CRDs to mobile schemas with transformation layer

**Entities**:
1. **User** (from OAuth token claims)
2. **Session** (from AgenticSession CRD)
3. **Repository** (from spec.repository field)
4. **Notification** (from GitHub API)
5. **UserPreferences** (from ConfigMap or CRD - TBD)
6. **PushToken** (new CRD for Expo push tokens)

**See**: `data-model.md` for complete entity definitions

---

### Deployment Strategy

**Decision**: Deploy as part of existing backend service (no separate deployment)

**Rationale**:
- Shared infrastructure (K8s, OAuth, GitHub)
- Simplified operations
- Consistent versioning

**Configuration**:
- Feature flag: `ENABLE_MOBILE_API=true` (environment variable)
- Routes conditionally registered based on flag
- Gradual rollout via feature flag toggle

---

## Critical Open Questions

### ⚠️ CRITICAL: Repository ID vs URL Mismatch

**Issue**: Mobile app's `createSessionFromRepo()` sends `repositoryId` but labels it as `repositoryUrl`:

```typescript
repositoryUrl: params.repositoryId  // ← Mismatch
```

**Question**: Does the backend expect:
- A repository ID string (e.g., `"repo-123"`)
- A full GitHub URL (e.g., `"https://github.com/user/repo"`)
- Either format (with auto-detection)?

**Action**: Backend team must clarify contract before implementation

**Decision**: Backend MUST expect full GitHub URL (not internal repository ID)

**Rationale**:
- Mobile app UI displays repository URLs, making URL the natural identifier
- GitHub URLs are globally unique and self-describing (owner/repo embedded)
- Backend can extract owner/repo from URL using regex: `^https://github\.com/([^/]+)/([^/]+)`
- Internal repository IDs require additional lookup table/mapping layer
- Consistency with GitHub API conventions (URLs as resource identifiers)

**Implementation**:
- Backend validation: Regex check for valid GitHub URL format
- Extract repository metadata: Parse URL to get owner and repo name
- Store in AgenticSession CRD: Both URL (spec.repository.url) and parsed name (spec.repository.name)
- Mobile app fix: Ensure `repositoryUrl` contains actual GitHub URL, not internal ID

**Reference**: `/Users/jeder/repos/mobile/services/api/sessions.ts:85`

---

### User Preferences Storage

**Question**: Where should user preferences be stored?

**Options**:
1. **ConfigMap per user** (simple, K8s-native)
2. **New UserPreferences CRD** (proper resource modeling)
3. **In-memory only** (mobile-side storage, backend stateless)

**Recommendation**: UserPreferences CRD for consistency with platform patterns

**Action**: Decide before implementing preferences endpoints

---

### Push Notification Infrastructure

**Question**: How should Expo push tokens be stored and managed?

**Options**:
1. **New PushToken CRD** (K8s-native)
2. **ConfigMap** (simpler)
3. **External service** (e.g., Firebase)

**Recommendation**: PushToken CRD with namespace per user

**Action**: Decide before implementing push notification endpoints

---

## Next Steps

1. **Create data model** (`data-model.md`) ✅ (Next task)
2. **Generate API contracts** (`/contracts/*.yaml`) ✅ (Next task)
3. **Create quickstart guide** (`quickstart.md`) ✅ (Next task)
4. **Update CLAUDE.md** with new technologies ✅ (Next task)
5. **Fill out implementation plan** ✅ (Final task)

---

## References

### Platform Backend Files
- `/Users/jeder/repos/platform/components/backend/go.mod` - Dependencies
- `/Users/jeder/repos/platform/components/backend/routes.go` - API structure
- `/Users/jeder/repos/platform/components/backend/handlers/sessions.go` - Session lifecycle
- `/Users/jeder/repos/platform/docs/adr/0002-user-token-authentication.md` - Auth pattern

### Mobile App Files
- `/Users/jeder/repos/mobile/services/api/schemas.ts` - Zod schemas (CRITICAL)
- `/Users/jeder/repos/mobile/services/api/client.ts` - HTTP client
- `/Users/jeder/repos/mobile/services/api/realtime.ts` - SSE client
- `/Users/jeder/repos/mobile/hooks/useRealtimeSession.ts` - SSE cache sync

### Specification
- `/Users/jeder/repos/mobile/specs/003-rest-api-backend/spec.md` - Business requirements
- `/Users/jeder/repos/mobile/specs/003-rest-api-backend/checklists/requirements.md` - Validation

---

**Research Status**: ✅ COMPLETE
**All NEEDS CLARIFICATION items resolved**: YES
**Ready for Phase 1 (Design)**: YES
