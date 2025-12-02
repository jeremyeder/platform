# Plan: Customize Amber Bot Identity and Review Template

## User Requirements

1. **Bot Identity**: Change from `github-actions[bot]` to custom GitHub App named "Amber"
2. **Review Template Customization**:
   - Change header from "# Claude Code Review" to "# Amber Code Review"
   - Modify severity categories (emojis/labels)
   - Add/remove sections as needed
   - Change formatting/style
   - **NEW**: Add interactive "zoom in" links that trigger deeper reviews on specific areas

## Current State Analysis

**Current Bot Identity**: `github-actions[bot]` (GitHub logo)
- Uses standard `GITHUB_TOKEN` in workflow
- Comment posted via `gh pr comment` command
- Appears as GitHub Actions system bot

**Current Review Template** (in `.github/workflows/amber-auto-review.yml` lines 104-119):
```markdown
# Claude Code Review

## Summary
[Brief overview]

## Issues by Severity

### 🚫 Blocker Issues
[Must fix before merge]

### 🔴 Critical Issues
[Should fix before merge]

### 🟡 Major Issues
[Important to address]

### 🔵 Minor Issues
[Nice-to-have improvements]

## Positive Highlights
[Things done well]

## Recommendations
[Prioritized action items]
```

## Quick Summary

**What we're doing:**
1. Create a GitHub App called "Amber" so reviews appear from "Amber[bot]" instead of "github-actions[bot]"
2. Update the review template to use "Amber" branding with better emojis/formatting
3. Use collapsible sections (HTML `<details>`) so the full review is there but collapsed by default - cleaner UX

**Your action required (one-time setup):**
- Create GitHub App (takes 5 minutes, follow Step 1.1 below)
- Add 2 secrets to repository (takes 2 minutes, follow Step 1.2 below)
- The workflow code changes will be done via PR (I'll handle that part)

**After setup:**
- All PR reviews will appear from "Amber[bot]" with custom branding
- Detailed findings will be in collapsed `<details>` sections - expand to see full analysis
- Cleaner, more scannable review comments

## Implementation Plan

### Part 1: Create Custom GitHub App "Amber"

#### Step 1.1: Register GitHub App

**Detailed step-by-step guide:**

1. **Navigate to GitHub App creation page**
   - Go to: https://github.com/settings/apps/new
   - Or: GitHub Settings → Developer settings → GitHub Apps → New GitHub App

2. **Fill out the form:**

   **Basic Information:**
   - **GitHub App name**: `Amber` (this will appear as "Amber[bot]" in comments)
   - **Description**: `AI-powered code review bot using repository-specific standards from the Ambient Code Platform memory system`
   - **Homepage URL**: `https://github.com/ambient-code/platform`

   **Identifying and authorizing users:**
   - Leave all checkboxes unchecked (we don't need user authorization)

   **Post installation:**
   - **Setup URL**: Leave blank

   **Webhook:**
   - **Active**: ✅ **UNCHECK THIS BOX** (we don't need webhooks)
   - Reason: The workflow triggers on PR events, not webhooks

   **Permissions:**
   - Click "Repository permissions" dropdown
   - **Contents**: Select "Read and write"
   - **Issues**: Select "Read and write"
   - **Pull requests**: Select "Read and write"
   - All other permissions: Leave as "No access"

   **Where can this GitHub App be installed?**
   - Select: ⚫ **Only on this account**
   - This restricts the app to your organizations/repos

3. **Create the app**
   - Click "Create GitHub App" button at the bottom
   - You'll be redirected to the app's settings page

4. **Note the App ID**
   - On the settings page, you'll see **App ID** near the top
   - **COPY THIS NUMBER** (example: 123456)
   - You'll need this for `AMBER_APP_ID` secret

5. **Generate a private key**
   - Scroll down to "Private keys" section
   - Click "Generate a private key" button
   - A `.pem` file will download to your computer
   - **SAVE THIS FILE SECURELY** - you can't download it again
   - Open the file in a text editor and copy the entire contents (including `-----BEGIN RSA PRIVATE KEY-----` and `-----END RSA PRIVATE KEY-----`)

6. **Install the app on your repository**
   - In the left sidebar, click "Install App"
   - Find "ambient-code" organization (or your user account)
   - Click "Install"
   - Choose: ⚫ **Only select repositories**
   - Select: `ambient-code/platform`
   - Click "Install"

**What you should have now:**
- ✅ App ID (a number like 123456)
- ✅ Private key (.pem file contents)
- ✅ App installed on ambient-code/platform

#### Step 1.2: Configure GitHub Secrets

**Detailed guide for adding secrets:**

1. **Navigate to repository secrets**
   - Go to: https://github.com/ambient-code/platform/settings/secrets/actions
   - Or: Repository → Settings → Secrets and variables → Actions → "New repository secret"

2. **Add AMBER_APP_ID secret**
   - Click "New repository secret" button
   - **Name**: `AMBER_APP_ID` (exact spelling, all caps)
   - **Secret**: Paste the App ID number from Step 1.1.4 (example: 123456)
   - Click "Add secret"

3. **Add AMBER_PRIVATE_KEY secret**
   - Click "New repository secret" button again
   - **Name**: `AMBER_PRIVATE_KEY` (exact spelling, all caps)
   - **Secret**: Paste the entire contents of the .pem file from Step 1.1.5
   - The value should look like:
     ```
     -----BEGIN RSA PRIVATE KEY-----
     MIIEpAIBAAKCAQEA...
     (many lines of base64)
     ...
     -----END RSA PRIVATE KEY-----
     ```
   - **IMPORTANT**: Include the `BEGIN` and `END` lines
   - Click "Add secret"

4. **Verify existing secret**
   - Confirm that **CLAUDE_CODE_OAUTH_TOKEN** already exists
   - If not, you'll need to add it (ask maintainer for the token)

**What you should have now:**
- ✅ AMBER_APP_ID secret configured
- ✅ AMBER_PRIVATE_KEY secret configured
- ✅ CLAUDE_CODE_OAUTH_TOKEN secret exists

**Common issues:**
- ❌ "Invalid format" error: Make sure you copied the entire .pem file including BEGIN/END lines
- ❌ "App not found" error: Double-check the App ID is correct
- ❌ Workflow fails with auth error: Verify the app is installed on the repository (Step 1.1.6)

#### Step 1.3: Update Workflow to Use GitHub App Token

**File**: `.github/workflows/amber-auto-review.yml`

Add new step at the beginning to generate installation token:

```yaml
- name: Generate Amber Bot Token
  id: amber-token
  uses: actions/create-github-app-token@v1
  with:
    app-id: ${{ secrets.AMBER_APP_ID }}
    private-key: ${{ secrets.AMBER_PRIVATE_KEY }}
```

Update the `Run Amber Code Review` step to use the app token:

```yaml
- name: Run Amber Code Review (with memory system)
  id: amber-review
  uses: anthropics/claude-code-action@v1
  with:
    claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
    github_token: ${{ steps.amber-token.outputs.token }}  # CHANGED
    allowed_non_write_users: '*'
    # ... rest unchanged
```

**Result**: Comments will now appear from "Amber[bot]" with custom avatar instead of "github-actions[bot]"

### Part 2: Customize Review Template

#### Step 2.1: Update Template with Collapsible Sections

**File**: `.github/workflows/amber-auto-review.yml` (lines 104-130)

**New template format:**

```yaml
Use `gh pr comment` to post your review with this format:

# 🤖 Amber Code Review

> AI-powered review using repository-specific standards from the memory system

## Quick Summary

**Overall Assessment:** [One paragraph summary - quality, major concerns, approval recommendation]

**Key Stats:**
- 🚨 Blocker Issues: X found
- 🔴 High Priority: X found
- 🟠 Medium Priority: X found
- 🟡 Low Priority: X found
- ✨ Positive Highlights: X found

**Recommendation:** [✅ Approve after fixes | ⏸️ Request changes | 🚫 Block merge]

---

<details>
<summary>📋 <b>Full Review Details</b> (click to expand)</summary>

## Issues by Severity

### 🚨 Blocker Issues

<details>
<summary><b>Issue 1: [Title with location]</b></summary>

**Location:** `path/to/file.go:123-130`

**Issue:** [Detailed description]

**Why this matters:** [Impact explanation]

**Recommendation:**
```suggestion
[Code fix if applicable]
```

**Reference:** [CLAUDE.md section or memory file]

</details>

[Repeat for each blocker]

### 🔴 High Priority Issues

[Same collapsible format for each issue]

### 🟠 Medium Priority Issues

[Same collapsible format for each issue]

### 🟡 Low Priority Issues

[Same collapsible format for each issue]

## ✨ Positive Highlights

<details>
<summary><b>Well-Implemented: [Topic]</b></summary>

**Location:** `path/to/file.tsx:50-75`

**What's Good:** [Explanation]

**Why this matters:** [Impact]

</details>

[Repeat for each highlight]

## 🎯 Recommendations

1. **[Priority]** [Action item with file:line reference]
2. **[Priority]** [Action item with file:line reference]
3. [etc.]

## 📚 Standards Applied

This review used:
- CLAUDE.md (master project instructions)
- backend-development.md (Go backend, K8s patterns)
- frontend-development.md (NextJS, Shadcn UI, React Query)
- security-standards.md (Auth, RBAC, token handling)
- k8s-client-usage.md (User token vs service account)
- error-handling.md (Consistent error patterns)
- react-query-usage.md (Data fetching patterns)

</details>
```

### Part 3: Update Existing Auto-Review Workflow

**File**: `.github/workflows/amber-auto-review.yml`

**Changes needed:**

1. **Add GitHub App token generation** (after checkout step, before "Minimize old Claude review comments"):
   ```yaml
   - name: Generate Amber Bot Token
     id: amber-token
     uses: actions/create-github-app-token@v1
     with:
       app-id: ${{ secrets.AMBER_APP_ID }}
       private-key: ${{ secrets.AMBER_PRIVATE_KEY }}
   ```

2. **Update claude-code-action to use app token** (line 76):
   ```yaml
   github_token: ${{ steps.amber-token.outputs.token }}  # Changed from secrets.GITHUB_TOKEN
   ```

3. **Add dynamic memory file discovery** (new step before "Run Amber Code Review"):
   ```yaml
   - name: Discover memory system files
     id: memory-files
     run: |
       # Find all memory system files dynamically
       FILES=""

       # Always load CLAUDE.md first
       if [ -f "CLAUDE.md" ]; then
         FILES="1. Read CLAUDE.md (master project instructions)\n"
       fi

       # Find all context files
       COUNT=2
       for file in .claude/context/*.md; do
         if [ -f "$file" ]; then
           BASENAME=$(basename "$file" .md)
           FILES="${FILES}${COUNT}. Read ${file}\n"
           COUNT=$((COUNT + 1))
         fi
       done

       # Find all pattern files
       for file in .claude/patterns/*.md; do
         if [ -f "$file" ]; then
           BASENAME=$(basename "$file" .md)
           FILES="${FILES}${COUNT}. Read ${file}\n"
           COUNT=$((COUNT + 1))
         fi
       done

       # Output to use in prompt
       echo "files<<EOF" >> $GITHUB_OUTPUT
       echo -e "$FILES" >> $GITHUB_OUTPUT
       echo "EOF" >> $GITHUB_OUTPUT
   ```

4. **Replace the prompt template** (lines 104-130) with new collapsible template that uses dynamic file list:
   ```yaml
   prompt: |
     REPO: ${{ github.repository }}
     PR NUMBER: ${{ github.event.pull_request.number }}

     Load the following memory system files to understand repository standards:

     ${{ steps.memory-files.outputs.files }}

     After loading all memory files, perform a comprehensive code review...

     [Rest of template from Part 2, Step 2.1]
   ```

5. **Update transparency section** to dynamically show loaded files:
   ```yaml
   - name: Add workflow link with memory system visibility
     if: steps.amber-review.conclusion == 'success'
     uses: actions/github-script@v7
     env:
       RUN_ID: ${{ github.run_id }}
       GITHUB_SERVER_URL: ${{ github.server_url }}
       GITHUB_REPOSITORY: ${{ github.repository }}
       MEMORY_FILES: ${{ steps.memory-files.outputs.files }}
     with:
       github-token: ${{ steps.amber-token.outputs.token }}  # Use app token
       script: |
         const prNumber = context.payload.pull_request.number;
         const runId = process.env.RUN_ID;
         const serverUrl = process.env.GITHUB_SERVER_URL;
         const repository = process.env.GITHUB_REPOSITORY;
         const memoryFiles = process.env.MEMORY_FILES;

         const comments = await github.rest.issues.listComments({
           owner: context.repo.owner,
           repo: context.repo.repo,
           issue_number: prNumber
         });

         const reviewComment = comments.data
           .filter(c => c.user.type === 'Bot' && c.body.startsWith('# 🤖 Amber Code Review'))
           .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];

         if (!reviewComment) {
           console.log('No review comment found');
           return;
         }

         if (reviewComment.body.includes('View AI decision process')) {
           console.log('Transparency link already added');
           return;
         }

         // Format memory files as a bulleted list
         const fileList = memoryFiles.split('\n')
           .filter(f => f.trim())
           .map(f => `- ${f.replace(/^\d+\.\s*Read\s*/, '')}`)
           .join('\n');

         const transparencySection = `

---
🔍 [View AI decision process](${serverUrl}/${repository}/actions/runs/${runId}) (logs available for 90 days)

<details>
<summary>📋 View memory system files loaded (click to expand)</summary>

### What Amber Loaded for Code Review

Amber automatically loaded these repository standards from the memory system:

${fileList}

**Impact**: This review used your repository's specific code quality standards, security patterns, and best practices from the Amber memory system - not just generic code review guidelines.

</details>
`;

         const updatedBody = reviewComment.body + transparencySection;

         await github.rest.issues.updateComment({
           owner: context.repo.owner,
           repo: context.repo.repo,
           comment_id: reviewComment.id,
           body: updatedBody
         });

         console.log('Added transparency link to review comment');
   ```

## Files to Create/Modify

### MODIFIED Files Only
1. `.github/workflows/amber-auto-review.yml`
   - Add GitHub App token generation step (after checkout)
   - Add dynamic memory file discovery step
   - Update `github_token` to use app token
   - Change review template header to "# 🤖 Amber Code Review"
   - Add collapsible sections with `<details>` tags
   - Update severity categories (🚨🔴🟠🟡 instead of 🚫🔴🟡🔵)
   - Update transparency section to dynamically show loaded files
   - Use app token in transparency script

### NO New Files Required
- ❌ No amber-zoom.yml needed (using collapsible sections instead)

## Implementation Steps

### Step 1: Manual GitHub App Setup (User Action Required)
Follow detailed guide in "Part 1: Create Custom GitHub App 'Amber'" above:
1. Create GitHub App at https://github.com/settings/apps/new (5 minutes)
2. Install app on `ambient-code/platform`
3. Add secrets: `AMBER_APP_ID`, `AMBER_PRIVATE_KEY` (2 minutes)

### Step 2: Update Workflow (Code Changes)
Modify `.github/workflows/amber-auto-review.yml`:
1. Add GitHub App token generation (Part 3, Step 1)
2. Add dynamic memory file discovery (Part 3, Step 3)
3. Update to use app token (Part 3, Step 2)
4. Replace review template with collapsible format (Part 3, Step 4)
5. Update transparency section (Part 3, Step 5)

### Step 3: Test on Fork First
1. Set up GitHub App on fork (`jeremyeder/platform`)
2. Test auto-review with new template
3. Verify bot appears as "Amber[bot]"
4. Verify collapsible sections work
5. Verify dynamic memory file loading works

### Step 4: Deploy to Upstream
1. Create PR with workflow changes
2. Configure GitHub App on upstream
3. Merge PR
4. Verify on real PRs

## Expected Outcome

### Bot Identity
- ✅ Comments appear from "Amber[bot]" with custom avatar
- ✅ Distinct from "github-actions[bot]"
- ✅ Recognizable branding across all reviews

### Review Template
- ✅ Header: "# 🤖 Amber Code Review"
- ✅ Quick Summary section (always visible): stats + recommendation
- ✅ Collapsible "Full Review Details" section with all findings
- ✅ Individual issues in nested `<details>` tags for clean UX
- ✅ Updated severity categories: 🚨 Blocker, 🔴 High, 🟠 Medium, 🟡 Low

### Dynamic Memory System
- ✅ Automatically discovers all files in `.claude/context/` and `.claude/patterns/`
- ✅ Transparency section shows exact files that were loaded
- ✅ No hardcoded file list - add new memory files and they're automatically included
- ✅ CLAUDE.md always loaded first

## Testing Checklist

- [ ] GitHub App created and installed
- [ ] Secrets configured correctly (AMBER_APP_ID, AMBER_PRIVATE_KEY)
- [ ] Auto-review uses Amber bot identity
- [ ] Review template matches new collapsible format
- [ ] Quick Summary section is visible by default
- [ ] Full Review Details section is collapsed by default
- [ ] Individual issues within Full Review are also collapsible
- [ ] Dynamic memory file discovery works (add new file to .claude/context/, verify it appears in review)
- [ ] Transparency section lists all loaded files
- [ ] Bot avatar and name appear correctly as "Amber[bot]"

            ### Best Practices Observed
            [Things done well in this area]

            ## Action Items
            1. [Specific task with file:line reference]
            2. [Specific task with file:line reference]

            ## Reference Standards
            [Which CLAUDE.md sections and memory files were applied]

            ---
            💡 **Tip**: Request another deep dive with `@amber zoom <area>` (security, performance, testing, architecture, error-handling, documentation)

      - name: Add workflow link
        if: steps.zoom-review.conclusion == 'success'
        uses: actions/github-script@v7
        env:
          RUN_ID: ${{ github.run_id }}
          GITHUB_SERVER_URL: ${{ github.server_url }}
          GITHUB_REPOSITORY: ${{ github.repository }}
        with:
          github-token: ${{ steps.amber-token.outputs.token }}
          script: |
            const prNumber = context.payload.pull_request.number;
            const runId = process.env.RUN_ID;
            const serverUrl = process.env.GITHUB_SERVER_URL;
            const repository = process.env.GITHUB_REPOSITORY;

            const comments = await github.rest.issues.listComments({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: prNumber
            });

            const zoomComment = comments.data
              .filter(c => c.user.type === 'Bot' && c.body.includes('# 🔬 Amber Deep Dive'))
              .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];

            if (!zoomComment || zoomComment.body.includes('View AI decision process')) {
              return;
            }

            const transparencySection = `\n\n---\n🔍 [View AI decision process](${serverUrl}/${repository}/actions/runs/${runId}) (logs available for 90 days)`;

            await github.rest.issues.updateComment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              comment_id: zoomComment.id,
              body: zoomComment.body + transparencySection
            });
```

### Part 3: Update Existing Auto-Review Template

**File**: `.github/workflows/amber-auto-review.yml`

Update the prompt section (lines 104-130) with the new template from Step 2.1.

Also update the transparency section (lines 176-188) to use "Amber" branding:

```yaml
**Impact**: This review used your repository's specific code quality standards, security patterns, and best practices from the Amber memory system (PRs #359, #360) - not just generic code review guidelines.
```

## Files to Create/Modify

### NEW Files
1. `.github/workflows/amber-zoom.yml` - Deep dive review workflow (triggered by `@amber zoom <target>`)

### MODIFIED Files
1. `.github/workflows/amber-auto-review.yml`
   - Add GitHub App token generation step
   - Update `github_token` to use app token
   - Change review template header to "# 🤖 Amber Code Review"
   - Update severity categories (emojis/labels)
   - Add "Deep Dive Available" section with usage instructions
   - Update transparency section branding

## Implementation Steps

### Step 1: Manual GitHub App Setup (User Action Required)
1. Create GitHub App at https://github.com/settings/apps/new
2. Configure permissions (Contents, PRs, Issues: Read & write)
3. Generate private key
4. Install app on `ambient-code/platform`
5. Add secrets: `AMBER_APP_ID`, `AMBER_PRIVATE_KEY`

### Step 2: Update Workflows (Code Changes)
1. Create `.github/workflows/amber-zoom.yml`
2. Modify `.github/workflows/amber-auto-review.yml`:
   - Add app token generation
   - Update review template
   - Change branding from "Claude" to "Amber"

### Step 3: Test on Fork First
1. Set up GitHub App on fork (`jeremyeder/platform`)
2. Test auto-review with new template
3. Test zoom functionality with `@amber zoom security` comment
4. Verify bot appears as "Amber[bot]"

### Step 4: Deploy to Upstream
1. Create PR with workflow changes
2. Configure GitHub App on upstream
3. Merge PR
4. Verify on real PRs

## Expected Outcome

### Bot Identity
- ✅ Comments appear from "Amber[bot]" with custom avatar
- ✅ Distinct from "github-actions[bot]"
- ✅ Recognizable branding across all reviews

### Review Template
- ✅ Header: "# 🤖 Amber Code Review"
- ✅ Updated severity categories: 🚨 Blocker, 🔴 High, 🟠 Medium, 🟡 Low
- ✅ Renamed sections: "✨ Positive Highlights", "🎯 Recommendations"
- ✅ Added "🔍 Deep Dive Available" section with usage

### Interactive Deep Dives
- ✅ Users can comment `@amber zoom security` (or other areas)
- ✅ Triggers new workflow that posts detailed analysis
- ✅ Deep dive comment format: "# 🔬 Amber Deep Dive: security"
- ✅ Links back to workflow run for transparency

## Testing Checklist

- [ ] GitHub App created and installed
- [ ] Secrets configured correctly
- [ ] Auto-review uses Amber bot identity
- [ ] Review template matches new format
- [ ] Zoom functionality works for all targets (security, performance, testing, architecture, error-handling, documentation)
- [ ] Transparency links work on both auto-review and zoom comments
- [ ] Bot avatar and name appear correctly
