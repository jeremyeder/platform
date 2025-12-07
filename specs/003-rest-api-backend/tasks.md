# Tasks: REST API Backend for ACP Mobile App

**Input**: Design documents from `/specs/003-rest-api-backend/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅
**Implementation Repository**: `~/repos/platform/components/backend`

**Tests**: This feature does NOT request explicit test tasks. Tests will be written following existing platform backend patterns (table-driven tests, integration tests with K8s).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `- [ ] [ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

**Backend Repository**: `~/repos/platform/components/backend/`
- Handlers: `handlers/mobile_*.go`
- Types: `types/mobile.go`
- SSE: `sse/hub.go`
- Routes: `routes.go`
- Tests: `tests/mobile_*.go`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Backend project structure and dependencies

- [ ] T001 Create `~/repos/platform/components/backend/types/mobile.go` for mobile response types
- [ ] T002 [P] Create `~/repos/platform/components/backend/sse/` directory for SSE hub package
- [ ] T003 [P] Add Go dependencies to `go.mod` if needed (SSE libraries, validation)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete. All mobile endpoints depend on these foundational components.

- [ ] T004 Define `MobileSessionResponse` struct in `~/repos/platform/components/backend/types/mobile.go` matching mobile Zod schema
- [ ] T005 [P] Define `MobileRepository` struct in `~/repos/platform/components/backend/types/mobile.go`
- [ ] T006 [P] Define `ErrorResponse` struct in `~/repos/platform/components/backend/types/mobile.go`
- [ ] T007 Implement `transformToMobileSession()` function in `~/repos/platform/components/backend/handlers/helpers.go` to convert K8s CR to mobile format
- [ ] T008 [P] Implement `mapPhaseToMobileStatus()` helper in `~/repos/platform/components/backend/handlers/helpers.go` for status enum mapping
- [ ] T009 [P] Implement `generateRepoID()` and `extractRepoName()` helpers in `~/repos/platform/components/backend/handlers/helpers.go`
- [ ] T010 Create SSE hub in `~/repos/platform/components/backend/sse/hub.go` with Subscribe/Unsubscribe/Broadcast methods
- [ ] T011 Add CORS configuration for mobile app origin in `~/repos/platform/components/backend/server/server.go`

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Mobile User Authenticates and Views Sessions (Priority: P1) 🎯 MVP

**Goal**: Mobile user can authenticate via OAuth and view their AI coding sessions with current status and progress

**Independent Test**:
1. Start mobile app
2. Mock auth auto-logs in as `developer@redhat.com`
3. Navigate to Sessions tab
4. Sessions list loads from backend (or shows empty state)
5. Verify: No Zod validation errors in Metro console

**Backend Endpoints Required**:
- `GET /api/v1/sessions` - List all sessions for user
- `GET /api/v1/sessions/:id` - Get session details

### Implementation for User Story 1

- [ ] T012 [P] [US1] Create `~/repos/platform/components/backend/handlers/mobile_sessions.go` file
- [ ] T013 [US1] Implement `ListMobileSessions()` handler in `~/repos/platform/components/backend/handlers/mobile_sessions.go`
  - Use `GetK8sClientsForRequest()` for user token auth (ADR-0002)
  - List AgenticSessions using user's token
  - Apply optional status filter from query param
  - Transform each session to mobile format using `transformToMobileSession()`
  - Return `{"sessions": [...]}`
- [ ] T014 [US1] Implement `GetMobileSession()` handler in `~/repos/platform/components/backend/handlers/mobile_sessions.go`
  - Use `GetK8sClientsForRequest()` for user token auth
  - Get single AgenticSession by ID
  - Transform to mobile format
  - Return 404 if not found
- [ ] T015 [US1] Register mobile routes in `~/repos/platform/components/backend/routes.go`
  - Add `/api/v1` route group with `ValidateProjectContext` middleware
  - Register `GET /api/v1/sessions` → `ListMobileSessions`
  - Register `GET /api/v1/sessions/:id` → `GetMobileSession`
- [ ] T016 [US1] Test with mobile app: configure `.env.local` with `EXPO_PUBLIC_USE_MOCK_DATA=false`, verify sessions load

**Checkpoint**: User Story 1 complete - mobile app can authenticate and view sessions from backend

---

## Phase 4: User Story 2 - Mobile User Monitors Session Progress in Real-Time (Priority: P1)

**Goal**: Mobile user can watch session progress update live via Server-Sent Events without refreshing

**Independent Test**:
1. Mobile app connected to backend
2. Navigate to session detail screen
3. Backend sends SSE progress update event
4. Verify: Progress bar animates to new value without refresh
5. Verify: Metro logs show `[SSE] Event received: session.progress`

**Backend Endpoints Required**:
- `GET /api/v1/sse/sessions` - SSE stream for real-time updates

### Implementation for User Story 2

- [ ] T017 [P] [US2] Create `~/repos/platform/components/backend/handlers/mobile_sse.go` file
- [ ] T018 [US2] Implement `StreamSessions()` handler in `~/repos/platform/components/backend/handlers/mobile_sse.go`
  - Use `GetK8sClientsForRequest()` for user token auth
  - Set SSE headers (`Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`)
  - Subscribe to SSE hub for user
  - Stream events in loop: send event, handle heartbeat (30s), detect client disconnect
  - Unsubscribe on disconnect
- [ ] T019 [US2] Add helper `toJSON()` function in `~/repos/platform/components/backend/handlers/mobile_sse.go` to serialize event data
- [ ] T020 [US2] Modify existing session update handlers to broadcast SSE events
  - In `UpdateMobileSession()`: Broadcast `session.status` event after status change
  - In `UpdateMobileSession()`: Broadcast `session.progress` event after progress update
  - In `UpdateMobileSession()`: Broadcast `session.updated` event for partial updates
- [ ] T021 [US2] Register SSE route in `~/repos/platform/components/backend/routes.go`
  - Register `GET /api/v1/sse/sessions` → `StreamSessions`
- [ ] T022 [US2] Test with mobile app: configure `EXPO_PUBLIC_USE_MOCK_SSE=false`, verify real-time updates work

**Checkpoint**: User Story 2 complete - mobile app receives real-time session updates via SSE

---

## Phase 5: User Story 3 - Mobile User Creates New AI Coding Session (Priority: P2)

**Goal**: Mobile user can create a new AI code review session directly from the mobile app

**Independent Test**:
1. Mobile app connected to backend
2. Tap "New Session" button
3. Select repository and workflow type
4. Submit
5. Verify: New session appears in sessions list with status "running"

**Backend Endpoints Required**:
- `POST /api/v1/sessions` - Create new session
- `PATCH /api/v1/sessions/:id` - Update session status

### Implementation for User Story 3

- [ ] T023 [P] [US3] Define `CreateMobileSessionRequest` struct in `~/repos/platform/components/backend/types/mobile.go`
  - Fields: name (optional), workflowType, model, repositoryUrl, branch (optional)
- [ ] T024 [P] [US3] Define `UpdateMobileSessionRequest` struct in `~/repos/platform/components/backend/types/mobile.go`
  - Fields: action (approve/reject/pause/resume), feedback (optional)
- [ ] T025 [US3] Implement `CreateMobileSession()` handler in `~/repos/platform/components/backend/handlers/mobile_sessions.go`
  - Use `GetK8sClientsForRequest()` for user token auth
  - Parse request body and validate
  - ⚠️ CRITICAL: Clarify if `repositoryUrl` expects ID or full GitHub URL
  - Create AgenticSession CRD in user's namespace
  - Transform created session to mobile format
  - Broadcast `session.updated` SSE event
  - Return 201 Created with session object
- [ ] T026 [US3] Implement `UpdateMobileSession()` handler in `~/repos/platform/components/backend/handlers/mobile_sessions.go`
  - Use `GetK8sClientsForRequest()` for user token auth
  - Parse request body (action + optional feedback)
  - Update AgenticSession status based on action
  - Broadcast appropriate SSE event (session.status or session.updated)
  - Return updated session object
- [ ] T027 [US3] Implement `DeleteMobileSession()` handler in `~/repos/platform/components/backend/handlers/mobile_sessions.go`
  - Use `GetK8sClientsForRequest()` for user token auth
  - Verify session ownership (users can only delete their own sessions)
  - Delete AgenticSession CRD
  - Broadcast `session.deleted` SSE event (optional)
  - Return 204 No Content
- [ ] T028 [US3] Register session mutation routes in `~/repos/platform/components/backend/routes.go`
  - Register `POST /api/v1/sessions` → `CreateMobileSession`
  - Register `PATCH /api/v1/sessions/:id` → `UpdateMobileSession`
  - Register `DELETE /api/v1/sessions/:id` → `DeleteMobileSession`
- [ ] T029 [US3] Test with mobile app: create session from mobile, verify it appears in list and SSE updates work

**Checkpoint**: User Story 3 complete - mobile users can create and manage sessions

---

## Phase 6: User Story 4 - Mobile User Manages GitHub Notifications (Priority: P2)

**Goal**: Mobile user can view GitHub notifications, see workflow suggestions, and mark as read or mute threads

**Independent Test**:
1. Mobile app connected to backend
2. Navigate to Notifications tab
3. Verify: GitHub notifications load with suggested workflows
4. Mark notification as read
5. Verify: Notification marked read in UI and on GitHub

**Backend Endpoints Required**:
- `GET /api/v1/notifications/github?unread=true` - List notifications
- `PATCH /api/v1/notifications/read` - Mark as read
- `PATCH /api/v1/notifications/read-all` - Mark all as read
- `POST /api/v1/notifications/mute` - Mute thread

### Implementation for User Story 4

- [ ] T030 [P] [US4] Define `MobileNotification` struct in `~/repos/platform/components/backend/types/mobile.go`
  - Fields: id, type, repository, itemNumber, title, author, timestamp, isUnread, suggestedWorkflow, url
- [ ] T031 [P] [US4] Create `~/repos/platform/components/backend/github/notifications.go` file
- [ ] T032 [US4] Implement `NotificationTransformer` in `~/repos/platform/components/backend/github/notifications.go`
  - `FetchNotifications()`: Fetch from GitHub API
  - `TransformNotification()`: Convert GitHub notification to mobile format
  - `mapNotificationType()`: Map GitHub type to mobile enum
  - `suggestWorkflow()`: Suggest workflow based on notification type
  - `extractItemNumber()`: Extract PR/issue number from URL
  - `buildNotificationURL()`: Build GitHub URL
- [ ] T033 [P] [US4] Create `~/repos/platform/components/backend/handlers/mobile_notifications.go` file
- [ ] T034 [US4] Implement `GetGitHubNotifications()` handler in `~/repos/platform/components/backend/handlers/mobile_notifications.go`
  - Use `GetK8sClientsForRequest()` for user token auth
  - Get GitHub client for user (using existing GitHub App infrastructure)
  - Fetch notifications via transformer
  - Transform to mobile format
  - Count unread
  - Return `{"notifications": [...], "unreadCount": N}`
- [ ] T035 [US4] Implement `MarkNotificationsRead()` handler in `~/repos/platform/components/backend/handlers/mobile_notifications.go`
  - Parse request body (notificationIds array)
  - Mark each thread as read via GitHub API
  - Return 204 No Content
- [ ] T036 [US4] Implement `MarkAllNotificationsRead()` handler in `~/repos/platform/components/backend/handlers/mobile_notifications.go`
  - Mark all threads as read via GitHub API
  - Return 204 No Content
- [ ] T037 [US4] Implement `MuteNotification()` handler in `~/repos/platform/components/backend/handlers/mobile_notifications.go`
  - Parse request body (notificationId)
  - Mute thread via GitHub API
  - Return 204 No Content
- [ ] T038 [US4] Register notification routes in `~/repos/platform/components/backend/routes.go`
  - Register `GET /api/v1/notifications/github` → `GetGitHubNotifications`
  - Register `PATCH /api/v1/notifications/read` → `MarkNotificationsRead`
  - Register `PATCH /api/v1/notifications/read-all` → `MarkAllNotificationsRead`
  - Register `POST /api/v1/notifications/mute` → `MuteNotification`
- [ ] T039 [US4] Implement background job to poll GitHub every 5 minutes and send `notification.new` SSE events
- [ ] T040 [US4] Test with mobile app: verify notifications load, mark as read syncs to GitHub, mute works

**Checkpoint**: User Story 4 complete - mobile users can manage GitHub notifications with workflow suggestions

---

## Phase 7: User Story 5 - Mobile User Manages Preferences and Connected Repositories (Priority: P3)

**Goal**: Mobile user can customize theme, enable quiet hours, and manage connected GitHub repositories

**Independent Test**:
1. Mobile app connected to backend
2. Navigate to Settings
3. Toggle dark mode
4. Enable quiet hours (10pm-7am)
5. Verify: Preferences persist across app restarts

**Backend Endpoints Required**:
- `GET /api/v1/user/profile` - Get user profile
- `GET /api/v1/user/preferences` - Get preferences
- `PATCH /api/v1/user/preferences` - Update preferences
- `GET /api/v1/repositories` - List connected repos
- `POST /api/v1/repositories` - Connect repo
- `DELETE /api/v1/repositories/:id` - Disconnect repo

### Implementation for User Story 5

- [ ] T041 [P] [US5] Define `User` struct in `~/repos/platform/components/backend/types/mobile.go`
  - Fields: id, email, name, avatarUrl, role, ssoProvider
- [ ] T042 [P] [US5] Define `UserPreferences` struct in `~/repos/platform/components/backend/types/mobile.go`
  - Fields: theme, notifications (nested struct), quietHours (nullable nested struct)
- [ ] T043 [P] [US5] Create `~/repos/platform/components/backend/k8s/userprefs.go` for UserPreferences CRD operations
- [ ] T044 [US5] Implement `LoadUserPreferences()` in `~/repos/platform/components/backend/k8s/userprefs.go`
  - Get ConfigMap `userprefs-{userID}` from namespace
  - Parse to UserPreferences struct
  - Return defaults if ConfigMap doesn't exist
- [ ] T045 [US5] Implement `SaveUserPreferences()` in `~/repos/platform/components/backend/k8s/userprefs.go`
  - Create or update ConfigMap with user preferences
  - Flatten nested structs to ConfigMap data fields
- [ ] T046 [P] [US5] Create `~/repos/platform/components/backend/handlers/mobile_user.go` file
- [ ] T047 [US5] Implement `GetUserProfile()` handler in `~/repos/platform/components/backend/handlers/mobile_user.go`
  - Use `GetK8sClientsForRequest()` for user token auth
  - Extract user from token claims
  - Return `{"data": {...}}` with User object
- [ ] T048 [US5] Implement `GetUserPreferences()` handler in `~/repos/platform/components/backend/handlers/mobile_user.go`
  - Load preferences from ConfigMap
  - Return `{"data": {...}}` with UserPreferences object
- [ ] T049 [US5] Implement `UpdateUserPreferences()` handler in `~/repos/platform/components/backend/handlers/mobile_user.go`
  - Parse request body
  - Validate quiet hours format (HH:MM)
  - Save to ConfigMap
  - Return updated UserPreferences
- [ ] T050 [US5] Implement `ListRepositories()` handler in `~/repos/platform/components/backend/handlers/mobile_user.go`
  - Query user's connected repositories (TBD: from ProjectSettings CRDs?)
  - Transform to mobile Repository format
  - Return array of Repository objects
- [ ] T051 [US5] Implement `ConnectRepository()` handler in `~/repos/platform/components/backend/handlers/mobile_user.go`
  - Validate GitHub URL
  - Verify user has access via GitHub App
  - Create repository connection (TBD: in ProjectSettings?)
  - Return Repository object
- [ ] T052 [US5] Implement `DisconnectRepository()` handler in `~/repos/platform/components/backend/handlers/mobile_user.go`
  - Remove repository connection
  - Return 204 No Content
- [ ] T053 [US5] Register user and repository routes in `~/repos/platform/components/backend/routes.go`
  - Register `GET /api/v1/user/profile` → `GetUserProfile`
  - Register `GET /api/v1/user/preferences` → `GetUserPreferences`
  - Register `PATCH /api/v1/user/preferences` → `UpdateUserPreferences`
  - Register `GET /api/v1/repositories` → `ListRepositories`
  - Register `POST /api/v1/repositories` → `ConnectRepository`
  - Register `DELETE /api/v1/repositories/:id` → `DisconnectRepository`
- [ ] T054 [US5] Test with mobile app: verify preferences save, theme changes, quiet hours work, repos display

**Checkpoint**: User Story 5 complete - mobile users can customize preferences and manage repositories

---

## Phase 8: Authentication Endpoints (Optional - Future Enhancement)

**Purpose**: Full OAuth 2.0 + PKCE implementation (optional - mock auth works for MVP)

**Note**: Mobile app currently uses mock authentication (`EXPO_PUBLIC_USE_MOCK_AUTH=true`). Real OAuth can be implemented later if needed.

- [ ] T055 [P] Create `~/repos/platform/components/backend/handlers/mobile_auth.go` file
- [ ] T056 [P] Implement `InitiateOAuthLogin()` handler for OAuth flow initiation
- [ ] T057 [P] Implement `ExchangeOAuthToken()` handler for PKCE code exchange
- [ ] T058 [P] Implement `RefreshToken()` handler for token refresh
  - Implement refresh token rotation logic (FR-005): invalidate old refresh token when issuing new one
  - Return new access token + new refresh token pair
  - Store refresh token hash (not plaintext) in persistent storage
  - Verify refresh token validity and expiration before issuing new tokens
- [ ] T059 [P] Implement `GetAuthProfile()` handler for auth check
- [ ] T060 Register auth routes in `~/repos/platform/components/backend/routes.go` (no middleware)
  - Register `POST /api/v1/auth/login` → `InitiateOAuthLogin`
  - Register `POST /api/v1/auth/token` → `ExchangeOAuthToken`
  - Register `POST /api/v1/auth/refresh` → `RefreshToken`
  - Register `GET /api/v1/auth/profile` → `GetAuthProfile`

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] T061 [P] Add comprehensive logging for all mobile endpoints in handlers
- [ ] T062 [P] Implement rate limiting middleware for mobile API routes (100 req/min per user)
- [ ] T063 [P] Add metrics/monitoring for SSE connection count and API response times
- [ ] T064 [P] Optimize Kubernetes label selectors for session list queries (FR-045)
  - Ensure `ListMobileSessions()` uses proper label selectors: `project={projectName},user={userID}`
  - Verify namespace scoping to minimize K8s API load
  - Add query timing metrics to identify slow queries
  - Document optimal label selector patterns in backend README
- [ ] T065 [P] Write unit tests for transformation functions (`transformToMobileSession`, enum mappers)
- [ ] T066 [P] Write integration tests for mobile API endpoints in `~/repos/platform/components/backend/tests/mobile_api_test.go`
- [ ] T067 [P] Write SSE hub tests in `~/repos/platform/components/backend/tests/sse_test.go`
- [ ] T068 [P] Update backend README with mobile API documentation
- [ ] T069 Validate all responses match mobile Zod schemas (run mobile app, check Metro console)
- [ ] T070 Run quickstart.md validation scenarios end-to-end
- [ ] T071 Security audit: verify token redaction, RBAC enforcement, input sanitization
- [ ] T072 Performance testing: verify <2s API response time, 100+ concurrent SSE connections

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-7)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel (if staffed)
  - Or sequentially in priority order (US1 → US2 → US3 → US4 → US5)
- **Authentication (Phase 8)**: Optional - can be deferred (mock auth works)
- **Polish (Phase 9)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Sessions list/detail - Foundation only
- **User Story 2 (P1)**: SSE real-time - Depends on US1 (needs sessions to update)
- **User Story 3 (P2)**: Create/update sessions - Depends on US1 (extends session API)
- **User Story 4 (P2)**: GitHub notifications - Independent (can start after Foundation)
- **User Story 5 (P3)**: Preferences/repos - Independent (can start after Foundation)

**Recommended Order**: US1 → US2 → US3 (these form the core session management flow), then US4 and US5 in parallel

### Within Each User Story

- Type definitions before handlers (structs before functions)
- Helper functions before main handlers
- Handlers before route registration
- Route registration before testing
- Core implementation before integration

### Parallel Opportunities

- **Setup**: All tasks marked [P] (T002, T003)
- **Foundational**: T005-T006 (type definitions), T008-T009 (helpers), T011 (CORS)
- **User Story 1**: T012-T013 can start together (handler file creation vs implementation, though overlapping)
- **User Story 2**: T017-T019 (SSE file creation, handler, helper)
- **User Story 3**: T023-T024 (type definitions)
- **User Story 4**: T072-T072 (type definitions, GitHub file), T072 (notifications handler file)
- **User Story 5**: T072-T072 (all type definitions and K8s file), T072 (handler file)
- **Authentication**: All tasks T072-T072 (different auth handlers)
- **Polish**: T072-T072 (logging, rate limiting, metrics, tests, docs all independent)

---

## Parallel Example: User Story 1

```bash
# Launch type definitions and handler file creation together:
Task: "Create ~/repos/platform/components/backend/types/mobile.go"
Task: "Create ~/repos/platform/components/backend/handlers/mobile_sessions.go"

# After foundational types exist, implement handlers:
Task: "Implement ListMobileSessions() handler"
Task: "Implement GetMobileSession() handler"
```

---

## Parallel Example: Foundational Phase

```bash
# Launch all type definitions together:
Task: "Define MobileSessionResponse struct in types/mobile.go"
Task: "Define MobileRepository struct in types/mobile.go"
Task: "Define ErrorResponse struct in types/mobile.go"

# Launch all helper functions together (after types exist):
Task: "Implement mapPhaseToMobileStatus() helper"
Task: "Implement generateRepoID() and extractRepoName() helpers"
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2 Only)

**Goal**: Get mobile app showing real sessions with real-time updates ASAP

1. ✅ Complete Phase 1: Setup (10 min)
2. ✅ Complete Phase 2: Foundational (2-3 hours)
   - Type definitions
   - Transformation functions
   - SSE hub
   - CORS config
3. ✅ Complete Phase 3: User Story 1 (4-6 hours)
   - Sessions list/detail endpoints
   - Route registration
   - Test with mobile app
4. ✅ Complete Phase 4: User Story 2 (4-6 hours)
   - SSE streaming endpoint
   - Event broadcasting
   - Test real-time updates
5. **STOP and VALIDATE**: Mobile app can view sessions AND get real-time updates
6. Deploy/demo if ready

**Total MVP Time**: ~1.5-2 days for core functionality

### Incremental Delivery

1. **Week 1**: Setup + Foundational + US1 + US2 → **MVP deployed**
2. **Week 2**: US3 (session creation) → Deploy
3. **Week 2**: US4 (notifications) → Deploy
4. **Week 3**: US5 (preferences) → Deploy
5. **Week 3**: Polish phase (tests, docs, security) → Final release

### Parallel Team Strategy

With 2-3 developers:

1. **Day 1**: Team completes Setup + Foundational together
2. **Day 2-3**: Once Foundational is done:
   - Developer A: US1 (sessions list/detail)
   - Developer B: US2 (SSE streaming) - waits for US1 routes
3. **Week 2**:
   - Developer A: US3 (session creation)
   - Developer B: US4 (notifications) - independent!
   - Developer C: US5 (preferences) - independent!
4. Stories integrate and test independently

---

## Critical Implementation Notes

### 1. Mobile Zod Schema Contract (CRITICAL)

**Source of Truth**: `~/repos/mobile/services/api/schemas.ts`

Before implementing ANY handler, read the corresponding Zod schema to ensure exact match:
- Enum values are case-sensitive: `"running"` NOT `"RUNNING"`
- Date format: ISO 8601 (`time.RFC3339` in Go)
- Field names: Exact matches (`createdAt` NOT `created_at`)
- Nullability: Respect nullable fields (`currentTask`, `errorMessage`)

**Validation**: Run mobile app after each endpoint, check Metro console for Zod errors.

### 2. Authentication Pattern (CRITICAL)

**ALWAYS use this in every handler**:

```go
reqK8s, reqDyn := GetK8sClientsForRequest(c)
if reqK8s == nil {
    c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid or missing token"})
    c.Abort()
    return
}
```

**NEVER** use service account for mobile user operations (violates ADR-0002).

### 3. SSE Event Format

All SSE events must follow this format:

```
event: session.progress
data: {"sessionId":"abc-123","progress":67}

```

Event types: `session.progress`, `session.status`, `session.updated`, `notification.new`, `notification.read`

### 4. Error Responses

Always use standardized format:

```go
c.JSON(http.StatusBadRequest, gin.H{
    "error":      "VALIDATION_ERROR",
    "message":    "Invalid session ID format",
    "statusCode": 400,
})
```

### 5. Testing with Mobile App

After each user story phase:

```bash
# Configure mobile app
cd ~/repos/mobile
cat > .env.local << EOF
EXPO_PUBLIC_API_BASE_URL=http://localhost:8080/api/v1
EXPO_PUBLIC_USE_MOCK_AUTH=true
EXPO_PUBLIC_USE_MOCK_DATA=false
EXPO_PUBLIC_USE_MOCK_SSE=false
EOF

# Start mobile app
npm start

# Check Metro console for:
# [API] GET /api/v1/sessions
# [SSE] Connection opened
# NO Zod validation errors
```

---

## Task Count Summary

- **Total Tasks**: 70
- **Setup (Phase 1)**: 3 tasks
- **Foundational (Phase 2)**: 8 tasks
- **User Story 1 (P1)**: 5 tasks
- **User Story 2 (P1)**: 6 tasks
- **User Story 3 (P2)**: 6 tasks
- **User Story 4 (P2)**: 11 tasks
- **User Story 5 (P3)**: 14 tasks
- **Authentication (Optional)**: 6 tasks
- **Polish**: 11 tasks

**Parallel Tasks**: 30 tasks marked [P] can run in parallel (43% of total)

**MVP Scope**: Setup + Foundational + US1 + US2 = **22 tasks** (critical path for working mobile app)

---

## Notes

- **[P] tasks** = different files, no dependencies on incomplete work
- **[Story] label** maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- **Repository ID vs URL**: Task T025 highlights critical clarification needed - mobile sends `repositoryId` as `repositoryUrl`
- Follow quickstart.md for detailed implementation examples and debugging guidance
