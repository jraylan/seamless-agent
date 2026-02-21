# Changelog

## [0.1.23](https://github.com/jraylan/seamless-agent/compare/seamless-agent-v0.1.22...seamless-agent-v0.1.23) (2026-02-21)


### Features

* add draggable resize handle for ask_user textarea ([4f5baa9](https://github.com/jraylan/seamless-agent/commit/4f5baa980457fec75e550194dcbf131b02f628ae))
* implement compact list design for history view ([1831c7b](https://github.com/jraylan/seamless-agent/commit/1831c7bb7334ea66ff9545074264d08b798b6e83))
* implement Ctrl and Shift selection in batch mode ([bcb5c5f](https://github.com/jraylan/seamless-agent/commit/bcb5c5fe661197eace591ff408166da9c2894259))
* improve batch selection UX with toggle selection and empty area clear ([114ef63](https://github.com/jraylan/seamless-agent/commit/114ef63a33748d04c3cd24e449239be02f1cabe4))
* **input-history:** add InputHistoryManager with navigation and persistence functionality ([e8d15fc](https://github.com/jraylan/seamless-agent/commit/e8d15fc07f87df8e023a9db27ddc23b2d61c8de3))
* **input-history:** implement input history management with navigation and persistence ([307142d](https://github.com/jraylan/seamless-agent/commit/307142d451133f9b83ed2a430ae997a0eafef002))
* **input-history:** integrate InputHistoryManager for improved input history management ([561c4b2](https://github.com/jraylan/seamless-agent/commit/561c4b216231b00ca6897fb0deee2cc8885ec6d2))


### Bug Fixes

* address PR review comments ([1a79e6b](https://github.com/jraylan/seamless-agent/commit/1a79e6b7c724669a48b252a008e81e842a36ff9e))
* improve visibility detection for shift-click range selection ([670331f](https://github.com/jraylan/seamless-agent/commit/670331f70a14dbb6e5b3b1d1479fc80f337654fa))
* preserve batch selection UI during delete confirmation ([f637124](https://github.com/jraylan/seamless-agent/commit/f6371247bba454c08274dde0b900996e36f0603a))
* resolve layout issue causing title and preview to appear on same line ([4a8f2cc](https://github.com/jraylan/seamless-agent/commit/4a8f2cc30b0b510fd4d496c7c08f5afcf2044789))

## [0.1.22](https://github.com/jraylan/seamless-agent/compare/seamless-agent-v0.1.21...seamless-agent-v0.1.22) (2026-02-10)


### Features

* **ask-user:** add clickable option buttons for user responses ([94e1827](https://github.com/jraylan/seamless-agent/commit/94e182749708626546134f66ead40020ad4fbc6c))
* **ask-user:** combine selected options and typed response in submit ([2e90e23](https://github.com/jraylan/seamless-agent/commit/2e90e232b000e086f6852115b40c59a006aa19c5))
* **ask-user:** handle JSON string options ([3e4edb8](https://github.com/jraylan/seamless-agent/commit/3e4edb81c0f68b0c29d6cdb906853f3afc64902e))
* **ask-user:** improve response clarity ([d3ebad9](https://github.com/jraylan/seamless-agent/commit/d3ebad9ed78dbed8e289d45ef796ebd3bea5b73e))
* **askUser:** single-line option layout with smart width and scroll ([6a1ef8f](https://github.com/jraylan/seamless-agent/commit/6a1ef8f4bd2b4b5d18c56d6ba7cd623e137581fb))


### Bug Fixes

* add overflow-wrap to option button text to prevent overflow ([ebdbf65](https://github.com/jraylan/seamless-agent/commit/ebdbf65002e7f701b31b2d3bf03124bed81d55ae))
* address code review feedback for options feature ([93743a3](https://github.com/jraylan/seamless-agent/commit/93743a3a0e2666f26d22f699cbf19cfe87d6b85a))
* use top-level oneOf in options schema to prevent mixed types ([3993802](https://github.com/jraylan/seamless-agent/commit/3993802d69773625fca411e63801fbe868443fc3))


### Code Refactoring

* unify options stepper for pending and history views ([9f8d8ae](https://github.com/jraylan/seamless-agent/commit/9f8d8ae9597d7c02f54c037f0a9c56e04f0aeab4))

## [0.1.21](https://github.com/jraylan/seamless-agent/compare/seamless-agent-v0.1.20...seamless-agent-v0.1.21) (2026-02-03)


### Features

* add configuration for 'askUser' response suffix ([c2b5e7e](https://github.com/jraylan/seamless-agent/commit/c2b5e7e8d82e830cf285b7a4de30b2e482c133aa))


### Bug Fixes

* fix typo in config text translation ([5444127](https://github.com/jraylan/seamless-agent/commit/5444127f8ff31a2bb0cb6d328ef01e3563c6fb8b))

## [0.1.20](https://github.com/jraylan/seamless-agent/compare/seamless-agent-v0.1.19...seamless-agent-v0.1.20) (2026-01-20)


### Features

* add batch deletion for history items ([#48](https://github.com/jraylan/seamless-agent/issues/48)) ([9158079](https://github.com/jraylan/seamless-agent/commit/9158079b1776ac4332244c77ffe4e02e5fef082d))
* add configurable time display to history items ([c611387](https://github.com/jraylan/seamless-agent/commit/c611387d307c4cfa7ac86c6cefbaa8eaf7413eaf)), closes [#49](https://github.com/jraylan/seamless-agent/issues/49)
* **ui:** move clear history into history tab ([803c0e3](https://github.com/jraylan/seamless-agent/commit/803c0e3e2fb37389564e578c53505bff76d66e46)), closes [#47](https://github.com/jraylan/seamless-agent/issues/47)
* **ui:** simplify ask_user history detail ([71bcff3](https://github.com/jraylan/seamless-agent/commit/71bcff3ab9a7f749b2e8e82cbb5673948dbdb556)), closes [#51](https://github.com/jraylan/seamless-agent/issues/51)


### Bug Fixes

* **ask_user:** preserve pending response text ([ea8d638](https://github.com/jraylan/seamless-agent/commit/ea8d638fda11ac50fd365db03c880d78c91f6b5e)), closes [#37](https://github.com/jraylan/seamless-agent/issues/37)
* resolve race condition causing empty Review Plan view ([#58](https://github.com/jraylan/seamless-agent/issues/58)) ([b72bfcc](https://github.com/jraylan/seamless-agent/commit/b72bfcc80a4ab3be1a8cd7885dc48fb75db017df))

## [0.1.19](https://github.com/jraylan/seamless-agent/compare/seamless-agent-v0.1.18...seamless-agent-v0.1.19) (2026-01-08)


### Bug Fixes

* allow clipboard and cursor navigation in response input ([c1325ca](https://github.com/jraylan/seamless-agent/commit/c1325caba779a554b02d7b1078fb1643cfb4fca4))

## [0.1.18](https://github.com/jraylan/seamless-agent/compare/seamless-agent-v0.1.17...seamless-agent-v0.1.18) (2026-01-04)


### Features

* Add delete Buttons to pending notification cards ([9acbedc](https://github.com/jraylan/seamless-agent/commit/9acbedc610cc5c056940c9f50ed4354d674e781f))


### Bug Fixes

* Fix tab item title spacing ([3e1d078](https://github.com/jraylan/seamless-agent/commit/3e1d0785b2c5978a2404779063f70ccf7a0244e0))

## [0.1.17](https://github.com/jraylan/seamless-agent/compare/seamless-agent-v0.1.16...seamless-agent-v0.1.17) (2025-12-31)


### Bug Fixes

* Incorrect scrolling in #askUser tool input on Windows IME ([f33a9a7](https://github.com/jraylan/seamless-agent/commit/f33a9a7a631b7653e3b753fcb07b36d612873d48))

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
