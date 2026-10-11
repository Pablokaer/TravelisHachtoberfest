_This is a submission for the [Hacktoberfest Open-Source AI Challenge Week 1: Touch Grass](https://dev.to/challenges/hacktoberfest-week1-2026-10-05)_

<!-- Tags: devchallenge, hf26challenge. Team: list teammates' DEV usernames here and publish from one account. -->

## What I Built

**Travelist** is a travel companion for iOS, Android and the web that turns "where should I go?" into "put the phone away and walk". You pick a city (198 cities in 52 countries, 22,756 attractions), and Travelist gives you:

- **Suggested historic walks.** Themed routes made of the city's most popular historic places, grouped by walking distance, starting at the place nearest to you. A local open-weight model writes the route titles in English and Portuguese; code chooses and validates the stops.
- **A walking route that follows the streets.** Pick places, get an optimised order, a walking time and a distance, and open it in Google or Apple Maps. Routes never fall back to a straight line through buildings (D-087).
- **In-app navigation** that follows you and keeps the places readable (D-086), so the screen is a map you glance at, not a feed you scroll.
- **A trip planner that interviews you** (three questions written by the model) and proposes destinations that fit the month, the weather and the kind of trip, based on ten years of monthly climate averages.
- **Offline trips.** Save a trip on the device (stops, street path, place texts, photos and a map area on a phone) and open it, and navigate it, with no connection (D-092).
- **A "visited" mark** per place, so the next suggested route stops treating a place you have already seen as a priority (D-085).
- **A city builder.** If you are somewhere the app does not cover, it builds the city from your position (attractions, texts, climate, facts, routes) using open data.

It is for people who travel on foot: the traveller who wants a good two-hour walk instead of a list of 40 pins.

The design goal is that **the screen is the shortest part of the experience**: plan in a minute, then walk.

## Demo

- Web app: https://travelist.live
- Video: <!-- TODO: add link to the demo video, ideally recorded outdoors -->

## Code

{% embed https://github.com/Pablokaer/TravelisHachtoberfest %}

## How I Built It

**Open-source AI**

- **Gemma 3 (`gemma3:4b`) served by Ollama**, running on my own machine. Qwen 2.5 is the default when no model is chosen, and `OLLAMA_MODEL` or `--model` swaps between them without touching code. The model writes three things: route titles, the three interview questions of the trip planner, and the reason for each proposed destination.
- **A local model writes, code decides.** Every filter, distance, score and validation is plain code, so the model cannot invent a place or a number. If no model is running, rule-based planners take over, and the app still works.
- **Nomic embeddings (`nomic-embed-text`) through Ollama**, stored with **pgvector** in Postgres, for hybrid semantic + keyword search of attractions.

**Open data**

Wikidata, OpenStreetMap (Overpass, Nominatim), Wikipedia, Wikimedia Commons and Open-Meteo, with the source and licence kept next to every place. MapLibre with OpenFreeMap tiles draws the maps with no API key.

**App and backend**

Expo SDK 57 / React Native 0.86 with Expo Router (one codebase for iOS, Android and web), TanStack Query, Zustand, react-hook-form + zod and i18next (EN / PT). A shared TypeScript package holds schemas, ranking and route-ordering logic used by both the app and the backend. Supabase provides Postgres 17 + PostGIS, Auth, row-level security and Deno Edge Functions. A Python pipeline ingests the open data into committed SQL seeds, and a local Python service (`wayfarer_pipeline serve`) builds missing cities and answers the planner.

**What I measured**

On the same two planner requests (one run each), Gemma 3 4B answered in 10 to 20 seconds and followed the requested language once the language was repeated at the end of the user message (D-090). Qwen took 9 to 34 seconds and gave one invalid answer. Each model call writes a JSON log line with model, latency and token counts.

## Why Does Open Innovation Matter?

- **Your travel profile stays on your machine.** The passports, preferences and interview answers that shape a trip are processed by a model running locally, not sent to a server I do not control.
- **It costs nothing to run.** There is no per-call fee for route titles, questions and reasons, so I can regenerate routes for every city while iterating.
- **I can swap the model.** Moving from Qwen to Gemma was an environment variable. That let me compare them on the same inputs and pick by latency and by whether the output survives validation, instead of accepting what one API gives me.
- **I can change how the agent behaves.** I constrained the model's output with a JSON schema and made code the authority on facts. With an open model I could see exactly where it failed (wrong language, invalid answer) and fix the prompt.
- **It degrades gracefully.** Because the model is only a writer, losing it means plainer titles, not a broken app.

Honest limits: a 4B model on a laptop takes tens of seconds for the planner's ranking, and the model runs on my PC, so the phone reaches it over the local network rather than on the trail. A fully on-device model is the next step.

## My Agent Session

<!-- TODO: save the session with DevRelay and embed it with the agent_session tag, or link it. -->

## Prize Categories

Only technologies that are implemented and configured in this project are listed.

- **Gemma (Google):** Gemma 3 (`gemma3:4b`) runs locally through Ollama as the model behind suggested routes and the trip planner, compared against Qwen on the same requests.
- **Sentry Agent Tracing:** a `gen_ai.chat` span per model call with model, latency and input/output tokens (JSON log lines even without Sentry). <!-- TODO before publishing: add a screenshot of the traces in Sentry (Insights → Agents). -->
- **ElevenLabs:** `POST /narrate` turns a route or an attraction text into MP3 narration (English and Portuguese), so a walker can listen instead of looking. <!-- TODO: confirm it has been run end to end and mention a real result. -->
- **SerpApi:** `GET /places/web` brings live web results about a city into the service. <!-- TODO: confirm it has been run end to end. -->
- **MongoDB Atlas:** the planner's remembered interviews and the cities it picked (`GET /plan/history`). <!-- TODO: confirm it has been run end to end. -->

<!-- Teammates (DEV usernames): @... -->
