# vTeam KPI Dashboard - Implementation Plan

**Version**: 1.0
**Date**: 2025-11-02
**Status**: Ready for Implementation

---

## Executive Summary

Dual-persona KPI dashboard for vTeam serving business users (managers, POs) and technical users (DevOps, SRE).

**Key Decisions**:
- Unified dashboard with persona-aware defaults
- Prometheus with 30-day retention (no long-term storage initially)
- React Query + WebSocket for real-time updates
- WCAG 2.1 AA compliant
- Project-scoped metrics with RBAC

**Resources**: ~3 FTE effort, ~30Gi storage

---

## 1. KPI Framework

### 1.1 User Usage Metrics (Business Persona)

#### Session Lifecycle

| Metric | Data Source | Target | Alert |
|--------|-------------|--------|-------|
| Daily/Weekly Active Sessions | Backend API + K8s CRs | 15% MoM growth | -20% WoW (warn), -40% (critical) |
| Session Completion Rate | AgenticSession status | >85% success | <80% (warn), <70% (critical) |
| Time to First Completion | ProjectSettings + Sessions | Median <30 min | >1h (warn), >2h (critical) |
| Session Duration | Job timestamps | P50: 3-7 min, P95: <15 min | P95 >20 min |

#### Feature Adoption

| Metric | Data Source | Target | Visualization |
|--------|-------------|--------|---------------|
| RFE Workflow Adoption | RFEWorkflow vs Sessions | 30% power users | Gauge + trend |
| RFE Step Completion | RFEWorkflow status | >70% each step | Funnel chart |
| Multi-Repo Usage | Session spec.repos | 20% of sessions | Distribution |
| Interactive vs Batch | Session spec.interactive | 40-60% interactive | Pie + trend |
| Custom Model Usage | Session spec.model | 20-40% custom | Bar + error overlay |

#### User Segmentation

| Metric | Calculation | Target | Impact |
|--------|-------------|--------|--------|
| Power Users | 10+ sessions/month | 15-25% projects | Revenue drivers |
| New User Activation | 3+ sessions in week 1 | >40% activation | Predicts retention |
| User Retention | MoM active projects | >90% power users | Churn indicator |

### 1.2 Application Health Metrics (DevOps Persona)

#### Component Health

| Metric | Data Source | Target | Alert |
|--------|-------------|--------|-------|
| Component Availability | K8s readiness probes | Frontend: 99.5%, Backend/Operator: 99.9%, Runner: 95% | <99% in 1h |
| Pod Restart Rate | K8s events | <2/day (non-runner), <5/hour (runner) | >5/hour |
| Watch Reconnections | Operator logs | <10/day | >20/hour |

#### Performance

| Metric | Data Source | Target | Alert |
|--------|-------------|--------|-------|
| API Response Time | Access logs | P50: <100ms, P95: <300ms, P99: <1s | P95 >2x for 5min |
| Job Queue Depth | AgenticSession status | <10 sessions | >20 for 5min |
| Job Execution Time | K8s Job status | Batch P50: <5min, Interactive P50: <30min | P95 >20min (batch) |

#### Errors & Resources

| Metric | Data Source | Target | Alert |
|--------|-------------|--------|-------|
| API Error Rate | Access logs | 4xx: <5%, 5xx: <0.5% | 5xx >1% for 5min |
| Session Failures | Status messages | Timeout <5%, Unknown <1% | Unknown >5% |
| K8s Resource Errors | Backend/Operator logs | <0.1% ops | RBAC spike >10/hour |
| Component Resources | K8s metrics-server | <80% memory, no CPU throttle | >80% memory |
| Storage Usage | PVC status | <80% capacity | >80% |

### 1.3 Dashboard Layouts

**Manager/Business Default**: Active users, sessions today, success rate, adoption trends, top projects, 24h stats

**DevOps/Engineer Default**: System status, cluster health, API latency, error rate, resource utilization heatmap, recent alerts, job processing

---

## 2. Technical Architecture

### 2.1 Overview

```
Frontend (NextJS) → Backend API (Go) → Prometheus (30d) ← Metrics Exporters
                                                            (Backend, Operator, CR Exporter, Runner)
```

**Design Notes**:
- 30-day retention sufficient for operational dashboards
- Can add long-term storage later (Thanos, TimescaleDB)
- Users can export data before it ages out

### 2.2 Component Instrumentation

#### Backend Metrics
**File**: `components/backend/metrics/metrics.go`

Metrics:
- `vteam_backend_http_requests_total` (counter: method, path, status, project)
- `vteam_backend_http_request_duration_seconds` (histogram)
- `vteam_sessions_created_total` (counter: project, interactive)
- `vteam_sessions_completed_total` (counter: project, phase)
- `vteam_session_duration_seconds` (histogram: project, phase)
- `vteam_backend_errors_total` (counter: handler, error_type, project)

**Integration**: Add `metrics.MetricsMiddleware()` to server.go, expose `/metrics` endpoint in main.go

#### Operator Metrics
**File**: `components/operator/internal/metrics/metrics.go`

Metrics:
- `vteam_operator_reconciliations_total` (counter)
- `vteam_operator_reconciliation_duration_seconds` (histogram)
- `vteam_operator_reconciliation_errors_total` (counter)
- `vteam_operator_jobs_created_total`, `jobs_completed_total` (counters)
- `vteam_operator_watch_reconnections_total` (counter)

**Integration**: Start metrics server on :8081 in main.go

#### CR Exporter (New Component)
**File**: `components/cr-exporter/main.go`

Metrics:
- `vteam_session_phase_info` (gauge: namespace, project, session_name, phase)
- `vteam_session_repo_status` (gauge: 1=pushed, 0=abandoned)
- `vteam_rfe_step_status` (gauge)

**Deployment**: `components/manifests/cr-exporter.yaml` (reuses operator SA)

#### Runner Metrics
**File**: `components/runners/claude-code-runner/src/claude_code_runner/metrics.py`

Metrics:
- `vteam_runner_claude_requests_total` (counter: session, model, status)
- `vteam_runner_claude_request_duration_seconds` (histogram)
- `vteam_runner_claude_tokens_total` (counter: session, model, type=input/output)
- `vteam_runner_workspace_operations_total` (counter)

**Integration**: Start prometheus_client HTTP server on :8080, update Job template to expose port

### 2.3 Storage

#### Prometheus
**Files**:
- `components/manifests/prometheus/prometheus-deployment.yaml`
- `components/manifests/prometheus/prometheus-config.yaml`
- `components/manifests/prometheus/prometheus-rbac.yaml`

**Config**:
- 30-day retention, 30Gi PVC
- Resources: 512Mi-2Gi memory, 200m-1 CPU
- Scrape jobs: vteam-backend, vteam-operator, vteam-cr-exporter, vteam-runners (dynamic)

#### Recording Rules
**File**: `components/manifests/prometheus/rules/vteam-rules.yaml`

Pre-aggregated (5min intervals):
- `vteam:session_completion_rate:5m`
- `vteam:session_duration_avg:5m`
- `vteam:api_error_rate:5m`
- `vteam:active_sessions:current`
- `vteam:tokens_per_minute:5m`

#### Storage Sizing
- Raw metrics: 30 days, ~30Gi for 100 projects
- Growth: ~1Gi per 3-4 projects/month
- Future: Extend to 90d (~90Gi), Thanos (S3), or TimescaleDB

### 2.4 Backend API

#### Routes
**File**: `components/backend/routes.go`

```
/api/projects/:projectName/metrics/
  GET /dashboard - Pre-computed metrics
  GET /query - Custom PromQL query
  GET /query_range - Time-series data
  GET /stream - WebSocket live updates
```

All use `ValidateProjectContext()` middleware for RBAC.

#### Handlers
**Files**:
- `components/backend/handlers/metrics.go` - Main handlers
- `components/backend/handlers/metrics_ws.go` - WebSocket streaming

**Key Functions**:
- `GetDashboardMetrics()` - Queries 6 key metrics concurrently, returns JSON
- `QueryMetrics()` - Executes PromQL with project filter injection
- `QueryRangeMetrics()` - Time-series queries for charts
- `StreamMetrics()` - WebSocket streaming (5s updates)
- `injectProjectFilter()` - Adds `{project="name"}` to all queries

**Optimization**: 5-second cache for dashboard metrics

### 2.5 Frontend

#### API Layer
**File**: `components/frontend/src/services/api/metrics.ts`

Types: `DashboardMetrics`, `PrometheusQueryResult`, `PrometheusRangeResult`

API methods: `getDashboard()`, `query()`, `queryRange()`

#### React Query Hooks
**File**: `components/frontend/src/services/queries/metrics.ts`

Hooks:
- `useDashboardMetrics(project, refreshInterval=10s)` - Auto-refreshing dashboard data
- `useMetricsQuery(project, query, time)` - Custom PromQL queries
- `useMetricsRangeQuery(project, query, start, end, step)` - Time-series data

Query key factory: `metricsKeys.dashboard()`, `metricsKeys.query()`, etc.

Optimization: `staleTime: 5s`, `refetchInterval: 10s`, `refetchOnWindowFocus: false`

#### WebSocket Hook
**File**: `components/frontend/src/hooks/use-metrics-stream.ts`

`useMetricsStream(project, queries[])` - Returns live metric updates every 5s

#### Dashboard Page
**File**: `components/frontend/src/app/projects/[name]/metrics/page.tsx`

Components:
- `MetricCard` - Reusable card with icon, value, loading state
- Grid layouts for key metrics (4 cards), 24h stats (2 cards), trends (placeholder)

**Also create**:
- `loading.tsx` - Skeleton states
- `error.tsx` - Error boundary

### 2.6 Security

**RBAC**: All endpoints under `/api/projects/:project/metrics` with `ValidateProjectContext()`

**Metric Labels**: All metrics tagged with `project="namespace-name"`

**Query Filtering**: Automatic `{project="X"}` injection in all PromQL queries

**Endpoint Security**:
- Component `/metrics`: Cluster-internal only
- API endpoints: Require user auth + RBAC

### 2.7 Performance

**Backend**: 5-second cache for dashboard metrics (in-memory map with mutex)

**Recording Rules**: Pre-compute expensive queries every 30s

**Frontend**: React Query staleTime/refetch optimization

---

## 3. UX Design

### 3.1 Information Architecture

```
Dashboard Root
├── Overview - Health, activity, alerts
├── Business Metrics - User activity, adoption, success, cost
├── Operations - Infrastructure, performance, reliability, dependencies
└── Analytics - Model performance, workflows, behavior
```

### 3.2 Persona Defaults

**Manager**: Active users, sessions, success rate | 7-30d range | Trends | 30s refresh

**DevOps**: Errors, latency, health, queue | 1-6h range | Real-time gauges | 10s refresh

**Customization**: Drag-drop widgets, saved views, pinned metrics, custom alerts

### 3.3 Accessibility (WCAG 2.1 AA)

**Multi-modal indicators**: Color + icon + text + pattern

**Colorblind palette**: HSL colors (blue, orange, green, pink)

**Keyboard**: All interactive elements accessible, visible focus, logical tab order, arrow keys for charts

**Screen reader**: Semantic HTML, ARIA labels, chart descriptions, data table fallbacks

### 3.4 Responsive

**Mobile**: Essential metrics (4-6 cards), sparklines, bottom nav, pull-refresh

**Desktop**: Full features, 3-4 columns, interactive charts, advanced filters

### 3.5 Real-Time Strategy

| Type | Frequency | Method |
|------|-----------|--------|
| Active sessions, errors | <30s | WebSocket |
| Hourly aggregates | 1-5min | React Query poll |
| Daily metrics | 15-30min | React Query poll |
| Historical | On-demand | User-triggered |

**Staleness**: Show "Updated X ago" with refresh spinner

### 3.6 Alerts

**Severity**:
- Critical: In-app + email + push + Slack
- Error: In-app + email + push
- Warning: In-app + email
- Info: In-app

**Grouping**: Combine similar alerts (e.g., "45 session failures" not 45 individual)

**UI**: Notification center popover with bell icon, unread badge, scrollable list

---

## 4. Implementation Roadmap

### Phase 1: Foundation (Weeks 1-2)
- Add Prometheus client libraries
- Instrument backend, operator
- Deploy Prometheus (30d retention)
- Create recording rules
- Deploy CR Exporter

**Success**: Prometheus scraping all, metrics visible, rules producing data

### Phase 2: Backend API (Weeks 2-3)
- Implement `handlers/metrics.go`
- Add dashboard, query, query_range endpoints
- Project label filtering
- Backend caching (5s TTL)
- Unit tests

**Success**: Dashboard endpoint works, RBAC enforced, <500ms P95

### Phase 3: Frontend (Weeks 3-4)
- API service layer
- React Query hooks
- Dashboard page (4-6 cards)
- Loading/error states
- Mobile responsive

**Success**: Loads <2s, metrics display, mobile usable

### Phase 4: Advanced (Weeks 5-6)
- Instrument Python runner
- WebSocket streaming
- TimeSeriesChart component
- Time range selector
- Drill-down views

**Success**: Charts render, WebSocket <5s latency, time ranges work

### Phase 5: Polish (Weeks 6-7)
- More recording rules
- Optimize caching
- WCAG audit
- Accessibility testing
- Performance testing
- Documentation

**Success**: Lighthouse >90, <2s load, WCAG passes

### Phase 6: Validation (Weeks 7-8)
- Usability testing (6-8 users)
- Critical fixes
- Production deploy

**Success**: >80% task completion, >4/5 confidence, zero critical issues

---

## 5. Research & Validation

### 5.1 User Research

**Managers**: Resource decisions, value assessment, investment triggers

**DevOps**: Health definition, incident analysis, daily checks

### 5.2 Usability Testing

**Manager Scenarios**:
1. VP asks about adoption - 5 min to report
2. Team wants budget - what data supports/refutes

**DevOps Scenarios**:
1. Slow response times - diagnose
2. 2 AM page - what to check first

**Success**: >85% completion, >4/5 confidence, <60s to insight

### 5.3 Analytics

Track: Viewed vs ignored metrics, session duration, return frequency, filter usage

### 5.4 Accessibility

**Automated**: `npm run test:a11y` (axe-core)

**Manual**: Keyboard nav, screen reader, 200% zoom, high contrast

---

## 6. Success Metrics

### Usage
- Daily Active Users: 80% platform users
- Session Duration: 2-5min (managers), 30s-2min (DevOps)
- Time to Insight: <60s
- Task Completion: >85%
- Decision Confidence: >4/5

### Technical
- Load Time: <2s P95
- API Response: <500ms P95
- Error Rate: <0.5%
- Accessibility: >90
- WCAG: 100% AA

### Business Impact
- MTTR: -30% (3mo)
- User Issues: -20% (6mo)
- Adoption: +15% (6mo)

---

## Appendices

### A. Resources
- Prometheus: 512Mi-2Gi mem, 200m-1 CPU, 30Gi storage
- CR Exporter: 64-128Mi mem, 50-100m CPU
- Total: ~1-2.5Gi mem, ~300m-1.1 CPU, ~30Gi storage

### B. Future Expansion
If >30d retention needed:
1. Extend Prometheus to 90d (~90Gi)
2. Add Thanos (S3/object storage)
3. Add TimescaleDB (queryable historical)

### C. File Paths

**Backend**:
- `components/backend/metrics/metrics.go`
- `components/backend/metrics/middleware.go`
- `components/backend/handlers/metrics.go`
- `components/backend/handlers/metrics_ws.go`
- `components/backend/routes.go`

**Operator**:
- `components/operator/internal/metrics/metrics.go`
- `components/operator/main.go`

**CR Exporter**:
- `components/cr-exporter/main.go`
- `components/manifests/cr-exporter.yaml`

**Frontend**:
- `components/frontend/src/services/api/metrics.ts`
- `components/frontend/src/services/queries/metrics.ts`
- `components/frontend/src/hooks/use-metrics-stream.ts`
- `components/frontend/src/app/projects/[name]/metrics/page.tsx`
- `components/frontend/src/app/projects/[name]/metrics/loading.tsx`
- `components/frontend/src/app/projects/[name]/metrics/error.tsx`

**Kubernetes**:
- `components/manifests/prometheus/prometheus-deployment.yaml`
- `components/manifests/prometheus/prometheus-config.yaml`
- `components/manifests/prometheus/prometheus-rbac.yaml`
- `components/manifests/prometheus/rules/vteam-rules.yaml`
