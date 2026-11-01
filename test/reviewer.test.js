/**
 * Reviewer isolation checks: the `egm_reviewer` spawn tool must start children in
 * the read-only preset, and the reviewer tool guard must keep only read/search
 * tools and deny every other call.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const reviewer = await import(pathToFileURL(require.resolve('../reviewer-host.js')).href)
const tools = await import(pathToFileURL(require.resolve('../reviewer-tools.js')).href)

/** Minimal Cordis-like context for the reviewer tool plugin. */
function createReviewerContext(options = {}) {
  const registeredTools = []
  const activations = []
  const createdListeners = []
  const context = {
    effects: [],
    effect(callback) {
      const disposer = callback()
      this.effects.push(disposer)
      return typeof disposer === 'function' ? disposer : () => {}
    },
    on(event, listener) {
      if (event === 'agent/created') createdListeners.push(listener)
      return () => {}
    },
    get(name) {
      if (name === 'agentPresets') {
        if (options.withoutPresets === true) return undefined
        return {
          async list() {
            return options.presets ?? [{ id: 'egm-reviewer' }]
          },
          composedPreset(agentContext) {
            return options.composedPreset?.(agentContext)
          },
        }
      }
      return undefined
    },
    subagents: {
      list() {
        return options.providers ?? ['spawn']
      },
      async startActivation(spec) {
        activations.push(spec)
        return { childId: 'child-reviewer-1', messageId: 'message-1', result: Promise.resolve({}), dispose: async () => {} }
      },
    },
    tools: {
      register(definition) {
        registeredTools.push(definition)
        return () => {}
      },
    },
  }
  return { context, registeredTools, activations, createdListeners }
}

test('the reviewer plugin registers the egm_reviewer tool and starts preset children', async () => {
  const { context, registeredTools, activations } = createReviewerContext()
  reviewer.apply(context)
  assert.equal(registeredTools.length, 1, 'one reviewer tool must be registered')
  const tool = registeredTools[0]
  assert.equal(tool.name, 'egm_reviewer')
  assert.match(tool.description, /read-only/iu)
  const result = await tool.execute(
    { description: 'comprehension reviewer', prompt: 'You are a naive reader.' },
    { agent: { id: 'parent-1' }, signal: new AbortController().signal },
  )
  assert.deepEqual(result, { kind: 'activation', subagentId: 'child-reviewer-1' })
  assert.equal(activations.length, 1, 'the tool must start exactly one activation')
  const spec = activations[0]
  assert.equal(spec.provider, 'spawn')
  assert.equal(spec.delivery, 'parent')
  assert.equal(spec.request.agentPreset, 'egm-reviewer', 'the child must mount the read-only preset')
  assert.equal(spec.request.maxDepth, 1, 'a reviewer must not be able to delegate further')
  assert.deepEqual(spec.request.prompt, [{ type: 'text', text: 'You are a naive reader.' }])
  assert.deepEqual(spec.request.parent, { id: 'parent-1' })
})

test('the reviewer tool fails closed when reviewer support is missing', async () => {
  const cases = [
    { options: { withoutPresets: true }, pattern: /agent-presets service/iu },
    { options: { providers: [] }, pattern: /spawn/iu },
    { options: { presets: [{ id: 'standard' }] }, pattern: /not installed/iu },
  ]
  for (const { options, pattern } of cases) {
    const { context, registeredTools } = createReviewerContext(options)
    reviewer.apply(context)
    const tool = registeredTools[0]
    await assert.rejects(
      () => tool.execute({ description: 'x', prompt: 'y' }, { agent: { id: 'p' }, signal: new AbortController().signal }),
      pattern,
      `reviewer tool must fail closed for ${JSON.stringify(options)}`,
    )
  }
})

test('reviewer agents get every non-read tool hidden at the agent scope', () => {
  const restrictions = []
  const reviewerAgentContext = {
    effect(callback) {
      const disposer = callback()
      return typeof disposer === 'function' ? disposer : () => {}
    },
    tools: {
      schemas() {
        return [
          { name: 'read' },
          { name: 'grep' },
          { name: 'egm_reviewer' },
          { name: 'working_directory' },
          { name: 'load_workspace_dependencies' },
        ]
      },
      restrict(filter) {
        restrictions.push(filter)
        return () => {}
      },
    },
  }
  const standardAgentContext = { ...reviewerAgentContext }
  const { context, createdListeners } = createReviewerContext({
    composedPreset: (agentContext) => (agentContext === reviewerAgentContext ? 'egm-reviewer' : 'standard'),
  })
  reviewer.apply(context)
  assert.equal(createdListeners.length, 1, 'the reviewer plugin must observe agent creation')
  createdListeners[0]({ agent: { ctx: standardAgentContext } })
  assert.equal(restrictions.length, 0, 'non-reviewer agents must not be restricted')
  createdListeners[0]({ agent: { ctx: reviewerAgentContext } })
  assert.equal(restrictions.length, 1, 'a reviewer agent must get one deny-list restriction')
  assert.deepEqual(restrictions[0].deny.sort(), ['egm_reviewer', 'load_workspace_dependencies', 'working_directory'].sort())
})

test('the reviewer guard hides non-read tools and denies every non-allowlisted call', () => {
  const restrictions = []
  const guards = []
  const context = {
    effect(callback) {
      const disposer = callback()
      return typeof disposer === 'function' ? disposer : () => {}
    },
    tools: {
      schemas() {
        return [
          { name: 'read' },
          { name: 'grep' },
          { name: 'ops_read_files' },
          { name: 'write' },
          { name: 'edit' },
          { name: 'bash' },
          { name: 'session_event_read' },
          { name: 'ask_user_question' },
        ]
      },
      restrict(filter) {
        restrictions.push(filter)
        return () => {}
      },
      guard(fn) {
        guards.push(fn)
        return () => {}
      },
    },
  }
  tools.apply(context)
  assert.equal(restrictions.length, 1, 'the guard plugin must restrict once')
  assert.deepEqual(
    restrictions[0].deny.sort(),
    ['ask_user_question', 'bash', 'edit', 'session_event_read', 'write'].sort(),
  )
  assert.equal(guards.length, 1, 'the guard plugin must register one guard')
  const guardFn = guards[0]
  assert.equal(guardFn({ name: 'read' }), undefined, 'read must be allowed')
  assert.equal(guardFn({ name: 'grep' }), undefined, 'grep must be allowed')
  assert.equal(guardFn({ name: 'ops_read_files' }), undefined, 'ops_read_files must be allowed')
  assert.match(guardFn({ name: 'write' }), /read-only/iu)
  assert.match(guardFn({ name: 'bash' }), /read-only/iu)
  assert.match(guardFn({ name: 'session_event_read' }), /read-only/iu)
  assert.match(guardFn({ name: 'ask_user_question' }), /read-only/iu)
  assert.match(guardFn({ name: 'ops_discover_tools' }), /read-only/iu, 'the scope-local discovery selector must be denied too')
})
