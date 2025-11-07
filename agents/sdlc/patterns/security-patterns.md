# Security Patterns

**Version**: 1.0.0
**Last Updated**: 2025-11-06
**Scope**: Cross-cutting security patterns for all components

---

## Pattern: multi-tenant-namespace-isolation

**Pattern ID**: multi-tenant-namespace-isolation
**Version**: 1.0
**Status**: Stable
**Category**: Security / Multi-Tenancy

**Description**:
Enforce strict namespace boundaries. Users can only access resources in namespaces they have RBAC permissions for. Backend validates project access, operator restricts operations to session namespace.

**Implementation**:
```go
// Backend: ValidateProjectContext middleware
func ValidateProjectContext() gin.HandlerFunc {
    return func(c *gin.Context) {
        project := c.Param("projectName")
        reqK8s, _ := GetK8sClientsForRequest(c)

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
            c.JSON(http.StatusForbidden, gin.H{"error": "Access denied"})
            c.Abort()
            return
        }

        c.Next()
    }
}
```

**Anti-Patterns**:
```go
// ❌ NEVER skip namespace validation
func ListSessions(c *gin.Context) {
    project := c.Param("projectName")
    // WRONG: No validation if user can access this namespace
    list, _ := reqDyn.Resource(gvr).Namespace(project).List(ctx, v1.ListOptions{})
}
```

**Detection**:
- ✅ All project endpoints use ValidateProjectContext middleware
- ❌ Cross-namespace resource creation in operator

**Validation**: Integration test with restricted user attempting cross-namespace access should return 403

**Related Patterns**: [Pattern: rbac-enforcement-api-layer], [Pattern: user-scoped-k8s-client-creation]

**Change History**: v1.0 (2025-11-06): Initial from CLAUDE.md

---

## Pattern: secret-management-handlers

**Pattern ID**: secret-management-handlers
**Version**: 1.0
**Status**: Stable
**Category**: Security / Credentials

**Description**:
Secrets must be created with OwnerReferences, minimal RBAC permissions, and proper encoding. Never log Secret data. Use ProjectSettings CR for API key management.

**Implementation**:
```go
func createRunnerSecret(sessionName, namespace string, anthropicKey string) error {
    secret := &corev1.Secret{
        ObjectMeta: v1.ObjectMeta{
            Name:      fmt.Sprintf("%s-secret", sessionName),
            Namespace: namespace,
            OwnerReferences: []v1.OwnerReference{ownerRef}, // Auto-cleanup
        },
        Type: corev1.SecretTypeOpaque,
        StringData: map[string]string{
            "ANTHROPIC_API_KEY": anthropicKey, // Auto-encodes to base64
        },
    }

    _, err := K8sClient.CoreV1().Secrets(namespace).Create(ctx, secret, v1.CreateOptions{})
    if err != nil {
        log.Printf("Failed to create secret (len=%d chars)", len(anthropicKey)) // Log length not content
        return err
    }

    return nil
}
```

**Anti-Patterns**:
```go
// ❌ NEVER log secret values
log.Printf("Creating secret with key: %s", anthropicKey) // WRONG

// ❌ NEVER create secrets without OwnerReferences
secret := &corev1.Secret{
    ObjectMeta: v1.ObjectMeta{
        Name: "my-secret",
        // WRONG: No OwnerReferences - manual cleanup required
    },
}
```

**Detection**:
- ✅ All Secret creation has OwnerReferences
- ❌ `grep -r 'log.*[Kk]ey.*%s\|log.*[Ss]ecret.*%s' components/`

**Related Patterns**: [Pattern: token-security-and-redaction], [Pattern: ownerreferences-lifecycle]

**Change History**: v1.0 (2025-11-06): Initial from CLAUDE.md

---

## Pattern: input-sanitization-xss-prevention

**Pattern ID**: input-sanitization-xss-prevention
**Version**: 1.0
**Status**: Stable
**Category**: Security / Input Handling

**Description**:
Sanitize user input on both backend and frontend. Escape HTML in user-provided strings. Use React's JSX for safe rendering (auto-escapes). Validate URLs before processing.

**Implementation**:
```go
// Backend: Sanitize prompt before storage
import "html"

func sanitizePrompt(prompt string) string {
    // Remove null bytes
    prompt = strings.ReplaceAll(prompt, "\x00", "")
    // Trim whitespace
    prompt = strings.TrimSpace(prompt)
    // Escape HTML (prevent stored XSS)
    prompt = html.EscapeString(prompt)
    return prompt
}

func CreateSession(c *gin.Context) {
    var spec AgenticSessionSpec
    if err := c.ShouldBindJSON(&spec); err != nil {
        c.JSON(400, gin.H{"error": "Invalid input"})
        return
    }

    spec.Prompt = sanitizePrompt(spec.Prompt)
    // Proceed with sanitized input
}
```

```tsx
// Frontend: React auto-escapes in JSX (safe by default)
export function SessionCard({ session }) {
  // ✅ Safe: React automatically escapes {session.name}
  return <div className="card">{session.name}</div>

  // For cases requiring HTML rendering, use DOMPurify library
}
```

**Anti-Patterns**:
```go
// ❌ NEVER store unsanitized user input
func CreateSession(c *gin.Context) {
    c.BindJSON(&spec)
    // WRONG: No sanitization, stored as-is
    createCR(spec)
}
```

**Detection**:
- ✅ All user input sanitized before storage
- ❌ User content rendered without escaping

**Validation**: Submit `<script>alert('XSS')</script>` in prompt field, verify it's escaped/sanitized in storage and display

**Related Patterns**: [Pattern: input-validation-and-sanitization]

**Change History**: v1.0 (2025-11-06): Initial from CLAUDE.md
