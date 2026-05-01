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

  enforce_admins                  = true
  require_conversation_resolution = true
  required_linear_history         = true
  allows_deletions                = false
  allows_force_pushes             = false

  required_status_checks {
    strict = true
    contexts = [
      "lint",
      "typecheck",
      "unit-tests",
      "migration-lint",
      "doctor",
      "lint:cycles",
      "evidence/verify",
    ]
  }

  required_pull_request_reviews {
    dismiss_stale_reviews           = true
    require_code_owner_reviews      = true
    required_approving_review_count = 2
  }
}
