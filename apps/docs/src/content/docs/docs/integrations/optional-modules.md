---
title: Nutrition, video, photos, and voices
description: Enable optional enrichment and media features, understand provider requirements, and diagnose failures.
sidebar:
  order: 5
---

Manual recipes, planning, lists, pantry tracking, and ordinary cook steps work without these additions. A server admin controls server modules; household settings and provider credentials determine which households can use them. These steps describe alpha.4's implementation. Live provider/media processing has not been verified in the release smoke test.

## Nutrition

**Prerequisites:** recipes with ingredients and a meaningful serving count. Imported nutrition can be retained without configuring a provider. To calculate from food data, a server admin supplies a USDA FoodData Central key. Optional AI can estimate nutrition when configured; it is not required for the USDA path.

:::note[Available in alpha.4]
The Nutrition card includes **Get your USDA key** steps, **Get a free USDA key**, and **USDA API guide** buttons.
:::

1. Open **Settings → This server → Nutrition** and choose **Get a free USDA key**, or use the [USDA FoodData Central signup page](https://fdc.nal.usda.gov/api-key-signup/). Register using your name and email. If the key email has not arrived, check your spam or junk folder.
2. Enter **USDA key** and choose **Save key**. Merran tests it before saving; **Test** rechecks an already saved key. Environment-managed servers can use `MERRAN_USDA_KEY` instead.
3. Open **Settings → Household → Nutrition for the library**. Fix recipes listed as needing servings, then choose **Work out …** for recipes missing nutrition.
4. Wait for the run to finish, or choose **Stop**. Inspect several recipes' nutrition and ingredient matches.

**Expected result:** Eligible recipes gain calculated or estimated nutrition. Missing food matches, unrecognized amounts, or missing servings can leave incomplete results. These values are estimates, not a guarantee of dietary or allergen safety. USDA receives food search terms; an AI calculation sends relevant recipe information to its provider. For failures, check the key test, ingredient amounts, servings, provider errors, and **Settings → This server → Jobs**.

## Video imports

**Prerequisites:** the **Video import** module, working `yt-dlp` and `ffmpeg`, and eligible AI for extraction. The released Docker image includes the tools. The module and automatic tool updates default on; enabling the module alone does not provide AI credentials.

1. Open **Settings → This server → Video import** and confirm the tool versions are shown.
2. Enable **Import videos**. Decide whether to enable **Keep yt-dlp up to date**; changing video sites can require tool updates.
3. Configure household AI, then paste or share a supported TikTok, YouTube, Instagram, or Facebook link through the normal recipe import flow.
4. Wait for the import and review the extracted ingredients, servings, timings, and steps against the source.

**Expected result:** Merran extracts a recipe when the accessible caption, transcript, and available media contain enough information. It cannot guarantee every video is readable. A private, removed, region-restricted, or authentication-protected video may fail.

For source deployments, tool paths can be set with `MERRAN_YTDLP_PATH` and `MERRAN_FFMPEG_PATH`. Sites requiring sign-in may need an operator-supplied `cookies.txt` in the data directory, or `MERRAN_YTDLP_COOKIES` pointing to a mounted file. Cookies grant account access: keep them out of exports, issues, and source control, and use only content you are entitled to access. Tools contact the source site; extracted content is sent to AI. `MERRAN_OUTBOUND=minimal` suppresses automatic tool updating, not a requested import.

If imports fail, check the module status, tools, provider capability, source availability, and whether cookies have expired. Do not repeatedly retry an access restriction. See [import troubleshooting](../../run/troubleshooting/).

## AI recipe photos

**Prerequisites:** the server's **AI photos** switch and an eligible OpenAI or Google key. A chat-only or text-only provider is not sufficient. The module defaults off; provider billing and limits apply. No fixed per-image price is promised.

1. A server admin enables **Settings → This server → AI photos → Make AI photos**.
2. Decide whether **For each new recipe** should automatically fill missing photos for eligible newly added recipes. This does not automatically process an entire migrated library.
3. In **Settings → Household → AI photos**, choose **Photo style**: **Dark plate, white marble**, **Rustic wood**, **Bright and airy**, or **Dark and moody**.
4. Use **Make … photos** to fill eligible missing photos in the existing library. Review progress and use **Stop** if needed.

**Expected result:** Recipes without photos receive generated images in the household style. Existing photos are not overwritten by the missing-photo run. A generated image is an illustration of the recipe, not proof of what someone cooked; inspect it for misleading ingredients or presentation.

Recipe name, description, ingredient context, finishing steps, and the selected style are sent to the image provider. If the run stops, check key availability, task settings, limits, provider errors, and Jobs. See [AI setup and costs](../../run/ai-setup/) and [AI privacy](../../project/ai-privacy/).

## Server voices

Cook mode can use device speech, self-hosted Kokoro, or OpenAI speech. Speech playback and recognizing hands-free commands are separate browser capabilities. Choosing a server voice does not make microphone recognition available in every browser.

### Kokoro with Compose

For complete Postgres + Kokoro examples and TrueNAS/Dockge/Portainer downloads, start with [Optional services with Compose](../../get-started/install/#optional-services-with-compose). The profile command below applies to the full project `compose.yaml`; it does not add a missing service to a minimal SQLite stack.

1. From your existing installation directory, start the optional service:

   ```bash
   docker compose --profile voice up -d
   ```

2. In **Settings → This server → Voice**, set **Who reads aloud** to **Kokoro** and **Kokoro's address** to `http://kokoro:8880` for the supplied Compose network. Alternatively set `MERRAN_VOICE=kokoro` and `MERRAN_KOKORO_URL=http://kokoro:8880` in `.env`, then recreate Merran.
3. Pick a voice and use **Hear …** to preview it. Open a recipe's cook view and try reading a step.

**Expected result:** Merran sends step text to Kokoro and plays the returned audio. Audio is cached; a failed server voice can fall back to device speech. The Compose service publishes no Kokoro port. A remote Kokoro URL receives the text at that address, so “self-hosted” does not necessarily mean the same machine.

To keep Kokoro included in later Compose commands, save `COMPOSE_PROFILES=voice` in `.env`, or add `voice` to its existing comma-separated list (for example `postgres,voice`). Wait for Kokoro's server/model startup before previewing a voice.

### Device or OpenAI speech

Choose **Each device** for browser/device voices, or **OpenAI** when the household has an eligible OpenAI key. Preview before relying on it while cooking. OpenAI receives the text to speak and can charge for generation; provider rates can change. Device speech and speech recognition depend on the browser/OS and are not guaranteed to run locally.

For silent playback, check browser audio permission, volume, the selected voice, provider/key errors, and the address reachable **from the Merran container**. `localhost:8880` inside that container refers to Merran itself, not a separate Kokoro service. For failed voice commands, check microphone permission, HTTPS, and browser support in the [Cooking guide](../../use/cooking/).

Next: [settings reference](../../run/settings-reference/) for every environment variable, and [AI privacy](../../project/ai-privacy/) for service data flow.
