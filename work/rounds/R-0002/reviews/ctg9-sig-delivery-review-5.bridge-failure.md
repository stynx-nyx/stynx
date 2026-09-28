# CTG9 SIG delivery-review 5 — bridge format failure

The DETRAN `bridge.sh claude claude-opus-5-5` invocation used prompt
`173-ctg9-sig-delivery-review-5.md` and this STYNX worktree. It exited 4
because Claude returned a JSON object inside a Markdown code fence; the
bridge's strict JSON parser rejected the fence. Its visible verdict was
`FAIL`, with an effective-xref/catalog-shadow blocker. The same prompt was
resent to `claude -p --model claude-opus-5-5 --permission-mode plan` with
structured JSON output; the adjacent `.json` is the authoritative parsed
verdict. The reviewer was read only, and DETRAN remained read only.
