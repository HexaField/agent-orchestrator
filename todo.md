- [ ] turn progress file to structured JSON
- [ ] completely remove env var configs
  - [ ] remove user facing configs
  - [ ] refactor test logic out of implementation
- [ ] CLI to validate templates
- [ ] refined API
  - [ ] replace completely with init preferences (which can be changed with `config set`)
- [ ] allow user to define their own orchestration flows
- [ ] figure out how to unstick an agent that is stuck in a loop or stalled
- [ ] Stream agent and llm responses to console

rethink this a bit

- [ ] 'npx agent-orchestrator new' that takes a url or saved url to set up a new project
  - [ ] clones the file as AGENTS.md and then calls a meta-prompt to fill in the rest of the files according to the AGENTS.md spec
  - [ ] `--save https://path.to/file.md` option to save the url for future `new` commands when no url is provided
