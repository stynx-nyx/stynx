variable "repository_owner" {
  description = "GitHub user or organization that owns the repository."
  type        = string
  default     = "aarusso-nyx"
}

variable "repository_name" {
  description = "Repository name to protect."
  type        = string
  default     = "stynx"
}

variable "protected_branch" {
  description = "Branch name protected by this policy."
  type        = string
  default     = "main"
}
