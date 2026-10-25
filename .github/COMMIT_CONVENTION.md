# Commit Convention

Nookive follows [Conventional Commits](https://www.conventionalcommits.org/).
Use the following format for commit messages:

```text
<type>(optional scope): <description>
```

Keep the description short, use the imperative mood, and write it in English.
The first line should normally be no longer than 72 characters.

## Types

- `feat`: add a user-facing feature
- `fix`: correct a user-facing bug
- `refactor`: change code structure without changing behavior
- `perf`: improve performance
- `docs`: change documentation
- `test`: add or update tests
- `build`: change build tooling or dependencies
- `ci`: change CI/CD configuration
- `chore`: perform maintenance that does not fit another type
- `style`: change formatting without changing behavior
- `revert`: revert an earlier commit

## Examples

```text
feat: add application result ranking
fix: prevent preview layout shift
refactor(search): separate file icon component
ci: update Rust checks workflow
docs: improve contributing guide
```

For an incompatible change, add `!` after the type or scope and explain the
change in the commit body:

```text
feat!: change the local index format
```

Commit bodies should explain why the change was made when the subject is not
enough. Include relevant test commands in pull requests rather than in every
commit message.
