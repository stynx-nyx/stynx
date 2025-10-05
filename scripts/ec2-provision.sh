#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<USAGE
Usage: scripts/ec2-provision.sh --name st-core-api --region us-east-1 --type t3.micro --key keypair

Creates an EC2 instance with security group configured for HTTP(80)/HTTPS(443)/API(3000) traffic and outputs connection info.
USAGE
}

REGION="us-east-1"
NAME="st-core-api"
TYPE="t3.micro"
KEY_NAME=""
AMI_ID=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --region) REGION="$2"; shift 2 ;;
    --name) NAME="$2"; shift 2 ;;
    --type) TYPE="$2"; shift 2 ;;
    --key) KEY_NAME="$2"; shift 2 ;;
    --ami) AMI_ID="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option $1" >&2; usage; exit 1 ;;
  esac
done

if [[ -z "$KEY_NAME" ]]; then
  echo "--key (EC2 key pair) is required" >&2
  exit 1
fi

if [[ -z "$AMI_ID" ]]; then
  AMI_ID=$(aws ec2 describe-images --owners amazon --filters "Name=name,Values=al2023-ami-kernel-6.*-x86_64" --region "$REGION" --query 'Images | sort_by(@, &CreationDate)[-1].ImageId' --output text)
fi

SG_ID=$(aws ec2 create-security-group --group-name "$NAME-sg" --description "st-core API security group" --region "$REGION" --query 'GroupId' --output text)

for port in 22 80 443 3000; do
  aws ec2 authorize-security-group-ingress --group-id "$SG_ID" --protocol tcp --port "$port" --cidr 0.0.0.0/0 --region "$REGION"
done

INSTANCE_ID=$(aws ec2 run-instances \
  --image-id "$AMI_ID" \
  --instance-type "$TYPE" \
  --key-name "$KEY_NAME" \
  --security-group-ids "$SG_ID" \
  --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=$NAME}]" \
  --region "$REGION" \
  --query 'Instances[0].InstanceId' --output text)

PUBLIC_DNS=$(aws ec2 describe-instances --instance-ids "$INSTANCE_ID" --region "$REGION" --query 'Reservations[0].Instances[0].PublicDnsName' --output text)

echo "Provisioned instance ${INSTANCE_ID}. Connect via: ssh -i ~/.ssh/${KEY_NAME}.pem ec2-user@${PUBLIC_DNS}"
