# Lab 1: Hello ACP - Your First Session

## What You'll Learn

Create your first AI session and watch it automatically create a "Hello ACP!" file in a repository.

## Time Required

2 minutes

## Prerequisites

- Access to the ACP UI
- A test repository (we'll guide you to create one if needed)
- That's it!

---

## Steps

### Step 1: Navigate to Sessions

1. Log in to the ACP UI
2. Select your project (or create a new one called "hello-acp-lab")
3. Click **"Sessions"** in the left navigation menu
4. Click the **"+ New Session"** button (top right)

<!-- Screenshot placeholder: Navigate to Sessions view -->

**Success Check**: You should see a session creation form with fields for Repository, Prompt, and Settings.

---

### Step 2: Configure Your Repository

In the **Repository** section:

1. **Repository URL**: Enter a test repository URL (or use the default if provided)
   - Example: `https://github.com/your-username/hello-acp-test`
   - Or click **"Create test repo"** if that option is available

2. **Branch**: Leave as `main` (default)

**Don't have a test repo?** No problem! You can use any public repo you have write access to, or create a new one on GitHub:

- Go to github.com → New Repository
- Name it `hello-acp-test`
- Make it public
- Initialize with README
- Copy the URL

---

### Step 3: Enter Your Prompt

In the **Prompt** field, copy and paste this exact text:

```text
Create a new file called hello-acp.md in the root of the repository with the following content:

# Hello ACP!

This file was created by the Ambient Code Platform.

Date: [today's date]
Project: Hello ACP Lab 1

The future of software development is here, and it's awesome!
```

**Success Check**: The prompt should be pasted in the large text area.

---

### Step 4: Choose Your Settings

Leave all settings at their defaults:

- **Model**: Claude Sonnet 4.5 (default)
- **Interactive Mode**: OFF (unchecked)
- **Timeout**: 300 seconds (default)

---

### Step 5: Launch Your Session

1. Click the **"Create Session"** button at the bottom
2. You'll be redirected to the session detail page
3. Watch the status change from `Pending` → `Creating` → `Running` → `Completed`

**This usually takes 30-60 seconds.**

<!-- Screenshot placeholder: Session running view -->

---

### Step 6: View Your Results

Once the status shows `Completed`:

1. Click the **"View Output"** tab
2. You should see logs showing:
   - File created: `hello-acp.md`
   - Content written
   - Changes committed

3. Click **"View in Repository"** to see the file on GitHub

**Success Check**: The file `hello-acp.md` exists in your repository with the Hello ACP content!

<!-- Screenshot placeholder: Completed session view -->

---

## Success Criteria

✅ Session status shows `Completed`

✅ File `hello-acp.md` exists in your repository

✅ File contains "Hello ACP!" heading and the text you specified

✅ Changes are committed to the `main` branch (or your specified branch)

---

## What Just Happened?

You just orchestrated an AI agent to:

1. Clone your repository
2. Create a new file with specific content
3. Commit the changes
4. Push back to GitHub

**All automatically, in under a minute!** This is the power of the Ambient Code Platform.

---

## Troubleshooting

**Session stuck in "Pending"?**

- Check that your repository URL is correct
- Ensure you have write access to the repository
- Verify your API credentials are configured in Project Settings

**Session failed?**

- Click "View Logs" to see what went wrong
- Common issue: Repository authentication - make sure ACP has access
- Try again with a public repository to rule out auth issues

**Don't see the file in your repo?**

- Refresh the GitHub page
- Check the commit history to verify the commit was pushed
- Look at the session logs for the commit message

---

## What You Learned

- **Session Creation**: How to configure and launch an AI session
- **Prompt Engineering**: How to give clear instructions to the AI
- **Result Verification**: How to check that tasks completed successfully
- **Git Integration**: ACP automatically commits and pushes changes

---

## Next Steps

**Continue the Journey:**

- **[Lab 2: Hello Code →](02-hello-code.md)** - Watch AI write a complete Python program
- **[User Guide](../../user-guide/index.md)** - Learn more about ACP features

**Try It Yourself:**

- Modify the prompt to create different files
- Try creating multiple files in one session
- Experiment with different file types (Python, JavaScript, etc.)

---

**Congratulations!** 🎉 You've completed your first ACP session. You're now ready to explore more advanced features!

[← Back to Hello ACP Labs](index.md) | [Next Lab: Hello Code →](02-hello-code.md)
