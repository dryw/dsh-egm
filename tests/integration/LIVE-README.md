# Live acceptance

Run in WSL from the repository root after the setup in [README.md](README.md):

```sh
export EGM_TEST_RUNTIME=/home/dryw/.cache/dsh-egm-linux-runtime
export PATH=/home/dryw/.cache/dsh-egm-node24/node_modules/.bin:$EGM_TEST_RUNTIME/node_modules/.bin:/usr/bin:/bin
export DSH_EGM_TARBALL="$PWD/.dev/acceptance/published-0.2.4.tgz"
export DSH_EGM_MODEL=deepseek-flash
read -rsp 'DeepSeek API key: ' DEEPSEEK_API_KEY; echo
export DEEPSEEK_API_KEY
DSH_EGM_LIVE=1 /home/dryw/.cache/dsh-egm-acceptance-venv/bin/python -m pytest tests/integration/test_dsh_live.py -x -s -q --basetemp "$HOME/.cache/dsh-egm-live-$(date +%s)"
unset DEEPSEEK_API_KEY
```

Runs isolation, then the canonical design workflow; `-x` stops on failure.
Use `-k isolation` or `-k brainstorm` to select one. Without `DSH_EGM_TARBALL`,
the fixture packs the checkout. No normal DSH profile is used.

This spends API credit: 32,768 output tokens per response, 20-minute SDK wait,
no provider retries, no total call or dollar cap. Evidence paths are printed;
keep native logs private. The client closes in `finally`.

The unchanged upstream prompt is accompanied by native slash invocations of the
three skills. Assertions check actual fresh children, completion, skill delivery,
required artifacts and exact draft/final equality. They do not prove review
quality or stage order. The harness does not repair model output.

Latest attempt: isolation passed; 15 workflow children completed; workflow failed
because only the final document changed Status from Draft to In Review.
Evidence: `/home/dryw/.cache/dsh-egm-live-1793804340`.
