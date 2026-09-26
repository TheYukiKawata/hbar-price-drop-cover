import hre from "hardhat";

const SOURCIFY_API = "https://sourcify.dev/server/v2";
const CONTRACT = "contracts/PriceDropCover.sol:PriceDropCover";
const POLL_INTERVAL_MS = 3_000;

type VerificationJob = {
  isJobCompleted: boolean;
  contract?: { match: string | null };
  error?: { customCode: string; message: string };
};

async function submitVerification(chainId: bigint, address: string) {
  const buildInfo = await hre.artifacts.getBuildInfo(CONTRACT);
  if (!buildInfo) throw new Error(`No build info for ${CONTRACT}. Run yarn hardhat:compile.`);

  const response = await fetch(`${SOURCIFY_API}/verify/${chainId}/${address}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      stdJsonInput: buildInfo.input,
      compilerVersion: buildInfo.solcLongVersion,
      contractIdentifier: CONTRACT,
    }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`Sourcify rejected the request: ${JSON.stringify(body)}`);
  return (body as { verificationId: string }).verificationId;
}

async function waitForJob(verificationId: string): Promise<VerificationJob> {
  const response = await fetch(`${SOURCIFY_API}/verify/${verificationId}`);
  const job = (await response.json()) as VerificationJob;
  if (job.isJobCompleted) return job;
  await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
  return waitForJob(verificationId);
}

async function main() {
  const { address } = await hre.deployments.get("PriceDropCover");
  const { chainId } = await hre.ethers.provider.getNetwork();
  const job = await waitForJob(await submitVerification(chainId, address));
  if (job.error?.customCode === "already_verified") return console.log(`✅ ${address} is already verified on Sourcify`);
  if (job.error) throw new Error(`Sourcify could not verify ${address}: ${job.error.message}`);
  console.log(`✅ ${address} verified on Sourcify: ${job.contract?.match}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
