# Lab 3: Hello Multi-Repo

## What You'll Learn

Work across multiple repositories simultaneously - one of ACP's unique superpowers!

## Time Required

3 minutes

## Prerequisites

- Completed [Lab 1](01-first-session.md) and [Lab 2](02-hello-code.md) OR comfortable with sessions
- Two test repositories (we'll help you set these up)

---

## Steps

### Step 1: Prepare Two Repositories

You'll need two repositories. Don't have them? Quick setup:

**Option A: Create Two New Repos**

1. Go to GitHub → New Repository
2. Create `hello-acp-frontend` (public, initialize with README)
3. Create `hello-acp-backend` (public, initialize with README)
4. Copy both URLs

**Option B: Use Existing Repos**

Any two repos you have write access to will work fine.

---

### Step 2: Create a Multi-Repo Session

1. Navigate to **Sessions** → **"+ New Session"**
2. In the **Repository** section, look for **"+ Add Repository"** button
3. Click it to enable multi-repo mode

<!-- Screenshot placeholder: Multi-repo button in session creation form -->

---

### Step 3: Configure Repository 1

**First Repository** (this will be the main working directory):

- **URL**: `https://github.com/your-username/hello-acp-frontend`
- **Branch**: `main`
- **Working Directory**: ✅ Checked (this is the main repo)

---

### Step 4: Configure Repository 2

Click **"+ Add Repository"** again

**Second Repository**:

- **URL**: `https://github.com/your-username/hello-acp-backend`
- **Branch**: `main`
- **Working Directory**: ☐ Unchecked

**Success Check**: You should see both repositories listed with their URLs.

---

### Step 5: Enter the Multi-Repo Prompt

Copy and paste this prompt:

```text
I'm working with a frontend and backend repository.

In the FRONTEND repository (hello-acp-frontend):
- Create a file called HELLO-FRONTEND.md
- Add content: "# Hello from Frontend!\n\nThis is the user-facing part of our Hello ACP application."

In the BACKEND repository (hello-acp-backend):
- Create a file called HELLO-BACKEND.md
- Add content: "# Hello from Backend!\n\nThis is the API server for our Hello ACP application."

Both files should be created in the root of their respective repositories.
Commit each change with a descriptive message.
```

---

### Step 6: Launch and Monitor

1. **Model**: Claude Sonnet 4.5 (default)
2. **Interactive**: OFF
3. Click **"Create Session"**

Watch the session execute (60-90 seconds):

**What to look for:**

- "Working in repository: hello-acp-frontend"
- "Creating HELLO-FRONTEND.md..."
- "Switching to repository: hello-acp-backend"
- "Creating HELLO-BACKEND.md..."
- "Committing changes to both repositories"

<!-- Screenshot placeholder: Multi-repo execution logs -->

---

### Step 7: Verify Results in Both Repos

Once completed, verify each repository:

**Frontend Repo:**

1. Click **"View in Repository"** → select frontend repo
2. Confirm `HELLO-FRONTEND.md` exists with correct content
3. Check commit message

**Backend Repo:**

1. Navigate to your backend repo on GitHub
2. Confirm `HELLO-BACKEND.md` exists with correct content
3. Check commit message

**Success Check**: Both files exist in their respective repositories!

<!-- Screenshot placeholder: Both repositories updated successfully -->

---

## Success Criteria

✅ Session completed successfully

✅ Frontend repository has `HELLO-FRONTEND.md` with correct content

✅ Backend repository has `HELLO-BACKEND.md` with correct content

✅ Both repositories have proper commit messages

✅ Session logs show work in both repositories

---

## What Just Happened?

You orchestrated work across **two separate repositories** in a single session! The AI:

1. **Understood the context**: Knew which file goes where
2. **Managed workspaces**: Switched between repository working directories
3. **Isolated changes**: Kept frontend and backend work separate
4. **Committed separately**: Created appropriate commits for each repo
5. **Pushed everything**: Both repositories updated automatically

**This is multi-repo coordination that would normally require:**

- Multiple terminal windows
- Manual repo switching
- Careful tracking of what goes where
- Multiple commit/push cycles

**ACP did it all in one shot!**

---

## Troubleshooting

**Only one repository updated?**

- Check session logs to see if AI worked on both
- Verify both repository URLs are correct
- Ensure you have write access to both repos
- Try again with more explicit prompt (mention both repos by name)

**Wrong files in wrong repos?**

- Review the prompt - be specific about which file goes where
- Use clear naming: "In repository X" vs "In repository Y"
- Check the "Working Directory" checkbox - that's where AI starts

**Authentication issues?**

- Ensure ACP has access to both repositories
- Check Project Settings → Git Credentials
- Try with two public repos first to rule out auth problems

---

## Going Deeper

**Challenge Yourself:**

Try these multi-repo scenarios:

**Shared Library Pattern:**

```text
Create a shared utility function in the backend repo (utils.py)
and corresponding import/usage example in the frontend repo (app.py).
```

**Synchronized Versioning:**

```text
Update version numbers in both repos to 1.0.0:
- Frontend: package.json
- Backend: setup.py
Ensure they match.
```

**Cross-Repo Documentation:**

```text
Create API documentation in the backend repo (API.md)
and a corresponding integration guide in the frontend repo (INTEGRATION.md)
that references the API docs.
```

---

## What You Learned

- **Multi-Repo Sessions**: How to work across multiple repositories
- **Workspace Management**: AI understands different working directories
- **Coordinated Changes**: Making related changes across repos in one shot
- **Repository Isolation**: Changes stay organized and separate
- **Efficiency**: What would take 10 minutes manually takes 60 seconds with ACP

---

## Real-World Applications

Multi-repo sessions are perfect for:

- **Microservices**: Update frontend + backend + API gateway together
- **Monorepo Migration**: Gradually split code across repos
- **Library Maintenance**: Update library + example projects simultaneously
- **Documentation**: Keep docs in sync with code across repos
- **Configuration**: Update dev/staging/prod config repos together

---

## Next Steps

**Continue Learning:**

- **[Lab 4: Hello RFE →](04-hello-rfe.md)** - Watch 7 agents collaborate on a design
- **[User Guide](../../user-guide/index.md)** - Learn more about ACP features

**Try More Complex Scenarios:**

- Work with 3+ repositories
- Use fork workflows (input repo ≠ output repo)
- Coordinate breaking changes across service boundaries

---

**Incredible!** 🎯 You just coordinated work across multiple repositories in one session. Ready to see how 7 AI agents collaborate?

[← Lab 2: Hello Code](02-hello-code.md) | [Back to Index](index.md) | [Next Lab: Hello RFE →](04-hello-rfe.md)
