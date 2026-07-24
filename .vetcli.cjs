/**
 * Visual E2E CLI config for release / pub.
 */
module.exports = {
  allowBranch: ["master"],
  bumpFiles: [
    "package.json",
    "package-lock.json",
    { filename: "version.js", type: "code" },
  ],
  tagPrefix: "v",
  releasePrefix: "release-v",
  changelog: {
    file: "CHANGELOG.md",
    githubRepo: "visual-e2e/visual-e2e-test",
  },
  hooks: {
    prepublish: "node scripts/prepare-pub.mjs",
  },
  assets: [
    "build/macos-arm64/*.dmg",
    "build/macos-x64/*.dmg",
    "build/windows/*.exe",
  ],
  releaseNotes: "node scripts/print-release-notes.mjs",
};
