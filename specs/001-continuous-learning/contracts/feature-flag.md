# Contract: Feature Flag

## Flag Definition

**File**: `components/manifests/base/core/flags.json`

```json
{
  "name": "continuous-learning.enabled",
  "description": "Enable continuous learning capture and wiki injection for workspace sessions",
  "tags": [
    {
      "type": "scope",
      "value": "workspace"
    }
  ]
}
```

## Evaluation API (existing endpoint, no changes)

```
GET /api/projects/{projectName}/feature-flags/evaluate/continuous-learning.enabled
Authorization: Bearer <user-token>

Response 200:
{
  "flag": "continuous-learning.enabled",
  "enabled": true | false,
  "source": "workspace-override" | "unleash" | "default"
}
```

## Frontend Usage (existing hook, no changes)

```typescript
const { enabled: clEnabled } = useWorkspaceFlag(projectName, "continuous-learning.enabled");
```

## Runner Usage (new)

```python
# During _setup_platform(), after repos are cloned:
cl_flag = await evaluate_workspace_flag(
    backend_url=os.getenv("BACKEND_URL"),
    project=os.getenv("PROJECT_NAME"),
    flag_name="continuous-learning.enabled",
    token=context.get_env("SESSION_TOKEN"),
)
```
