# Testing Patterns

**Version**: 1.0.0
**Last Updated**: 2025-11-06
**Scope**: Testing patterns for backend, frontend, and operator

---

## Pattern: table-driven-tests-go

**Pattern ID**: table-driven-tests-go
**Version**: 1.0
**Status**: Stable
**Category**: Testing / Go

**Description**:
Use table-driven tests with subtests for comprehensive test coverage in Go. Each test case should have descriptive name, input, and expected output.

**Implementation**:
```go
func TestCreateSession(t *testing.T) {
    tests := []struct {
        name           string
        spec           AgenticSessionSpec
        expectedStatus int
        expectedError  string
    }{
        {
            name: "valid session creation",
            spec: AgenticSessionSpec{
                Prompt: "Test prompt",
                Repos:  []Repo{{Input: RepoInput{URL: "https://github.com/test/repo", Branch: "main"}}},
            },
            expectedStatus: http.StatusCreated,
        },
        {
            name: "missing prompt",
            spec: AgenticSessionSpec{
                Repos: []Repo{{Input: RepoInput{URL: "https://github.com/test/repo", Branch: "main"}}},
            },
            expectedStatus: http.StatusBadRequest,
            expectedError:  "prompt is required",
        },
        {
            name: "invalid repo URL",
            spec: AgenticSessionSpec{
                Prompt: "Test",
                Repos:  []Repo{{Input: RepoInput{URL: "not-a-url", Branch: "main"}}},
            },
            expectedStatus: http.StatusBadRequest,
            expectedError:  "invalid git URL",
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            // Setup
            w := httptest.NewRecorder()
            c, _ := gin.CreateTestContext(w)

            body, _ := json.Marshal(tt.spec)
            c.Request = httptest.NewRequest("POST", "/api/projects/test/agentic-sessions", bytes.NewReader(body))

            // Execute
            CreateSession(c)

            // Assert
            assert.Equal(t, tt.expectedStatus, w.Code)
            if tt.expectedError != "" {
                var response map[string]string
                json.Unmarshal(w.Body.Bytes(), &response)
                assert.Contains(t, response["error"], tt.expectedError)
            }
        })
    }
}
```

**Anti-Patterns**:
```go
// ❌ NEVER write separate test functions for each case
func TestCreateSessionValid(t *testing.T) { }
func TestCreateSessionMissingPrompt(t *testing.T) { }
func TestCreateSessionInvalidURL(t *testing.T) { }
// WRONG: Hard to maintain, lots of duplication

// ❌ NEVER skip test names in table tests
tests := []struct {
    spec AgenticSessionSpec
    want int
}{
    {validSpec, 201}, // WRONG: No name, unclear what's being tested
}
```

**Detection**:
- ✅ Test files use `tests := []struct` pattern
- ❌ Many similar test functions without table structure

**Related Patterns**: [Pattern: mock-k8s-clients-go]

**Change History**: v1.0 (2025-11-06): Initial from CLAUDE.md

---

## Pattern: mock-k8s-clients-go

**Pattern ID**: mock-k8s-clients-go
**Version**: 1.0
**Status**: Stable
**Category**: Testing / Mocking

**Description**:
Use testify/mock for mocking Kubernetes clients in unit tests. Integration tests should use real clients with kind or test namespaces.

**Implementation**:
```go
import (
    "github.com/stretchr/testify/mock"
    "k8s.io/client-go/dynamic"
)

type MockDynamicClient struct {
    mock.Mock
}

func (m *MockDynamicClient) Resource(gvr schema.GroupVersionResource) dynamic.NamespaceableResourceInterface {
    args := m.Called(gvr)
    return args.Get(0).(dynamic.NamespaceableResourceInterface)
}

func TestListSessions(t *testing.T) {
    mockClient := new(MockDynamicClient)
    mockResource := new(MockNamespaceableResource)

    // Setup expectations
    mockClient.On("Resource", mock.Anything).Return(mockResource)
    mockResource.On("Namespace", "test-project").Return(mockNamespaceResource)
    mockNamespaceResource.On("List", mock.Anything, mock.Anything).Return(&unstructured.UnstructuredList{
        Items: []unstructured.Unstructured{
            {Object: map[string]interface{}{"metadata": map[string]interface{}{"name": "session-1"}}},
        },
    }, nil)

    // Use mock in handler
    originalClient := DynamicClient
    DynamicClient = mockClient
    defer func() { DynamicClient = originalClient }()

    // Test handler
    // ...

    // Verify
    mockClient.AssertExpectations(t)
}
```

**Anti-Patterns**:
```go
// ❌ NEVER use real K8s clients in unit tests
func TestListSessions(t *testing.T) {
    // WRONG: Requires real cluster, slow, flaky
    config, _ := rest.InClusterConfig()
    client, _ := kubernetes.NewForConfig(config)
}

// ❌ NEVER skip mock expectations
mockClient.On("Resource", mock.Anything).Return(mockResource)
// WRONG: No assertions, mock not verified
```

**Detection**:
- ✅ Unit tests use mocks, integration tests use real clients
- ❌ `rest.InClusterConfig()` in unit test files

**Related Patterns**: [Pattern: integration-tests-cleanup]

**Change History**: v1.0 (2025-11-06): Initial from CLAUDE.md

---

## Pattern: integration-tests-cleanup

**Pattern ID**: integration-tests-cleanup
**Version**: 1.0
**Status**: Stable
**Category**: Testing / Integration

**Description**:
Integration tests must clean up created resources. Use TEST_NAMESPACE environment variable. Set CLEANUP_RESOURCES=true for automatic cleanup on test completion.

**Implementation**:
```go
func TestSessionLifecycle(t *testing.T) {
    if testing.Short() {
        t.Skip("Skipping integration test in short mode")
    }

    namespace := os.Getenv("TEST_NAMESPACE")
    if namespace == "" {
        t.Fatal("TEST_NAMESPACE must be set for integration tests")
    }

    cleanupEnabled := os.Getenv("CLEANUP_RESOURCES") == "true"

    // Create test resources
    sessionName := fmt.Sprintf("test-session-%d", time.Now().Unix())
    session := createTestSession(t, namespace, sessionName)

    // Cleanup function
    cleanup := func() {
        if cleanupEnabled {
            err := DynamicClient.Resource(gvr).Namespace(namespace).Delete(context.Background(), sessionName, v1.DeleteOptions{})
            if err != nil && !errors.IsNotFound(err) {
                t.Logf("Failed to cleanup session %s: %v", sessionName, err)
            }
        }
    }
    defer cleanup()

    // Run tests
    t.Run("session created successfully", func(t *testing.T) {
        assert.NotNil(t, session)
        assert.Equal(t, sessionName, session.GetName())
    })

    t.Run("job created for session", func(t *testing.T) {
        jobName := fmt.Sprintf("%s-job", sessionName)
        job, err := K8sClient.BatchV1().Jobs(namespace).Get(context.Background(), jobName, v1.GetOptions{})
        assert.NoError(t, err)
        assert.NotNil(t, job)
    })
}
```

**Anti-Patterns**:
```go
// ❌ NEVER skip cleanup
func TestSessionCreate(t *testing.T) {
    session := createSession(t, "test", "my-session")
    // WRONG: No cleanup, leaves resources in cluster
}

// ❌ NEVER hardcode namespace
func TestSessionCreate(t *testing.T) {
    createSession(t, "default", "test-session") // WRONG: Use TEST_NAMESPACE
}
```

**Detection**:
- ✅ All integration tests have defer cleanup()
- ✅ All integration tests use TEST_NAMESPACE
- ❌ Hardcoded namespace in test files

**Validation**: Run integration tests, verify namespace clean afterward

**Related Patterns**: [Pattern: table-driven-tests-go]

**Change History**: v1.0 (2025-11-06): Initial from CLAUDE.md

---

## Pattern: cypress-e2e-patterns

**Pattern ID**: cypress-e2e-patterns
**Version**: 1.0
**Status**: Stable
**Category**: Testing / E2E

**Description**:
Cypress E2E tests should focus on critical user workflows, use data-testid for selectors, and handle async operations with proper waits.

**Implementation**:
```typescript
// e2e/cypress/e2e/session-workflow.cy.ts
describe('Session Workflow', () => {
  beforeEach(() => {
    cy.visit('/projects/test-project/sessions')
  })

  it('should create and view session', () => {
    // Use data-testid for stable selectors
    cy.get('[data-testid="create-session-btn"]').click()

    // Fill form
    cy.get('[data-testid="session-prompt-input"]').type('Analyze this repository')
    cy.get('[data-testid="repo-url-input"]').type('https://github.com/example/repo')
    cy.get('[data-testid="repo-branch-input"]').type('main')

    // Submit and wait for navigation
    cy.get('[data-testid="submit-btn"]').click()
    cy.url().should('include', '/sessions/')

    // Verify session created
    cy.contains('Session created successfully').should('be.visible')
    cy.get('[data-testid="session-status"]').should('contain', 'Pending')
  })

  it('should handle errors gracefully', () => {
    cy.get('[data-testid="create-session-btn"]').click()

    // Submit without required fields
    cy.get('[data-testid="submit-btn"]').click()

    // Should show validation errors
    cy.contains('Prompt is required').should('be.visible')
    cy.get('[data-testid="session-prompt-input"]').should('have.attr', 'aria-invalid', 'true')
  })
})
```

**Anti-Patterns**:
```typescript
// ❌ NEVER use brittle CSS selectors
cy.get('.button.primary.large').click() // WRONG: Breaks with style changes

// ❌ NEVER use arbitrary waits
cy.wait(5000) // WRONG: Use explicit waits
cy.get('[data-testid="result"]') // Correct: Implicit wait

// ❌ NEVER test implementation details
cy.window().then(win => {
  expect(win.fetch).to.have.been.called // WRONG: Testing internals
})
```

**Detection**:
- ✅ All selectors use data-testid
- ❌ `cy.wait(number)` without network alias

**Related Patterns**: [Pattern: loading-and-error-states]

**Change History**: v1.0 (2025-11-06): Initial from CLAUDE.md
