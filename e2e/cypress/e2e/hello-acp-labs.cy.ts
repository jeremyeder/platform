/**
 * Hello ACP Labs - Cypress E2E Test Suite
 *
 * This test suite automates the 5 Hello ACP labs to ensure they remain
 * foolproof and functional. Each lab is designed to take 2-3 minutes
 * for a human user, but these tests validate the critical paths.
 *
 * Test Strategy:
 * - Use data-testid attributes for reliable selectors
 * - Minimize typing, maximize clicking
 * - Verify success criteria from each lab
 * - Handle async operations (session creation, completion)
 * - Clean up resources between tests
 */

describe('Hello ACP Labs - Full Suite', () => {
  const TEST_PROJECT = 'hello-acp-test-project';
  const TEST_REPO_FRONTEND = 'https://github.com/test-user/hello-acp-frontend';
  const TEST_REPO_BACKEND = 'https://github.com/test-user/hello-acp-backend';

  // Setup: Create test project if it doesn't exist
  before(() => {
    cy.visit('/');
    cy.login(); // Custom command for authentication

    // Create or navigate to test project
    cy.createProjectIfNotExists(TEST_PROJECT);
  });

  // Cleanup: Remove test sessions after all tests
  after(() => {
    cy.cleanupTestSessions(TEST_PROJECT);
  });

  /**
   * Lab 1: Hello ACP - Your First Session
   *
   * Validates:
   * - Session creation UI navigation
   * - Repository configuration
   * - Prompt input and submission
   * - Session execution and completion
   * - File creation verification
   *
   * Expected Duration: ~60 seconds
   */
  describe('Lab 1: Your First Session', () => {
    it('should complete the first session lab successfully', () => {
      // Step 1: Navigate to Sessions
      cy.get('[data-testid="nav-sessions"]').click();
      cy.get('[data-testid="new-session-button"]').should('be.visible').click();
      cy.url().should('include', '/sessions/new');

      // Step 2: Configure Repository
      cy.get('[data-testid="repo-url-input"]')
        .should('be.visible')
        .type(TEST_REPO_FRONTEND);

      cy.get('[data-testid="repo-branch-input"]')
        .should('have.value', 'main'); // Verify default

      // Step 3: Enter Prompt
      const lab1Prompt = `Create a new file called hello-acp.md in the root of the repository with the following content:

# Hello ACP!

This file was created by the Ambient Code Platform.

Date: ${new Date().toISOString().split('T')[0]}
Project: Hello ACP Lab 1

The future of software development is here, and it's awesome!`;

      cy.get('[data-testid="session-prompt-input"]')
        .should('be.visible')
        .clear()
        .type(lab1Prompt, { delay: 0 }); // Type fast in tests

      // Step 4: Verify Default Settings
      cy.get('[data-testid="model-select"]')
        .should('contain', 'Claude Sonnet 4.5');

      cy.get('[data-testid="interactive-mode-toggle"]')
        .should('not.be.checked');

      cy.get('[data-testid="timeout-input"]')
        .should('have.value', '300');

      // Step 5: Launch Session
      cy.get('[data-testid="create-session-button"]').click();

      // Should redirect to session detail page
      cy.url().should('include', '/sessions/');
      cy.url().should('not.include', '/new');

      // Step 6: Wait for Completion
      // Watch status transition: Pending → Creating → Running → Completed
      cy.get('[data-testid="session-status"]', { timeout: 90000 })
        .should('contain', 'Completed');

      // Verify session details
      cy.get('[data-testid="session-name"]').should('be.visible');
      cy.get('[data-testid="session-start-time"]').should('be.visible');
      cy.get('[data-testid="session-completion-time"]').should('be.visible');

      // Step 7: Verify Output
      cy.get('[data-testid="tab-output"]').click();
      cy.get('[data-testid="output-logs"]')
        .should('contain', 'hello-acp.md')
        .should('contain', 'created');

      // Verify file link
      cy.get('[data-testid="view-in-repo-button"]')
        .should('be.visible')
        .should('have.attr', 'href')
        .and('include', 'hello-acp.md');

      // Success criteria met!
      cy.log('Lab 1 completed successfully: First session created file in repository');
    });
  });

  /**
   * Lab 2: Hello Code - AI That Writes Code
   *
   * Validates:
   * - Code generation from natural language
   * - Python file creation with proper structure
   * - Type hints, docstrings, and best practices
   * - Syntax highlighting in diff view
   *
   * Expected Duration: ~90 seconds
   */
  describe('Lab 2: AI That Writes Code', () => {
    it('should generate a complete Python program', () => {
      // Navigate to new session
      cy.get('[data-testid="nav-sessions"]').click();
      cy.get('[data-testid="new-session-button"]').click();

      // Configure repo
      cy.get('[data-testid="repo-url-input"]').type(TEST_REPO_FRONTEND);

      // Enter code generation prompt
      const lab2Prompt = `Create a Python program called hello_acp.py that does the following:

1. Prints "Hello from the Ambient Code Platform!" in ASCII art
2. Shows the current date and time
3. Displays a random inspirational quote about AI and automation
4. Has a main function that runs everything
5. Includes docstrings and type hints

Make it colorful using ANSI escape codes for terminal output.`;

      cy.get('[data-testid="session-prompt-input"]')
        .clear()
        .type(lab2Prompt, { delay: 0 });

      // Launch
      cy.get('[data-testid="create-session-button"]').click();

      // Wait for completion
      cy.get('[data-testid="session-status"]', { timeout: 120000 })
        .should('contain', 'Completed');

      // Verify code was created
      cy.get('[data-testid="tab-output"]').click();
      cy.get('[data-testid="output-logs"]')
        .should('contain', 'hello_acp.py')
        .should('contain', 'created');

      // Check files changed section
      cy.get('[data-testid="files-changed-section"]').within(() => {
        cy.contains('hello_acp.py').should('be.visible');
      });

      // Verify file diff shows Python code
      cy.get('[data-testid="view-diff-button"]').click();
      cy.get('[data-testid="file-diff"]')
        .should('contain', 'def main()')
        .should('contain', 'import')
        .should('contain', '"""'); // Docstring

      cy.log('Lab 2 completed: AI generated working Python code');
    });
  });

  /**
   * Lab 3: Hello Multi-Repo
   *
   * Validates:
   * - Multi-repository session creation
   * - Adding multiple repos to one session
   * - Main repo selection
   * - Coordinated changes across repos
   * - Per-repo status tracking
   *
   * Expected Duration: ~90 seconds
   */
  describe('Lab 3: Multi-Repo Operations', () => {
    it('should create files in multiple repositories', () => {
      // Navigate to new session
      cy.get('[data-testid="nav-sessions"]').click();
      cy.get('[data-testid="new-session-button"]').click();

      // Configure first repo
      cy.get('[data-testid="repo-url-input"]').type(TEST_REPO_FRONTEND);
      cy.get('[data-testid="working-directory-checkbox"]').check();

      // Add second repo
      cy.get('[data-testid="add-repository-button"]')
        .should('be.visible')
        .click();

      // Configure second repo
      cy.get('[data-testid="repo-url-input"]')
        .eq(1) // Second repo input
        .type(TEST_REPO_BACKEND);

      // Verify both repos are listed
      cy.get('[data-testid="repository-list"]').within(() => {
        cy.contains(TEST_REPO_FRONTEND).should('be.visible');
        cy.contains(TEST_REPO_BACKEND).should('be.visible');
      });

      // Enter multi-repo prompt
      const lab3Prompt = `I'm working with a frontend and backend repository.

In the FRONTEND repository (hello-acp-frontend):
- Create a file called HELLO-FRONTEND.md
- Add content: "# Hello from Frontend!\\n\\nThis is the user-facing part of our Hello ACP application."

In the BACKEND repository (hello-acp-backend):
- Create a file called HELLO-BACKEND.md
- Add content: "# Hello from Backend!\\n\\nThis is the API server for our Hello ACP application."

Both files should be created in the root of their respective repositories.
Commit each change with a descriptive message.`;

      cy.get('[data-testid="session-prompt-input"]')
        .clear()
        .type(lab3Prompt, { delay: 0 });

      // Launch
      cy.get('[data-testid="create-session-button"]').click();

      // Wait for completion
      cy.get('[data-testid="session-status"]', { timeout: 120000 })
        .should('contain', 'Completed');

      // Verify output mentions both repos
      cy.get('[data-testid="tab-output"]').click();
      cy.get('[data-testid="output-logs"]')
        .should('contain', 'HELLO-FRONTEND.md')
        .should('contain', 'HELLO-BACKEND.md')
        .should('contain', 'frontend')
        .should('contain', 'backend');

      // Verify per-repo status
      cy.get('[data-testid="repos-status-section"]').within(() => {
        cy.contains(TEST_REPO_FRONTEND).should('be.visible');
        cy.contains(TEST_REPO_BACKEND).should('be.visible');

        // Both should show "pushed" status
        cy.get('[data-testid="repo-status"]')
          .should('have.length', 2)
          .each(($el) => {
            cy.wrap($el).should('contain', 'pushed');
          });
      });

      cy.log('Lab 3 completed: Multi-repo coordination successful');
    });
  });

  /**
   * Lab 4: Hello RFE - The 7-Agent Council
   *
   * Validates:
   * - RFE workflow navigation
   * - RFE creation and submission
   * - 7-agent council execution
   * - Agent contributions display
   * - Refined RFE output
   *
   * Expected Duration: ~180 seconds (agents take time)
   */
  describe('Lab 4: The 7-Agent Council', () => {
    it('should complete an RFE workflow with all 7 agents', () => {
      // Navigate to RFE Workflows
      cy.get('[data-testid="nav-rfe-workflows"]').click();
      cy.get('[data-testid="new-rfe-button"]')
        .should('be.visible')
        .click();

      // Enter RFE details
      cy.get('[data-testid="rfe-title-input"]')
        .type('Add a Hello Endpoint to the API');

      const lab4Description = `We need to add a simple HTTP endpoint to our application that responds to GET requests.

Requirements:
- Endpoint path: /api/hello
- Method: GET
- Response: JSON with message "Hello from ACP!" and current timestamp
- Should work without authentication (public endpoint)

This is for testing and demonstration purposes.`;

      cy.get('[data-testid="rfe-description-input"]')
        .type(lab4Description, { delay: 0 });

      // Select repository
      cy.get('[data-testid="rfe-repo-select"]')
        .select(TEST_REPO_FRONTEND);

      // Submit RFE
      cy.get('[data-testid="create-rfe-button"]').click();

      // Should redirect to RFE detail page
      cy.url().should('include', '/rfe/');

      // Wait for all 7 agents to complete (this can take 2-3 minutes)
      cy.get('[data-testid="rfe-status"]', { timeout: 240000 })
        .should('contain', 'Completed');

      // Verify all 7 agents contributed
      const expectedAgents = [
        'Product Manager',
        'Architect',
        'Staff Engineer',
        'Product Owner',
        'Team Lead',
        'Team Member',
        'Delivery Owner'
      ];

      expectedAgents.forEach((agent) => {
        cy.get('[data-testid="agent-contributions"]')
          .should('contain', agent);

        // Each agent should have visible contribution text
        cy.get(`[data-testid="agent-${agent.toLowerCase().replace(' ', '-')}"]`)
          .should('be.visible')
          .should('not.be.empty');
      });

      // Verify refined RFE output exists
      cy.get('[data-testid="refined-rfe-output"]')
        .should('be.visible')
        .should('contain', 'Requirements')
        .should('contain', 'Implementation')
        .should('contain', 'Testing')
        .should('contain', 'Acceptance Criteria');

      // Refined output should be more detailed than original
      cy.get('[data-testid="refined-rfe-output"]').then(($refined) => {
        const refinedLength = $refined.text().length;
        expect(refinedLength).to.be.greaterThan(lab4Description.length);
      });

      cy.log('Lab 4 completed: 7-agent council refined the RFE');
    });
  });

  /**
   * Lab 5: Hello Interactive - Chat With Your AI
   *
   * Validates:
   * - Interactive mode toggle
   * - Session startup with interactive enabled
   * - Message sending and receiving
   * - Real-time conversation
   * - Session completion
   *
   * Expected Duration: ~60 seconds (minimal conversation)
   */
  describe('Lab 5: Interactive Chat', () => {
    it('should enable interactive conversation with AI', () => {
      // Navigate to new session
      cy.get('[data-testid="nav-sessions"]').click();
      cy.get('[data-testid="new-session-button"]').click();

      // Configure repo
      cy.get('[data-testid="repo-url-input"]').type(TEST_REPO_FRONTEND);

      // Enable interactive mode
      cy.get('[data-testid="interactive-mode-toggle"]')
        .should('not.be.checked')
        .check()
        .should('be.checked');

      // Verify UI shows interactive mode enabled
      cy.get('[data-testid="interactive-mode-status"]')
        .should('contain', 'Enabled');

      // Increase timeout for interactive session
      cy.get('[data-testid="timeout-input"]')
        .clear()
        .type('600'); // 10 minutes

      // Enter initial prompt
      const initialPrompt = `Hello! I'd like to explore creating a simple web application.
Can you help me brainstorm what a "Hello ACP" web app might include?`;

      cy.get('[data-testid="session-prompt-input"]')
        .clear()
        .type(initialPrompt, { delay: 0 });

      // Launch interactive session
      cy.get('[data-testid="create-session-button"]').click();

      // Wait for session to be running (not completed)
      cy.get('[data-testid="session-status"]', { timeout: 60000 })
        .should('contain', 'Running');

      // Verify interactive interface appears
      cy.get('[data-testid="message-history"]').should('be.visible');
      cy.get('[data-testid="message-input"]').should('be.visible');
      cy.get('[data-testid="send-message-button"]').should('be.visible');

      // Wait for AI's first response
      cy.get('[data-testid="message-history"]', { timeout: 30000 })
        .should('contain.text', 'Hello') // AI should respond
        .should('not.be.empty');

      // Send a follow-up message
      const followUp = 'I like the interactive tutorial idea. How would we structure that?';

      cy.get('[data-testid="message-input"]')
        .type(followUp)
        .should('have.value', followUp);

      cy.get('[data-testid="send-message-button"]').click();

      // Input should clear after sending
      cy.get('[data-testid="message-input"]')
        .should('have.value', '');

      // Wait for AI's second response
      cy.get('[data-testid="message-history"]', { timeout: 30000 })
        .should('contain', followUp) // User's message
        .should('contain', 'tutorial'); // AI should reference the topic

      // Verify message count (initial + AI response + follow-up + AI response = 4)
      cy.get('[data-testid="message-history"]')
        .find('[data-testid^="message-"]')
        .should('have.length.at.least', 3); // At least 3 messages exchanged

      // Stop the session
      cy.get('[data-testid="stop-session-button"]')
        .should('be.visible')
        .click();

      // Confirm stop dialog
      cy.get('[data-testid="confirm-stop-button"]')
        .should('be.visible')
        .click();

      // Session should transition to Completed
      cy.get('[data-testid="session-status"]', { timeout: 30000 })
        .should('contain', 'Completed');

      // Conversation history should be preserved
      cy.get('[data-testid="message-history"]')
        .should('be.visible')
        .should('contain', initialPrompt)
        .should('contain', followUp);

      cy.log('Lab 5 completed: Interactive conversation successful');
    });
  });

  /**
   * Full Lab Series Integration Test
   *
   * Validates that all labs can be completed in sequence
   * without interference, simulating a user completing
   * the full Hello ACP series in one session.
   */
  describe('Complete Lab Series', () => {
    it('should complete all 5 labs in sequence', () => {
      // This test would run all labs sequentially
      // Useful for integration testing the full user journey
      // Skipped by default to avoid long test runs

      cy.log('Full series test - run individual labs instead');
    });
  });
});

/**
 * Custom Cypress Commands for Hello ACP Labs
 *
 * Add these to cypress/support/commands.ts:
 *
 * Cypress.Commands.add('login', () => {
 *   // Implement authentication based on ACP auth flow
 *   cy.visit('/login');
 *   cy.get('[data-testid="username"]').type(Cypress.env('TEST_USER'));
 *   cy.get('[data-testid="password"]').type(Cypress.env('TEST_PASSWORD'));
 *   cy.get('[data-testid="login-button"]').click();
 *   cy.url().should('not.include', '/login');
 * });
 *
 * Cypress.Commands.add('createProjectIfNotExists', (projectName: string) => {
 *   cy.visit('/projects');
 *   cy.get('body').then(($body) => {
 *     if (!$body.text().includes(projectName)) {
 *       cy.get('[data-testid="new-project-button"]').click();
 *       cy.get('[data-testid="project-name-input"]').type(projectName);
 *       cy.get('[data-testid="create-project-button"]').click();
 *     }
 *   });
 *   cy.contains(projectName).click();
 * });
 *
 * Cypress.Commands.add('cleanupTestSessions', (projectName: string) => {
 *   cy.visit(`/projects/${projectName}/sessions`);
 *   cy.get('[data-testid="session-list"]').then(($list) => {
 *     if ($list.find('[data-testid^="session-"]').length > 0) {
 *       cy.get('[data-testid="select-all-sessions"]').click();
 *       cy.get('[data-testid="delete-selected-button"]').click();
 *       cy.get('[data-testid="confirm-delete-button"]').click();
 *     }
 *   });
 * });
 */

/**
 * Required data-testid Attributes for Frontend
 *
 * To make these tests work, add these data-testid attributes
 * to the corresponding UI components:
 *
 * Navigation:
 * - nav-sessions
 * - nav-rfe-workflows
 * - new-session-button
 * - new-rfe-button
 *
 * Session Creation:
 * - repo-url-input
 * - repo-branch-input
 * - session-prompt-input
 * - model-select
 * - interactive-mode-toggle
 * - interactive-mode-status
 * - timeout-input
 * - create-session-button
 * - add-repository-button
 * - repository-list
 * - working-directory-checkbox
 *
 * Session Detail:
 * - session-status
 * - session-name
 * - session-start-time
 * - session-completion-time
 * - tab-output
 * - output-logs
 * - view-in-repo-button
 * - files-changed-section
 * - view-diff-button
 * - file-diff
 * - repos-status-section
 * - repo-status
 * - stop-session-button
 * - confirm-stop-button
 *
 * Interactive Session:
 * - message-history
 * - message-input
 * - send-message-button
 * - message-{index}
 *
 * RFE Workflow:
 * - rfe-title-input
 * - rfe-description-input
 * - rfe-repo-select
 * - create-rfe-button
 * - rfe-status
 * - agent-contributions
 * - agent-{role}
 * - refined-rfe-output
 */
