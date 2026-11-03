# Tavo Images

Image generation and editing inside Tavo chats.

Tavo Images turns chat scenes into illustrations and provides tools for working with prompts, character references, reusable reference boards, and image variations. It also includes a standalone generation studio and world map integration with the Memory plugin.

This is a Tavo adaptation based on [notsosillynotsoimages](https://github.com/aceeenvw/notsosillynotsoimages) by **aceeenvw**, which builds on [SillyImages](https://github.com/0xl0cal/sillyimages) by **0xl0cal**.

[Download the latest release](https://github.com/NotFound404dev/tavo-images/releases/latest) · [Changelog](CHANGELOG.md) · [Credits](CREDITS.md) · [License](LICENSE)

## Features

- **Chat illustrations.** Generate images automatically for new character messages or trigger generation manually. Regenerate an image, revise its prompt, or create an edited version.
- **Separate prompt generation.** Use the chat model or a dedicated text model to turn a scene into an image prompt.
- **Styles and custom prompts.** Choose from built-in style guides or create your own. Provider-specific controls include negative prompts and NovelAI character captions.
- **Character and scene references.** Combine avatars, appearance descriptions, uploaded images, and references for clothing, poses, backgrounds, and art styles.
- **Boards.** Organize reusable outfits, appearance details, and location references, then select them for chat or studio generation.
- **Studio.** Generate images from your own scene description, select characters and references, create variations, and edit existing results.
- **Tensor Art tools.** Work with checkpoints, LoRAs, embeddings, saved presets, and generation parameters. Supported workflows include text-to-image, image-to-image, inpainting, and upscaling.
- **Gallery.** Browse generated images, mark favorites, download results, and manage stored images.
- **World maps.** Generate maps from locations supplied by the Memory plugin, edit existing maps, and add markers.
- **Russian and English interface.**

Available image sizes, reference types, editing tools, and generation parameters depend on the selected provider and model.

## How it works

The plugin connects scene preparation, prompt generation, and image generation within Tavo.

1. **Choose a scene.** Start from a character message or enter a scene in the studio.
2. **Prepare the prompt.** The selected text model uses the scene, relevant context, appearance descriptions, and style instructions to write an image prompt. Workflows with a prepared prompt can use it directly.
3. **Prepare references.** The plugin collects enabled references, associates them with characters or scene elements, and adapts them to the selected provider. Reference filtering uses the scene and generated cast information to reduce unrelated references.
4. **Request the image.** A provider adapter builds the request in the format expected by the image service and handles its response.
5. **Save and display the result.** The image appears in the chat or studio, with its prompt and generation details available for further work.

Prompt generation and image generation are separate stages. They can use different models and connections—for example, the chat model can describe the scene while a separate image provider renders it.

Reference selection and style instructions guide the model; the final interpretation still depends on that model.

## Provider integrations

| Connection | Implementation |
| --- | --- |
| OpenAI-compatible | Chat and image endpoint modes for compatible image-generation services |
| Gemini native | Requests using Gemini's native API format |
| Naistera | Provider-specific model selection and request handling |
| NovelAI official | Direct image generation with NovelAI-specific controls |
| Tensor Art | TAMS job submission, status polling, image retrieval, and studio controls |

These connections have different capabilities. For example, Tensor Art's chat generation uses text descriptions for character appearance references, while its editing workflows accept a source image.

## Installation and first image

1. Download **`tavo-images-1.38.0.tpg`** from the [latest release](https://github.com/NotFound404dev/tavo-images/releases/latest).
2. Import the package into Tavo's plugin manager and enable it for your chat.
3. Open **+ → Images**. In the Russian interface, the action is named **Картинки**.
4. In the **API** tab, select your image provider and configure its credentials and model settings.
5. Choose whether the prompt should be written by the chat model or a separate connection.
6. Select a style, configure references if needed, and generate an image manually or enable automatic generation.

You need a Tavo version that supports **plugin specification 2** and access to a supported image-generation service.

## Data and storage

Settings, reference records, galleries, and generated files use Tavo's storage APIs.

Depending on the selected workflow, generation requests can include chat context, scene descriptions, character appearance notes, and enabled reference images. These are sent through the configured text and image services.

Provider credentials are supplied by the user through the plugin interface. The distributed package does not include API credentials.

## Project structure

| Path | Purpose |
| --- | --- |
| `src/entry.js` | Plugin runtime, generation workflows, provider adapters, storage, and integrations |
| `src/ui/panel.html` | Settings panel, boards, studio, and gallery |
| `src/ui/image.html` | Image display and controls inside chat messages |
| `src/manifest.json` | Plugin metadata, permissions, and registered UI fragments |
| `src/locales/` | Localized metadata and descriptions |
| `src/cover.png`, `src/icons/`, `src/previews/` | Packaged visual assets |
| `build.py` | Reproducible `.tpg` packaging |

Interface translations are also embedded in the HTML files.

## Building from source

Requires **Python 3.10 or later**, with no third-party Python dependencies.

```bash
python3 build.py
```

The build creates:

```text
dist/tavo-images-1.38.0.tpg
dist/SHA256SUMS
```

Edit the current source directly in `src/`. The build script packages the required files without transforming the application code and includes the license and credits.

## Development and validation

Tavo-specific development covers the plugin lifecycle, chat integration, reference handling, boards, studio workflows, provider adapters, and Memory integration.

Validation for the published 1.38.0 package included JavaScript syntax checks, reproducible packaging, archive verification, and 14 world map scenarios using mocked providers. These checks cover selected behavior; they do not establish compatibility with every provider or device.

[CHANGELOG.md](CHANGELOG.md) records selected releases and includes technical background for notable fixes, with the checks recorded during development.

## Credits and license

Tavo adaptation and development by **NotFound_404 / Not_Found** ([NotFound404dev](https://github.com/NotFound404dev)).

The project builds on work by **aceeenvw** and **0xl0cal**. Additional implementation references, design inspiration, built-in styles, and contributed prompts are documented in [CREDITS.md](CREDITS.md).

Licensed under **AGPL-3.0-or-later**. See [LICENSE](LICENSE).
