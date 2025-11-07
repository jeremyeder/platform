# Deployment Patterns

**Version**: 1.0.0
**Last Updated**: 2025-11-06
**Scope**: CI/CD, container builds, Kubernetes deployment

---

## Pattern: component-change-detection

**Pattern ID**: component-change-detection
**Version**: 1.0
**Status**: Stable
**Category**: CI/CD / Build Optimization

**Location**: .github/workflows/components-build-deploy.yml
**Grep Anchor**: `dorny/paths-filter`

**Description**:
Only build components that have changed using dorny/paths-filter in GitHub Actions. Avoids unnecessary builds and speeds up CI pipeline.

**Implementation**:
```yaml
# .github/workflows/components-build-deploy.yml
jobs:
  changes:
    runs-on: ubuntu-latest
    outputs:
      frontend: ${{ steps.filter.outputs.frontend }}
      backend: ${{ steps.filter.outputs.backend }}
      operator: ${{ steps.filter.outputs.operator }}
      runner: ${{ steps.filter.outputs.runner }}
    steps:
      - uses: actions/checkout@v4
      - uses: dorny/paths-filter@v2
        id: filter
        with:
          filters: |
            frontend:
              - 'components/frontend/**'
            backend:
              - 'components/backend/**'
            operator:
              - 'components/operator/**'
            runner:
              - 'components/runners/claude-code-runner/**'

  build-frontend:
    needs: changes
    if: needs.changes.outputs.frontend == 'true'
    runs-on: ubuntu-latest
    steps:
      - name: Build frontend
        run: make build-frontend
```

**Anti-Patterns**:
```yaml
# ❌ NEVER build all components on every change
jobs:
  build-all:
    steps:
      - run: make build-all  # WRONG: Builds everything even for typo fix
```

**Detection**:
- ✅ CI workflow uses paths-filter
- ❌ Workflows that build all components unconditionally

**Related Patterns**: [Pattern: multi-platform-container-builds]

**Change History**: v1.0 (2025-11-06): Initial from CLAUDE.md

---

## Pattern: multi-platform-container-builds

**Pattern ID**: multi-platform-container-builds
**Version**: 1.0
**Status**: Stable
**Category**: CI/CD / Containers

**Description**:
Build container images for both linux/amd64 and linux/arm64 using Docker buildx. Support both Docker and Podman via CONTAINER_ENGINE variable.

**Implementation**:
```makefile
# Makefile
CONTAINER_ENGINE ?= docker
PLATFORM ?= linux/amd64
REGISTRY ?= quay.io/ambient_code

.PHONY: build-all
build-all: build-frontend build-backend build-operator build-runner

.PHONY: build-frontend
build-frontend:
	cd components/frontend && \
	$(CONTAINER_ENGINE) buildx build \
		--platform $(PLATFORM) \
		-t $(REGISTRY)/vteam_frontend:latest \
		--load \
		.

# Multi-platform build for release
.PHONY: build-multiplatform
build-multiplatform:
	$(CONTAINER_ENGINE) buildx build \
		--platform linux/amd64,linux/arm64 \
		-t $(REGISTRY)/vteam_frontend:$(VERSION) \
		--push \
		components/frontend
```

```yaml
# GitHub Actions
- name: Set up Docker Buildx
  uses: docker/setup-buildx-action@v3

- name: Build and push
  uses: docker/build-push-action@v5
  with:
    context: components/frontend
    platforms: linux/amd64,linux/arm64
    push: ${{ github.ref == 'refs/heads/main' }}
    tags: quay.io/ambient_code/vteam_frontend:latest
```

**Anti-Patterns**:
```makefile
# ❌ NEVER hardcode docker command
build-frontend:
	docker build -t frontend .  # WRONG: Doesn't support podman or multi-platform
```

**Detection**:
- ✅ Makefiles use `$(CONTAINER_ENGINE)` and `$(PLATFORM)` variables
- ❌ Hardcoded `docker` commands

**Related Patterns**: [Pattern: container-image-scanning]

**Change History**: v1.0 (2025-11-06): Initial from CLAUDE.md

---

## Pattern: container-image-scanning

**Pattern ID**: container-image-scanning
**Version**: 1.0
**Status**: Stable
**Category**: Security / CI/CD

**Description**:
Scan all container images for vulnerabilities using Trivy before pushing to registry. Fail builds on HIGH/CRITICAL vulnerabilities.

**Implementation**:
```yaml
# .github/workflows/components-build-deploy.yml
- name: Build image
  uses: docker/build-push-action@v5
  with:
    context: components/backend
    load: true  # Load into Docker for scanning
    tags: backend:${{ github.sha }}

- name: Scan image with Trivy
  uses: aquasecurity/trivy-action@master
  with:
    image-ref: backend:${{ github.sha }}
    format: 'sarif'
    output: 'trivy-results.sarif'
    severity: 'CRITICAL,HIGH'
    exit-code: '1'  # Fail on vulnerabilities

- name: Upload scan results
  uses: github/codeql-action/upload-sarif@v2
  if: always()
  with:
    sarif_file: 'trivy-results.sarif'

- name: Push image (only if scan passes)
  uses: docker/build-push-action@v5
  with:
    context: components/backend
    push: true
    tags: quay.io/ambient_code/vteam_backend:latest
```

**Anti-Patterns**:
```yaml
# ❌ NEVER push images without scanning
- name: Build and push
  run: |
    docker build -t backend .
    docker push backend  # WRONG: No vulnerability check
```

**Detection**:
- ✅ All image build workflows include Trivy scan
- ❌ Push steps without preceding scan

**Related Patterns**: [Pattern: multi-platform-container-builds]

**Change History**: v1.0 (2025-11-06): Initial from CLAUDE.md

---

## Pattern: kustomize-overlay-management

**Pattern ID**: kustomize-overlay-management
**Version**: 1.0
**Status**: Stable
**Category**: Kubernetes / Deployment

**Location**: components/manifests/
**Grep Anchor**: `kustomization.yaml`

**Description**:
Use Kustomize overlays for environment-specific configuration (base, e2e, production). Base contains common resources, overlays patch for specific environments.

**Implementation**:
```yaml
# components/manifests/base/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

resources:
  - namespace.yaml
  - frontend-deployment.yaml
  - backend-deployment.yaml
  - operator-deployment.yaml
  - crds/

commonLabels:
  app.kubernetes.io/part-of: ambient-code

# components/manifests/overlays/e2e/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

bases:
  - ../../base

namespace: vteam-e2e

patchesStrategicMerge:
  - frontend-patch.yaml  # Remove oauth-proxy for testing

images:
  - name: quay.io/ambient_code/vteam_frontend
    newTag: test

configMapGenerator:
  - name: test-config
    literals:
      - TEST_MODE=true
```

```bash
# Deployment script
#!/bin/bash
ENVIRONMENT=${1:-base}

kubectl apply -k components/manifests/overlays/${ENVIRONMENT}
```

**Anti-Patterns**:
```yaml
# ❌ NEVER duplicate entire manifests per environment
production/
  ├── frontend-deployment.yaml  # Full copy
  ├── backend-deployment.yaml   # Full copy
staging/
  ├── frontend-deployment.yaml  # Duplicated
  ├── backend-deployment.yaml   # Duplicated
# WRONG: Use Kustomize overlays instead
```

**Detection**:
- ✅ Environments use `bases:` or `resources:` pointing to base/
- ❌ Duplicate YAML manifests across environments

**Related Patterns**: [Pattern: crd-installation-upgrade]

**Change History**: v1.0 (2025-11-06): Initial from CLAUDE.md

---

## Pattern: crd-installation-upgrade

**Pattern ID**: crd-installation-upgrade
**Version**: 1.0
**Status**: Stable
**Category**: Kubernetes / CRD Management

**Location**: components/manifests/deploy.sh
**Grep Anchor**: `kubectl apply -f.*crds`

**Description**:
Apply CRDs before other resources. Use `kubectl apply` for CRD upgrades (handles schema changes). Verify CRD established before deploying operator.

**Implementation**:
```bash
#!/bin/bash
# components/manifests/deploy.sh

set -e

NAMESPACE=${NAMESPACE:-ambient-code}

echo "Installing CRDs..."
kubectl apply -f base/crds/

echo "Waiting for CRDs to be established..."
kubectl wait --for condition=established --timeout=60s \
  crd/agenticsessions.vteam.ambient-code \
  crd/projectsettings.vteam.ambient-code \
  crd/rfeworkflows.vteam.ambient-code

echo "Creating namespace..."
kubectl create namespace $NAMESPACE --dry-run=client -o yaml | kubectl apply -f -

echo "Deploying platform components..."
kubectl apply -k overlays/production -n $NAMESPACE

echo "Waiting for operator to be ready..."
kubectl wait --for=condition=available --timeout=300s \
  deployment/vteam-operator -n $NAMESPACE

echo "Deployment complete!"
```

**Anti-Patterns**:
```bash
# ❌ NEVER deploy operator before CRDs
kubectl apply -k .  # WRONG: Applies everything at once, operator may crash

# ❌ NEVER use kubectl create for CRD updates
kubectl create -f crds/  # WRONG: Fails on updates, use apply
```

**Detection**:
- ✅ Deployment scripts apply CRDs first
- ✅ Scripts wait for CRD establishment
- ❌ Single `kubectl apply -k` without CRD separation

**Validation**: Upgrade CRD schema, verify existing resources preserved

**Related Patterns**: [Pattern: kustomize-overlay-management]

**Change History**: v1.0 (2025-11-06): Initial from CLAUDE.md

---

## Pattern: rolling-updates-zero-downtime

**Pattern ID**: rolling-updates-zero-downtime
**Version**: 1.0
**Status**: Stable
**Category**: Kubernetes / Deployment

**Description**:
Configure Deployments for rolling updates with proper health checks. Use maxSurge and maxUnavailable for controlled rollouts. Implement readiness probes.

**Implementation**:
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: vteam-backend
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1        # At most 1 extra pod during update
      maxUnavailable: 0  # Always maintain capacity
  template:
    spec:
      containers:
      - name: backend
        image: quay.io/ambient_code/vteam_backend:latest
        ports:
        - containerPort: 8080
        readinessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 10
        livenessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 15
          periodSeconds: 20
```

**Anti-Patterns**:
```yaml
# ❌ NEVER use Recreate strategy for user-facing services
strategy:
  type: Recreate  # WRONG: Causes downtime

# ❌ NEVER skip health checks
spec:
  containers:
  - name: backend
    # WRONG: No readiness/liveness probes
```

**Detection**:
- ✅ All Deployments have RollingUpdate strategy
- ✅ All containers have readinessProbe
- ❌ Deployments without probes

**Validation**: Deploy new version, verify no request failures during rollout

**Related Patterns**: [Pattern: kustomize-overlay-management]

**Change History**: v1.0 (2025-11-06): Initial from CLAUDE.md
