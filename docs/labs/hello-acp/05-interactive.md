# Lab 5: Hello Interactive - Chat With Your AI

## What You'll Learn

Have a real-time conversation with an AI agent. Ask questions, iterate on ideas, and collaborate interactively!

## Time Required

2-3 minutes (plus however long you want to chat!)

## Prerequisites

- Completed previous labs OR comfortable with sessions
- A test repository
- A question or task you want to explore with AI

---

## Steps

### Step 1: Create an Interactive Session

1. Navigate to **Sessions** → **"+ New Session"**
2. Select your test repository
3. **IMPORTANT**: Check the **"Interactive Mode"** checkbox

<!-- Screenshot placeholder: Interactive mode toggle in session creation -->

**Success Check**: The UI should show "Interactive Mode: Enabled" and possibly different options.

---

### Step 2: Start With a Simple Prompt

Enter this initial prompt to start the conversation:

```text
Hello! I'd like to explore creating a simple web application.
Can you help me brainstorm what a "Hello ACP" web app might include?
```

---

### Step 3: Launch the Interactive Session

1. Leave **Timeout** at default or increase to 600 seconds (10 min) for longer conversations
2. Click **"Create Session"**
3. Wait for the session to reach **"Running"** status

**Success Check**: Status shows "Running" and you see an interaction interface.

---

### Step 4: Engage in Conversation

Once running, you'll see:

- **Message history**: Previous messages in the conversation
- **Input box**: Type your next message
- **Send button**: Submit your message

**The AI might respond with something like:**

> "Great! A 'Hello ACP' web app could include:
>
> 1. A landing page with project info
> 2. Live demo of session creation
> 3. Code examples for each feature
> 4. Interactive tutorial
>
> Which of these interests you most, or would you like to explore something else?"

**Now it's your turn!** Type a response:

```text
I like the interactive tutorial idea.
How would we structure that?
```

<!-- Screenshot placeholder: Interactive chat interface -->

---

### Step 5: Continue the Conversation

Have a real conversation! Try these follow-up messages:

**Option 1: Dive Deeper**

```text
Can you create a basic HTML structure for the tutorial page?
```

**Option 2: Change Direction**

```text
Actually, let's focus on the landing page instead.
What should it include?
```

**Option 3: Get Specific**

```text
Show me example code for a feature comparison table.
```

**Option 4: Ask for Action**

```text
Let's implement the landing page.
Create index.html with a clean, modern design.
```

**Watch the AI respond and act on your requests in real-time!**

---

### Step 6: Review What Was Created

If you asked the AI to create files:

1. Check the **"Files Changed"** section (updates in real-time)
2. Click **"View Diff"** to see what was created
3. Continue the conversation to iterate on the code

**Example Conversation Flow:**

You: "Create index.html"
AI: *creates file* "I've created index.html with..."

You: "Can you add a navigation bar?"
AI: *updates file* "I've added a nav bar with..."

You: "Make the colors match ACP branding"
AI: *updates styles* "Updated to use..."

**This is iterative development in real-time!**

<!-- Screenshot placeholder: Real-time file updates -->

---

### Step 7: End the Session When Ready

When you're finished:

1. Click **"Complete Session"** or **"Stop Session"**
2. Review the conversation history
3. Check all files that were created/modified

**Success Check**: All your messages and AI responses are logged, and any file changes are committed to your repository.

---

## Success Criteria

✅ Interactive session started successfully

✅ Sent at least 2-3 messages back and forth

✅ AI responded to your questions/requests

✅ If you requested file changes, files were created/modified

✅ Conversation history is preserved

✅ Session can be stopped cleanly

---

## What Just Happened?

You had a **real conversation** with an AI that can:

1. **Understand context**: Remembers previous messages
2. **Answer questions**: Explains concepts and options
3. **Write code**: Creates files based on your requests
4. **Iterate**: Modifies code based on feedback
5. **Collaborate**: Works with you like a pair programmer

**This is pair programming with an AI teammate!**

**Traditional Workflow:**

- Write code → Test → Fix → Repeat
- Look up documentation
- Search Stack Overflow
- Trial and error

**Interactive ACP Workflow:**

- Discuss approach
- AI implements
- You review and request changes
- AI iterates immediately
- **Faster feedback loop, less context switching**

---

## Troubleshooting

**Can't send messages?**

- Verify session status is "Running"
- Check that Interactive Mode was enabled when you created the session
- Refresh the page if the input box isn't appearing

**AI isn't responding?**

- Check session logs for errors
- Verify Anthropic API key is configured
- Ensure session hasn't timed out (default 5 min, can be increased)

**Session timed out?**

- Increase timeout when creating session (up to 3600 seconds / 1 hour)
- Be aware: Interactive sessions consume API credits while running
- Complete session when done to avoid unnecessary costs

**Want to resume a previous conversation?**

- Currently each session is independent
- For continuity, reference previous context in your first message
- Future versions may support session resumption

---

## Going Deeper

**Try These Interactive Scenarios:**

**Debugging Session:**

```text
Initial: "I have a Python script that's throwing a TypeError. Can we debug it together?"
Follow-up: "Here's the error message: [paste error]"
Follow-up: "That fix worked! Now it's running slow. How can we optimize it?"
```

**Learning Session:**

```text
Initial: "I want to learn about WebSockets. Can you explain them and show me a simple example?"
Follow-up: "That makes sense. Can you add error handling to the example?"
Follow-up: "How would I deploy this to production?"
```

**Refactoring Session:**

```text
Initial: "I have messy code in app.py. Can you review it and suggest improvements?"
Follow-up: "Good ideas. Can you refactor it with those patterns?"
Follow-up: "Now add unit tests for the refactored code."
```

**Architecture Session:**

```text
Initial: "I'm designing a microservices architecture. Can we discuss the trade-offs?"
Follow-up: "How would you handle authentication across services?"
Follow-up: "Can you create a diagram showing the flow?"
```

---

## What You Learned

- **Interactive Mode**: Real-time conversation with AI
- **Context Retention**: AI remembers the conversation
- **Iterative Development**: Request changes and see immediate updates
- **Exploratory Work**: Brainstorm and refine ideas together
- **Efficiency**: Faster than searching docs or Stack Overflow

---

## Interactive vs Batch Mode

**When to Use Interactive:**

- ✅ Exploratory work (not sure exactly what you want)
- ✅ Complex tasks requiring back-and-forth
- ✅ Learning and asking questions
- ✅ Debugging and troubleshooting
- ✅ Iterating on designs or code

**When to Use Batch (non-interactive):**

- ✅ Well-defined tasks with clear requirements
- ✅ Automated workflows
- ✅ Bulk operations
- ✅ Scheduled tasks
- ✅ When you won't be monitoring the session

**Pro Tip**: Start interactive to explore and refine, then use batch mode for execution of finalized plans.

---

## Real-World Interactive Use Cases

**Pair Programming:**

- Work through implementation together
- AI explains code as it writes
- Immediate feedback and iteration

**Code Review:**

- Discuss code quality
- Ask "why" questions
- Explore alternative approaches

**Architecture Design:**

- Brainstorm solutions
- Evaluate trade-offs
- Document decisions together

**Debugging:**

- Explain symptoms
- AI suggests diagnoses
- Test fixes together

**Learning:**

- Ask concept questions
- Request examples
- Build understanding incrementally

---

## Next Steps

**You've Completed the Hello ACP Series!** 🎉

**What You've Mastered:**

1. ✅ Creating and managing sessions
2. ✅ AI-powered code generation
3. ✅ Multi-repository operations
4. ✅ RFE workflow and agent collaboration
5. ✅ Interactive real-time collaboration

**Continue Your Journey:**

- **[Basic Labs](../basic/lab-1-first-rfe.md)** - Deeper dive into RFE workflows
- **[User Guide](../../user-guide/index.md)** - Complete platform documentation
- **[Getting Started](../../user-guide/getting-started.md)** - Set up your first project

**Share Your Experience:**

- What was your favorite lab?
- What would you like to try next?
- Any suggestions for improving these labs?

---

**Congratulations!** 🚀 You've completed all 5 Hello ACP labs and experienced the power of the Ambient Code Platform. You're ready to build amazing things!

[← Lab 4: Hello RFE](04-hello-rfe.md) | [Back to Index](index.md) | [Explore More →](../basic/lab-1-first-rfe.md)
