/**
 * Build a by-value OpenID4VCI credential offer URI.
 * issuer_state is intentionally omitted (docs/CREDENTIAL_OFFER.md).
 */
export function configurationIdsFor(credentialType, formats = []) {
  const ids = [];
  for (const format of formats) {
    if (format === 'dc+sd-jwt') ids.push(`dc_sd_jwt_${credentialType}`);
    else if (format === 'mso_mdoc') ids.push(`mso_mdoc_${credentialType}`);
  }
  if (!ids.length) ids.push(`dc_sd_jwt_${credentialType}`);
  return ids;
}

export function credentialOfferHref({
  credentialIssuer,
  configurationIds,
  scheme = 'openid-credential-offer',
}) {
  const body = {
    credential_issuer: credentialIssuer,
    credential_configuration_ids: configurationIds,
    grants: { authorization_code: {} },
  };
  const param = encodeURIComponent(JSON.stringify(body));
  return `${scheme}://?credential_offer=${param}`;
}
