# Contributing

Improvements from people using this on real Lagos listings are the most valuable kind.

## Feedback
Open a [feedback issue](https://github.com/tobilobaadeyemo/claude-real-estate-exec-brief/issues/new/choose). Never include client names, addresses, phone numbers, or other personal data.

## Changing the skill
1. Edit files in `real-estate-exec-brief/`. Keep `SKILL.md` short; put detail in `references/`.
2. If you change a method or threshold, update the examples so their arithmetic still holds.
3. Rebuild and validate: `./scripts/build.sh` (rebuilds `dist/real-estate-exec-brief.zip` and runs `scripts/validate.py`).
4. Run the relevant cases in `evals/test-cases.md` and log the results.
5. Add a line to `CHANGELOG.md`.
6. Open a pull request. CI runs the same validation.

## Style
- Plain, specific language. Numbers carry source tags.
- Lagos-specific facts (regulators, title types, norms) need a source or a "confirm with compliance or solicitor" flag.

## Releases
Maintainers tag `vX.Y.Z` on `main`. The release workflow builds the zip and attaches it to a GitHub Release.
