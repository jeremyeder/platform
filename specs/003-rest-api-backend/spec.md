# Feature Specification: REST API Backend for ACP Mobile App

**Feature Branch**: `003-rest-api-backend`
**Created**: 2025-12-07
**Status**: Draft
**Input**: User description: "Implement REST API Backend for ACP Mobile App with OAuth 2.0, SSE real-time updates, GitHub notifications, and session management. Backend will serve the mobile companion app with endpoints for authentication, sessions CRUD, real-time progress via Server-Sent Events, GitHub notification integration, and user preferences."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Mobile User Authenticates and Views Sessions (Priority: P1)

A mobile app user opens the ACP Mobile app, authenticates using their Red Hat SSO credentials, and immediately sees a list of their AI coding sessions with current status and progress.

**Why this priority**: Authentication and session viewing are the core foundation - without these, the mobile app cannot function. This delivers immediate value by allowing users to monitor their AI workflows from mobile devices.

**Independent Test**: Can be fully tested by logging into the mobile app and verifying that sessions load from the backend. Delivers value by showing users their active AI workflows without needing to open a desktop browser.

**Acceptance Scenarios**:

1. **Given** a user has not logged in, **When** they open the mobile app, **Then** they are presented with a login button
2. **Given** a user taps login, **When** OAuth flow completes successfully, **Then** they are redirected back to the app with valid access tokens
3. **Given** a user is authenticated, **When** they view the Sessions tab, **Then** they see a list of all their sessions with name, status, progress, and last updated time
4. **Given** a user has no sessions, **When** they view the Sessions tab, **Then** they see an empty state message encouraging them to create their first session
5. **Given** a user's token is about to expire, **When** they make any API request, **Then** their token is automatically refreshed without interrupting their experience

---

### User Story 2 - Mobile User Monitors Session Progress in Real-Time (Priority: P1)

A mobile app user starts an AI code review session from the web app, then switches to their mobile device and watches the session progress update live without refreshing.

**Why this priority**: Real-time updates are essential for mobile users who want to monitor long-running AI workflows while away from their desk. This is the primary value proposition of the mobile app.

**Independent Test**: Can be fully tested by starting a session (via web or API), opening the mobile app, and verifying that progress updates appear instantly as the session executes. Delivers value by keeping users informed of workflow status in real-time.

**Acceptance Scenarios**:

1. **Given** a user has an active session, **When** they open the session detail screen, **Then** the mobile app establishes a Server-Sent Events connection to receive real-time updates
2. **Given** a session is running, **When** progress increases (e.g., from 45% to 60%), **Then** the progress bar animates smoothly to the new value without page refresh
3. **Given** a session status changes (e.g., from "running" to "awaiting_review"), **When** the update is sent via SSE, **Then** the mobile app shows a notification and updates the UI immediately
4. **Given** the mobile app loses network connection, **When** connection is restored, **Then** SSE reconnects automatically with exponential backoff and displays current session state
5. **Given** a user backgrounds the mobile app, **When** they return to the app, **Then** SSE reconnects and syncs the latest session status

---

### User Story 3 - Mobile User Creates New AI Coding Session (Priority: P2)

A mobile app user receives a GitHub notification about a new pull request on their phone, taps "Start Review Workflow," and creates a new AI code review session directly from the mobile app.

**Why this priority**: Session creation enables the mobile app to be a full workflow management tool, not just a viewer. However, it's secondary to viewing/monitoring existing sessions.

**Independent Test**: Can be fully tested by selecting a connected repository, choosing a workflow type, and verifying the session is created and appears in the sessions list. Delivers value by allowing users to initiate AI workflows from mobile.

**Acceptance Scenarios**:

1. **Given** a user taps "New Session," **When** they select a repository and workflow type, **Then** a new session is created with status "running" and progress 0%
2. **Given** a user has no connected repositories, **When** they attempt to create a session, **Then** they are prompted to connect a repository first
3. **Given** a session creation request fails, **When** the backend returns an error, **Then** the mobile app displays a user-friendly error message and allows retry
4. **Given** a user creates a session, **When** the backend confirms creation, **Then** the mobile app navigates to the session detail screen showing real-time progress

---

### User Story 4 - Mobile User Manages GitHub Notifications (Priority: P2)

A mobile app user receives a push notification about a new GitHub pull request mention, opens the mobile app, sees the notification with a suggested "Code Review" workflow, and can mark it as read or mute the thread.

**Why this priority**: GitHub notification management makes the mobile app a productivity hub for developers. It's important but requires session management to be working first.

**Independent Test**: Can be fully tested by triggering GitHub notifications (PR, issue, mention) and verifying they appear in the mobile app with correct metadata and suggested workflows. Delivers value by consolidating developer notifications in one place.

**Acceptance Scenarios**:

1. **Given** a user has GitHub notifications, **When** they open the Notifications tab, **Then** they see a list of unread notifications with type, repository, title, and suggested workflow
2. **Given** a user taps a notification, **When** they select "Start Workflow," **Then** a new session is created pre-configured with the notification's repository and suggested workflow type
3. **Given** a user long-presses a notification, **When** they select "Mark as Read," **Then** the notification is marked read both in the app and on GitHub
4. **Given** a user wants to mute a noisy thread, **When** they select "Mute Thread," **Then** future notifications from that thread are suppressed
5. **Given** a user has no unread notifications, **When** they view the Notifications tab, **Then** they see a clean empty state

---

### User Story 5 - Mobile User Manages Preferences and Connected Repositories (Priority: P3)

A mobile app user wants to customize their experience by changing the app theme to dark mode, enabling quiet hours for notifications (10pm-7am), and connecting a new GitHub repository for workflow creation.

**Why this priority**: User preferences improve the experience but are not essential for core functionality. These can be implemented after the critical session and notification features work.

**Independent Test**: Can be fully tested by navigating to Settings, toggling preferences, and verifying they persist across app restarts. Delivers value by personalizing the mobile experience.

**Acceptance Scenarios**:

1. **Given** a user opens Settings, **When** they toggle dark mode, **Then** the app theme changes immediately and persists across restarts
2. **Given** a user enables quiet hours (10pm-7am), **When** a notification arrives during quiet hours, **Then** no push notification is sent (notification still appears in-app)
3. **Given** a user taps "Connect Repository," **When** they authenticate with GitHub, **Then** their accessible repositories are listed and can be connected
4. **Given** a user disconnects a repository, **When** they confirm the action, **Then** the repository is removed from their connected list and cannot be used for new sessions
5. **Given** a user updates their profile (name, avatar), **When** they save changes, **Then** updates are reflected throughout the app

---

### Edge Cases

- **What happens when a user's OAuth token expires during an active SSE connection?** The backend must detect token expiration, close the SSE connection gracefully, and send a 401 response that triggers the mobile app to refresh the token and reconnect.

- **How does the system handle concurrent session updates from multiple sources?** If a session is updated via web app while mobile app has it open, SSE events ensure both clients stay in sync. The mobile app merges partial updates into its local cache without full refetch.

- **What happens when a user starts a session that requires repository access they've revoked?** The backend must detect missing GitHub permissions and return a clear error indicating which repository access is needed, prompting the user to re-authenticate.

- **How does the system handle SSE reconnection storms during network instability?** The backend must implement connection throttling and the mobile app uses exponential backoff (1s → 2s → 4s → 8s → 16s → 30s max) to prevent overwhelming the server.

- **What happens when a user deletes a session while it's running?** The backend must gracefully stop the workflow execution, clean up resources, and send an SSE event notifying all connected clients that the session was deleted.

- **How does the system handle push notification registration failures?** The mobile app continues to function normally, falling back to in-app notifications only. The backend logs the failure but does not block other functionality.

## Requirements _(mandatory)_

### Functional Requirements

#### Authentication & Authorization

- **FR-001**: System MUST implement OAuth 2.0 with PKCE flow for secure mobile authentication against Red Hat SSO
- **FR-002**: System MUST issue JWT access tokens with 1-hour expiration and refresh tokens with 30-day expiration
- **FR-003**: System MUST provide a token refresh endpoint that accepts refresh tokens and returns new access/refresh token pairs
- **FR-004**: System MUST validate Bearer tokens on all protected endpoints and return 401 for invalid/expired tokens
- **FR-005**: System MUST support automatic token rotation - old refresh tokens invalidated when new ones issued

#### Session Management

- **FR-006**: System MUST allow authenticated users to list all their AI coding sessions with pagination support
- **FR-007**: System MUST return session details including id, name, status, progress (0-100), model type, workflow type, repository info, creation/update timestamps, current task, completed tasks, and error messages
- **FR-008**: System MUST allow authenticated users to create new sessions by specifying repository and workflow type
- **FR-009**: System MUST allow authenticated users to update session properties (name, status)
- **FR-010**: System MUST allow authenticated users to delete sessions they own
- **FR-011**: System MUST track session execution progress and expose it via API and SSE
- **FR-012**: System MUST support session statuses: running, paused, done, awaiting_review, error

#### Real-Time Updates (Server-Sent Events)

- **FR-013**: System MUST provide an SSE endpoint that streams real-time session updates to authenticated clients
- **FR-014**: System MUST send SSE events for session progress updates (event: session.progress) without triggering full cache invalidation
- **FR-015**: System MUST send SSE events for session status changes (event: session.status) and trigger notifications when status becomes "awaiting_review"
- **FR-016**: System MUST send SSE events for partial session updates (event: session.updated) that clients merge into local cache
- **FR-017**: System MUST maintain persistent SSE connections and handle client disconnections gracefully
- **FR-018**: System MUST send SSE heartbeat pings every 30 seconds to keep connections alive
- **FR-019**: System MUST support multiple concurrent SSE connections per user (web + mobile)

#### GitHub Notifications Integration

- **FR-020**: System MUST integrate with GitHub API to fetch user notifications (pull requests, issues, mentions)
- **FR-021**: System MUST return GitHub notifications with type, repository, item number, title, author, timestamp, read status, suggested workflow, and URL
- **FR-022**: System MUST allow users to mark notifications as read, syncing status back to GitHub
- **FR-023**: System MUST allow users to mute notification threads, suppressing future notifications from that thread
- **FR-024**: System MUST send SSE events when new notifications arrive (event: notification.new)
- **FR-025**: System MUST implement workflow suggestion logic: PRs → review, bug issues → bugfix, feature requests → plan, general issues → research

#### User Profile & Preferences

- **FR-026**: System MUST provide user profile information including id, email, name, and avatar URL from OAuth provider
- **FR-027**: System MUST allow users to update their profile name
- **FR-028**: System MUST persist user preferences including theme (light/dark), notification settings, and quiet hours configuration
- **FR-029**: System MUST respect quiet hours settings when sending push notifications (suppress notifications during configured hours)

#### Repository Management

- **FR-030**: System MUST allow users to list their connected GitHub repositories
- **FR-031**: System MUST allow users to connect new repositories via GitHub OAuth
- **FR-032**: System MUST allow users to disconnect repositories from their account
- **FR-033**: System MUST validate repository access before allowing session creation (check GitHub permissions)

#### Push Notifications (Post-MVP)

- **FR-034**: System SHOULD accept push notification token registration from mobile clients (Expo push tokens)
- **FR-035**: System SHOULD send push notifications via Expo Push Service when sessions reach "awaiting_review" status
- **FR-036**: System SHOULD send push notifications for new GitHub notifications (unless quiet hours active)
- **FR-037**: System SHOULD handle push notification failures gracefully without blocking other functionality

#### Error Handling & Validation

- **FR-038**: System MUST validate all request payloads against expected schemas and return 400 Bad Request for invalid input
- **FR-039**: System MUST return standardized error responses with error type, human-readable message, and optional details object
- **FR-040**: System MUST use HTTP status codes correctly: 200 (success), 201 (created), 204 (no content), 400 (bad request), 401 (unauthorized), 403 (forbidden), 404 (not found), 500 (server error)
- **FR-041**: System MUST log all errors with sufficient context for debugging while sanitizing sensitive data from logs

#### Performance & Scalability

- **FR-042**: System MUST respond to API requests within 2 seconds at 95th percentile under normal load
- **FR-043**: System MUST support at least 100 concurrent SSE connections per backend instance
- **FR-044**: System MUST implement rate limiting on API endpoints to prevent abuse (max 100 requests/minute per user)
- **FR-045**: System MUST implement Kubernetes query optimization to minimize response times (proper label selectors on frequently queried resources)

#### Security

- **FR-046**: System MUST enforce HTTPS for all API communication in production environments
- **FR-047**: System MUST sanitize all user input to prevent SQL injection and XSS attacks
- **FR-048**: System MUST implement CORS policies allowing only authorized origins (mobile app, web app)
- **FR-049**: System MUST never log or expose sensitive data (tokens, passwords, API keys) in responses or logs
- **FR-050**: System MUST validate session ownership before allowing update/delete operations (users can only modify their own sessions)

### Key Entities

- **User**: Represents an authenticated developer with email, name, avatar, and OAuth identity. Links to their sessions, preferences, connected repositories, and notification settings.

- **Session**: Represents an AI coding workflow execution with unique ID, name, status (running/paused/done/awaiting_review/error), progress percentage (0-100), model type (sonnet-4.5/opus-4.5), workflow type (review/bugfix/plan/research/chat), associated repository, creation/update timestamps, current task description, list of completed tasks, and optional error message.

- **Repository**: Represents a connected GitHub repository with unique ID, full name (owner/repo), URL, current branch, and connection status. Links to the user who connected it and sessions using it.

- **Notification**: Represents a GitHub notification (pull request, issue, mention) with unique ID, type, repository, item number, title, author, timestamp, read status, suggested workflow type based on notification content, and GitHub URL for deep linking.

- **UserPreferences**: Represents user customization settings including theme choice (light/dark), notification preferences (enabled/disabled by type), quiet hours configuration (start time, end time, timezone), and default workflow settings.

- **PushToken**: Represents a mobile device registration for push notifications with unique token (Expo push token), associated user, device platform (iOS/Android), registration timestamp, and last used timestamp.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Mobile users can complete OAuth login flow and view their sessions list within 5 seconds of opening the app
- **SC-002**: Real-time progress updates appear on mobile devices within 2 seconds of backend processing the change
- **SC-003**: System handles 100 concurrent mobile users with active SSE connections without response time degradation
- **SC-004**: API endpoints respond within 2 seconds for 95% of requests under normal load conditions
- **SC-005**: Mobile users successfully create new sessions from GitHub notifications with 90% success rate on first attempt
- **SC-006**: SSE connections automatically reconnect within 30 seconds of network interruption with zero data loss
- **SC-007**: Zero security vulnerabilities related to authentication, authorization, or data exposure in production
- **SC-008**: Push notifications for session status changes reach mobile devices within 5 seconds with 95% delivery rate
- **SC-009**: GitHub notification sync completes within 3 seconds, showing users their latest notifications
- **SC-010**: User preference changes persist correctly across app restarts and device changes with 100% reliability
