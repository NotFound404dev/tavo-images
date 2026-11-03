# Changelog

Selected features, fixes, and design decisions from the Tavo adaptation, listed newest first. This history covers releases from 1.28.0 onward; it is not an exhaustive record of every patch.

Versions before 1.38.0 were developed and distributed before this repository's first GitHub publication. Their entries summarize development records rather than separate releases or commits in this repository. Verification notes describe checks recorded for those versions, not a test run against every later release. The historical test harnesses are not included in this compact source distribution.

## Unreleased

### Changed

- Expanded the English README with setup instructions, generation workflows, provider integrations, and a source overview.
- Added this selected release history with technical background for notable fixes.

## 1.38.0 — 2026-11-03

### Added

- Added world map generation and editing requests from the Memory plugin, including location descriptions and separate entries for edited results.

### Changed

- Published the Tavo adaptation on GitHub with source, a reproducible package builder, license, and full credits.
- Simplified the published source to the current runtime and required resources, removing legacy source copies and development-only material.

## 1.37.0 — 2026-10-28

### Fixed

- Aligned LoRA weight fields and action buttons in the Tensor studio.
- Aligned paired Advanced, Upscale, and ADetailer fields when their labels wrap onto different numbers of lines.
- Made the parameter-fill button span the available section width.

### Changed

- Renamed the saved-settings section to **Presets** and updated its related labels.

## 1.36.0 — 2026-10-28

### Changed

- Collapsed advanced Tensor controls by default and grouped result parameters under **Information**.
- Placed Generate and Stop on the same row and clarified the batch-count label.
- Made the Tensor gallery and image viewer follow the layout of the chat gallery.

## 1.35.0 — 2026-10-27

### Fixed

- Fixed Tensor Art image downloads in Tavo's WebView by retrieving generated images through Tavo's file API.
- Validated downloaded image data before saving a result as an image.

### Removed

- Removed the optional image-download proxy introduced in 1.34.0.

<details>
<summary>Technical background: retrieving a completed image without another generation</summary>

**Problem:** Tensor Art could finish a paid generation while the WebView failed to download the image because the storage response lacked the CORS headers needed by browser fetch. Earlier retry handling could submit another generation job after a download failure.

**Change:** Version 1.34.0 separated download failures from generation retries and retained the completed job's result URL. Version 1.35.0 added downloads through Tavo's host file API, followed by image validation and temporary-file cleanup. Direct fetch and a temporary result-link display remain fallback paths.

**Verification recorded during development:** Regression checks covered host-download success, fallback behavior, invalid image responses, and preventing another job after a download failure. An Android smoke test recorded one submitted generation job, a saved image, and removal of the temporary download file.

</details>

## 1.34.0 — 2026-10-27

### Fixed

- Prevented completed Tensor Art jobs from being resubmitted when downloading their images failed.
- Preserved a temporary result link and expiry information when a Tensor Art image could not be downloaded because of a network or CORS failure.
- Corrected image-anchor collisions that could reuse another message's image.
- Allowed multiple board items to remain selected together.
- Corrected negative-prompt formatting and scene/style prompt handling for NovelAI through Naistera.

## 1.33.0 — 2026-10-26

### Added

- Added a dedicated Tensor studio interface with generation-data import, saved LoRAs, and presets.

### Fixed

- Corrected Tensor Art sampler names and scheduler mapping that caused **Params Valid** request errors.
- Corrected the initial image-fragment height on iPhone.

## 1.32.0 — 2026-10-25

### Added

- Added Tensor Art remix workflows and a library of saved remixes.
- Added embeddings, support for up to six LoRAs, and additional framing controls.

### Changed

- Selected and stored the Tensor Art seed before submission so the same seed and generation settings could be reused for a remix.

## 1.31.0 — 2026-10-25

### Added

- Added the Tensor Art connection using the TAMS API, with checkpoint and generation controls.
- Added Tensor Art image-to-image, inpainting, and upscaling workflows.

## 1.30.4 — 2026-10-25

### Fixed

- Restored optional translation for NovelAI and removed unconditional rejection of Russian text in prompts and reference notes.
- Added a clearer message when NovelAI rejects a request containing Russian text.

## 1.30.3 — 2026-10-24

### Fixed

- Displayed studio batch results as each image became ready instead of waiting for the entire batch to finish.
- Kept session results ordered by recency.

## 1.30.1 — 2026-10-24

### Fixed

- Preserved negative prompts when using NovelAI through Naistera.

## 1.30.0 — 2026-10-24

### Fixed

- Scoped NovelAI-specific prompt transformations to NovelAI connections so they did not alter requests to other providers.

## 1.29.0 — 2026-10-23

### Added

- Added editing and size controls for existing studio results.

### Fixed

- Prevented chat-specific appearance overrides from replacing the characters selected in the studio.
- Corrected variation navigation that could jump back to an older selection.

<details>
<summary>Technical background: keeping studio character selection independent of the chat</summary>

**Problem:** A chat-specific appearance override could be applied to a character or persona selected independently in the studio, producing a prompt or references for the wrong appearance.

**Change:** Studio reference preparation reads the selected characters' saved descriptions and images directly, with their avatars as a fallback. It does not apply the active chat's appearance override.

**Verification recorded during development:** Mocked regression checks covered studio isolation, selected-character references, editing requests, and result identifiers. The specific cross-persona scenario was not recorded as a live device test for this release.

</details>

## 1.28.0 — 2026-10-23

### Fixed

- Prevented image-edit requests from silently falling back to generation without the source image.
- Corrected conflicting style instructions and reference ordering that could weaken an uploaded art-style reference.
- Reduced repeated image-frame resizing with the Discord theme.
- Improved handling of empty or timed-out prompt-model responses.

<details>
<summary>Technical background: preserving the source image during editing</summary>

**Problem:** Some provider fallback paths retried a failed request after dropping image references. During editing, that changed the operation into a fresh generation rather than a modification of the selected image.

**Change:** Editing requests require their source image. Unsupported image-reference modes and source-image rejection produce an explicit error instead of retrying without the source. Editing prompts also exclude unrelated appearance and style additions from the previous generation.

**Verification recorded during development:** Mocked provider checks inspected request bodies and rejection paths and compared ordinary generation requests with the preceding version. Live image editing through the affected providers was not verified in that release's recorded checks.

</details>
