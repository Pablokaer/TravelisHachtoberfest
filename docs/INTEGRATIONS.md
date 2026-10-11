# Open-source AI and partner integrations (D-084)

The app's AI is **local and open-weight**: Ollama serves Qwen or Gemma on the owner's machine and
the model only writes (route titles, interview questions, reasons); code validates and computes.
This page lists what was built around it for the Hacktoberfest week-1 prompt ("open-source AI at
its core", theme _Touch Grass_) and what only the owner can switch on.

Everything below is **optional and off while its variable is empty**; the app works on one machine
with no account. Code: `data-pipeline/wayfarer_pipeline/integrations/`.

| Category              | What it does here                                                                                                                  | Switch on with                                                      |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Gemma                 | Any Ollama model works through `--model`; compare Gemma and Qwen on the same city by their trace lines                             | `ollama pull gemma3:4b`, then `serve --model gemma3:4b`             |
| Sentry Agent Tracing  | A `gen_ai.chat` span per model call (model, latency, input/output tokens, errors); JSON log lines on stderr even without Sentry    | `SENTRY_DSN`, `pip install -e "data-pipeline[integrations]"`        |
| SerpApi               | `GET /places/web?q=` live web results (title, link, snippet) about a city                                                          | `SERPAPI_API_KEY`                                                   |
| ElevenLabs            | `POST /narrate {"text"}` → MP3 narration of a route or an attraction text (EN and PT)                                              | `ELEVENLABS_API_KEY` (+ `ELEVENLABS_VOICE_ID`)                      |
| MongoDB Atlas         | `GET /plan/history` the planner's remembered interviews and the cities it picked                                                   | `MONGODB_URI`, `pip install -e "data-pipeline[integrations]"`       |
| Tiger Data / pgvector | `GET /search/attractions?q=` hybrid semantic + keyword search; table `attraction_embeddings`, function `search_attractions_hybrid` | `ollama pull nomic-embed-text`, `python -m wayfarer_pipeline embed` |
| Render                | `render.yaml`: the city builder as a Docker web service                                                                            | see "Render" below                                                  |
| DigitalOcean          | `.do/app.yaml` (App Platform) and `deploy/digitalocean/ollama-gpu-droplet.sh` (GPU Droplet running Ollama)                         | see "DigitalOcean" below                                            |
| GitHub Copilot        | `.github/copilot-instructions.md` and the coding agent's setup workflow                                                            | see "GitHub Copilot" below                                          |
| Entire                | Shares the agent sessions behind the project                                                                                       | see "Entire" below                                                  |

## Gemma and Qwen

`OLLAMA_MODEL` in the root `.env` chooses the model (`--model` on the command line wins; empty is
Qwen). This install runs **`gemma3:4b`**: `ollama pull gemma3:4b`, `OLLAMA_MODEL=gemma3:4b`, restart
`serve`. The `serve` log shows which one answered, one JSON line per model call, for example
`{"event": "llm_call", "model": "gemma3:4b", "latency_ms": 6742, "input_tokens": 238, "output_tokens": 36, "tokens_per_second": 9.0}`.

A first comparison (the same two requests, one run each): Gemma answered in 10–20 s, in the language
asked once the language was also repeated at the end of the user message (D-090); Qwen took 9–34 s
and gave one invalid answer. To compare on routes:

```bash
cd data-pipeline
python -m wayfarer_pipeline suggest-routes --city sintra --planner ollama --model qwen2.5:7b  2> qwen.log
python -m wayfarer_pipeline suggest-routes --city sintra --planner ollama --model gemma3:4b   2> gemma.log
```

Compare the `latency_ms` and `tokens_per_second` of the two logs and the routes written (titles in
Portuguese, stops that survive validation).

## What only the owner can do

None of these can be done from the repository; each needs an account, a key or a setting on a
website.

The variables go in the root `.env` (copy of `.env.example`); `python -m wayfarer_pipeline serve` reads
that file when it starts (a variable already set in your shell wins), so after editing it just
restart `serve`.

**Sentry** — [sign up](https://sentry.io/signup/) → create a project (platform Python) → copy its
DSN from _Project → Settings → SDK Setup → Client Keys (DSN)_ → `SENTRY_DSN=<dsn>` →
`pip install -e "data-pipeline[integrations]"` → restart `serve`. Traces appear under _Insights →
Agents_ (or _Traces_, operation `gen_ai.chat`).

**SerpApi** — [sign up](https://serpapi.com/users/sign_up) (a free plan, about 100 searches a
month; check [the pricing page](https://serpapi.com/pricing)) → copy the private key from
[Manage API key](https://serpapi.com/manage-api-key) → `SERPAPI_API_KEY=` in `.env`.

**ElevenLabs** — [sign up](https://elevenlabs.io) → [API keys](https://elevenlabs.io/app/settings/api-keys)
(if that address has moved: _Developers → API Keys_ in the app) → _Create API Key_, copy it at once
(it is shown only once; if you restrict it, allow _Text to Speech_) → `ELEVENLABS_API_KEY=` in
`.env`. Optional: a voice id from the Voice Library in `ELEVENLABS_VOICE_ID=`. Hacktoberfest credits:
[hacktoberfest.com/my/promos](https://hacktoberfest.com/my/promos).

**MongoDB Atlas** — [register](https://www.mongodb.com/cloud/atlas/register) (then
[cloud.mongodb.com](https://cloud.mongodb.com)) → create a free **M0** cluster → _Database Access_:
a user with read/write and a password → _Network Access_: your IP address (`0.0.0.0/0` only for a
quick test) → _Connect → Drivers_: copy the `mongodb+srv://…` string and replace `<password>` →
`MONGODB_URI=` in `.env` → `pip install -e "data-pipeline[integrations]"`.

**Semantic search (pgvector)** — on your machine: `ollama pull nomic-embed-text`,
`pnpm db:reset` (or `pnpm exec supabase db push`) to apply migration `20261012000100`,
`pnpm db:test` to run its pgTAP test, then `cd data-pipeline && python -m wayfarer_pipeline embed`
(it embeds the most popular attractions first and can be stopped and resumed). For the hosted
project, `./scripts/deploy-backend.sh` pushes the migration; Supabase Cloud already ships pgvector.
For Tiger Data: any Postgres with pgvector works, so create a Tiger Cloud service and use its
connection string as `DATABASE_URL`.

**Render** — render.com → _New → Blueprint_ → connect the GitHub repository → it reads
`render.yaml` → fill `DATABASE_URL` with a **demo** Postgres (never production: the service has no
sign-in) and any optional keys → deploy → put the service URL in `EXPO_PUBLIC_CITY_BUILDER_URL`
and rebuild the app (`pnpm build:android`).

**DigitalOcean** — (a) _App Platform_: edit `repo:` in `.do/app.yaml`, then
`doctl apps create --spec .do/app.yaml` and fill the secrets in the dashboard. (b) _GPU Droplet_
for the model: create one from the AI/ML-ready image in the same VPC, run
`deploy/digitalocean/ollama-gpu-droplet.sh` on it, then set `PLANNER=ollama` and
`OLLAMA_URL=http://<droplet private IP>:11434` on the app. Credits: hacktoberfest.com/my/promos.

**GitHub Copilot** — the files are already in the repository (`.github/copilot-instructions.md` and
`.github/workflows/copilot-setup-steps.yml`). Two things only you can do:

1. **Have Copilot and turn the cloud agent on.** It needs a Copilot plan (Pro, Pro+, Business or
   Enterprise). On a personal repository you enable it in your own
   [Copilot settings](https://github.com/settings/copilot) (the features page shows whether it is on);
   on an organisation's repository an organisation or enterprise administrator controls it. GitHub's
   guide: [use the cloud agent on GitHub](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/cloud-agent/use-cloud-agent-on-github)
   — you then assign an issue to **Copilot** in its sidebar, or ask it for a pull request.
2. **Get the setup workflow onto the default branch.** GitHub only uses
   `copilot-setup-steps.yml` when it is on the repository's **default branch**
   ([docs](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/cloud-agent/customize-the-agent-environment)),
   and here the default is `main`, which only moves through the **Promote** workflow (D-075). Until
   a promotion, Copilot runs without our setup steps.

To have Copilot review pull requests, add a branch ruleset on `dev` with _Automatically request
Copilot code review_ (I could not confirm the exact menu names from GitHub's documentation: look
under the repository's _Settings → Rules → Rulesets_).

**Entire** — create an account at [entire.io/login](https://entire.io/login) (the page does not say
whether the account is needed for the command-line tool, only for the web app that shows your
sessions). Install the CLI with `curl -fsSL https://entire.io/install.sh | bash` (or `brew install
entireio/tap/entire`, or `go install github.com/entireio/cli/cmd/entire@latest`), then run
`entire enable` inside this repository; it records the agent sessions on a separate git branch so
they can be linked from the write-up. Docs: [docs.entire.io](https://docs.entire.io/platforms/overview).
Nothing about it is in the repository, because it is its own tool.

**Hacktoberfest post** — the contest judges the write-up most. Publish it on dev.to with the
challenge's tag, and say which categories you target and how (the table above).

## Security notes

- `serve` has no sign-in and open CORS (it was made for `127.0.0.1`). Anyone who can reach a
  hosted one can ask it to build a city and to run the planner. Point it at a demo database.
- Keys live only in the service's environment, never in `EXPO_PUBLIC_*` (those are inlined into the
  app). The partner transports never put a key in an error message.
- ElevenLabs and SerpApi receive the text or query you send them; they are off without a key.
