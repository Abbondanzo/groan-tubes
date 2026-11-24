// Conventional Commits, checked in CI on every PR (see AGENTS.md).
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "scope-enum": [2, "always", ["audio", "physics", "ui", "pwa", "ci", "deps", "docs"]],
    // Trailers such as Claude-Session carry long URLs.
    "footer-max-line-length": [0],
  },
};
