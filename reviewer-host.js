/**
 * Reviewer delegation for dsh-egm.
 *
 * Registers the `egm_reviewer` tool, which starts a Goldfish reviewer as a fresh
 * child agent in the `egm-reviewer` agent preset. That preset has no write tools,
 * no command or job tools, no user-question tool, no session-reading tools, and no
 * delegation tools, so reviewer isolation is enforced by the Harness rather than by
 * a persona instruction. `subagent_fork` is never used.
 *
 * The preset itself is declared in cordis.patch.yml and its tool guard is
 * `reviewer-tools.js`. This module owns the model-facing spawn tool and the
 * agent-scope restriction that keeps the reviewer's visible schema read-only.
 */
import { hideNonReviewerTools } from './reviewer-tools.js'

export const name = 'dsh-egm-reviewer'

export const inject = ['tools', 'subagents', 'agents']

const REVIEWER_PRESET = 'egm-reviewer'

/** The tool's model-facing schema: a description and a self-contained prompt. */
const PARAMETERS = {
  type: 'object',
  additionalProperties: false,
  properties: {
    description: {
      type: 'string',
      description: 'Short label for this reviewer activation, such as the reviewer role and the document under review.',
    },
    prompt: {
      type: 'string',
      description: 'The complete reviewer prompt: the Goldfish persona text plus every input path the fresh child needs. The child sees none of this conversation.',
    },
  },
  required: ['description', 'prompt'],
}

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    kind: { type: 'string', enum: ['activation'] },
    subagentId: { type: 'string' },
  },
  required: ['kind', 'subagentId'],
}

/** Return the exact error text for a composition that cannot host reviewers. */
function reviewerSupportError(ctx) {
  if (ctx.get('agentPresets') === undefined) {
    return 'the agent-presets service is not composed, so the read-only egm-reviewer preset cannot be selected'
  }
  if (!ctx.subagents.list().includes('spawn')) {
    return 'no in-process "spawn" subagent provider is composed'
  }
  return undefined
}

/**
 * Register the `egm_reviewer` tool and the agent-scope restriction that keeps the
 * reviewer's tool schema read-only.
 * @param {import('@deepseek-ai/cordis').Context} ctx owning plugin context.
 */
export function apply(ctx) {
  const presets = ctx.get('agentPresets')
  ctx.effect(() => ctx.on('agent/created', ({ agent }) => {
    if (presets === undefined) return
    try {
      if (presets.composedPreset(agent.ctx) !== REVIEWER_PRESET) return
      agent.ctx.effect(() => hideNonReviewerTools(agent.ctx.tools))
    } catch (error) {
      console.warn(`[dsh-egm] could not enforce reviewer tool isolation: ${error instanceof Error ? error.message : String(error)}`)
    }
  }))

  const definition = {
    name: 'egm_reviewer',
    description:
      'Start a fresh-context, read-only Goldfish reviewer for an Elephant-Goldfish Model design review. '
      + 'The child runs in the read-only `egm-reviewer` agent preset: it can read and search files but cannot write, edit, run commands, ask the user, read this conversation, or delegate. '
      + 'Pass the reviewer persona text verbatim and every input path in `prompt`; the child sees none of this conversation. '
      + 'Use this tool only for EGM reviewer activations and never use `subagent_fork` for a review.',
    parameters: PARAMETERS,
    output: {
      schema: OUTPUT_SCHEMA,
      render(_args, value) {
        return [{ type: 'text', text: `started read-only EGM reviewer ${value.subagentId}` }]
      },
    },
    async execute(args, exec) {
      const supportError = reviewerSupportError(ctx)
      if (supportError !== undefined) throw new Error(`egm_reviewer unavailable: ${supportError}`)
      const parent = exec.agent
      if (parent === undefined) throw new Error('egm_reviewer requires a calling agent')
      const declared = await ctx.get('agentPresets').list()
      if (!declared.some((preset) => preset.id === REVIEWER_PRESET)) {
        throw new Error(`egm_reviewer unavailable: the "${REVIEWER_PRESET}" agent preset is not installed; reinstall dsh-egm`)
      }
      if (typeof args.prompt !== 'string' || args.prompt.trim() === '') {
        throw new Error('egm_reviewer requires a non-empty prompt')
      }
      const activation = await ctx.subagents.startActivation({
        provider: 'spawn',
        label: typeof args.description === 'string' && args.description.trim() !== '' ? args.description : 'EGM Goldfish reviewer',
        request: {
          prompt: [{ type: 'text', text: args.prompt }],
          parent,
          agentPreset: REVIEWER_PRESET,
          // Depth 1 admits this child and forbids it from delegating further.
          maxDepth: 1,
        },
        signal: exec.signal,
        delivery: 'parent',
      })
      return { kind: 'activation', subagentId: activation.childId }
    },
  }
  ctx.effect(() => ctx.tools.register(definition))
}
