/**
 * Package entry: re-exports the DeepSeek Harness integration layer in
 * `skills-host.js`. The bundle patch addresses `dsh-egm/skills-host` directly so a
 * running Harness can load a fresh module generation after an update.
 */
export * from './skills-host.js'
