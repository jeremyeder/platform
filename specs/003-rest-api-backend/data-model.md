# Data Model: REST API Backend for ACP Mobile App

**Feature**: 003-rest-api-backend
**Created**: 2025-12-07
**Status**: Complete

---

## Overview

This document defines the data model for the REST API Backend that serves the ACP Mobile app. The model maps Kubernetes Custom Resources (from the platform backend) to mobile-friendly JSON schemas validated by Zod on the client side.

**Key Principles**:
1. **Source of Truth**: Kubernetes CRDs in platform backend
2. **Transformation Layer**: Backend transforms K8s resources to mobile schemas
3. **Validation**: Mobile app validates responses with Zod schemas
4. **Immutability**: Mobile app treats data as immutable (React Query caching)

---

## Entity Relationship Diagram

```
┌─────────────┐
│    User     │ (OAuth token claims)
└──────┬──────┘
       │
       │ 1:N
       ├─────────┐
       │         │
       ▼         ▼
┌──────────┐  ┌───────────────┐
│ Session  │  │ Notification  │
└────┬─────┘  └───────────────┘
     │
     │ N:1
     ▼
┌────────────┐
│ Repository │
└────────────┘

┌─────────────────┐
│ UserPreferences │ (1:1 with User)
└─────────────────┘

┌────────────┐
│ PushToken  │ (N:1 with User)
└────────────┘
```

---

## Entities

### 1. User

**Source**: OAuth token claims + Kubernetes user metadata
**Storage**: No persistent storage (derived from token)
**Scope**: Runtime only

**Fields**:

| Field | Type | Required | Description | Validation |
|-------|------|----------|-------------|------------|
| `id` | `string` | Yes | Unique user identifier from OAuth | Non-empty |
| `email` | `string` | Yes | User email address | Valid email format |
| `name` | `string` | No | Display name | Max 100 chars |
| `avatarUrl` | `string` | No | Profile picture URL | Valid URL or null |
| `role` | `string` | Yes | User role (e.g., "developer", "admin") | Non-empty |
| `ssoProvider` | `string` | Yes | OAuth provider (e.g., "redhat-sso") | Non-empty |

**Derived From**:
```go
// Extracted from JWT token claims
type User struct {
    ID          string  `json:"id"`          // From "sub" claim
    Email       string  `json:"email"`       // From "email" claim
    Name        *string `json:"name"`        // From "name" claim
    AvatarUrl   *string `json:"avatarUrl"`   // From "picture" claim
    Role        string  `json:"role"`        // From "groups" claim or K8s RBAC
    SSOProvider string  `json:"ssoProvider"` // From "iss" claim
}
```

**Business Rules**:
- User is authenticated if valid JWT token exists
- Role determines RBAC permissions in Kubernetes
- Email is unique per SSO provider

**API Usage**:
- `GET /api/v1/auth/profile` returns User object
- Token refresh endpoints return User with new tokens

---

### 2. Session

**Source**: Kubernetes `AgenticSession` CRD
**Storage**: `vteam.ambient-code/v1alpha1` Custom Resource
**Scope**: Namespace (project-scoped)

**Fields**:

| Field | Type | Required | Description | Validation | K8s Source |
|-------|------|----------|-------------|------------|------------|
| `id` | `string` | Yes | Unique session ID | UUID format | `metadata.uid` |
| `name` | `string` | Yes | Session name | K8s DNS-1123 label | `metadata.name` |
| `status` | `SessionStatus` | Yes | Current status | Enum: `running`, `paused`, `done`, `awaiting_review`, `error` | `status.phase` |
| `progress` | `number` | Yes | Completion percentage | 0-100 integer | `spec.progress` |
| `model` | `ModelType` | Yes | AI model type | Enum: `sonnet-4.5`, `opus-4.5` | `spec.model` |
| `workflowType` | `string` | Yes | Workflow type | E.g., `review`, `bugfix`, `plan` | `spec.workflowType` |
| `repository` | `Repository` | Yes | Associated repository | Nested object | `spec.repository.*` |
| `createdAt` | `Date` | Yes | Creation timestamp | ISO 8601 string | `metadata.creationTimestamp` |
| `updatedAt` | `Date` | Yes | Last update timestamp | ISO 8601 string | `status.conditions[].lastTransitionTime` |
| `currentTask` | `string` | No | Current task description | Max 500 chars or null | `status.currentTask` |
| `tasksCompleted` | `string[]` | Yes | Completed tasks | Array of strings (can be empty) | `status.tasksCompleted` |
| `errorMessage` | `string` | No | Error message if status is `error` | Max 1000 chars or null | `status.conditions[type=Error].message` |

**Kubernetes Mapping**:
```yaml
# Source: AgenticSession CRD
apiVersion: vteam.ambient-code/v1alpha1
kind: AgenticSession
metadata:
  name: code-review-abc123          # → name
  uid: 550e8400-e29b-41d4-a716-446655440000  # → id
  creationTimestamp: 2025-12-07T10:00:00Z    # → createdAt
spec:
  model: sonnet-4.5                 # → model
  workflowType: review              # → workflowType
  progress: 45                      # → progress
  repository:
    url: https://github.com/owner/repo  # → repository.url
    branch: main                    # → repository.branch
status:
  phase: Running                    # → status ("running")
  currentTask: "Analyzing code"     # → currentTask
  tasksCompleted:                   # → tasksCompleted
    - "Clone repository"
    - "Install dependencies"
  conditions:
    - type: Error
      status: "False"
      message: null                 # → errorMessage (null if no error)
    - type: Ready
      status: "True"
      lastTransitionTime: 2025-12-07T10:30:00Z  # → updatedAt
```

**Go Transformation**:
```go
type SessionResponse struct {
    ID              string       `json:"id"`
    Name            string       `json:"name"`
    Status          string       `json:"status"`
    Progress        int          `json:"progress"`
    Model           string       `json:"model"`
    WorkflowType    string       `json:"workflowType"`
    Repository      Repository   `json:"repository"`
    CreatedAt       string       `json:"createdAt"`    // ISO 8601
    UpdatedAt       string       `json:"updatedAt"`    // ISO 8601
    CurrentTask     *string      `json:"currentTask"`
    TasksCompleted  []string     `json:"tasksCompleted"`
    ErrorMessage    *string      `json:"errorMessage"`
}

func TransformAgenticSession(cr *unstructured.Unstructured) (SessionResponse, error) {
    // Extract metadata
    id := cr.GetUID()
    name := cr.GetName()
    createdAt := cr.GetCreationTimestamp().Format(time.RFC3339)

    // Extract spec fields
    spec := cr.Object["spec"].(map[string]interface{})
    model := spec["model"].(string)
    workflowType := spec["workflowType"].(string)
    progress := int(spec["progress"].(float64))

    // Extract status
    status := cr.Object["status"].(map[string]interface{})
    phase := mapPhaseToStatus(status["phase"].(string))
    currentTask := getStringPtr(status, "currentTask")
    tasksCompleted := getStringArray(status, "tasksCompleted")

    // Find latest condition timestamp for updatedAt
    conditions := status["conditions"].([]interface{})
    var updatedAt string
    for _, cond := range conditions {
        c := cond.(map[string]interface{})
        if timestamp, ok := c["lastTransitionTime"].(string); ok {
            updatedAt = timestamp  // Latest timestamp
        }
    }

    // Extract error message if status is Error
    var errorMessage *string
    if phase == "error" {
        for _, cond := range conditions {
            c := cond.(map[string]interface{})
            if c["type"] == "Error" && c["status"] == "True" {
                msg := c["message"].(string)
                errorMessage = &msg
                break
            }
        }
    }

    // Extract repository
    repoSpec := spec["repository"].(map[string]interface{})
    repository := Repository{
        ID:          generateRepoID(repoSpec["url"].(string)),
        Name:        extractRepoName(repoSpec["url"].(string)),
        URL:         repoSpec["url"].(string),
        Branch:      repoSpec["branch"].(string),
        IsConnected: true,
    }

    return SessionResponse{
        ID:             string(id),
        Name:           name,
        Status:         phase,
        Progress:       progress,
        Model:          model,
        WorkflowType:   workflowType,
        Repository:     repository,
        CreatedAt:      createdAt,
        UpdatedAt:      updatedAt,
        CurrentTask:    currentTask,
        TasksCompleted: tasksCompleted,
        ErrorMessage:   errorMessage,
    }, nil
}

func mapPhaseToStatus(phase string) string {
    switch phase {
    case "Running":
        return "running"
    case "Paused":
        return "paused"
    case "Done":
        return "done"
    case "AwaitingReview":
        return "awaiting_review"
    case "Error":
        return "error"
    default:
        return "error"  // Fallback
    }
}
```

**State Transitions**:
```
          ┌─────────┐
          │ running │ (initial state)
          └────┬────┘
               │
     ┌─────────┼─────────┐
     │         │         │
     ▼         ▼         ▼
┌────────┐ ┌──────┐ ┌───────┐
│ paused │ │ done │ │ error │
└────┬───┘ └──────┘ └───────┘
     │         │
     ▼         ▼
┌─────────┐ ┌─────────────────┐
│ running │ │ awaiting_review │
└─────────┘ └─────────────────┘
                    │
                    ▼
               ┌────────┐
               │  done  │
               └────────┘
```

**Business Rules**:
- Session names must be unique per namespace (project)
- Progress must be 0-100 (enforced at K8s level)
- Status `error` MUST have non-null `errorMessage`
- Status `done` or `awaiting_review` MUST have progress=100
- Repository must exist and user must have access

**API Usage**:
- `GET /api/v1/sessions` returns array of SessionResponse
- `GET /api/v1/sessions/:id` returns single SessionResponse
- `POST /api/v1/sessions` creates new AgenticSession CRD
- `PATCH /api/v1/sessions/:id` updates session status

---

### 3. Repository

**Source**: Embedded in `AgenticSession.spec.repository` field
**Storage**: No separate storage (part of Session)
**Scope**: Nested object within Session

**Fields**:

| Field | Type | Required | Description | Validation |
|-------|------|----------|-------------|------------|
| `id` | `string` | Yes | Repository identifier | Generated from URL |
| `name` | `string` | Yes | Repository name | Format: `owner/repo` |
| `url` | `string` | Yes | GitHub repository URL | Valid HTTPS URL |
| `branch` | `string` | Yes | Git branch | Non-empty |
| `isConnected` | `boolean` | Yes | Connection status | Always `true` for sessions |

**Transformation**:
```go
type Repository struct {
    ID          string `json:"id"`
    Name        string `json:"name"`
    URL         string `json:"url"`
    Branch      string `json:"branch"`
    IsConnected bool   `json:"isConnected"`
}

func TransformRepository(url, branch string) Repository {
    return Repository{
        ID:          generateRepoID(url),       // Hash of URL
        Name:        extractRepoName(url),      // "owner/repo" from URL
        URL:         url,
        Branch:      branch,
        IsConnected: true,
    }
}

func generateRepoID(url string) string {
    // Example: https://github.com/owner/repo → "repo-abc123def456"
    hash := sha256.Sum256([]byte(url))
    return "repo-" + hex.EncodeToString(hash[:6])
}

func extractRepoName(url string) string {
    // Example: https://github.com/owner/repo → "owner/repo"
    parts := strings.Split(strings.TrimSuffix(url, ".git"), "/")
    if len(parts) >= 2 {
        return parts[len(parts)-2] + "/" + parts[len(parts)-1]
    }
    return url
}
```

**Business Rules**:
- URL must be a valid GitHub repository
- User must have access to repository (verified via GitHub App)
- Branch must exist in repository
- `isConnected` always `true` for repositories in sessions (false only for disconnected repos in settings)

**Future**: Separate `GET /api/v1/repositories` endpoint for managing connected repos in settings

---

### 4. Notification

**Source**: GitHub API (`/notifications` endpoint)
**Storage**: In-memory cache (30-minute TTL)
**Scope**: User-specific (filtered by GitHub authentication)

**Fields**:

| Field | Type | Required | Description | Validation |
|-------|------|----------|-------------|------------|
| `id` | `string` | Yes | GitHub notification thread ID | Non-empty |
| `type` | `NotificationType` | Yes | Notification type | Enum (see below) |
| `repository` | `string` | Yes | Repository name | Format: `owner/repo` |
| `itemNumber` | `number` | Yes | PR/Issue number | Positive integer |
| `title` | `string` | Yes | Notification title | Max 500 chars |
| `author` | `string` | Yes | Author username | Non-empty |
| `timestamp` | `Date` | Yes | Last updated timestamp | ISO 8601 string |
| `isUnread` | `boolean` | Yes | Read status | Boolean |
| `suggestedWorkflow` | `string` | Yes | Suggested workflow type | E.g., `review`, `bugfix` |
| `url` | `string` | Yes | GitHub URL | Valid HTTPS URL |

**NotificationType Enum**:
```typescript
enum NotificationType {
  PULL_REQUEST = 'pull_request',
  PULL_REQUEST_REVIEW = 'pull_request_review',
  ISSUE = 'issue',
  ISSUE_COMMENT = 'issue_comment',
  COMMIT_COMMENT = 'commit_comment',
  MENTION = 'mention',
  RELEASE = 'release',
  SECURITY_ALERT = 'security_alert',
}
```

**GitHub API Mapping**:
```go
type GitHubNotification struct {
    ID                string `json:"id"`
    Type              string `json:"type"`
    Repository        string `json:"repository"`
    ItemNumber        int    `json:"itemNumber"`
    Title             string `json:"title"`
    Author            string `json:"author"`
    Timestamp         string `json:"timestamp"`
    IsUnread          bool   `json:"isUnread"`
    SuggestedWorkflow string `json:"suggestedWorkflow"`
    URL               string `json:"url"`
}

func TransformGitHubNotification(ghNotif *github.Notification) GitHubNotification {
    itemNumber := extractIssueNumber(ghNotif.GetSubject().GetURL())
    notifType := mapSubjectType(ghNotif.GetSubject().GetType())

    return GitHubNotification{
        ID:                ghNotif.GetID(),
        Type:              notifType,
        Repository:        ghNotif.GetRepository().GetFullName(),
        ItemNumber:        itemNumber,
        Title:             ghNotif.GetSubject().GetTitle(),
        Author:            ghNotif.GetRepository().GetOwner().GetLogin(),
        Timestamp:         ghNotif.GetUpdatedAt().Format(time.RFC3339),
        IsUnread:          ghNotif.GetUnread(),
        SuggestedWorkflow: suggestWorkflow(notifType, ghNotif),
        URL:               buildGitHubURL(ghNotif),
    }
}

func suggestWorkflow(notifType string, ghNotif *github.Notification) string {
    switch notifType {
    case "pull_request", "pull_request_review":
        return "review"
    case "issue":
        // Check labels for bug/feature keywords
        if hasLabel(ghNotif, "bug") {
            return "bugfix"
        }
        if hasLabel(ghNotif, "feature", "enhancement") {
            return "plan"
        }
        return "chat"
    case "mention", "issue_comment", "commit_comment":
        return "chat"
    default:
        return "chat"
    }
}
```

**Business Rules**:
- Notifications fetched from GitHub every 5 minutes (background job)
- Cached in-memory for 30 minutes
- Real-time updates via SSE when new notifications arrive
- Mark as read syncs back to GitHub

**API Usage**:
- `GET /api/v1/notifications/github?unread=true` returns notifications
- `PATCH /api/v1/notifications/read` marks as read
- `POST /api/v1/notifications/mute` mutes thread

---

### 5. UserPreferences

**Source**: Kubernetes ConfigMap or UserPreferences CRD (TBD)
**Storage**: ConfigMap per user: `userprefs-{userID}`
**Scope**: Namespace: `ambient-code-users` or user's project namespace

**Fields**:

| Field | Type | Required | Description | Validation |
|-------|------|----------|-------------|------------|
| `theme` | `string` | Yes | UI theme | Enum: `light`, `dark`, `system` |
| `notifications` | `NotificationSettings` | Yes | Notification preferences | Nested object |
| `quietHours` | `QuietHours` | No | Quiet hours config | Nested object or null |

**NotificationSettings**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `blockingAlerts` | `boolean` | Yes | Enable blocking alerts |
| `reviewRequests` | `boolean` | Yes | Enable review request notifications |
| `sessionUpdates` | `boolean` | Yes | Enable session update notifications |
| `featuresAndNews` | `boolean` | Yes | Enable features/news notifications |

**QuietHours**:

| Field | Type | Required | Description | Validation |
|-------|------|----------|-------------|------------|
| `enabled` | `boolean` | Yes | Enable quiet hours | Boolean |
| `start` | `string` | Yes | Start time | Format: `HH:MM` (e.g., `22:00`) |
| `end` | `string` | Yes | End time | Format: `HH:MM` (e.g., `08:00`) |

**Kubernetes Storage**:
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: userprefs-user123
  namespace: ambient-code-users
data:
  theme: "dark"
  notifications.blockingAlerts: "true"
  notifications.reviewRequests: "true"
  notifications.sessionUpdates: "true"
  notifications.featuresAndNews: "false"
  quietHours.enabled: "true"
  quietHours.start: "22:00"
  quietHours.end: "08:00"
```

**Transformation**:
```go
type UserPreferences struct {
    Theme         string               `json:"theme"`
    Notifications NotificationSettings `json:"notifications"`
    QuietHours    *QuietHours          `json:"quietHours"`
}

type NotificationSettings struct {
    BlockingAlerts   bool `json:"blockingAlerts"`
    ReviewRequests   bool `json:"reviewRequests"`
    SessionUpdates   bool `json:"sessionUpdates"`
    FeaturesAndNews  bool `json:"featuresAndNews"`
}

type QuietHours struct {
    Enabled bool   `json:"enabled"`
    Start   string `json:"start"`
    End     string `json:"end"`
}

func LoadUserPreferences(userID string, k8sClient kubernetes.Interface) (UserPreferences, error) {
    cm, err := k8sClient.CoreV1().ConfigMaps("ambient-code-users").Get(ctx, "userprefs-"+userID, metav1.GetOptions{})
    if err != nil {
        // Return defaults if not found
        return DefaultUserPreferences(), nil
    }

    prefs := UserPreferences{
        Theme: cm.Data["theme"],
        Notifications: NotificationSettings{
            BlockingAlerts:  parseBool(cm.Data["notifications.blockingAlerts"]),
            ReviewRequests:  parseBool(cm.Data["notifications.reviewRequests"]),
            SessionUpdates:  parseBool(cm.Data["notifications.sessionUpdates"]),
            FeaturesAndNews: parseBool(cm.Data["notifications.featuresAndNews"]),
        },
    }

    if parseBool(cm.Data["quietHours.enabled"]) {
        prefs.QuietHours = &QuietHours{
            Enabled: true,
            Start:   cm.Data["quietHours.start"],
            End:     cm.Data["quietHours.end"],
        }
    }

    return prefs, nil
}
```

**Business Rules**:
- Defaults provided if ConfigMap doesn't exist
- Quiet hours validated: start < end (same day) OR start > end (overnight)
- Push notifications suppressed during quiet hours

**API Usage**:
- `GET /api/v1/user/preferences` returns UserPreferences
- `PATCH /api/v1/user/preferences` updates ConfigMap

---

### 6. PushToken

**Source**: Mobile app registers Expo push tokens
**Storage**: ConfigMap or PushToken CRD (TBD)
**Scope**: User-specific (multiple devices per user)

**Fields**:

| Field | Type | Required | Description | Validation |
|-------|------|----------|-------------|------------|
| `token` | `string` | Yes | Expo push token | Expo token format |
| `platform` | `string` | Yes | Device platform | Enum: `ios`, `android` |
| `deviceId` | `string` | Yes | Device identifier | Unique per device |
| `userId` | `string` | Yes | User ID | Links to User |
| `registeredAt` | `Date` | Yes | Registration timestamp | ISO 8601 string |
| `lastUsedAt` | `Date` | Yes | Last notification sent timestamp | ISO 8601 string |

**Kubernetes Storage** (Option: ConfigMap):
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: pushtoken-device123
  namespace: ambient-code-users
  labels:
    user-id: user123
data:
  token: "ExponentPushToken[xxxxxxxxxxxxxx]"
  platform: "ios"
  deviceId: "device123"
  userId: "user123"
  registeredAt: "2025-12-07T10:00:00Z"
  lastUsedAt: "2025-12-07T15:30:00Z"
```

**Kubernetes Storage** (Option: CRD - Recommended):
```yaml
apiVersion: ambient-code/v1alpha1
kind: PushToken
metadata:
  name: pushtoken-device123
  namespace: ambient-code-users
spec:
  token: "ExponentPushToken[xxxxxxxxxxxxxx]"
  platform: ios
  deviceId: device123
  userId: user123
  registeredAt: "2025-12-07T10:00:00Z"
  lastUsedAt: "2025-12-07T15:30:00Z"
```

**Transformation**:
```go
type PushToken struct {
    Token        string `json:"token"`
    Platform     string `json:"platform"`
    DeviceID     string `json:"deviceId"`
    UserID       string `json:"userId"`
    RegisteredAt string `json:"registeredAt"`
    LastUsedAt   string `json:"lastUsedAt"`
}

func RegisterPushToken(token, platform, deviceID, userID string) error {
    // Create or update PushToken CRD
    pushTokenCR := &unstructured.Unstructured{
        Object: map[string]interface{}{
            "apiVersion": "ambient-code/v1alpha1",
            "kind":       "PushToken",
            "metadata": map[string]interface{}{
                "name":      "pushtoken-" + deviceID,
                "namespace": "ambient-code-users",
            },
            "spec": map[string]interface{}{
                "token":        token,
                "platform":     platform,
                "deviceId":     deviceID,
                "userId":       userID,
                "registeredAt": time.Now().Format(time.RFC3339),
                "lastUsedAt":   time.Now().Format(time.RFC3339),
            },
        },
    }

    _, err := dynamicClient.Resource(pushTokenGVR).Namespace("ambient-code-users").Create(ctx, pushTokenCR, metav1.CreateOptions{})
    return err
}
```

**Business Rules**:
- One token per device (deviceId is unique)
- Multiple devices per user allowed
- Tokens expire after 90 days of inactivity (Expo limitation)
- Invalid tokens removed after push failure

**API Usage**:
- `POST /api/v1/push/register` registers new token
- Backend sends push notifications via Expo Push Service

---

## Validation Rules

### Session

- **Name**: Must match Kubernetes DNS-1123 label regex: `^[a-z0-9]([-a-z0-9]*[a-z0-9])?$` (max 63 chars)
- **Progress**: Integer 0-100
- **Status**: Must be one of: `running`, `paused`, `done`, `awaiting_review`, `error`
- **Model**: Must be one of: `sonnet-4.5`, `opus-4.5`
- **Repository URL**: Must be valid HTTPS GitHub URL
- **Dates**: Must be ISO 8601 format

### Notification

- **Item Number**: Positive integer
- **Type**: Must match NotificationType enum
- **Repository**: Must match format `owner/repo`

### UserPreferences

- **Theme**: Must be one of: `light`, `dark`, `system`
- **Quiet Hours Start/End**: Must match `HH:MM` format (e.g., `22:00`)
- **Quiet Hours Validation**: If enabled, start and end must be valid times

### PushToken

- **Token**: Must match Expo token format: `ExponentPushToken[...]` or `ExpoPushToken[...]`
- **Platform**: Must be one of: `ios`, `android`

---

## Indexes & Queries

### Kubernetes Label Selectors

**List sessions for user in project**:
```go
listOptions := metav1.ListOptions{
    LabelSelector: fmt.Sprintf("project=%s,user=%s", projectName, userID),
}
sessions, err := dynClient.Resource(sessionGVR).Namespace(namespace).List(ctx, listOptions)
```

**Filter sessions by status**:
```go
// Add status as label for efficient filtering
labels := map[string]string{
    "project": projectName,
    "user":    userID,
    "status":  "awaiting_review",  // Label added on status change
}
```

**List push tokens for user**:
```go
listOptions := metav1.ListOptions{
    LabelSelector: fmt.Sprintf("user-id=%s", userID),
}
tokens, err := k8sClient.CoreV1().ConfigMaps("ambient-code-users").List(ctx, listOptions)
```

---

## Data Consistency

### Session Updates

**CRITICAL**: SSE events must not trigger full cache invalidation. Use partial updates:

```go
// SSE Event: session.progress
{
    "sessionId": "abc-123",
    "progress": 67,
    "currentTask": "Running tests"
}

// Mobile app merges into cache (React Query setQueriesData)
// NO full refetch triggered
```

### Optimistic Updates

**Mark Notification as Read**:
1. Mobile app optimistically marks as read in UI
2. Send PATCH request to backend
3. Backend calls GitHub API to mark as read
4. On success: No action (already updated)
5. On error: Rollback optimistic update

---

## Migration Strategy

### Phase 1: Sessions Only
- Implement Session + Repository entities
- No preferences, no push notifications
- Mobile app uses mock data for notifications

### Phase 2: Add Notifications
- Integrate GitHub API
- Implement notification endpoints
- SSE events for new notifications

### Phase 3: Add Preferences
- Create ConfigMap storage for preferences
- Implement preferences endpoints
- Mobile app syncs preferences

### Phase 4: Add Push Notifications
- Create PushToken storage (CRD preferred)
- Integrate Expo Push Service
- Respect quiet hours from preferences

---

## References

### Mobile App Schemas
- `/Users/jeder/repos/mobile/services/api/schemas.ts` - Zod validation schemas
- `/Users/jeder/repos/mobile/types/session.ts` - TypeScript interfaces
- `/Users/jeder/repos/mobile/types/notification.ts` - Notification types

### Platform Backend
- `/Users/jeder/repos/platform/components/manifests/base/crds/agenticsessions-crd.yaml` - AgenticSession CRD
- `/Users/jeder/repos/platform/components/backend/types/session.go` - Session types
- `/Users/jeder/repos/platform/components/backend/handlers/sessions.go` - Session handlers

### Specification
- `/Users/jeder/repos/mobile/specs/003-rest-api-backend/spec.md` - Business requirements
- `/Users/jeder/repos/mobile/specs/003-rest-api-backend/research.md` - Technical decisions

---

**Status**: ✅ COMPLETE
**Next Step**: Generate API contracts in `/contracts/` directory
