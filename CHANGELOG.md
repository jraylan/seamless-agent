# Changelog

## [0.1.16](https://github.com/jraylan/seamless-agent/compare/seamless-agent-v0.1.15...seamless-agent-v0.1.16) (2025-12-31)


### Bug Fixes

* preserve VS Code keyboard shortcuts in textarea input ([5abd48c](https://github.com/jraylan/seamless-agent/commit/5abd48c8e520cb96421b62ea83c5e27a3e22bce4))

## [0.1.15](https://github.com/jraylan/seamless-agent/compare/seamless-agent-v0.1.14...seamless-agent-v0.1.15) (2025-12-18)


### Bug Fixes

* Fix `ask_user` history layout. ([51b9d54](https://github.com/jraylan/seamless-agent/commit/51b9d544e3c4912bfa501c48e7b3b01f094c3c25)), closes [#33](https://github.com/jraylan/seamless-agent/issues/33)
* Fix ask_user history type. Now it correctly saves the agent name. ([54a7281](https://github.com/jraylan/seamless-agent/commit/54a7281f32476f3ac81fa6a374babbc01b377ebe))
* Fix image attachment ([e86f5fe](https://github.com/jraylan/seamless-agent/commit/e86f5feb061c712b4f99756c97d08a35a5eade1a)), closes [#35](https://github.com/jraylan/seamless-agent/issues/35)

## [0.1.14](https://github.com/jraylan/seamless-agent/compare/seamless-agent-v0.1.13...seamless-agent-v0.1.14) (2025-12-17)


### Bug Fixes

* Restored askUser modelsDescription ([207102f](https://github.com/jraylan/seamless-agent/commit/207102f911b051beb7288303925df14e62fc6595))

## [0.1.13](https://github.com/jraylan/seamless-agent/compare/seamless-agent-v0.1.12...seamless-agent-v0.1.13) (2025-12-17)


### Features

* Attached files preview ([5c18d3b](https://github.com/jraylan/seamless-agent/commit/5c18d3b6165485c6ffbf66b01deec17f2c90fa80)), closes [#29](https://github.com/jraylan/seamless-agent/issues/29)

## [0.1.12](https://github.com/jraylan/seamless-agent/compare/seamless-agent-v0.1.11...seamless-agent-v0.1.12) (2025-12-17)


### Features

* Add configuration seamless-agent.storageContext ([c8a0f51](https://github.com/jraylan/seamless-agent/commit/c8a0f51b37b1bf5d296e8ffb69a4163862113afb))


### Bug Fixes

* Fix ask_user history question `pre code` style ([eec3ab7](https://github.com/jraylan/seamless-agent/commit/eec3ab7471b72d1a21d54daa3a34e35c14bd9e01))
* Removed duplicated ask_user history entries. ([eed9177](https://github.com/jraylan/seamless-agent/commit/eed917785fcffa2c6709f3831f1bf1d20d3c0310))

## [0.1.11](https://github.com/jraylan/seamless-agent/compare/seamless-agent-v0.1.10...seamless-agent-v0.1.11) (2025-12-16)


### Features

* Add session history, folder attachments & accessibility ([06445e1](https://github.com/jraylan/seamless-agent/commit/06445e1cae774fb0c8aaeaf43962cd8e2467af7c))
* Added filters to search file panels. ([9d37707](https://github.com/jraylan/seamless-agent/commit/9d37707d71fb41c0ca9122c23537babe065bfa47))
* Added plan_review and walkthroug_review to Antigravity ([17a5543](https://github.com/jraylan/seamless-agent/commit/9e9ce43d3d1fb59b84b3238d5f5ae75da37aae63))
* Enhance image handling and cleanup processes, add validation for image MIME types, and improve search query sanitization ([17c7c3d](https://github.com/jraylan/seamless-agent/commit/17c7c3dbcd13230d8c2036f1ea35a458535f9d63))
* update features in README and add scrolling CSS for attachment chips container ([1a27eda](https://github.com/jraylan/seamless-agent/commit/1a27eda7b7df2d7ec510f762be0dc406339b030a))
* Deprecated tool approve_plan in favor of plan_review [#12](https://github.com/jraylan/seamless-agent/issues/12) ([c104e65](https://github.com/jraylan/seamless-agent/commit/c104e65d5ab115a4f416f2b1a4d64dd8941ad525))

### Bug Fixes

* address PR [#18](https://github.com/jraylan/seamless-agent/issues/18) code review feedback ([dcc6476](https://github.com/jraylan/seamless-agent/commit/dcc64760440d04a263d4385c028b34738ba46c2e))


### Refactoring

* general QoL improvements ([17a5543](https://github.com/jraylan/seamless-agent/commit/17a5543f828ec2711b10b2f48972a6989b6e096e))  ([c104e65](https://github.com/jraylan/seamless-agent/commit/c104e65d5ab115a4f416f2b1a4d64dd8941ad525))
* Refactor extension overal layout ([c104e65](https://github.com/jraylan/seamless-agent/commit/c104e65d5ab115a4f416f2b1a4d64dd8941ad525))


## [0.1.10](https://github.com/jraylan/seamless-agent/compare/v0.1.9...v0.1.10) (2025-12-14)



### Bug Fixes

* harden local API service ([8ad4f67](https://github.com/jraylan/seamless-agent/commit/8ad4f671aa08196992e78a739979ab6d76bc563f))

## [0.1.9](https://github.com/jraylan/seamless-agent/compare/v0.1.8...v0.1.9) (2025-12-14)

### Features

* Add file reference autocomplete (`#filename`) for workspace files
* Add attachment chips UI for managing attached files
* Add support for pasting images directly into the input area
* Add attach button for selecting files via file picker
* Improve inline image support in ask_user tool using LanguageModelDataPart.image()
* Simplify attachment response format to string array of URIs
* Simplify pasted image naming (e.g., `image-pasted.png`)
* Simplify file reference syntax from `#file:filename` to `#filename`
* Update README features and add scrolling CSS for attachment chips container

### Bug Fixes

* Disabled automatic reveal to avoid disrupting user
* Fix badge counting
* Cleanup unused code
* Use localized title and cleanup comments
* Remove `.vsix` file from repository


## [0.1.8](https://github.com/jraylan/seamless-agent/compare/v0.1.7...v0.1.8)

### Features

* Add approve_plan tool (`#approvePlan`) for reviewing and approving plans with inline comments


## [0.1.7](https://github.com/jraylan/seamless-agent/compare/v0.1.6...v0.1.7)

### Bug Fixes

* Fix issue where fallback prompt opened when Webview did not receive focus

### Documentation

* Add instructions for Antigravity users


## [0.1.6](https://github.com/jraylan/seamless-agent/compare/v0.1.5...v0.1.6)

### Bug Fixes

* Fix Antigravity integration


## [0.1.5](https://github.com/jraylan/seamless-agent/compare/v0.1.4...v0.1.5)

### Features

* Add support for Antigravity


## [0.1.4](https://github.com/jraylan/seamless-agent/compare/v0.1.3...v0.1.4)

### Bug Fixes

* Fix badge not resetting to 0 after all requests are closed
* Improve notification behavior to avoid interruptions when panel is visible


## [0.1.3](https://github.com/jraylan/seamless-agent/compare/v0.1.2...v0.1.3)

### Features

* Add support for multiple concurrent requests with list view
* Add file attachments support using VS Code Quick Pick
* Improve task list UI with better visual hierarchy
* Add panel icon matching VS Code design language

### Changes

* Update layout to resemble Copilot Chat
* Dispose request when agent stops
* Improve badge counter visuals

### Pull Requests

* Merge dedicated view panel feature


## [0.1.2](https://github.com/jraylan/seamless-agent/compare/v0.1.1...v0.1.2)

### Features

* Add dedicated Seamless Agent panel in bottom panel area
* Add rich Markdown rendering (headers, bold, italic, code blocks, syntax highlighting, lists, tables, links)
* Add multi-line input with textarea and Ctrl+Enter submit
* Add non-intrusive notifications with badge indicator and optional console link
* Add graceful fallback when webview panel is unavailable

### Changes

* Move user confirmation UI from popup dialogs to dedicated panel
* Update esbuild config to compile webview scripts separately
* Improve localization system (EN, PT-BR, PT)

### Bug Fixes

* Add `dist/` to `.gitignore` to avoid committing build artifacts
