# Quick Start: REST API Backend for ACP Mobile App

**Feature**: 003-rest-api-backend
**Target Repository**: `~/repos/platform/components/backend`
**Created**: 2025-12-07

---

## Overview

This guide helps backend developers implement the REST API endpoints that serve the ACP Mobile app. The implementation extends the existing Go + Gin backend in the platform repository.

**What You're Building**:
- Mobile-friendly REST API endpoints for session management
- Server-Sent Events (SSE) for real-time updates
- GitHub notifications integration
- User preferences management
- OAuth 2.0 + PKCE authentication support

**Timeline**: 2-3 weeks for MVP (sessions + SSE + notifications)

---

## Prerequisites

### Required Reading
1. **ADR-0002**: User Token Authentication (`~/repos/platform/docs/adr/0002-user-token-authentication.md`)
2. **Mobile App Zod Schemas**: `~/repos/mobile/services/api/schemas.ts` (CRITICAL - must match exactly)
3. **Existing Backend Code**: `~/repos/platform/components/backend/handlers/sessions.go`

### Tools Required
- Go 1.24.0+
- Kubernetes cluster access (local Minikube or staging)
- GitHub App credentials (for notifications)
- OAuth provider credentials (Red Hat SSO)

### Environment Setup
```bash
cd ~/repos/platform/components/backend

# Install dependencies
go mod download

# Verify existing backend runs
make run

# Run tests
make test
```

---

## Phase 1: Sessions API (Week 1)

### Step 1.1: Understand Mobile Contract

**CRITICAL**: Read mobile app schemas first to understand expected responses:

```bash
# View Zod schemas (source of truth for API contract)
cat ~/repos/mobile/services/api/schemas.ts

# Key schemas to internalize:
# - sessionSchema: Exact response format for sessions
# - SessionStatus enum: "running" | "paused" | "done" | "awaiting_review" | "error"
# - ModelType enum: "sonnet-4.5" | "opus-4.5"
# - Date format: ISO 8601 strings (e.g., "2025-12-07T10:00:00Z")
```

### Step 1.2: Create Mobile-Specific Handlers

**File**: `~/repos/platform/components/backend/handlers/mobile_sessions.go`

```go
package handlers

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
)

// MobileSessionResponse matches mobile Zod schema EXACTLY
type MobileSessionResponse struct {
	ID              string              `json:"id"`              // metadata.uid
	Name            string              `json:"name"`            // metadata.name
	Status          string              `json:"status"`          // status.phase (mapped)
	Progress        int                 `json:"progress"`        // spec.progress
	Model           string              `json:"model"`           // spec.model
	WorkflowType    string              `json:"workflowType"`    // spec.workflowType
	Repository      MobileRepository    `json:"repository"`      // spec.repository
	CreatedAt       string              `json:"createdAt"`       // ISO 8601
	UpdatedAt       string              `json:"updatedAt"`       // ISO 8601
	CurrentTask     *string             `json:"currentTask"`     // status.currentTask
	TasksCompleted  []string            `json:"tasksCompleted"`  // status.tasksCompleted
	ErrorMessage    *string             `json:"errorMessage"`    // status.conditions[Error].message
}

type MobileRepository struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	URL         string `json:"url"`
	Branch      string `json:"branch"`
	IsConnected bool   `json:"isConnected"`
}

// ListMobileSessions godoc
// @Summary List sessions for mobile app
// @Description Returns all sessions in mobile-friendly format
// @Tags mobile
// @Produce json
// @Param status query string false "Filter by status"
// @Success 200 {object} map[string][]MobileSessionResponse
// @Failure 401 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/v1/sessions [get]
func ListMobileSessions(c *gin.Context) {
	// ALWAYS use user token authentication (ADR-0002)
	reqK8s, reqDyn := GetK8sClientsForRequest(c)
	if reqK8s == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid or missing token"})
		c.Abort()
		return
	}

	// Get user context
	userID := c.GetString("user_id")
	projectName := c.GetString("project_name") // From middleware

	// Optional status filter
	statusFilter := c.Query("status")

	// List AgenticSessions using user's token
	ctx := context.TODO()
	sessionGVR := sessionGVR() // From existing code

	listOptions := metav1.ListOptions{
		LabelSelector: fmt.Sprintf("project=%s,user=%s", projectName, userID),
	}

	sessionList, err := reqDyn.Resource(sessionGVR).Namespace(projectName).List(ctx, listOptions)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list sessions"})
		return
	}

	// Transform to mobile format
	var mobileSessions []MobileSessionResponse
	for _, item := range sessionList.Items {
		session, err := transformToMobileSession(&item)
		if err != nil {
			// Log error but continue (don't fail entire request)
			fmt.Printf("Error transforming session %s: %v\n", item.GetName(), err)
			continue
		}

		// Apply status filter if provided
		if statusFilter != "" && session.Status != statusFilter {
			continue
		}

		mobileSessions = append(mobileSessions, session)
	}

	c.JSON(http.StatusOK, gin.H{"sessions": mobileSessions})
}

// transformToMobileSession converts K8s CR to mobile format
func transformToMobileSession(cr *unstructured.Unstructured) (MobileSessionResponse, error) {
	// Extract metadata
	id := string(cr.GetUID())
	name := cr.GetName()
	createdAt := cr.GetCreationTimestamp().Format(time.RFC3339)

	// Extract spec
	spec, ok := cr.Object["spec"].(map[string]interface{})
	if !ok {
		return MobileSessionResponse{}, fmt.Errorf("invalid spec")
	}

	model := getString(spec, "model")
	workflowType := getString(spec, "workflowType")
	progress := getInt(spec, "progress")

	// Extract repository
	repoSpec, ok := spec["repository"].(map[string]interface{})
	if !ok {
		return MobileSessionResponse{}, fmt.Errorf("invalid repository")
	}

	repoURL := getString(repoSpec, "url")
	repoBranch := getString(repoSpec, "branch")

	repository := MobileRepository{
		ID:          generateRepoID(repoURL),
		Name:        extractRepoName(repoURL),
		URL:         repoURL,
		Branch:      repoBranch,
		IsConnected: true,
	}

	// Extract status
	status, ok := cr.Object["status"].(map[string]interface{})
	if !ok {
		return MobileSessionResponse{}, fmt.Errorf("invalid status")
	}

	phase := getString(status, "phase")
	mobileStatus := mapPhaseToMobileStatus(phase)

	currentTask := getStringPtr(status, "currentTask")
	tasksCompleted := getStringArray(status, "tasksCompleted")

	// Find latest condition timestamp for updatedAt
	updatedAt := createdAt // Fallback to createdAt
	conditions, ok := status["conditions"].([]interface{})
	if ok {
		for _, cond := range conditions {
			c, ok := cond.(map[string]interface{})
			if !ok {
				continue
			}
			if ts, ok := c["lastTransitionTime"].(string); ok {
				updatedAt = ts
			}
		}
	}

	// Extract error message if status is error
	var errorMessage *string
	if mobileStatus == "error" {
		for _, cond := range conditions {
			c, ok := cond.(map[string]interface{})
			if !ok {
				continue
			}
			if c["type"] == "Error" && c["status"] == "True" {
				msg := getString(c, "message")
				errorMessage = &msg
				break
			}
		}
	}

	return MobileSessionResponse{
		ID:             id,
		Name:           name,
		Status:         mobileStatus,
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

// mapPhaseToMobileStatus maps K8s phase to mobile status enum
func mapPhaseToMobileStatus(phase string) string {
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
		return "error" // Fallback
	}
}

// Helper functions (add to helpers.go)
func getString(m map[string]interface{}, key string) string {
	if v, ok := m[key].(string); ok {
		return v
	}
	return ""
}

func getInt(m map[string]interface{}, key string) int {
	if v, ok := m[key].(float64); ok {
		return int(v)
	}
	return 0
}

func getStringPtr(m map[string]interface{}, key string) *string {
	if v, ok := m[key].(string); ok {
		return &v
	}
	return nil
}

func getStringArray(m map[string]interface{}, key string) []string {
	if arr, ok := m[key].([]interface{}); ok {
		result := make([]string, 0, len(arr))
		for _, item := range arr {
			if s, ok := item.(string); ok {
				result = append(result, s)
			}
		}
		return result
	}
	return []string{}
}
```

### Step 1.3: Register Mobile Routes

**File**: `~/repos/platform/components/backend/routes.go`

```go
// Add to RegisterRoutes()
func RegisterRoutes(router *gin.Engine) {
	// Existing routes...

	// Mobile API endpoints (v1)
	v1 := router.Group("/api/v1")
	v1.Use(ValidateProjectContext) // RBAC middleware
	{
		// Sessions
		v1.GET("/sessions", handlers.ListMobileSessions)
		v1.GET("/sessions/:id", handlers.GetMobileSession)
		v1.POST("/sessions", handlers.CreateMobileSession)
		v1.PATCH("/sessions/:id", handlers.UpdateMobileSession)

		// SSE (Phase 2)
		v1.GET("/sse/sessions", handlers.StreamSessions)

		// Notifications (Phase 3)
		v1.GET("/notifications/github", handlers.GetGitHubNotifications)
		v1.PATCH("/notifications/read", handlers.MarkNotificationsRead)
		v1.PATCH("/notifications/read-all", handlers.MarkAllNotificationsRead)
		v1.POST("/notifications/mute", handlers.MuteNotification)

		// User (Phase 3)
		v1.GET("/user/profile", handlers.GetUserProfile)
		v1.GET("/user/preferences", handlers.GetUserPreferences)
		v1.PATCH("/user/preferences", handlers.UpdateUserPreferences)
	}

	// Auth endpoints (no middleware)
	auth := router.Group("/api/v1/auth")
	{
		auth.POST("/login", handlers.InitiateOAuthLogin)
		auth.POST("/token", handlers.ExchangeOAuthToken)
		auth.POST("/refresh", handlers.RefreshToken)
		auth.GET("/profile", handlers.GetAuthProfile)
	}
}
```

### Step 1.4: Test with Mobile App

```bash
# Terminal 1: Run backend
cd ~/repos/platform/components/backend
make run

# Terminal 2: Configure mobile app
cd ~/repos/mobile
cat > .env.local << EOF
EXPO_PUBLIC_API_BASE_URL=http://localhost:8080/api/v1
EXPO_PUBLIC_USE_MOCK_AUTH=true
EXPO_PUBLIC_USE_MOCK_DATA=false
EXPO_PUBLIC_USE_MOCK_SSE=true
EOF

# Start mobile app
npm start

# Navigate to Sessions tab
# Should see sessions from backend (or empty list)
```

**Expected Result**:
- Sessions list loads without errors
- No Zod validation errors in Metro console
- Empty state displays if no sessions exist

---

## Phase 2: Server-Sent Events (Week 1-2)

### Step 2.1: Create SSE Hub

**File**: `~/repos/platform/components/backend/sse/hub.go`

```go
package sse

import (
	"fmt"
	"sync"
)

type SSEEvent struct {
	Type string      `json:"type"`
	Data interface{} `json:"data"`
}

type SSEHub struct {
	// Map of userID -> list of event channels
	subscribers map[string][]chan SSEEvent
	mu          sync.RWMutex
}

func NewSSEHub() *SSEHub {
	return &SSEHub{
		subscribers: make(map[string][]chan SSEEvent),
	}
}

// Subscribe creates a new event channel for a user
func (h *SSEHub) Subscribe(userID string) chan SSEEvent {
	h.mu.Lock()
	defer h.mu.Unlock()

	eventChan := make(chan SSEEvent, 10) // Buffered channel
	h.subscribers[userID] = append(h.subscribers[userID], eventChan)

	fmt.Printf("[SSE] User %s subscribed (total connections: %d)\n",
		userID, len(h.subscribers[userID]))

	return eventChan
}

// Unsubscribe removes an event channel for a user
func (h *SSEHub) Unsubscribe(userID string, eventChan chan SSEEvent) {
	h.mu.Lock()
	defer h.mu.Unlock()

	channels := h.subscribers[userID]
	for i, ch := range channels {
		if ch == eventChan {
			close(ch)
			h.subscribers[userID] = append(channels[:i], channels[i+1:]...)
			break
		}
	}

	if len(h.subscribers[userID]) == 0 {
		delete(h.subscribers, userID)
	}

	fmt.Printf("[SSE] User %s unsubscribed (remaining connections: %d)\n",
		userID, len(h.subscribers[userID]))
}

// Broadcast sends an event to all connections for a specific user
func (h *SSEHub) Broadcast(userID string, event SSEEvent) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	channels := h.subscribers[userID]
	for _, ch := range channels {
		select {
		case ch <- event:
			// Event sent successfully
		default:
			// Channel full, skip (prevents blocking)
			fmt.Printf("[SSE] Warning: Event dropped for user %s (channel full)\n", userID)
		}
	}
}
```

### Step 2.2: Implement SSE Endpoint

**File**: `~/repos/platform/components/backend/handlers/mobile_sse.go`

```go
package handlers

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"your-module/sse"
)

var sseHub = sse.NewSSEHub()

// StreamSessions godoc
// @Summary Stream session updates via SSE
// @Description Server-Sent Events endpoint for real-time session updates
// @Tags mobile
// @Produce text/event-stream
// @Success 200 {string} string "SSE stream"
// @Failure 401 {object} map[string]string
// @Router /api/v1/sse/sessions [get]
func StreamSessions(c *gin.Context) {
	// ALWAYS use user token authentication
	reqK8s, _ := GetK8sClientsForRequest(c)
	if reqK8s == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid or missing token"})
		c.Abort()
		return
	}

	userID := c.GetString("user_id")

	// Set SSE headers
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no") // Disable nginx buffering

	// Subscribe to events
	eventChan := sseHub.Subscribe(userID)
	defer sseHub.Unsubscribe(userID, eventChan)

	// Send heartbeat every 30 seconds
	heartbeatTicker := time.NewTicker(30 * time.Second)
	defer heartbeatTicker.Stop()

	fmt.Fprintf(c.Writer, ": connected\n\n")
	c.Writer.Flush()

	// Stream events
	for {
		select {
		case event := <-eventChan:
			// Send SSE event
			fmt.Fprintf(c.Writer, "event: %s\n", event.Type)
			fmt.Fprintf(c.Writer, "data: %s\n\n", toJSON(event.Data))
			c.Writer.Flush()

		case <-heartbeatTicker.C:
			// Send heartbeat (comment line)
			fmt.Fprintf(c.Writer, ": ping\n\n")
			c.Writer.Flush()

		case <-c.Request.Context().Done():
			// Client disconnected
			return
		}
	}
}

// Helper to serialize event data to JSON
func toJSON(v interface{}) string {
	data, err := json.Marshal(v)
	if err != nil {
		return "{}"
	}
	return string(data)
}
```

### Step 2.3: Send Events on Session Updates

**File**: Modify `~/repos/platform/components/backend/handlers/mobile_sessions.go`

```go
// UpdateMobileSession handles PATCH /api/v1/sessions/:id
func UpdateMobileSession(c *gin.Context) {
	// ... existing update logic ...

	// After successful update, send SSE event
	userID := c.GetString("user_id")

	sseHub.Broadcast(userID, sse.SSEEvent{
		Type: "session.status",
		Data: map[string]interface{}{
			"sessionId": sessionID,
			"status":    newStatus,
		},
	})

	c.JSON(http.StatusOK, updatedSession)
}
```

### Step 2.4: Test SSE with Mobile App

```bash
# Update mobile .env.local
EXPO_PUBLIC_USE_MOCK_SSE=false

# Restart mobile app
npm start

# Navigate to Sessions screen
# Check Metro logs for:
# [SSE] Connecting to SSE endpoint
# [SSE] Connection opened

# Trigger a session update from backend
# Expected: Progress bar updates in real-time WITHOUT page refresh
```

---

## Phase 3: GitHub Notifications (Week 2)

### Step 3.1: Implement GitHub API Client

**File**: `~/repos/platform/components/backend/github/notifications.go`

```go
package github

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/google/go-github/v57/github"
)

type NotificationTransformer struct {
	client *github.Client
}

func NewNotificationTransformer(client *github.Client) *NotificationTransformer {
	return &NotificationTransformer{client: client}
}

// FetchNotifications retrieves GitHub notifications for authenticated user
func (nt *NotificationTransformer) FetchNotifications(ctx context.Context, unreadOnly bool) ([]*github.Notification, error) {
	opts := &github.NotificationListOptions{
		All:           !unreadOnly,
		Participating: true,
	}

	notifications, _, err := nt.client.Activity.ListNotifications(ctx, opts)
	return notifications, err
}

// TransformNotification converts GitHub notification to mobile format
func (nt *NotificationTransformer) TransformNotification(notif *github.Notification) MobileNotification {
	return MobileNotification{
		ID:                notif.GetID(),
		Type:              mapNotificationType(notif.GetSubject().GetType()),
		Repository:        notif.GetRepository().GetFullName(),
		ItemNumber:        extractItemNumber(notif.GetSubject().GetURL()),
		Title:             notif.GetSubject().GetTitle(),
		Author:            notif.GetRepository().GetOwner().GetLogin(),
		Timestamp:         notif.GetUpdatedAt().Format(time.RFC3339),
		IsUnread:          notif.GetUnread(),
		SuggestedWorkflow: suggestWorkflow(notif),
		URL:               buildNotificationURL(notif),
	}
}

func mapNotificationType(ghType string) string {
	switch ghType {
	case "PullRequest":
		return "pull_request"
	case "Issue":
		return "issue"
	case "Commit":
		return "commit_comment"
	case "Release":
		return "release"
	default:
		return "mention"
	}
}

func suggestWorkflow(notif *github.Notification) string {
	subjectType := notif.GetSubject().GetType()
	switch subjectType {
	case "PullRequest":
		return "review"
	case "Issue":
		// Check reason for better suggestion
		reason := notif.GetReason()
		if reason == "review_requested" {
			return "review"
		}
		return "chat"
	default:
		return "chat"
	}
}

func extractItemNumber(url string) int {
	// Extract number from URL like "https://api.github.com/repos/owner/repo/issues/42"
	parts := strings.Split(url, "/")
	if len(parts) > 0 {
		lastPart := parts[len(parts)-1]
		var num int
		fmt.Sscanf(lastPart, "%d", &num)
		return num
	}
	return 0
}

func buildNotificationURL(notif *github.Notification) string {
	repoName := notif.GetRepository().GetFullName()
	subjectType := strings.ToLower(notif.GetSubject().GetType())
	itemNum := extractItemNumber(notif.GetSubject().GetURL())

	return fmt.Sprintf("https://github.com/%s/%s/%d", repoName, subjectType, itemNum)
}
```

### Step 3.2: Implement Notification Endpoints

**File**: `~/repos/platform/components/backend/handlers/mobile_notifications.go`

```go
package handlers

import (
	"context"
	"net/http"

	"github.com/gin-gonic/gin"
	"your-module/github"
)

type MobileNotification struct {
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

// GetGitHubNotifications godoc
// @Summary Get GitHub notifications
// @Description Retrieve GitHub notifications for authenticated user
// @Tags mobile
// @Produce json
// @Param unread query string false "Filter for unread only"
// @Success 200 {object} map[string]interface{}
// @Failure 401 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/v1/notifications/github [get]
func GetGitHubNotifications(c *gin.Context) {
	reqK8s, _ := GetK8sClientsForRequest(c)
	if reqK8s == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid or missing token"})
		c.Abort()
		return
	}

	unreadOnly := c.Query("unread") == "true"

	// Get GitHub client for user (using existing GitHub App infrastructure)
	githubClient, err := getGitHubClientForUser(c)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get GitHub client"})
		return
	}

	// Fetch notifications
	transformer := github.NewNotificationTransformer(githubClient)
	notifications, err := transformer.FetchNotifications(context.TODO(), unreadOnly)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch notifications"})
		return
	}

	// Transform to mobile format
	mobileNotifs := make([]MobileNotification, 0, len(notifications))
	unreadCount := 0

	for _, notif := range notifications {
		mobileNotif := transformer.TransformNotification(notif)
		mobileNotifs = append(mobileNotifs, mobileNotif)

		if mobileNotif.IsUnread {
			unreadCount++
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"notifications": mobileNotifs,
		"unreadCount":   unreadCount,
	})
}

// MarkNotificationsRead godoc
// @Summary Mark notifications as read
// @Description Mark one or more notifications as read (syncs to GitHub)
// @Tags mobile
// @Accept json
// @Param body body map[string][]string true "Notification IDs"
// @Success 204
// @Failure 400 {object} map[string]string
// @Failure 401 {object} map[string]string
// @Router /api/v1/notifications/read [patch]
func MarkNotificationsRead(c *gin.Context) {
	reqK8s, _ := GetK8sClientsForRequest(c)
	if reqK8s == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid or missing token"})
		c.Abort()
		return
	}

	var req struct {
		NotificationIDs []string `json:"notificationIds" binding:"required"`
	}

	if err := c.BindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	githubClient, err := getGitHubClientForUser(c)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get GitHub client"})
		return
	}

	// Mark each notification as read
	ctx := context.TODO()
	for _, threadID := range req.NotificationIDs {
		_, err := githubClient.Activity.MarkThreadRead(ctx, threadID)
		if err != nil {
			// Log error but continue
			fmt.Printf("Failed to mark thread %s as read: %v\n", threadID, err)
		}
	}

	c.Status(http.StatusNoContent)
}
```

---

## Common Patterns

### Authentication (CRITICAL)

**ALWAYS use this pattern** for all mobile endpoints:

```go
func YourHandler(c *gin.Context) {
	// Get user token clients (ADR-0002)
	reqK8s, reqDyn := GetK8sClientsForRequest(c)
	if reqK8s == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid or missing token"})
		c.Abort()
		return
	}

	userID := c.GetString("user_id")         // From token
	projectName := c.GetString("project_name") // From middleware

	// Use reqDyn for Kubernetes operations
}
```

### Error Responses

**ALWAYS return structured errors**:

```go
type ErrorResponse struct {
	Error      string      `json:"error"`
	Message    string      `json:"message"`
	StatusCode int         `json:"statusCode"`
	Details    interface{} `json:"details,omitempty"`
}

// Usage
c.JSON(http.StatusBadRequest, ErrorResponse{
	Error:      "VALIDATION_ERROR",
	Message:    "Invalid session ID format",
	StatusCode: http.StatusBadRequest,
	Details:    map[string]string{"field": "id"},
})
```

### Date Formatting

**ALWAYS use ISO 8601**:

```go
import "time"

// ✅ CORRECT
createdAt := time.Now().Format(time.RFC3339)
// Result: "2025-12-07T10:30:00Z"

// ❌ WRONG
createdAt := time.Now().Unix()
// Result: 1733569800 (mobile app will crash)
```

### Enum Values

**ALWAYS match mobile enums exactly** (case-sensitive):

```go
// ✅ CORRECT
status := "running"          // lowercase
model := "sonnet-4.5"        // exact string with hyphen

// ❌ WRONG
status := "RUNNING"          // uppercase - WRONG
status := "Running"          // titlecase - WRONG
model := "sonnet-4-5"        // underscores - WRONG
model := "sonnet_4.5"        // underscores - WRONG
```

---

## Testing Checklist

### Unit Tests
- [ ] Session transformation (K8s CR → mobile format)
- [ ] Status enum mapping
- [ ] Date format validation
- [ ] Error response structure
- [ ] Repository ID generation

### Integration Tests
- [ ] List sessions with user token
- [ ] Create session (valid request)
- [ ] Update session status
- [ ] SSE connection establishment
- [ ] SSE event delivery
- [ ] GitHub notifications fetch
- [ ] Mark notification as read

### Mobile App Tests
- [ ] Sessions list loads
- [ ] Session detail displays
- [ ] Real-time updates work (SSE)
- [ ] No Zod validation errors
- [ ] Error states handled gracefully
- [ ] Token refresh works (401 handling)

---

## Debugging

### Check Mobile Logs

```bash
# Mobile app Metro console
# Look for:
[API] GET /api/v1/sessions
[API] Response: { sessions: [...] }
[SSE] Connecting to SSE endpoint
[SSE] Connection opened
[SSE] Event received: session.progress

# Zod validation errors will show:
[ERROR] Zod validation failed: { ... }
```

### Check Backend Logs

```bash
cd ~/repos/platform/components/backend
make logs

# Look for:
[SSE] User user-123 subscribed (total connections: 1)
[API] GET /api/v1/sessions (user=user-123, project=project-abc)
```

### Common Issues

**Issue**: Zod validation failed
- **Cause**: Response doesn't match mobile schema
- **Fix**: Check exact field names, types, enum values, date format

**Issue**: 401 Unauthorized
- **Cause**: Missing or invalid Bearer token
- **Fix**: Verify mobile app sends `Authorization: Bearer {token}` header

**Issue**: SSE connection drops immediately
- **Cause**: Nginx buffering or missing headers
- **Fix**: Add `X-Accel-Buffering: no` header

---

## Resources

### Mobile App Files (Read These!)
- `/Users/jeder/repos/mobile/services/api/schemas.ts` - Zod schemas (CRITICAL)
- `/Users/jeder/repos/mobile/services/api/client.ts` - HTTP client
- `/Users/jeder/repos/mobile/services/api/realtime.ts` - SSE client
- `/Users/jeder/repos/mobile/hooks/useRealtimeSession.ts` - SSE cache sync

### Backend Files
- `/Users/jeder/repos/platform/components/backend/handlers/sessions.go` - Existing session handlers
- `/Users/jeder/repos/platform/docs/adr/0002-user-token-authentication.md` - Auth pattern
- `/Users/jeder/repos/platform/components/backend/routes.go` - Route registration

### Specification
- `/Users/jeder/repos/mobile/specs/003-rest-api-backend/spec.md` - Business requirements
- `/Users/jeder/repos/mobile/specs/003-rest-api-backend/data-model.md` - Entity definitions
- `/Users/jeder/repos/mobile/specs/003-rest-api-backend/contracts/openapi.yaml` - API contract

---

## Need Help?

1. **Schema mismatch errors**: Compare backend response to mobile Zod schema in `services/api/schemas.ts`
2. **Authentication issues**: Review ADR-0002 and `GetK8sClientsForRequest()` usage
3. **SSE not working**: Check heartbeat, headers, and connection management
4. **GitHub API**: Review existing GitHub App integration in `components/backend/github/`

---

**Status**: Ready for implementation
**Estimated Effort**: 2-3 weeks for MVP (sessions + SSE + notifications)
