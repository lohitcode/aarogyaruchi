terraform {
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0"
    }
  }
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

variable "cloudflare_api_token" {
  description = "Cloudflare API token (set via TF_VAR_cloudflare_api_token env var)"
  sensitive   = true
}

variable "cloudflare_zone_id" {
  description = "Cloudflare Zone ID (set via TF_VAR_cloudflare_zone_id env var)"
}

# API subdomain - proxied through Cloudflare
resource "cloudflare_record" "api" {
  zone_id = var.cloudflare_zone_id
  name    = "api"
  content = "(redacted)"
  type    = "A"
  proxied = true
}

# SSH subdomain - DNS only (not proxied)
resource "cloudflare_record" "ssh" {
  zone_id = var.cloudflare_zone_id
  name    = "ssh"
  content = "(redacted)"
  type    = "A"
  proxied = false
}

# SSL mode must be set manually in Cloudflare dashboard:
# Go to SSL/TLS > Overview > Set to "Flexible"
