# GitHub Repository Settings

Terraform in this directory declares the repository branch-protection policy.
Apply it with a GitHub token that can administer the repository:

```bash
terraform init
terraform plan -var='repository_name=stynx'
terraform apply -var='repository_name=stynx'
```

The policy intentionally mirrors the CI gate names in `.github/workflows/ci.yml`.
