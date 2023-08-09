import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam'
import * as ecr from 'aws-cdk-lib/aws-ecr'
import * as codebuild from 'aws-cdk-lib/aws-codebuild'
import * as events_targets from 'aws-cdk-lib/aws-events-targets';
import { Construct } from 'constructs';
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class CicdStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const buildRole = new iam.Role(this, 'funnel-image-builder', {
      roleName: 'funnel-image-builder-role',
      assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
    });

    const buildImageECRRepoName = "plugins-test-image"
    const buildImageRepo = new ecr.Repository(this, buildImageECRRepoName, {
      repositoryName: buildImageECRRepoName,
      imageTagMutability: ecr.TagMutability.MUTABLE,
      autoDeleteImages: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });
    buildImageRepo.grantPullPush(buildRole)

    buildRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          "codeartifact:GetAuthorizationToken",
          "codeartifact:DescribeRepository",
          "codeartifact:GetPackageVersionReadme",
          "codeartifact:GetRepositoryEndpoint",
          "codeartifact:ListPackageVersionAssets",
          "codeartifact:ListPackageVersionDependencies",
          "codeartifact:ListPackageVersions",
          "codeartifact:ListPackages",
          "codeartifact:ReadFromRepository",
          "kms:*",
          "s3:*",
          "secretsmanager:GetSecretValue"
        ],
        resources: ['*']
      })
    );

    buildRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["sts:GetServiceBearerToken"],
        resources: ["arn:aws:sts::028790571394:*"]
      })
    );

    buildRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["sts:AssumeRole"],
        resources: ["arn:aws:iam::028790571394:role/ConfigSecretRole"]
      })
    );

    const buildImageProjectName = "build-plugins-test-image"
    const buildImageSource = codebuild.Source.gitHub({
      owner: "funnel-io",
      repo: "aws-codebuild-docker-images",
      webhook: true,
      webhookFilters: [
        codebuild.FilterGroup
          .inEventOf(codebuild.EventAction.PUSH)
          .andBranchIs("master")
          .andCommitMessageIs("^update image.*$")
      ],
      buildStatusContext: buildImageProjectName,

    });
    const build_image_project = new codebuild.Project(this, buildImageProjectName, {
      projectName: buildImageProjectName,
      cache: codebuild.Cache.local(codebuild.LocalCacheMode.SOURCE),
      source: buildImageSource,
      buildSpec: codebuild.BuildSpec.fromSourceFilename("cicd/buildspecs/plugin-test-image.yml"),
      role: buildRole,
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        computeType: codebuild.ComputeType.MEDIUM
      }
    });
  }
}
