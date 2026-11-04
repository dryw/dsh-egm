# Live acceptance

Paid. Run in WSL from the repository root after the setup in [README.md](README.md).
Pack a fixed tarball first and note the commit it came from.

```sh
export EGM_TEST_RUNTIME=/home/dryw/.cache/dsh-egm-linux-runtime
export PATH=/home/dryw/.cache/dsh-egm-node24/node_modules/.bin:$EGM_TEST_RUNTIME/node_modules/.bin:/usr/bin:/bin
export DSH_EGM_TARBALL="$PWD/.dev/acceptance/dsh-egm-<version>.tgz"
export DSH_EGM_SOURCE_SHA=<commit the tarball was packed from>
export DSH_EGM_MODEL=deepseek-flash
read -rsp 'DeepSeek API key: ' DEEPSEEK_API_KEY; echo
export DEEPSEEK_API_KEY
DSH_EGM_LIVE=1 /home/dryw/.cache/dsh-egm-acceptance-venv/bin/python -m pytest tests/integration -s -q --basetemp "$HOME/.cache/dsh-egm-live-$(date +%s)"
unset DEEPSEEK_API_KEY
```

This runs the whole suite against the tarball, so install, isolation and
workflow are separate outcomes. It spends API credit: 32,768 output tokens per
response, a 20-minute SDK wait, no provider retries and no total cap. Keep native
logs private; the client closes in `finally`.

The workflow test sends the unchanged upstream line-count prompt after one block
of native slash invocations of the three skills. Each paid test writes
`identity.json` before the model runs. The workflow test writes `checks.json`
with every check's result, then fails if any check failed. See
[VERIFICATION.md](../../VERIFICATION.md) for how to read it.

## Manual interactive run

Upstream requires a real human approval pause. Use the same tarball.

1. Prepare a disposable profile with logs, observer and identity record:

   ```sh
   python tests/integration/test_dsh_live.py profile "$HOME/.cache/dsh-egm-manual-$(date +%s)" \
     --tarball "$DSH_EGM_TARBALL" --source-sha "$DSH_EGM_SOURCE_SHA" --model "$DSH_EGM_MODEL"
   ```

   It installs the tarball into a `tui` profile and prints the command that starts
   the terminal UI with `dsh tui --patch`. Run that command with
   `DEEPSEEK_API_KEY` exported.
2. Type `/egm-brainstorm`, then the feature paragraph and author line from
   `fixtures/live-prompts/google-codex-line-count-v1.txt`, without its approval
   paragraph. Answer every gate yourself.
3. Type `/egm-draft concepts_brief.md` and answer every gate yourself.
4. Type `/egm-review design_draft.md` and choose Step `uninterrupted`.
5. Quit, then run `python tests/integration/test_dsh_live.py check <dir>`.
6. For the pause, quote the native log rows for one question and for your typed
   answer, with their times. Record this run in its own row.
