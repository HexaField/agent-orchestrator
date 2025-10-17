Our MVP is a tool that takes a spec.md file, breaks it down into tasks in a progress.json file, and then invokes a coding agent to implement the tasks, clarifying and updating the spec as it goes along, automatically steering it to completion according to the spec and progress.

We use TDD to drive the implementation of the code, and the agent is expected to write and run tests as part of its process. Never include test specific code in the implementation of the tool.

This is an active prototype - there is no need or stubs, migration or legacy support.

NEVER create stubs or placeholders.

When told to remove something, always remove it completely and do not leave any references to it, even in comments.

Include jsdoc annotations for all functions and methods.

Always implement with a declarative, functional programming style.

Always update all relevant documentation files to reflect the current state of the codebase and its functionalities.
