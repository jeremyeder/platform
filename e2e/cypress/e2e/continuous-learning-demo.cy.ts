/**
 * Continuous Learning — Feature Demo
 *
 * Human-paced walkthrough of the "yes" paths:
 * 1. Enable the continuous-learning.enabled flag in workspace settings
 * 2. Create a session with the example repo (has .ambient/config.json)
 * 3. Show correction capture (triggers draft PR)
 * 4. Show explicit capture ("save this to learned")
 *
 * Run: cd e2e && npx cypress run --no-runner-ui --spec "cypress/e2e/continuous-learning-demo.cy.ts"
 */
describe('Continuous Learning Demo', () => {
  const workspaceName = `cl-demo-${Date.now()}`
  let workspaceSlug: string

  // Timing constants — aim for ~3 min total video
  const LONG = 3200    // hold on important visuals
  const PAUSE = 2400   // standard pause between actions
  const SHORT = 1600   // brief pause after small actions
  const TYPE_DELAY = 80 // ms per keystroke

  // Target first element (session page renders desktop + mobile layout)
  const chatInput = () => cy.get('textarea[placeholder*="message"]').first()

  // Caption: compact bar at TOP of viewport
  function caption(text: string) {
    cy.document().then((doc) => {
      let el = doc.getElementById('demo-caption')
      if (!el) {
        el = doc.createElement('div')
        el.id = 'demo-caption'
        el.style.cssText = [
          'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:99998',
          'background:rgba(0,0,0,0.80)', 'color:#fff', 'font-size:14px',
          'font-weight:500', 'font-family:system-ui,-apple-system,sans-serif',
          'padding:6px 20px', 'text-align:center', 'letter-spacing:0.2px',
          'pointer-events:none', 'transition:opacity 0.4s ease',
        ].join(';')
        doc.body.appendChild(el)
      }
      el.textContent = text
      el.style.opacity = '1'
    })
  }

  function clearCaption() {
    cy.document().then((doc) => {
      const el = doc.getElementById('demo-caption')
      if (el) el.style.opacity = '0'
    })
  }

  // Synthetic cursor + click ripple
  function initCursor() {
    cy.document().then((doc) => {
      if (doc.getElementById('demo-cursor')) return
      const cursor = doc.createElement('div')
      cursor.id = 'demo-cursor'
      cursor.style.cssText = [
        'position:fixed', 'z-index:99999', 'pointer-events:none',
        'width:20px', 'height:20px', 'border-radius:50%',
        'background:rgba(255,255,255,0.9)', 'border:2px solid #333',
        'box-shadow:0 0 6px rgba(0,0,0,0.4)',
        'transform:translate(-50%,-50%)',
        'transition:left 0.5s cubic-bezier(0.25,0.1,0.25,1), top 0.5s cubic-bezier(0.25,0.1,0.25,1)',
        'left:-40px', 'top:-40px',
      ].join(';')
      doc.body.appendChild(cursor)
      const ripple = doc.createElement('div')
      ripple.id = 'demo-ripple'
      ripple.style.cssText = [
        'position:fixed', 'z-index:99999', 'pointer-events:none',
        'width:40px', 'height:40px', 'border-radius:50%',
        'border:3px solid rgba(59,130,246,0.8)',
        'transform:translate(-50%,-50%) scale(0)',
        'opacity:0', 'left:-40px', 'top:-40px',
      ].join(';')
      doc.body.appendChild(ripple)
      const style = doc.createElement('style')
      style.textContent = `
        @keyframes demo-ripple-anim {
          0%   { transform: translate(-50%,-50%) scale(0); opacity: 1; }
          100% { transform: translate(-50%,-50%) scale(2.5); opacity: 0; }
        }
      `
      doc.head.appendChild(style)
    })
  }

  function moveTo(selector: string, options?: { first?: boolean }) {
    const chain = options?.first ? cy.get(selector).first() : cy.get(selector)
    chain.then(($el) => {
      const rect = $el[0].getBoundingClientRect()
      cy.document().then((doc) => {
        const cursor = doc.getElementById('demo-cursor')
        if (cursor) {
          cursor.style.left = `${rect.left + rect.width / 2}px`
          cursor.style.top = `${rect.top + rect.height / 2}px`
        }
      })
      cy.wait(600)
    })
  }

  function moveToText(text: string, tag?: string) {
    const chain = tag ? cy.contains(tag, text) : cy.contains(text)
    chain.then(($el) => {
      const rect = $el[0].getBoundingClientRect()
      cy.document().then((doc) => {
        const cursor = doc.getElementById('demo-cursor')
        if (cursor) {
          cursor.style.left = `${rect.left + rect.width / 2}px`
          cursor.style.top = `${rect.top + rect.height / 2}px`
        }
      })
      cy.wait(600)
    })
  }

  function clickEffect() {
    cy.document().then((doc) => {
      const cursor = doc.getElementById('demo-cursor')
      const ripple = doc.getElementById('demo-ripple')
      if (cursor && ripple) {
        ripple.style.left = cursor.style.left
        ripple.style.top = cursor.style.top
        ripple.style.animation = 'none'
        void ripple.offsetHeight
        ripple.style.animation = 'demo-ripple-anim 0.5s ease-out forwards'
      }
    })
  }

  function cursorClickText(text: string, tag?: string, options?: { force?: boolean }) {
    moveToText(text, tag)
    clickEffect()
    const chain = tag ? cy.contains(tag, text) : cy.contains(text)
    chain.click({ force: options?.force })
  }

  Cypress.on('uncaught:exception', (err) => {
    if (err.message.includes('Minified React error') || err.message.includes('Hydration')) {
      return false
    }
    return true
  })

  after(() => {
    if (!Cypress.env('KEEP_WORKSPACES')) {
      const token = Cypress.env('TEST_TOKEN')
      cy.request({
        method: 'DELETE',
        url: `/api/projects/${workspaceSlug}`,
        headers: { Authorization: `Bearer ${token}` },
        failOnStatusCode: false,
      })
    }
  })

  it('walks through the Continuous Learning flow end-to-end', () => {
    const token = Cypress.env('TEST_TOKEN')
    expect(token, 'TEST_TOKEN should be set').to.exist

    // ── ACT 1: Create workspace ──────────────────────────────────

    caption('Creating a new workspace for the demo...')

    cy.request({
      method: 'POST',
      url: '/api/projects',
      headers: { Authorization: `Bearer ${token}` },
      body: { name: workspaceName, displayName: 'CL Demo Workspace' },
    }).then((resp) => {
      expect(resp.status).to.be.oneOf([200, 201])
      workspaceSlug = resp.body.name || workspaceName

      // Poll until namespace ready
      const poll = (attempt: number): void => {
        if (attempt > 30) throw new Error('Namespace timeout')
        cy.request({
          url: `/api/projects/${workspaceSlug}`,
          headers: { Authorization: `Bearer ${token}` },
          failOnStatusCode: false,
        }).then((r) => {
          if (r.status !== 200) {
            cy.wait(1500, { log: false })
            poll(attempt + 1)
          }
        })
      }
      poll(1)
    })

    // Set API key for runner
    const apiKey = Cypress.env('ANTHROPIC_API_KEY') || 'mock-replay-key'
    cy.then(() =>
      cy.request({
        method: 'PUT',
        url: `/api/projects/${workspaceSlug}/runner-secrets`,
        headers: { Authorization: `Bearer ${token}` },
        body: { data: { ANTHROPIC_API_KEY: apiKey } },
      })
    )

    cy.wait(SHORT)

    // ── ACT 2: Enable the feature flag ───────────────────────────

    caption('Step 1: Enable continuous-learning.enabled in workspace settings')
    cy.wait(PAUSE)

    cy.then(() => {
      cy.visit(`/projects/${workspaceSlug}/settings`)
      initCursor()
    })

    cy.wait(PAUSE)

    caption('Navigate to workspace settings → Feature Flags section')
    cy.wait(PAUSE)

    // Look for the feature flags section/tab
    cy.get('body').then(($body) => {
      if ($body.find('[data-testid="feature-flags"]').length > 0) {
        moveTo('[data-testid="feature-flags"]')
        clickEffect()
        cy.get('[data-testid="feature-flags"]').click()
      } else if ($body.text().includes('Feature Flags')) {
        cursorClickText('Feature Flags')
      }
    })
    cy.wait(PAUSE)

    caption('Find the continuous-learning.enabled flag and toggle it ON')
    cy.wait(PAUSE)

    // Look for the CL flag toggle
    cy.get('body').then(($body) => {
      if ($body.text().includes('continuous-learning')) {
        moveToText('continuous-learning')
        cy.wait(SHORT)
        // Find and click the toggle near the flag name
        cy.contains('continuous-learning')
          .closest('[class*="flag"], tr, [class*="row"], [class*="item"]')
          .find('button, [role="switch"], input[type="checkbox"]')
          .first()
          .then(($toggle) => {
            moveTo(`#${$toggle.attr('id') || ''}`, { first: true })
            clickEffect()
            cy.wrap($toggle).click({ force: true })
          })
      }
    })

    cy.wait(LONG)
    caption('✓ Feature flag enabled — this workspace now supports Continuous Learning')
    cy.wait(LONG)

    // ── ACT 3: Create a session with the example repo ────────────

    caption('Step 2: Create a session with a repo that has .ambient/config.json')
    cy.wait(PAUSE)

    // Create session via API with the example repo
    cy.then(() =>
      cy.request({
        method: 'POST',
        url: `/api/projects/${workspaceSlug}/agentic-sessions`,
        headers: { Authorization: `Bearer ${token}` },
        body: {
          initialPrompt: '',
          repos: [
            {
              url: 'https://github.com/jeremyeder/continuous-learning-example',
              branch: 'main',
              autoPush: true,
            },
          ],
        },
      }).then((resp) => {
        const sessionName = resp.body.name || resp.body.metadata?.name
        cy.visit(`/projects/${workspaceSlug}/sessions/${sessionName}`)
        initCursor()
      })
    )

    cy.wait(PAUSE)
    caption('Session created with jeremyeder/continuous-learning-example repo')
    cy.wait(LONG)

    caption('The runner reads .ambient/config.json → finds learning.enabled: true')
    cy.wait(LONG)

    caption('CL instructions are injected into the system prompt automatically')
    cy.wait(LONG)

    // ── ACT 4: Demonstrate correction capture ────────────────────

    caption('Step 3: Correction Capture — give a directive, then correct it')
    cy.wait(PAUSE)

    // Wait for session to be ready (textarea visible)
    chatInput().should('be.visible', { timeout: 180_000 })
    cy.wait(SHORT)

    // Type the initial directive
    caption('Ask Claude to add a feature using the wrong pattern...')
    moveTo('textarea[placeholder*="message"]', { first: true })
    clickEffect()
    chatInput().click({ force: true })
    chatInput().type(
      'Add a PATCH /tasks/{task_id} endpoint to update a task status. Use a plain dict for the request body.',
      { delay: TYPE_DELAY }
    )
    cy.wait(SHORT)

    caption('Send the message')
    // Submit via Enter or send button
    chatInput().type('{enter}')
    cy.wait(LONG)

    // Wait for response (look for assistant message)
    caption('Claude implements it with a plain dict...')
    cy.wait(LONG * 2)

    // Now send the correction
    caption('Now correct Claude — redirect to the right pattern')
    cy.wait(PAUSE)

    chatInput().should('be.visible')
    moveTo('textarea[placeholder*="message"]', { first: true })
    clickEffect()
    chatInput().click({ force: true })
    chatInput().type(
      "No, don't use a plain dict. Create a proper Pydantic model called TaskUpdate with an optional status field. We always use Pydantic models for request bodies in this project.",
      { delay: TYPE_DELAY }
    )
    cy.wait(SHORT)
    chatInput().type('{enter}')

    caption('Claude detects the correction → silently creates a draft PR')
    cy.wait(LONG * 2)

    caption('A draft PR with the learned/correction-* branch now exists on the repo')
    cy.wait(LONG)

    caption('The developer was never interrupted — capture was completely silent')
    cy.wait(LONG)

    // ── ACT 5: Demonstrate explicit capture ──────────────────────

    caption('Step 4: Explicit Capture — save a pattern to learned knowledge')
    cy.wait(PAUSE)

    chatInput().should('be.visible')
    moveTo('textarea[placeholder*="message"]', { first: true })
    clickEffect()
    chatInput().click({ force: true })
    chatInput().type(
      'save this to learned: In this project, all ID fields use uuid4().hex[:8] for short readable IDs. Do not use auto-incrementing integers or full UUIDs.',
      { delay: TYPE_DELAY }
    )
    cy.wait(SHORT)
    chatInput().type('{enter}')

    caption('Claude creates another draft PR for the explicit pattern save')
    cy.wait(LONG * 2)

    caption('Claude responds: "Saved to learned knowledge." — minimal acknowledgment')
    cy.wait(LONG)

    // ── ACT 6: Show the result ───────────────────────────────────

    caption('Step 5: Draft PRs are now on the repo, ready for triage')
    cy.wait(LONG)

    caption('Reviewers see them in the Triage Dashboard → Learned Knowledge section')
    cy.wait(LONG)

    caption('Merge = keep the knowledge. Close = discard. Next session benefits automatically.')
    cy.wait(LONG)

    // ── OUTRO ────────────────────────────────────────────────────

    caption('Continuous Learning: configure once, knowledge compounds forever')
    cy.wait(LONG)

    caption('1. Add .ambient/config.json  →  2. Enable flag  →  3. Knowledge flows')
    cy.wait(LONG * 2)

    clearCaption()
    cy.wait(SHORT)
  })
})
