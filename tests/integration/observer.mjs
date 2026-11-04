import { appendFileSync } from 'node:fs'

export const name = 'egm-integration-observer'
export const inject = ['llm', 'tools', 'agents']

// Observe real host inputs and outcomes without changing request dispatch.
export function apply(ctx) {
  const record = (value) => appendFileSync(process.env.EGM_TEST_RECORD, `${JSON.stringify(value)}\n`)
  record({ kind: 'runtime', pid: process.pid })
  ctx.effect(() => ctx.on('llm/stream', (options, next) => {
    record({ kind: 'request', sessionId: options.sessionId, messages: options.messages, tools: options.tools })
    return next()
  }))
  ctx.effect(() => ctx.on('tools/result', (execution, result) => {
    record({ kind: 'tool', sessionId: execution.agent?.id, callId: execution.callId,
      name: execution.name, arguments: execution.arguments, result })
  }))
  ctx.effect(() => ctx.on('agent/created', ({ agent }) => {
    record({ kind: 'agent', sessionId: agent.id,
      preset: ctx.get('agentPresets')?.composedPreset(agent.ctx) })
  }))
}
