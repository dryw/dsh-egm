import assert from 'node:assert/strict'
import test from 'node:test'

import { readPackageJson, semverSatisfies } from './dsh_helpers.js'

const manifest = readPackageJson()

test('engines.node covers the tested Node range and is bounded', () => {
  const range = manifest.engines?.node
  assert.equal(typeof range, 'string', 'engines.node must be a string')
  assert.match(range, /[<^~]/u, 'engines.node must be bounded to tested Node versions')
  for (const version of ['22.0.0', '22.14.0', '24.16.0']) {
    assert.equal(
      semverSatisfies(version, range),
      true,
      `engines.node ${JSON.stringify(range)} must admit Node ${version}`,
    )
  }
  for (const version of ['21.9.0', '25.0.0']) {
    assert.equal(
      semverSatisfies(version, range),
      false,
      `engines.node ${JSON.stringify(range)} must not admit untested Node ${version}`,
    )
  }
})

test('engines.dsh follows the DSH prerelease policy and stays inside the tested 0.2.x line', () => {
  const range = manifest.engines?.dsh
  assert.equal(typeof range, 'string', 'engines.dsh must be a string')
  assert.equal(
    semverSatisfies('0.2.1-rc.5', range),
    true,
    'the runtime used by the recorded end-to-end run must be admitted',
  )
  // DSH evaluates engines.dsh with semver { includePrerelease: true } (the shipped Harness's
  // dsh-app-boot `satisfies`), so a later 0.2.2 prerelease is admitted even though npm's
  // default range policy rejects it. This test pins that policy; see tests/unit/dsh_helpers.js.
  assert.equal(semverSatisfies('0.2.2-alpha.2', range), true)
  assert.equal(semverSatisfies('0.2.2', range), true)
  assert.equal(
    semverSatisfies('0.3.0', range),
    false,
    'the next DSH minor line is untested and must stay refused',
  )
})
