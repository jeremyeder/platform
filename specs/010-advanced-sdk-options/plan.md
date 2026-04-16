# Implementation Plan: Advanced SDK Options

**Branch**: `010-advanced-sdk-options` | **Date**: 2026-04-15 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/010-advanced-sdk-options/spec.md`

## Summary

Expose Claude Agent SDK options (temperature, tokens, tools, system prompt, etc.) in the session creation UI. Options flow from a React form through Go backend validation to a Python runner, where they merge into `ClaudeAgentOptions`. Defense-in-depth via backend allowlist + runner denylist. A weekly GHA workflow detects SDK drift.

## Technical Context

**Language/Version**: Go 1.22+ (backend), TypeScript/Next.js 14 (frontend), Python 3.12 (runner)
**Primary Dependencies**: Gin (backend HTTP), React + Shadcn/ui (frontend), claude-agent-sdk (runner)
**Storage**: Kubernetes CRDs — options travel as JSON string in existing `environmentVariables` map (no CRD changes)
**Testing**: go test (backend), vitest (frontend), pytest (runner)
**Target Platform**: Kubernetes cluster (OpenShift/kind)
**Project Type**: Web application (Go API + React frontend + Python runner)

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. K8s-Native | PASS | Uses existing CR env vars, no new CRDs |
| II. Security | PASS | Allowlist + denylist + append-only system prompt |
| III. Type Safety | PASS | Backend type validation per key, no `any` in frontend |
| IV. TDD | ENFORCED | Tests required for each component |
| V. Modularity | PASS | Single-file component, handler functions, bridge method |
| X. Commit Discipline | PASS | Feature split into backend/frontend/runner commits |

## Project Structure

### Documentation (this feature)

```text
specs/010-advanced-sdk-options/
├── spec.md              # Feature specification
├── plan.md              # This file
└── tasks.md             # Task breakdown
```

### Source Code (files to create or modify)

```text
components/backend/
├── handlers/sessions.go          # MODIFY: add filterSdkOptions, validateSdkOptionValue, allowlist
└── types/session.go              # MODIFY: add SdkOptions field to request types

components/frontend/src/
├── components/
│   └── advanced-sdk-options.tsx   # CREATE: collapsible SDK options form
├── app/projects/[name]/
│   ├── new/page.tsx               # MODIFY: wire sdkOptions into create call
│   └── sessions/[sessionName]/components/
│       └── new-session-view.tsx   # MODIFY: add AdvancedSdkOptions + feature flag gate
└── types/api/sessions.ts         # MODIFY: add SdkOptions type

components/runners/ambient-runner/
├── ambient_runner/bridges/claude/bridge.py  # MODIFY: parse SDK_OPTIONS, denylist, merge
├── sdk-options-manifest.json               # CREATE: canonical SDK field list
└── tests/test_sdk_options.py               # CREATE: SDK_OPTIONS parsing tests

components/manifests/base/core/flags.json   # MODIFY: add advanced-sdk-options flag

.github/workflows/
└── claude-sdk-options-drift.yml            # CREATE: weekly drift detection

components/backend/handlers/
└── sessions_sdk_options_test.go            # CREATE: backend filterSdkOptions tests

components/frontend/src/components/__tests__/
└── advanced-sdk-options.test.tsx           # CREATE: frontend component tests
```

## Design Decisions

1. **Single file for frontend component** — `advanced-sdk-options.tsx` is a self-contained collapsible panel. No sub-component directory needed. Fields are simple inputs, selects, switches, and textareas.

2. **Backend allowlist as map literal** — `allowedSdkOptionKeys map[string]bool` at package level. Simple, auditable, no external config.

3. **Runner denylist as frozenset** — `_SDK_OPTIONS_DENYLIST` at module level. Blocks platform-internal keys even if backend is compromised.

4. **SDK_OPTIONS as JSON string in env var** — Avoids CRD changes. The `environmentVariables` map already exists on the CR spec.

5. **System prompt append-only** — User text appended under `## Custom Instructions` heading. Prevents users from stripping platform security instructions.

6. **Feature flag UI-only** — Backend always accepts `sdkOptions` for API callers. Flag gates the form in the frontend only.
