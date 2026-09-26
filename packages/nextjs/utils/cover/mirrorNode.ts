import { Address } from "viem";

type NftPage = {
  nfts: { serial_number: number }[];
  links: { next: string | null };
};

type AccountTokensPage = {
  tokens: { token_id: string }[];
};

type AccountInfo = {
  max_automatic_token_associations: number;
};

const UNLIMITED_AUTO_ASSOCIATIONS = -1;

function isNftPage(body: unknown): body is NftPage {
  const page = body as NftPage;
  return Array.isArray(page?.nfts) && page.nfts.every(nft => typeof nft.serial_number === "number");
}

function isAccountTokensPage(body: unknown): body is AccountTokensPage {
  return Array.isArray((body as AccountTokensPage)?.tokens);
}

function isAccountInfo(body: unknown): body is AccountInfo {
  return typeof (body as AccountInfo)?.max_automatic_token_associations === "number";
}

async function fetchMirror<T>(url: string, isExpectedShape: (body: unknown) => body is T): Promise<T | undefined> {
  const response = await fetch(url);
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error(`Mirror node returned ${response.status} for ${url}`);

  const body: unknown = await response.json();
  if (!isExpectedShape(body)) throw new Error(`Unexpected mirror node response from ${url}`);
  return body;
}

export async function fetchOwnedSerialNumbers(mirrorUrl: string, owner: Address, tokenId: string): Promise<bigint[]> {
  const serialNumbers: bigint[] = [];
  let nextPath: string | null = `/api/v1/accounts/${owner}/nfts?token.id=${tokenId}&limit=100`;

  while (nextPath) {
    const page: NftPage | undefined = await fetchMirror(`${mirrorUrl}${nextPath}`, isNftPage);
    if (!page) break;
    serialNumbers.push(...page.nfts.map(nft => BigInt(nft.serial_number)));
    nextPath = page.links.next;
  }
  return serialNumbers.sort((a, b) => (a > b ? -1 : 1));
}

export async function needsTokenAssociation(mirrorUrl: string, account: Address, tokenId: string): Promise<boolean> {
  const [accountInfo, accountTokens] = await Promise.all([
    fetchMirror(`${mirrorUrl}/api/v1/accounts/${account}`, isAccountInfo),
    fetchMirror(`${mirrorUrl}/api/v1/accounts/${account}/tokens?token.id=${tokenId}`, isAccountTokensPage),
  ]);
  if (!accountInfo) return true;

  const isAssociated = (accountTokens?.tokens.length ?? 0) > 0;
  const autoAssociatesAnyToken = accountInfo.max_automatic_token_associations === UNLIMITED_AUTO_ASSOCIATIONS;
  return !isAssociated && !autoAssociatesAnyToken;
}
