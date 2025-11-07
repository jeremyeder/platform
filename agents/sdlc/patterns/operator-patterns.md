# Operator Patterns

**Version**: 1.0.0
**Last Updated**: 2025-11-06
**Scope**: Kubernetes operator development for Ambient Code Platform

Critical patterns for operator development extracted from CLAUDE.md.

---

## Pattern: type-safe-unstructured-access

**Pattern ID**: type-safe-unstructured-access
**Version**: 1.0
**Status**: Stable
**Category**: Kubernetes / Type Safety

**Location**: components/operator/internal/handlers/sessions.go::handleAgenticSessionEvent
**Grep Anchor**: `unstructured\.NestedString\|unstructured\.NestedMap`

**Description**:
Always use `unstructured.Nested*` helpers for accessing fields in unstructured Kubernetes objects. Never use direct type assertions without checking the three-value return (value, found, error).

**Implementation**:
```go
func handleAgenticSessionEvent(obj *unstructured.Unstructured) error {
    name := obj.GetName()
    namespace := obj.GetNamespace()

    // ✅ Correct: Use Nested helpers with three-value return
    spec, found, err := unstructured.NestedMap(obj.Object, "spec")
    if err != nil {
        return fmt.Errorf("failed to get spec: %w", err)
    }
    if !found {
        return fmt.Errorf("spec not found in %s/%s", namespace, name)
    }

    prompt, found, err := unstructured.NestedString(spec, "prompt")
    if err != nil || !found {
        return fmt.Errorf("prompt field invalid or missing")
    }

    timeout, found, err := unstructured.NestedInt64(spec, "timeout")
    if err != nil || !found {
        timeout = 3600 // default value
    }

    // Proceed with typed values
    return createJobForSession(name, namespace, prompt, timeout)
}
```

**Anti-Patterns**:
```go
// ❌ NEVER use direct type assertion without checking
spec := obj.Object["spec"].(map[string]interface{}) // WRONG: Panics if missing or wrong type
prompt := spec["prompt"].(string)                     // WRONG: Panics if missing

// ❌ NEVER ignore 'found' or 'err' returns
prompt, _, _ := unstructured.NestedString(spec, "prompt") // WRONG: Silent failure
```

**Detection**:
- ✅ Correct: `grep -r "unstructured\.Nested" components/operator/`
- ❌ Wrong: `grep -r 'Object\[".*"\]\.\((' components/operator/`

**Related Patterns**: [Pattern: error-handling-no-panics]

**Change History**: v1.0 (2025-11-06): Initial from CLAUDE.md

---

## Pattern: ownerreferences-lifecycle

**Pattern ID**: ownerreferences-lifecycle
**Version**: 1.0
**Status**: Stable
**Category**: Kubernetes / Resource Management

**Location**: components/operator/internal/handlers/sessions.go::createJobForSession
**Grep Anchor**: `OwnerReferences.*Controller.*boolPtr\(true\)`

**Description**:
Always set OwnerReferences on child resources (Jobs, Secrets, PVCs, Services) with Controller: true for automatic garbage collection. Never set BlockOwnerDeletion (causes permission issues).

**Implementation**:
```go
func createJobForSession(sessionName, namespace string, sessionUID types.UID) error {
    ownerRef := v1.OwnerReference{
        APIVersion: "vteam.ambient-code/v1alpha1",
        Kind:       "AgenticSession",
        Name:       sessionName,
        UID:        sessionUID,
        Controller: boolPtr(true),
        // BlockOwnerDeletion: NEVER set this (permission issues)
    }

    job := &batchv1.Job{
        ObjectMeta: v1.ObjectMeta{
            Name:            fmt.Sprintf("%s-job", sessionName),
            Namespace:       namespace,
            OwnerReferences: []v1.OwnerReference{ownerRef},
        },
        // ... job spec
    }

    _, err := K8sClient.BatchV1().Jobs(namespace).Create(ctx, job, v1.CreateOptions{})
    return err
}

func boolPtr(b bool) *bool {
    return &b
}
```

**Anti-Patterns**:
```go
// ❌ NEVER create child resources without OwnerReferences
job := &batchv1.Job{
    ObjectMeta: v1.ObjectMeta{
        Name: jobName,
        Namespace: ns,
        // WRONG: No OwnerReferences - manual cleanup required, resource leaks
    },
}

// ❌ NEVER set BlockOwnerDeletion
ownerRef := v1.OwnerReference{
    // ...
    BlockOwnerDeletion: boolPtr(true), // WRONG: Causes multi-tenant permission issues
}
```

**Detection**:
- ✅ All child resources have OwnerReferences
- ❌ `grep -r "BlockOwnerDeletion" components/operator/` (should return no results)

**Validation**: Delete parent CR, verify all child resources deleted automatically

**Related Patterns**: [Pattern: goroutine-lifecycle-management]

**Change History**: v1.0 (2025-11-06): Initial from CLAUDE.md

---

## Pattern: watch-loop-reconnection

**Pattern ID**: watch-loop-reconnection
**Version**: 1.0
**Status**: Stable
**Category**: Kubernetes / Resilience

**Location**: components/operator/internal/handlers/sessions.go::WatchAgenticSessions
**Grep Anchor**: `for \{.*watcher.*Watch\(ctx`

**Description**:
Watch loops must automatically reconnect on channel closure or error. Use infinite for loop with error handling and backoff. Always call watcher.Stop() before creating new watcher.

**Implementation**:
```go
func WatchAgenticSessions() {
    gvr := types.GetAgenticSessionResource()

    for { // Infinite loop for automatic reconnection
        watcher, err := config.DynamicClient.Resource(gvr).Watch(ctx, v1.ListOptions{})
        if err != nil {
            log.Printf("Failed to create watcher: %v", err)
            time.Sleep(5 * time.Second) // Backoff before retry
            continue
        }

        log.Println("Watching AgenticSessions for events...")

        for event := range watcher.ResultChan() {
            switch event.Type {
            case watch.Added, watch.Modified:
                obj := event.Object.(*unstructured.Unstructured)
                if err := handleEvent(obj); err != nil {
                    log.Printf("Error handling event: %v", err)
                }
            case watch.Deleted:
                log.Printf("Session deleted: %s", event.Object.(*unstructured.Unstructured).GetName())
            }
        }

        log.Println("Watch channel closed, restarting...")
        watcher.Stop()
        time.Sleep(2 * time.Second) // Brief pause before reconnect
    }
}
```

**Anti-Patterns**:
```go
// ❌ NEVER watch without reconnection logic
watcher, _ := client.Resource(gvr).Watch(ctx, v1.ListOptions{})
for event := range watcher.ResultChan() {
    // WRONG: When channel closes, watch stops forever
}

// ❌ NEVER panic on watch errors
watcher, err := client.Resource(gvr).Watch(ctx, v1.ListOptions{})
if err != nil {
    panic(err) // WRONG: Crashes operator
}
```

**Detection**:
- ✅ All watch functions have `for { ... watcher := ... for event := range ... }`
- ❌ Watch loops without outer for loop

**Validation**: Kill API server connection, verify operator reconnects within 10s

**Related Patterns**: [Pattern: reconciliation-idempotency]

**Change History**: v1.0 (2025-11-06): Initial from CLAUDE.md

---

## Pattern: status-subresource-updates

**Pattern ID**: status-subresource-updates
**Version**: 1.0
**Status**: Stable
**Category**: Kubernetes / CRD Management

**Location**: components/operator/internal/handlers/sessions.go::updateAgenticSessionStatus
**Grep Anchor**: `UpdateStatus\(ctx, obj`

**Description**:
Always update CR status using the UpdateStatus subresource, never the main resource. Handle IsNotFound errors gracefully (resource may be deleted during update).

**Implementation**:
```go
func updateAgenticSessionStatus(namespace, name string, updates map[string]interface{}) error {
    gvr := types.GetAgenticSessionResource()

    obj, err := config.DynamicClient.Resource(gvr).Namespace(namespace).Get(ctx, name, v1.GetOptions{})
    if errors.IsNotFound(err) {
        log.Printf("Resource %s/%s deleted, skipping status update", namespace, name)
        return nil // Not an error - resource was deleted
    }
    if err != nil {
        return fmt.Errorf("failed to get resource: %w", err)
    }

    // Initialize status if needed
    if obj.Object["status"] == nil {
        obj.Object["status"] = make(map[string]interface{})
    }

    status := obj.Object["status"].(map[string]interface{})
    for k, v := range updates {
        status[k] = v
    }

    // Use UpdateStatus subresource (requires /status permission in RBAC)
    _, err = config.DynamicClient.Resource(gvr).Namespace(namespace).UpdateStatus(ctx, obj, v1.UpdateOptions{})
    if errors.IsNotFound(err) {
        return nil // Resource deleted during update
    }
    return err
}
```

**Anti-Patterns**:
```go
// ❌ NEVER update status via main resource
_, err := client.Resource(gvr).Namespace(ns).Update(ctx, obj, v1.UpdateOptions{})
// WRONG: Can cause version conflicts, doesn't use status subresource

// ❌ NEVER fail on IsNotFound during status update
if errors.IsNotFound(err) {
    return err // WRONG: Resource deletion is not an error
}
```

**Detection**:
- ✅ `grep -r "UpdateStatus" components/operator/`
- ❌ Status updates using `.Update(` instead of `.UpdateStatus(`

**Validation**: Concurrent delete+update should not error

**Related Patterns**: [Pattern: reconciliation-idempotency]

**Change History**: v1.0 (2025-11-06): Initial from CLAUDE.md

---

## Pattern: goroutine-lifecycle-management

**Pattern ID**: goroutine-lifecycle-management
**Version**: 1.0
**Status**: Stable
**Category**: Go / Resource Management

**Location**: components/operator/internal/handlers/sessions.go::monitorJob
**Grep Anchor**: `go monitorJob\(`

**Description**:
Goroutines monitoring resources must exit when parent resource is deleted. Check parent existence in monitoring loop. Use context cancellation for cleanup.

**Implementation**:
```go
func handleEvent(obj *unstructured.Unstructured) error {
    name := obj.GetName()
    namespace := obj.GetNamespace()

    // Create Job for session
    jobName := fmt.Sprintf("%s-job", name)
    if err := createJobForSession(name, namespace); err != nil {
        return err
    }

    // Start monitoring goroutine
    go monitorJob(jobName, name, namespace)
    return nil
}

func monitorJob(jobName, sessionName, namespace string) {
    ticker := time.NewTicker(5 * time.Second)
    defer ticker.Stop()

    for range ticker.C {
        // 1. Check if parent session still exists (exit if deleted)
        gvr := types.GetAgenticSessionResource()
        _, err := config.DynamicClient.Resource(gvr).Namespace(namespace).Get(ctx, sessionName, v1.GetOptions{})
        if errors.IsNotFound(err) {
            log.Printf("Session %s deleted, stopping Job monitor", sessionName)
            return // Exit goroutine - parent is gone
        }

        // 2. Check Job status
        job, err := config.K8sClient.BatchV1().Jobs(namespace).Get(ctx, jobName, v1.GetOptions{})
        if errors.IsNotFound(err) {
            return // Job deleted, exit
        }

        // 3. Update session status based on Job
        if job.Status.Succeeded > 0 {
            updateAgenticSessionStatus(namespace, sessionName, map[string]interface{}{
                "phase":          "Completed",
                "completionTime": time.Now().Format(time.RFC3339),
            })
            return // Job completed, exit goroutine
        }

        if job.Status.Failed > 0 {
            updateAgenticSessionStatus(namespace, sessionName, map[string]interface{}{
                "phase":   "Error",
                "message": "Job failed",
            })
            return
        }
    }
}
```

**Anti-Patterns**:
```go
// ❌ NEVER run infinite goroutines without exit condition
go func() {
    for {
        monitorResource() // WRONG: Never exits, goroutine leak
        time.Sleep(5 * time.Second)
    }
}()

// ❌ NEVER ignore parent deletion in monitor
func monitorJob(jobName, sessionName, namespace string) {
    for {
        job, _ := getJob(jobName)
        // WRONG: No check if parent session still exists
        updateStatus(sessionName, job.Status)
        time.Sleep(5 * time.Second)
    }
}
```

**Detection**:
- ✅ All `go` statements have corresponding exit conditions
- ❌ Infinite loops in goroutines without parent existence check

**Validation**: Delete parent CR, verify monitoring goroutine exits (check memory usage)

**Related Patterns**: [Pattern: ownerreferences-lifecycle]

**Change History**: v1.0 (2025-11-06): Initial from CLAUDE.md

---

## Pattern: securitycontext-job-pods

**Pattern ID**: securitycontext-job-pods
**Version**: 1.0
**Status**: Stable
**Category**: Security / Kubernetes

**Location**: components/operator/internal/handlers/sessions.go::createJobForSession
**Grep Anchor**: `SecurityContext.*AllowPrivilegeEscalation`

**Description**:
Always set SecurityContext on Job pods to prevent privilege escalation. Drop all capabilities, use non-root user, set read-only root filesystem when possible.

**Implementation**:
```go
job := &batchv1.Job{
    Spec: batchv1.JobSpec{
        Template: corev1.PodTemplateSpec{
            Spec: corev1.PodSpec{
                Containers: []corev1.Container{
                    {
                        Name:  "claude-runner",
                        Image: "quay.io/ambient_code/vteam_claude_runner:latest",
                        SecurityContext: &corev1.SecurityContext{
                            AllowPrivilegeEscalation: boolPtr(false),
                            ReadOnlyRootFilesystem:   boolPtr(false), // Set to true if no temp files needed
                            RunAsNonRoot:             boolPtr(true),
                            Capabilities: &corev1.Capabilities{
                                Drop: []corev1.Capability{"ALL"},
                            },
                        },
                    },
                },
            },
        },
    },
}
```

**Anti-Patterns**:
```go
// ❌ NEVER omit SecurityContext
Container{
    Name: "runner",
    Image: "...",
    // WRONG: No SecurityContext - allows privilege escalation
}

// ❌ NEVER allow privilege escalation
SecurityContext: &corev1.SecurityContext{
    AllowPrivilegeEscalation: boolPtr(true), // WRONG: Security risk
}
```

**Detection**:
- ✅ All Job specs have SecurityContext with AllowPrivilegeEscalation: false
- ❌ `grep -r "Containers.*{" components/operator/ | grep -v "SecurityContext"`

**Validation**: Create Job, inspect pod: `kubectl get pod -o yaml` should show SecurityContext

**Related Patterns**: [Pattern: ownerreferences-lifecycle]

**Change History**: v1.0 (2025-11-06): Initial from CLAUDE.md
