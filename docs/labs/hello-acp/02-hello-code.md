# Lab 2: Hello Code - AI That Writes Code

## What You'll Learn

Watch the AI write a complete, working Python program from scratch. See code generation in action!

## Time Required

3 minutes

## Prerequisites

- Completed [Lab 1: Hello ACP](01-first-session.md) OR comfortable creating sessions
- A test repository (can use the same one from Lab 1)

---

## Steps

### Step 1: Create a New Session

1. Navigate to **Sessions** in your project
2. Click **"+ New Session"**
3. Select your test repository (same as Lab 1 is fine)

---

### Step 2: Enter the Code Generation Prompt

Copy and paste this prompt:

```text
Create a Python program called hello_acp.py that does the following:

1. Prints "Hello from the Ambient Code Platform!" in ASCII art
2. Shows the current date and time
3. Displays a random inspirational quote about AI and automation
4. Has a main function that runs everything
5. Includes docstrings and type hints

Make it colorful using ANSI escape codes for terminal output.
```

---

### Step 3: Launch and Watch

1. Leave all settings at defaults
2. Click **"Create Session"**
3. Watch the AI work (30-90 seconds)

**What to look for in the logs:**

- "Creating file: hello_acp.py"
- "Adding type hints..."
- "Testing the program..."
- "Commit: Add hello_acp.py"

<!-- Screenshot placeholder: AI writing code in progress -->

---

### Step 4: Review the Generated Code

Once completed:

1. Click **"View Output"** tab
2. Click **"View Files Changed"** to see the diff
3. Click **"View in Repository"** to see it on GitHub

**Success Check**: You should see a complete Python file with:

- ASCII art function
- Date/time display
- Quote selection
- Color formatting
- Type hints
- Docstrings

<!-- Screenshot placeholder: Generated code review -->

---

### Step 5: (Optional) Run the Code

Want to see it in action?

1. Clone your repository locally:

   ```bash
   git clone [your-repo-url]
   cd [repo-name]
   ```

2. Run the program:

   ```bash
   python hello_acp.py
   ```

3. See the colorful output with ASCII art, time, and an inspirational quote!

---

## Success Criteria

✅ Session completed successfully

✅ File `hello_acp.py` created in repository

✅ Code includes all requested features (ASCII art, time, quotes, colors)

✅ Code has proper Python structure (main function, type hints, docstrings)

✅ Code runs without errors (if you tested it locally)

---

## What Just Happened?

The AI didn't just create a file - it:

1. **Understood requirements**: Parsed your prompt into specific tasks
2. **Designed the solution**: Planned functions and structure
3. **Wrote the code**: Generated working Python with best practices
4. **Added polish**: Included type hints, docstrings, and comments
5. **Tested it**: Likely ran the code to verify it works
6. **Committed cleanly**: Created a proper git commit

**This is AI-assisted development in action!**

---

## Troubleshooting

**Code doesn't run locally?**

- Check Python version (should work with Python 3.8+)
- Look at the session logs - AI may have noted dependencies
- The code should be dependency-free for this simple example

**Code is missing features?**

- Check the session logs to see if the AI explained any choices
- Try running the session again with a more specific prompt
- Some variation is normal - AI is creative!

**Want different code?**

- Modify the prompt to be more specific
- Request specific libraries (e.g., "use rich library for colors")
- Ask for different features (animations, user input, etc.)

---

## Going Deeper

**Challenge Yourself:**

Try modifying the prompt to generate:

- A web server that serves "Hello ACP" as HTML
- A CLI tool with argument parsing
- A simple game (guess the number, rock-paper-scissors)
- A data visualization script

**Example Enhanced Prompt:**

```text
Create a Python CLI tool called hello_acp.py that:
- Uses argparse for command-line arguments
- Has a --name flag to personalize the greeting
- Has a --style flag to choose ASCII art style (banner, big, small)
- Has a --quote flag to show a random quote or specific category
- Includes unit tests in a separate test_hello_acp.py file
```

---

## What You Learned

- **Code Generation**: AI can write complete, working programs
- **Requirements Translation**: Natural language → working code
- **Best Practices**: AI includes type hints, docstrings, proper structure
- **Testing**: AI validates code before committing
- **Version Control**: Clean commits with descriptive messages

---

## Next Steps

**Continue Learning:**

- **[Lab 3: Hello Multi-Repo →](03-multi-repo.md)** - Create files in multiple repos at once
- **[User Guide](../../user-guide/index.md)** - Learn more about ACP features

**Advanced Code Generation:**

- Generate entire project structures
- Convert between programming languages
- Refactor existing code
- Add features to existing codebases

---

**Awesome!** 🚀 You just watched AI write a complete program. Ready to see it work across multiple repos?

[← Lab 1: First Session](01-first-session.md) | [Back to Index](index.md) | [Next Lab: Multi-Repo →](03-multi-repo.md)
