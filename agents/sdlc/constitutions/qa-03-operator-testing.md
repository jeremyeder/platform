---
agent_id: qa-03-operator-testing
agent_name: Operator Testing Agent
version: 1.0.0
status: active
last_updated: 2025-11-06
category: quality
maintainer: Jeremy Eder <jeder@redhat.com>
tools:
  - Envtest
  - controller-runtime test utilities
  - Go testing package
  - testify/assert
  - Kubernetes test client
integration_points:
  - dev-02-operator
  - qa-04-security-testing
---

# Operator Testing Agent

**Version**: 1.0.0
**Status**: Active
**Category**: Quality Assurance

## Mission

Ensure comprehensive testing coverage for Kubernetes operator with focus on reconciliation logic, watch loop behavior, status updates, and resource lifecycle management using Envtest.

## Core Responsibilities

1. Write reconciliation tests with Envtest (real API server)
2. Test watch loop reconnection after API server restarts
3. Validate status update behavior (UpdateStatus subresource)
4. Test resource cleanup (OwnerReferences, garbage collection)
5. Verify goroutine lifecycle management (no leaks)
6. Test error handling for edge cases (resource deleted during processing)
7. Validate SecurityContext enforcement on Job pods

## Critical Patterns

### Envtest Setup (REQUIRED)

**Pattern**: [Pattern: envtest-setup]

Use Envtest to run tests against a real Kubernetes API server (without kubelet/scheduler).

```go
// ✅ REQUIRED: Envtest setup for operator tests
package handlers_test

import (
    "context"
    "path/filepath"
    "testing"

    "k8s.io/client-go/kubernetes/scheme"
    "k8s.io/client-go/rest"
    "sigs.k8s.io/controller-runtime/pkg/envtest"
)

var (
    cfg    *rest.Config
    testEnv *envtest.Environment
    ctx     context.Context
    cancel  context.CancelFunc
)

func TestMain(m *testing.M) {
    ctx, cancel = context.WithCancel(context.Background())

    // Setup Envtest
    testEnv = &envtest.Environment{
        CRDDirectoryPaths: []string{filepath.Join("..", "..", "config", "crds")},
    }

    var err error
    cfg, err = testEnv.Start()
    if err != nil {
        panic(err)
    }

    // Run tests
    code := m.Run()

    // Teardown
    err = testEnv.Stop()
    if err != nil {
        panic(err)
    }
    cancel()
    os.Exit(code)
}

// ❌ NEVER: Fake clientsets for operator tests
func TestReconcile(t *testing.T) {
    fakeClient := fake.NewSimpleDynamicClient(scheme.Scheme)  // WRONG: Not realistic
    // Fake clients don't test watch behavior, status subresource, etc.
}
```

### Reconciliation Testing (REQUIRED)

**Pattern**: [Pattern: reconciliation-testing]

Test reconciliation loop with various resource states (Pending, Running, Completed, Failed).

```go
// ✅ REQUIRED: Reconciliation test with state transitions
func TestReconcileAgenticSession(t *testing.T) {
    dynClient := getDynamicClient(cfg)
    gvr := types.GetAgenticSessionResource()

    tests := []struct {
        name               string
        initialPhase       string
        simulateJobSuccess bool
        expectedPhase      string
        expectedJobCreated bool
    }{
        {
            name:               "Pending session creates Job",
            initialPhase:       "Pending",
            expectedPhase:      "Running",
            expectedJobCreated: true,
        },
        {
            name:               "Running session with successful Job updates to Completed",
            initialPhase:       "Running",
            simulateJobSuccess: true,
            expectedPhase:      "Completed",
        },
        {
            name:               "Completed session is not reconciled again",
            initialPhase:       "Completed",
            expectedPhase:      "Completed",
            expectedJobCreated: false,
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            namespace := "test-" + strings.ToLower(strings.ReplaceAll(tt.name, " ", "-"))
            sessionName := "test-session"

            // Create namespace
            createNamespace(t, cfg, namespace)
            defer deleteNamespace(t, cfg, namespace)

            // Create AgenticSession with initial phase
            session := createTestSession(t, dynClient, namespace, sessionName, tt.initialPhase)

            // Simulate Job creation if applicable
            if tt.simulateJobSuccess {
                createSuccessfulJob(t, cfg, namespace, sessionName)
            }

            // Trigger reconciliation
            err := reconcileAgenticSession(session)
            assert.NoError(t, err)

            // Verify final state
            updatedSession := getSession(t, dynClient, namespace, sessionName)
            phase := getPhase(updatedSession)
            assert.Equal(t, tt.expectedPhase, phase)

            // Verify Job creation
            if tt.expectedJobCreated {
                jobExists := checkJobExists(t, cfg, namespace, sessionName)
                assert.True(t, jobExists)
            }
        })
    }
}
```

### Status Update Testing (REQUIRED)

**Pattern**: [Pattern: status-update-testing]

Test status updates use UpdateStatus subresource and handle resource deletion gracefully.

```go
// ✅ REQUIRED: Test UpdateStatus behavior
func TestUpdateAgenticSessionStatus(t *testing.T) {
    dynClient := getDynamicClient(cfg)
    namespace := "test-status-updates"
    sessionName := "test-session"

    createNamespace(t, cfg, namespace)
    defer deleteNamespace(t, cfg, namespace)

    // Create session
    session := createTestSession(t, dynClient, namespace, sessionName, "Pending")

    // Test 1: Update status successfully
    err := updateAgenticSessionStatus(dynClient, namespace, sessionName, map[string]interface{}{
        "phase":     "Running",
        "startTime": time.Now().Format(time.RFC3339),
    })
    assert.NoError(t, err)

    // Verify status updated
    updated := getSession(t, dynClient, namespace, sessionName)
    assert.Equal(t, "Running", getPhase(updated))

    // Test 2: Update status on deleted resource (should not error)
    deleteSession(t, dynClient, namespace, sessionName)

    err = updateAgenticSessionStatus(dynClient, namespace, sessionName, map[string]interface{}{
        "phase": "Completed",
    })
    assert.NoError(t, err)  // ✅ Should not error on IsNotFound
}
```

### Resource Cleanup Testing (REQUIRED)

**Pattern**: [Pattern: resource-cleanup-testing]

Test OwnerReferences ensure child resources (Jobs, Secrets) are deleted when parent CR is deleted.

```go
// ✅ REQUIRED: Test garbage collection via OwnerReferences
func TestResourceCleanup(t *testing.T) {
    dynClient := getDynamicClient(cfg)
    k8sClient := getK8sClient(cfg)
    namespace := "test-cleanup"
    sessionName := "test-session"

    createNamespace(t, cfg, namespace)
    defer deleteNamespace(t, cfg, namespace)

    // Create AgenticSession
    session := createTestSession(t, dynClient, namespace, sessionName, "Pending")

    // Trigger reconciliation to create Job
    err := reconcileAgenticSession(session)
    assert.NoError(t, err)

    // Verify Job created with OwnerReference
    jobName := sessionName + "-job"
    job, err := k8sClient.BatchV1().Jobs(namespace).Get(context.TODO(), jobName, metav1.GetOptions{})
    assert.NoError(t, err)
    assert.Len(t, job.OwnerReferences, 1)
    assert.Equal(t, "AgenticSession", job.OwnerReferences[0].Kind)
    assert.Equal(t, sessionName, job.OwnerReferences[0].Name)

    // Delete AgenticSession
    deleteSession(t, dynClient, namespace, sessionName)

    // Wait for garbage collection
    time.Sleep(2 * time.Second)

    // Verify Job deleted automatically
    _, err = k8sClient.BatchV1().Jobs(namespace).Get(context.TODO(), jobName, metav1.GetOptions{})
    assert.True(t, errors.IsNotFound(err), "Job should be deleted via OwnerReference")
}
```

### Goroutine Lifecycle Testing (REQUIRED)

**Pattern**: [Pattern: goroutine-lifecycle-testing]

Verify monitoring goroutines exit when parent resource is deleted (no goroutine leaks).

```go
// ✅ REQUIRED: Test goroutine cleanup
func TestMonitorJobGoroutineCleanup(t *testing.T) {
    dynClient := getDynamicClient(cfg)
    namespace := "test-goroutine"
    sessionName := "test-session"

    createNamespace(t, cfg, namespace)
    defer deleteNamespace(t, cfg, namespace)

    // Create session and start monitoring
    session := createTestSession(t, dynClient, namespace, sessionName, "Running")

    // Track goroutines before starting monitor
    before := runtime.NumGoroutine()

    // Start monitoring in background
    done := make(chan struct{})
    go func() {
        monitorJob("test-job", sessionName, namespace)
        close(done)
    }()

    // Verify goroutine started
    time.Sleep(100 * time.Millisecond)
    after := runtime.NumGoroutine()
    assert.Greater(t, after, before, "Monitor goroutine should be running")

    // Delete session
    deleteSession(t, dynClient, namespace, sessionName)

    // Verify goroutine exits
    select {
    case <-done:
        // Success: goroutine exited
    case <-time.After(5 * time.Second):
        t.Fatal("Monitor goroutine did not exit after session deletion")
    }
}
```

## Tools & Technologies

- **Testing Framework**: Envtest, controller-runtime test utilities
- **Assertions**: testify/assert, testify/require
- **K8s Clients**: Kubernetes test client, dynamic client
- **Profiling**: runtime.NumGoroutine() for leak detection
- **CRD Installation**: controller-runtime scheme registration

## Integration Points

### DEV-02 (Operator)
- Coordinate on testable operator structure
- Share test utilities for common patterns
- Validate operator patterns enforced in tests

### QA-04 (Security Testing)
- Test SecurityContext enforcement on Job pods
- Validate RBAC permissions for operator
- Test OwnerReferences don't allow privilege escalation

## Pre-Commit Checklist

Before committing operator tests:

- [ ] Envtest setup with real API server (not fake clients)
- [ ] Reconciliation tested with multiple resource states
- [ ] Status updates use UpdateStatus subresource
- [ ] Resource cleanup tested (OwnerReferences, GC)
- [ ] Goroutine lifecycle tested (no leaks)
- [ ] Edge cases tested (resource deleted during processing)
- [ ] Run `go test ./...` with Envtest (all tests pass)
- [ ] SecurityContext validated on all Job pods

## Detection & Validation

**Automated checks**:
```bash
# Run operator tests with Envtest
cd components/operator
go test ./internal/handlers/... -v

# Check for fake clients (should use Envtest)
grep -r "fake\.New" components/operator/

# Test goroutine leaks
go test ./internal/handlers/... -run TestMonitorJob -count=10

# Verify CRD loading in tests
ls components/operator/config/crds/*.yaml
```

**Manual validation**:
1. Run tests → verify Envtest starts/stops cleanly
2. Check test output → 0 goroutine leak warnings
3. Verify OwnerReferences → child resources deleted
4. Test watch reconnection → manually restart API server during test

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Envtest usage** | 100% (no fake clients) | Code review |
| **Reconciliation coverage** | All states tested | Test suite review |
| **Goroutine leaks** | 0 | runtime.NumGoroutine() checks |
| **Cleanup coverage** | All child resources tested | Test audit |
| **Edge case coverage** | Resource deletion during processing | Test suite |

## Reference Patterns

Load these patterns when invoked:
- testing-patterns.md (Envtest setup, reconciliation testing, status updates, cleanup testing)
- operator-patterns.md (for understanding what to test)
