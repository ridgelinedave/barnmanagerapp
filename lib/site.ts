/**
 * The origin for links the app HANDS OUT — a calendar subscription, an invite.
 *
 * Production: always the barn's own address (`barn.appHost`, passed in), even
 * when the person is using the app at the old vercel.app address, so new links
 * are never minted on a host the barn is moving off. Local development
 * (localhost, 127.0.0.1, [::1], *.localhost): the address it is running at, so
 * a link works on the machine that made it.
 *
 * Pure — no imports — so it runs on server, client and in tests/invites.
 */
export function shareOrigin(currentHost: string, currentProtocol: string, appHost: string): string {
  const hostname = currentHost.replace(/:\d+$/, "").toLowerCase();
  const local = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname.endsWith(".localhost");
  return local ? `${currentProtocol}://${currentHost}` : `https://${appHost}`;
}
