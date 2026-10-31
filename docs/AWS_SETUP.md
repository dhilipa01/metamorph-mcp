# AWS setup (read-only inventory)

`cloud_inventory` reads Lambda, RDS, EKS and EC2 metadata in ONE AWS account and reports what is end-of-life or soon to be.
It changes nothing.

**Status: not verified against a real AWS account.** The unit tests run the real AWS SDK client objects against stubbed
responses, and an optional test replays the same calls against the moto emulator (see "Evidence"). See "Acceptance check" for what
to run once an account exists.

## What the role can and cannot do

Can: call exactly these actions, on all resources (Describe/List actions do not support narrowing by resource):
`lambda:ListFunctions`, `rds:DescribeDBInstances`, `eks:ListClusters`, `eks:DescribeCluster`, `ec2:DescribeInstances`,
`ec2:DescribeImages`. (`sts:GetCallerIdentity` needs no permission and is not used.)

Cannot: create, change or delete anything; invoke functions or read their code or environment variables; read S3 objects,
secrets, database contents or IAM data; be assumed by anyone except the one principal you name, and only with the ExternalId.
Function names, database identifiers and cluster names are read and shown (after stripping anything that is not a plain
identifier). Tags are not read.

Not checked: Elastic Beanstalk (no verified end-of-life source; reported as `NoVerifiedEolSource`), Aurora and other RDS engines
(only mysql, postgres, mariadb), EC2 instance generations (only Amazon Linux AMIs are checked), IAM key age.

## 1. Pick the base identity

The server process calls STS AssumeRole with the standard AWS SDK credential chain (env `AWS_ACCESS_KEY_ID`,
`AWS_SECRET_ACCESS_KEY`, optional `AWS_SESSION_TOKEN`, or any other default-chain source). Create a dedicated IAM user or role
for it whose ONLY permission is `sts:AssumeRole` on the role created below. Metamorph never stores customer keys beyond this.

## 2. Create the stack

Template: `docs/aws/metamorph-readonly-role.yaml` (also served as the MCP resource `metamorph://aws/readonly-role.yaml`).

Console: CloudFormation > Create stack > With new resources > Upload a template file > choose the YAML > Next > set
`MetamorphPrincipalArn` (ARN of the base identity), `ExternalId` (a random value of 16+ characters; keep it for step 3), leave
`RoleName` > Next > tick "I acknowledge that AWS CloudFormation might create IAM resources with custom names" > Submit.
Open the stack Outputs tab and copy `RoleArn`.

CLI:

```
aws cloudformation deploy \
  --stack-name metamorph-readonly \
  --template-file docs/aws/metamorph-readonly-role.yaml \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides MetamorphPrincipalArn=arn:aws:iam::111122223333:user/metamorph-base ExternalId=<random 16+ chars>
aws cloudformation describe-stacks --stack-name metamorph-readonly --query "Stacks[0].Outputs"
```

## 3. Set the variables in NitroCloud

In the NitroCloud dashboard, open the app > Environment variables, and add (mark the secrets as secret):

| Variable | Value |
|---|---|
| `METAMORPH_AWS_ROLE_ARN` | the stack's `RoleArn` output |
| `METAMORPH_AWS_EXTERNAL_ID` | the ExternalId from step 2 |
| `METAMORPH_AWS_REGIONS` | optional, comma list (max 6). Default: `AWS_REGION` (or us-east-1) plus us-east-1 |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` (`AWS_SESSION_TOKEN`) | the base identity from step 1 |

Redeploy. Values are read only inside the connector. They are never returned, logged or placed in tool arguments.
Session credentials last 900 seconds, are kept in memory and are discarded after each call.

## 4. Check that it works

Call `cloud_inventory` with `{"provider":"aws"}`. Expected: `account` shows `****` and four digits, `regions` lists what was
scanned, `counts` per service, `findings` (ranked, max 25), `notChecked` (with AWS error codes such as `AccessDenied`) and the
line "Read-only: nothing was changed". If the server is not configured, the error points back to this file and does not say which
variable is missing.

## How findings are decided

Dates come from endoflife.date (products `aws-lambda`, `amazon-eks`, `amazon-rds-mysql`, `amazon-rds-postgresql`,
`amazon-rds-mariadb`, `amazon-linux`), fetched live and cached for 6 hours; each finding names the source and fetch time. If the feed
is down, Lambda runtimes and Amazon Linux fall back to a small checked-in table (marked "built-in table", checked 2026-10-31).
RDS engines and EKS have no fallback: they are listed as not checked rather than guessed.
Which date: Lambda uses the runtime deprecation date (the `support` field: security patches stop); EKS, RDS and Amazon Linux use
the end of standard support (`eol`).
Severity: date already passed = high; within 90 days = medium; within 180 days = low; later = no finding.
Limits: 2000 resources per service per region (the result says "checked N, more exist"), 60 seconds overall, 25 findings shown
(the rest counted in `moreFindings`).

Real responses observed on 2026-10-31: `aws-lambda` (52 runtime ids such as `nodejs18.x`, fields cycle, eol, support), `amazon-eks`
(20 cycles such as `1.29`), `amazon-rds-mysql` (cycles `5.7`, `8.0`, `8.4` plus patch releases), `amazon-rds-postgresql` (`9.6` to `18`),
`amazon-rds-mariadb`, `amazon-linux` (`2023`, `2`, `2018.03`...). No endoflife.date product exists for Elastic Beanstalk (HTTP 404).

## Acceptance check once a real AWS account exists

1. Deploy the stack (step 2) in a test account that has at least one old Lambda runtime.
2. Set the variables (step 3) and redeploy.
3. Call `cloud_inventory` `{"provider":"aws"}`; confirm the old function appears with its runtime and a recommendation.
4. Call it with `{"provider":"aws","regions":["eu-west-1"],"services":["lambda"]}`; confirm only that region and service.
5. Change `ExternalId` in the stack to a wrong value; confirm the error is a short message with the code `AccessDenied` and no secrets.
6. Check the server logs contain no key ids, secrets or tokens.

## Evidence

Date of the run: 2026-10-31. Nothing here was checked against a real AWS account.

- Fixture-tested: all logic, via stubbed SDK responses (`tests/unit/cloud-aws.test.ts`, `tests/unit/cloud-iam-actions.test.ts`).
- Wire-level check against an emulator (moto 5.2.5), not a real AWS account: STS AssumeRole, Lambda ListFunctions, RDS
  DescribeDBInstances, EKS ListClusters and DescribeCluster, EC2 DescribeInstances and DescribeImages. The real AWS SDK v3 clients
  (pinned) sent real HTTP requests to the emulator and our inventory code turned the answers into findings (Lambda on a deprecated
  runtime found, RDS and EKS versions mapped to end-of-life cycles, a failing service or region isolated). Test:
  `tests/integration/aws-moto.test.ts`, 7 tests passed.
- What this does NOT show: that real AWS returns identical shapes, that the IAM role grants enough, that the ExternalId condition
  is enforced (moto does not enforce IAM policies or ExternalId), throttling, or pagination limits. Those stay unverified until the
  Acceptance check below is run in a real account.
- Earlier attempt: `localstack/localstack:2026.10.4` exits at start with code 55 (licence activation, needs an auth token), so it
  was not used.

Reproduce (needs Docker; no account or token; use a fresh container per run because the test creates fixed-name resources):

```
docker run -d --rm --name metamorph-moto -p 127.0.0.1:5057:5000 motoserver/moto:5.2.5
METAMORPH_MOTO=1 METAMORPH_MOTO_ENDPOINT=http://127.0.0.1:5057 npx vitest run tests/integration/aws-moto.test.ts
docker rm -f metamorph-moto
```

The emulator endpoint is injected by the test through the client factory and STS client passed to `runAwsInventory`; the server
reads no endpoint setting, so a deployed server cannot be pointed at another endpoint. Without `METAMORPH_MOTO=1` (and always in CI)
the test is skipped with a logged reason, so `npm test` stays offline.
