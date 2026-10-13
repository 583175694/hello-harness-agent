# @harness/bundled-skills

Built-in (`bundled/system`) Skill **content** for Harness Agent.

Each skill lives in `skills/<name>/`:

- `skill.json` — metadata (name, description, version, source, modelCallable)
- `instructions.md` — body loaded by `skills.read` / Host explicit injection

Runtime registration happens in `@harness/api` via `SkillRegistryService` calling `loadBundledSkills()`.

Adding a skill: create a new folder under `skills/`, keep folder name equal to `skill.json` `name`, run package tests.
