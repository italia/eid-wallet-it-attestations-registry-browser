/**
 * Build a by-value OpenID4VCI credential offer URI.
 * issuer_state is intentionally omitted (docs/CREDENTIAL_OFFER.md).
 */
export function credentialOfferHref({ credentialIssuer, configurationIds, scheme = 'openid-credential-offer' }) {
  const body = {
    credential_issuer: credentialIssuer,
    credential_configuration_ids: configurationIds,
    grants: { authorization_code: {} },
  };
  const param = encodeURIComponent(JSON.stringify(body));
  return `${scheme}://?credential_offer=${param}`;
}
