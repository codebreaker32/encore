#!/usr/bin/env bash
# The MC on Amazon Bedrock AgentCore Runtime: the control-plane steps, as plain AWS CLI calls (deploy/README.md).
# Run on the laptop: they need IAM, S3 and AgentCore control-plane rights, which the build box's role does not have.
#   deploy/agentcore.sh role               create the execution role encore-mc-runtime-role (and update its policy)
#   deploy/agentcore.sh bucket             create the code bucket (private, versioned)
#   deploy/agentcore.sh upload <zip>       upload a build; prints the S3 version id
#   deploy/agentcore.sh create <s3-ver>    create the runtime from deploy/runtime.json
#   deploy/agentcore.sh update <s3-ver>    new runtime version with that zip (also how to roll back), MMDSv2 on
#   deploy/agentcore.sh wait | status | arn | versions | zips | logs [since] | retention [days]
#   deploy/agentcore.sh tracing            deliver the runtime's spans to X-Ray (needs Transaction Search)
#   deploy/agentcore.sh delete             delete the runtime (the bucket and role stay)
set -euo pipefail
REGION=${MC_AGENTCORE_REGION:-ap-south-1}
ACCOUNT=911167912118
NAME=encore_mc
ROLE=encore-mc-runtime-role
BUCKET=bedrock-agentcore-code-$ACCOUNT-$REGION
KEY=encore-mc/encore-mc.zip
HERE=$(cd "$(dirname "$0")" && pwd)
WORK=${ENCORE_MC_DEPLOY_DIR:-${TMPDIR:-/tmp}/encore-mc-deploy}
mkdir -p "$WORK"
ctl() { aws bedrock-agentcore-control --region "$REGION" "$@"; }

runtime_id() {
  local id
  id=$(ctl list-agent-runtimes --query "agentRuntimes[?agentRuntimeName=='$NAME'].agentRuntimeId | [0]" --output text)
  [ -n "$id" ] && [ "$id" != None ] || { echo "no runtime named $NAME in $REGION" >&2; exit 1; }
  echo "$id"
}

# render create|update <s3-version-id> [runtime-id]: deploy/runtime.json with the zip's version filled in
# (deploy/render.py; an update resends the whole configuration and turns on MMDSv2).
render() {
  python3 "$HERE/render.py" "$@" > "$WORK/runtime-$1.json" || return 1
  echo "$WORK/runtime-$1.json"
}

case "${1:-}" in
  role)
    aws iam get-role --role-name $ROLE --query Role.Arn --output text 2>/dev/null ||
      aws iam create-role --role-name $ROLE --assume-role-policy-document "file://$HERE/iam/runtime-trust.json" \
        --description "Encore MC on Bedrock AgentCore Runtime (model, voice, logs, traces)" \
        --tags Key=project,Value=encore --query Role.Arn --output text
    aws iam put-role-policy --role-name $ROLE --policy-name encore-mc-runtime \
      --policy-document "file://$HERE/iam/runtime-policy.json"
    ;;
  bucket)
    aws s3api create-bucket --bucket "$BUCKET" --region "$REGION" --create-bucket-configuration LocationConstraint="$REGION"
    aws s3api put-public-access-block --bucket "$BUCKET" --public-access-block-configuration \
      BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
    aws s3api put-bucket-versioning --bucket "$BUCKET" --versioning-configuration Status=Enabled
    # Old builds stay available for rollback for 30 days (the newest five always).
    aws s3api put-bucket-lifecycle-configuration --bucket "$BUCKET" --lifecycle-configuration \
      '{"Rules":[{"ID":"old-builds","Status":"Enabled","Filter":{"Prefix":"encore-mc/"},"NoncurrentVersionExpiration":{"NoncurrentDays":30,"NewerNoncurrentVersions":5}}]}'
    ;;
  upload)
    [ -f "${2:-}" ] || { echo "usage: $0 upload <zip>" >&2; exit 2; }
    aws s3api put-object --bucket "$BUCKET" --key $KEY --body "$2" --expected-bucket-owner $ACCOUNT \
      --checksum-algorithm SHA256 --query VersionId --output text
    ;;
  create)
    [ -n "${2:-}" ] || { echo "usage: $0 create <s3-version-id>" >&2; exit 2; }
    input=$(render create "$2")
    ctl create-agent-runtime --cli-input-json "file://$input" \
      --query '{arn:agentRuntimeArn,id:agentRuntimeId,version:agentRuntimeVersion,status:status}'
    ;;
  update)
    [ -n "${2:-}" ] || { echo "usage: $0 update <s3-version-id>" >&2; exit 2; }
    id=$(runtime_id)
    input=$(render update "$2" "$id")
    ctl update-agent-runtime --cli-input-json "file://$input" \
      --query '{arn:agentRuntimeArn,version:agentRuntimeVersion,status:status}'
    ;;
  wait)
    id=$(runtime_id)
    for _ in $(seq 1 90); do
      s=$(ctl get-agent-runtime --agent-runtime-id "$id" --query status --output text)
      case $s in READY) echo READY; exit 0 ;; *FAILED) ctl get-agent-runtime --agent-runtime-id "$id" --query failureReason --output text; exit 1 ;; esac
      sleep 5
    done
    echo "still $s after 7.5 minutes" >&2; exit 1
    ;;
  status)
    ctl get-agent-runtime --agent-runtime-id "$(runtime_id)" --query '{arn:agentRuntimeArn,version:agentRuntimeVersion,status:status,failure:failureReason,platform:platformVersion,mmds:metadataConfiguration,runtime:agentRuntimeArtifact.codeConfiguration.runtime,zip:agentRuntimeArtifact.codeConfiguration.code.s3.versionId,lifecycle:lifecycleConfiguration,updated:lastUpdatedAt}'
    ;;
  arn) ctl get-agent-runtime --agent-runtime-id "$(runtime_id)" --query agentRuntimeArn --output text ;;
  versions)
    ctl list-agent-runtime-versions --agent-runtime-id "$(runtime_id)" \
      --query 'agentRuntimes[].{version:agentRuntimeVersion,status:status,updated:lastUpdatedAt}' --output table
    ;;
  zips)
    aws s3api list-object-versions --bucket "$BUCKET" --prefix $KEY \
      --query 'Versions[].{version:VersionId,latest:IsLatest,modified:LastModified,mb:Size}' --output table
    ;;
  logs) aws logs tail "/aws/bedrock-agentcore/runtimes/$(runtime_id)-DEFAULT" --region "$REGION" --since "${2:-15m}" ;;
  retention)
    aws logs put-retention-policy --region "$REGION" --log-group-name "/aws/bedrock-agentcore/runtimes/$(runtime_id)-DEFAULT" \
      --retention-in-days "${2:-14}"
    ;;
  tracing)
    arn=$(ctl get-agent-runtime --agent-runtime-id "$(runtime_id)" --query agentRuntimeArn --output text)
    aws logs put-delivery-source --region "$REGION" --name encore-mc-traces --log-type TRACES --resource-arn "$arn" \
      --query 'deliverySource.name' --output text
    dest=$(aws logs put-delivery-destination --region "$REGION" --name encore-mc-xray --delivery-destination-type XRAY \
      --query 'deliveryDestination.arn' --output text)
    aws logs create-delivery --region "$REGION" --delivery-source-name encore-mc-traces --delivery-destination-arn "$dest" \
      --query 'delivery.id' --output text
    ;;
  delete)
    ctl delete-agent-runtime --agent-runtime-id "$(runtime_id)" --query status --output text
    ;;
  *)
    sed -n '2,13p' "$0"; exit 2 ;;
esac
