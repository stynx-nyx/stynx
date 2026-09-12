terraform {
  required_version = ">= 1.6.0"

  required_providers {
    github = {
      source  = "integrations/github"
      version = "~> 6.0"
    }
  }
}

provider "github" {
  owner = var.repository_owner
}

resource "github_branch_protection" "main" {
  repository_id = var.repository_name
  pattern       = var.protected_branch

  # Admins may bypass on a per-PR basis (GitHub records the bypass on the PR).
  # Reconciled to the live setting on 2026-09-12; it had been relaxed by hand
  # after the move to the stynx-nyx organization.
  enforce_admins                  = false
  require_conversation_resolution = true
  required_linear_history         = true
  allows_deletions                = false
  allows_force_pushes             = false

  required_status_checks {
    strict = true
    # One entry per required job name across .github/workflows/ci.yml,
    # semantic-pr-title.yml, reference-apps.yml and release-prep.yml.
    # Reconciled to the live rule set on 2026-09-12 (post-DEVAI-1.4.5 gate
    # names; `evidence/verify` was retired with the local governance).
    contexts = [
      "install",
      "lint",
      "typecheck",
      "unit-tests",
      "integration-tests",
      "stynx-tier-gate",
      "build (ubuntu-latest)",
      "semantic-pr-title",
      "migration-lint",
      "reference-web-e2e",
      "package-policy",
      "dependency-audit",
    ]
  }

  required_pull_request_reviews {
    dismiss_stale_reviews = true
    # Owner decision 2026-09-12: the repository is maintained by one person.
    # GitHub never counts the PR author's own approval, and a code-owner review
    # requirement is enforced independently of the approval count, so both are
    # off. Merges still require every status check below (strict, up to date)
    # and a pull request; admin bypasses stay recorded on the PR.
    require_code_owner_reviews      = false
    required_approving_review_count = 0
  }
}
