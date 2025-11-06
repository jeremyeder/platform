# Task: Implement Security Scanning Workflows

## Context

The vTeam platform is a production Kubernetes-native system handling AI workloads, container images, and user data. Currently there is NO security scanning for vulnerabilities in dependencies or container images. This is a critical gap for a production system.

## Objectives

Implement comprehensive security scanning using:
1. **Trivy** - Container image and filesystem vulnerability scanning
2. **CodeQL** - Static application security testing (SAST) for source code

## Part 1: Trivy Container Scanning

### Workflow Configuration

Create `.github/workflows/trivy-scan.yml`:

- **Triggers:**
  - Push to `main` branch (after images are built)
  - Pull requests to `main` branch
  - Schedule: Daily at 2 AM UTC (catch new CVEs)
  - Manual workflow dispatch

- **Scope:**
  - Scan all four container images:
    - `quay.io/ambient_code/vteam_frontend:latest`
    - `quay.io/ambient_code/vteam_backend:latest`
    - `quay.io/ambient_code/vteam_operator:latest`
    - `quay.io/ambient_code/vteam_claude_runner:latest`

### Trivy Configuration

Use `aquasecurity/trivy-action@master`:

**Scan types:**
1. **Image scanning** (built containers)
   - Scan type: `image`
   - Severity: `CRITICAL,HIGH`
   - Fail on: `CRITICAL` vulnerabilities
   - Warn on: `HIGH` vulnerabilities

2. **Filesystem scanning** (source code dependencies)
   - Scan type: `fs`
   - Target: Each component directory
   - Detect: `go.mod`, `package.json`, `pyproject.toml`

**Output formats:**
- `table` - Human-readable console output
- `sarif` - Upload to GitHub Security tab
- `json` - Generate artifact for review

### Implementation Requirements

1. **Matrix strategy** for parallel scanning:
   ```yaml
   strategy:
     matrix:
       component:
         - name: frontend
           image: quay.io/ambient_code/vteam_frontend:latest
           context: ./components/frontend
         - name: backend
           image: quay.io/ambient_code/vteam_backend:latest
           context: ./components/backend
         # ... etc
   ```

2. **Upload results to GitHub Security:**
   - Use `github/codeql-action/upload-sarif@v3`
   - Results appear in Security tab → Code scanning alerts

3. **Artifact preservation:**
   - Save JSON reports as artifacts
   - Retention: 30 days
   - Useful for compliance audits

4. **Severity-based actions:**
   - CRITICAL: Fail workflow, block merge
   - HIGH: Pass but create issue (optional)
   - MEDIUM/LOW: Report only

### Trivy Ignore Configuration

Create `.trivyignore` for known false positives or accepted risks:

```
# Format: CVE-ID  # Reason
# CVE-2024-12345  # False positive - not exploitable in our use case
```

## Part 2: CodeQL Static Analysis

### Workflow Configuration

Create `.github/workflows/codeql-analysis.yml`:

- **Triggers:**
  - Push to `main` branch
  - Pull requests to `main` branch
  - Schedule: Weekly on Monday at 3 AM UTC
  - Manual workflow dispatch

- **Languages to analyze:**
  - `go` (backend + operator)
  - `javascript-typescript` (frontend)
  - `python` (claude-code-runner, runner-shell)

### CodeQL Configuration

Use `github/codeql-action/init@v3`:

**Analysis scope:**
1. **Go analysis:**
   - Components: `components/backend`, `components/operator`
   - Queries: `security-and-quality`

2. **TypeScript analysis:**
   - Component: `components/frontend`
   - Queries: `security-and-quality`

3. **Python analysis:**
   - Components: `components/runners/**`
   - Queries: `security-and-quality`

**Query suites:**
- Default: `security-and-quality` (balanced)
- Can upgrade to `security-extended` for deeper analysis

### Implementation Requirements

1. **Matrix strategy by language:**
   ```yaml
   strategy:
     matrix:
       language: ['go', 'javascript-typescript', 'python']
   ```

2. **Auto-build for compiled languages:**
   - Go: Use `autobuild` step
   - TypeScript/Python: No build needed

3. **Upload results:**
   - Automatically uploads to GitHub Security tab
   - Creates code scanning alerts

4. **Result filtering:**
   - Severity: Focus on `error` and `warning`
   - Ignore: `note` level issues (too noisy)

### CodeQL Custom Queries (Optional)

Create `.github/codeql/` directory for custom queries:

- Kubernetes RBAC misconfigurations
- Hardcoded credentials detection
- SQL injection in Go code
- XSS in TypeScript React components

## Integration with Existing Workflows

### Dependency on Component Build

Trivy image scanning should run AFTER component builds:

```yaml
needs: [build-and-push]  # From components-build-deploy.yml
if: github.event_name == 'push' && github.ref == 'refs/heads/main'
```

### Integration with Dependabot

Security scanning complements Dependabot:
- Dependabot: Proactive dependency updates
- Trivy: Reactive vulnerability detection in builds
- CodeQL: Catch security issues in source code

## Expected File Structure

```
.github/workflows/
  ├── trivy-scan.yml           # New: Container & dependency scanning
  └── codeql-analysis.yml      # New: Static code analysis
.trivyignore                   # New: Trivy ignore list (optional)
.github/codeql/                # New: Custom queries (optional)
  └── custom-queries/
```

## Success Criteria

### Trivy Scanning
- [ ] Scans all four container images
- [ ] Scans filesystem dependencies
- [ ] Uploads SARIF to GitHub Security
- [ ] Fails on CRITICAL vulnerabilities
- [ ] Runs daily on schedule
- [ ] Results visible in Security tab

### CodeQL Analysis
- [ ] Analyzes Go, TypeScript, and Python
- [ ] Uploads results to GitHub Security
- [ ] Runs on PRs and main branch
- [ ] Weekly scheduled scan
- [ ] Detects common security issues (SQLi, XSS, etc.)

### General
- [ ] Clear documentation on interpreting results
- [ ] Process for triaging and fixing vulnerabilities
- [ ] Integration with existing CI/CD pipeline
- [ ] No excessive false positives

## Security Response Process

Document the process for handling security findings:

1. **Critical vulnerabilities:**
   - Immediate review required
   - Block deployment until fixed
   - Security advisory if needed

2. **High vulnerabilities:**
   - Review within 7 days
   - Fix in next release
   - Document in security log

3. **Medium/Low vulnerabilities:**
   - Tracked in backlog
   - Fixed opportunistically
   - Bulk updates monthly

## References

- Trivy documentation: https://aquasecurity.github.io/trivy/
- CodeQL documentation: https://codeql.github.com/docs/
- GitHub Security features: https://docs.github.com/en/code-security
- Existing workflows: `.github/workflows/components-build-deploy.yml`
- Container images: `quay.io/ambient_code/vteam_*`

## Notes

- Security scanning is CRITICAL for production systems
- Trivy is lightweight and fast (< 2 minutes per image)
- CodeQL may take 5-10 minutes for initial analysis
- Results integrate seamlessly with GitHub Security tab
- Can configure GitHub Advanced Security for private repos (if available)
- Consider adding SBOM (Software Bill of Materials) generation later
- Trivy can also scan Kubernetes manifests and Helm charts
