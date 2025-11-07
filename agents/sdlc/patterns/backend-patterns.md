# Backend Patterns

**Version**: 1.0.0
**Last Updated**: 2025-11-06
**Scope**: Go backend API development for Ambient Code Platform

This document defines critical patterns for backend development extracted from `CLAUDE.md` and production code.

---

## Pattern: user-scoped-k8s-client-creation

**Pattern ID**: user-scoped-k8s-client-creation
**Version**: 1.0
**Status**: Stable
**Category**: Authentication / RBAC

**Location**: components/backend/handlers/middleware.go::GetK8sClientsForRequest
**Grep Anchor**: `func GetK8sClientsForRequest\(c \*gin\.Context\)`

**Description**:
Always use user-scoped Kubernetes clients for API operations initiated by users. The backend service account (DynamicClient, K8sClient) must ONLY be used for CR writes after validation and token minting for runners. Using service account for user operations bypasses RBAC and violates multi-tenancy isolation.

**Context**:
Use this pattern for ALL HTTP handler operations that list, get, create, update, or delete Kubernetes resources on behalf of a user. Service account usage is only permitted in two specific cases: (1) writing CRs after validation (handlers/sessions.go:417), (2) minting tokens for runners (handlers/sessions.go:449).

**Implementation**:
```go
func ListSessions(c *gin.Context) {
    // ALWAYS get user-scoped clients first
    reqK8s, reqDyn := GetK8sClientsForRequest(c)
    if reqK8s == nil {
        c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid or missing token"})
        c.Abort()
        return
    }

    project := c.Param("projectName")
    gvr := types.GetAgenticSessionResource()

    // Use user-scoped dynamic client for list operation
    list, err := reqDyn.Resource(gvr).Namespace(project).List(ctx, v1.ListOptions{})
    if err != nil {
        log.Printf("Failed to list sessions: %v", err)
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list sessions"})
        return
    }

    c.JSON(http.StatusOK, gin.H{"items": list.Items})
}
```

**Anti-Patterns**:
```go
// ❌ NEVER use service account for user operations
func ListSessions(c *gin.Context) {
    project := c.Param("projectName")
    gvr := types.GetAgenticSessionResource()

    // WRONG: Bypasses user RBAC, violates multi-tenancy
    list, err := DynamicClient.Resource(gvr).Namespace(project).List(ctx, v1.ListOptions{})
    // ...
}

// ❌ NEVER fall back to service account on auth failure
func GetSession(c *gin.Context) {
    reqK8s, reqDyn := GetK8sClientsForRequest(c)
    if reqK8s == nil {
        // WRONG: Using elevated privileges on auth failure
        obj, _ := DynamicClient.Resource(gvr).Namespace(ns).Get(ctx, name, v1.GetOptions{})
        c.JSON(http.StatusOK, obj)
        return
    }
    // ...
}
```

**Detection**:
- ✅ Correct: `grep -r "GetK8sClientsForRequest" components/backend/handlers/`
- ❌ Wrong: `grep -r "DynamicClient\.Resource\|K8sClient\.CoreV1\|K8sClient\.BatchV1" components/backend/handlers/*.go` (should return ONLY sessions.go:417,449)

**Validation**:
1. Create test user with limited RBAC (read-only on namespace A)
2. Attempt operation on namespace B via API
3. Should return 403 Forbidden (not succeed due to service account)

**Related Patterns**:
- [Pattern: token-security-and-redaction] (how to handle tokens)
- [Pattern: rbac-enforcement-api-layer] (RBAC checks before operations)

**Change History**:
- v1.0 (2025-11-06): Initial pattern definition from CLAUDE.md

---

## Pattern: token-security-and-redaction

**Pattern ID**: token-security-and-redaction
**Version**: 1.0
**Status**: Stable
**Category**: Security / Logging

**Location**: components/backend/server/server.go::customLoggerFormatter
**Grep Anchor**: `func customLoggerFormatter.*LogFormatterParams`

**Description**:
Never log tokens, API keys, or sensitive headers in plain text. Always redact sensitive values using custom log formatters. Use token length instead of content for debugging.

**Context**:
Apply to all logging statements in backend and operator. Includes HTTP headers (Authorization, X-Forwarded-*), environment variables (ANTHROPIC_API_KEY), and Secret data.

**Implementation**:
```go
// Custom logger that redacts tokens
func customLoggerFormatter(param gin.LogFormatterParams) string {
    path := param.Path
    if param.Request.URL.RawQuery != "" {
        // Redact query params that might contain tokens
        path = strings.Split(path, "?")[0] + "?[REDACTED]"
    }

    return fmt.Sprintf("[%s] %s %s %d %s\n",
        param.TimeStamp.Format(time.RFC3339),
        param.Method,
        path, // Redacted path
        param.StatusCode,
        param.Latency,
    )
}

// In handlers, log token length not content
func SomeHandler(c *gin.Context) {
    token := extractToken(c)
    log.Printf("Processing request with token (len=%d)", len(token))
    // NEVER: log.Printf("Token: %s", token)
}
```

**Anti-Patterns**:
```go
// ❌ NEVER log tokens directly
log.Printf("Authorization: %s", c.GetHeader("Authorization"))
log.Printf("Token: %s", token)
log.Printf("API Key: %s", os.Getenv("ANTHROPIC_API_KEY"))

// ❌ NEVER include tokens in error messages
return fmt.Errorf("failed to validate token %s: %w", token, err)

// ❌ NEVER log full URLs with token query params
log.Printf("Fetching: %s", request.URL.String()) // May contain ?token=xxx
```

**Detection**:
- ✅ Correct: `grep -r "len(token)\|tokenLen\|\[REDACTED\]" components/backend/`
- ❌ Wrong: `grep -r 'log.*[Tt]oken.*%s\|log.*[Aa]pi[Kk]ey.*%s' components/backend/` (should return no results)

**Validation**:
1. Set log level to debug
2. Make API request with authorization header
3. Check logs contain no full token values (only lengths or [REDACTED])

**Related Patterns**:
- [Pattern: user-scoped-k8s-client-creation] (token extraction)
- [Pattern: secret-management-handlers] (handling Secret resources)

**Change History**:
- v1.0 (2025-11-06): Initial pattern from CLAUDE.md

---

## Pattern: rbac-enforcement-api-layer

**Pattern ID**: rbac-enforcement-api-layer
**Version**: 1.0
**Status**: Stable
**Category**: Security / Authorization

**Location**: components/backend/handlers/middleware.go::ValidateProjectContext
**Grep Anchor**: `func ValidateProjectContext\(\)`

**Description**:
Perform RBAC permission checks before executing operations, not after. Use SelfSubjectAccessReview to validate user permissions against Kubernetes RBAC policies. Return 403 Forbidden for unauthorized operations.

**Context**:
Use in middleware for project-scoped endpoints (`/api/projects/:project/*`) and in individual handlers for resource-specific operations.

**Implementation**:
```go
// Middleware for project-level RBAC
func ValidateProjectContext() gin.HandlerFunc {
    return func(c *gin.Context) {
        project := c.Param("projectName")
        reqK8s, _ := GetK8sClientsForRequest(c)

        if reqK8s == nil {
            c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid token"})
            c.Abort()
            return
        }

        // Check if user can access this namespace
        ssar := &authv1.SelfSubjectAccessReview{
            Spec: authv1.SelfSubjectAccessReviewSpec{
                ResourceAttributes: &authv1.ResourceAttributes{
                    Namespace: project,
                    Verb:      "get",
                    Resource:  "namespaces",
                },
            },
        }

        res, err := reqK8s.AuthorizationV1().SelfSubjectAccessReviews().Create(ctx, ssar, v1.CreateOptions{})
        if err != nil || !res.Status.Allowed {
            c.JSON(http.StatusForbidden, gin.H{"error": "Access denied to project"})
            c.Abort()
            return
        }

        c.Set("project", project)
        c.Next()
    }
}
```

**Anti-Patterns**:
```go
// ❌ NEVER skip RBAC checks
func ListSessions(c *gin.Context) {
    // WRONG: No permission check before operation
    list, err := reqDyn.Resource(gvr).Namespace(project).List(ctx, v1.ListOptions{})
}

// ❌ NEVER check permissions after the operation
func DeleteSession(c *gin.Context) {
    err := reqDyn.Resource(gvr).Namespace(ns).Delete(ctx, name, v1.DeleteOptions{})
    // WRONG: Checking permission after deletion
    if !userHasDeletePermission(c, ns) {
        // Too late, resource already deleted!
    }
}
```

**Detection**:
- ✅ Correct: All project endpoints use `ValidateProjectContext()` middleware
- ❌ Wrong: Endpoints without RBAC middleware or permission checks

**Validation**:
Integration test with restricted service account (components/backend/tests/integration/permissions_test.go):
1. Create user with read-only permissions on namespace A
2. Attempt write operation → should return 403
3. Attempt operation on namespace B → should return 403

**Related Patterns**:
- [Pattern: user-scoped-k8s-client-creation] (client creation for RBAC)
- [Pattern: multi-tenant-namespace-isolation] (namespace boundaries)

**Change History**:
- v1.0 (2025-11-06): Initial pattern from CLAUDE.md

---

## Pattern: error-handling-no-panics

**Pattern ID**: error-handling-no-panics
**Version**: 1.0
**Status**: Stable
**Category**: Reliability / Error Handling

**Location**: components/backend/handlers/sessions.go::CreateSession
**Grep Anchor**: `return fmt\.Errorf\(".*: %w", err\)`

**Description**:
Never use panic() in production code (handlers, reconcilers, business logic). Always return explicit errors with context using fmt.Errorf with %w for error wrapping. Log errors before returning to handlers.

**Context**:
Apply to all backend handlers, operator reconciliation loops, and business logic. Panic is only acceptable in init() for unrecoverable configuration errors.

**Implementation**:
```go
func CreateSession(c *gin.Context) {
    var spec types.AgenticSessionSpec
    if err := c.ShouldBindJSON(&spec); err != nil {
        log.Printf("Invalid session spec: %v", err)
        c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid session specification"})
        return
    }

    obj, err := buildSessionCR(spec)
    if err != nil {
        log.Printf("Failed to build session CR: %v", err)
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create session"})
        return
    }

    created, err := DynamicClient.Resource(gvr).Namespace(project).Create(ctx, obj, v1.CreateOptions{})
    if err != nil {
        log.Printf("Failed to create session %s in project %s: %v", name, project, err)
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create session"})
        return
    }

    c.JSON(http.StatusCreated, gin.H{"name": created.GetName()})
}
```

**Anti-Patterns**:
```go
// ❌ NEVER panic in handlers
func CreateSession(c *gin.Context) {
    var spec types.AgenticSessionSpec
    if err := c.ShouldBindJSON(&spec); err != nil {
        panic(fmt.Sprintf("Invalid spec: %v", err)) // WRONG: crashes server
    }
}

// ❌ NEVER return generic errors without logging
func GetSession(c *gin.Context) {
    obj, err := reqDyn.Resource(gvr).Get(ctx, name, v1.GetOptions{})
    if err != nil {
        c.JSON(500, gin.H{"error": "error"}) // WRONG: no logging, no context
        return
    }
}

// ❌ NEVER expose internal errors to API
func DeleteSession(c *gin.Context) {
    err := reqDyn.Resource(gvr).Delete(ctx, name, v1.DeleteOptions{})
    if err != nil {
        // WRONG: Leaks internal details to API response
        c.JSON(500, gin.H{"error": err.Error()})
        return
    }
}
```

**Detection**:
- ✅ Correct: All errors logged and returned with context
- ❌ Wrong: `grep -r "panic(" components/backend/handlers/ components/backend/internal/` (should return no results)

**Validation**:
1. Trigger error conditions (invalid input, missing resource, etc.)
2. Verify server continues running (no panic)
3. Verify errors logged with context
4. Verify API responses are user-friendly (no internal details)

**Related Patterns**:
- [Pattern: structured-logging] (how to log errors)
- [Pattern: input-validation] (preventing errors)

**Change History**:
- v1.0 (2025-11-06): Initial pattern from CLAUDE.md

---

## Pattern: project-scoped-endpoint-hierarchy

**Pattern ID**: project-scoped-endpoint-hierarchy
**Version**: 1.0
**Status**: Stable
**Category**: API Design / Multi-Tenancy

**Location**: components/backend/routes.go
**Grep Anchor**: `/api/projects/:projectName/`

**Description**:
All resource endpoints must be project-scoped following the pattern `/api/projects/:projectName/resource`. This enforces namespace isolation at the API level and makes RBAC enforcement consistent.

**Context**:
Apply to all new API endpoints that manage Kubernetes resources. Global endpoints (cluster-scoped) are reserved for admin operations only.

**Implementation**:
```go
// routes.go
func RegisterRoutes(r *gin.Engine) {
    api := r.Group("/api")
    {
        // Project-scoped endpoints (standard pattern)
        projects := api.Group("/projects/:projectName")
        projects.Use(ValidateProjectContext()) // RBAC middleware
        {
            // AgenticSessions
            projects.GET("/agentic-sessions", ListSessions)
            projects.POST("/agentic-sessions", CreateSession)
            projects.GET("/agentic-sessions/:sessionName", GetSession)
            projects.DELETE("/agentic-sessions/:sessionName", DeleteSession)

            // ProjectSettings
            projects.GET("/settings", GetProjectSettings)
            projects.PUT("/settings", UpdateProjectSettings)

            // RFE Workflows
            projects.POST("/rfe-workflows", CreateRFEWorkflow)
            projects.GET("/rfe-workflows/:workflowName", GetRFEWorkflow)
        }

        // Admin/global endpoints (cluster-scoped, rare)
        admin := api.Group("/admin")
        admin.Use(RequireClusterAdmin()) // Strict RBAC
        {
            admin.GET("/cluster-info", GetClusterInfo)
        }
    }
}
```

**Anti-Patterns**:
```go
// ❌ NEVER create resource endpoints without project scope
r.GET("/api/agentic-sessions", ListAllSessions) // WRONG: No namespace isolation
r.POST("/api/sessions/:id", CreateSession)      // WRONG: Not project-scoped

// ❌ NEVER use project as query parameter
r.GET("/api/sessions?project=foo", ListSessions) // WRONG: Inconsistent with pattern

// ❌ NEVER skip ValidateProjectContext middleware on project endpoints
projects.GET("/agentic-sessions", ListSessions) // WRONG: Missing RBAC middleware
```

**Detection**:
- ✅ Correct: All resource endpoints match `/api/projects/:projectName/*`
- ❌ Wrong: `grep -r 'r\.GET\|r\.POST\|r\.PUT\|r\.DELETE' components/backend/routes.go | grep -v '/projects/:projectName'`

**Validation**:
API test suite should verify:
1. Attempt to access `/api/agentic-sessions` (without project) → 404
2. Attempt to access `/api/projects/ns-a/agentic-sessions` with token for ns-b → 403
3. Valid project-scoped request → 200 OK

**Related Patterns**:
- [Pattern: rbac-enforcement-api-layer] (RBAC middleware)
- [Pattern: multi-tenant-namespace-isolation] (namespace boundaries)

**Change History**:
- v1.0 (2025-11-06): Initial pattern from CLAUDE.md

---

## Pattern: input-validation-and-sanitization

**Pattern ID**: input-validation-and-sanitization
**Version**: 1.0
**Status**: Stable
**Category**: Security / Input Handling

**Location**: components/backend/handlers/sessions.go::CreateSession
**Grep Anchor**: `c\.ShouldBindJSON\(&spec\)`

**Description**:
Always validate and sanitize user input before processing. Use Gin's binding with struct tags for automatic validation. Perform additional business logic validation before creating Kubernetes resources.

**Context**:
Apply to all handlers that accept user input (JSON bodies, query params, path params). Validation should happen at API boundary before any business logic.

**Implementation**:
```go
type AgenticSessionSpec struct {
    Prompt      string   `json:"prompt" binding:"required,min=10"`
    Repos       []Repo   `json:"repos" binding:"required,min=1,dive"`
    Interactive bool     `json:"interactive"`
    Timeout     int      `json:"timeout" binding:"min=60,max=3600"`
    Model       string   `json:"model" binding:"oneof=sonnet opus haiku"`
}

func CreateSession(c *gin.Context) {
    var spec AgenticSessionSpec

    // Automatic validation via struct tags
    if err := c.ShouldBindJSON(&spec); err != nil {
        log.Printf("Invalid session spec: %v", err)
        c.JSON(http.StatusBadRequest, gin.H{
            "error": "Invalid session specification",
            "details": err.Error(),
        })
        return
    }

    // Additional business logic validation
    if err := validateRepos(spec.Repos); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
        return
    }

    // Sanitize inputs
    spec.Prompt = sanitizePrompt(spec.Prompt)

    // Proceed with creation
    // ...
}

func validateRepos(repos []Repo) error {
    for i, repo := range repos {
        if !isValidGitURL(repo.Input.URL) {
            return fmt.Errorf("invalid git URL at repos[%d]: %s", i, repo.Input.URL)
        }
        if repo.Input.Branch == "" {
            return fmt.Errorf("branch required for repos[%d]", i)
        }
    }
    return nil
}
```

**Anti-Patterns**:
```go
// ❌ NEVER skip input validation
func CreateSession(c *gin.Context) {
    var spec AgenticSessionSpec
    c.BindJSON(&spec) // WRONG: Ignores validation errors
    // Proceeds with potentially invalid data
}

// ❌ NEVER trust user input for resource names
func GetSession(c *gin.Context) {
    name := c.Param("sessionName")
    // WRONG: No validation, could contain "../" or other exploits
    obj, _ := reqDyn.Resource(gvr).Get(ctx, name, v1.GetOptions{})
}

// ❌ NEVER expose validation errors verbatim (information leak)
if err := c.ShouldBindJSON(&spec); err != nil {
    c.JSON(400, gin.H{"error": err.Error()}) // WRONG: May leak internal structure
    return
}
```

**Detection**:
- ✅ Correct: All handlers use `ShouldBindJSON` or `ShouldBindQuery` with error checking
- ❌ Wrong: `grep -r 'c\.BindJSON\|c\.Bind(' components/backend/handlers/` (should use Should* variants)

**Validation**:
1. Send malformed JSON → should return 400 with clear error
2. Send invalid values (negative timeout, empty prompt) → 400
3. Send exploit payloads (SQL injection, path traversal) → sanitized or rejected

**Related Patterns**:
- [Pattern: error-handling-no-panics] (handling validation errors)
- [Pattern: rbac-enforcement-api-layer] (authorization after validation)

**Change History**:
- v1.0 (2025-11-06): Initial pattern from CLAUDE.md
