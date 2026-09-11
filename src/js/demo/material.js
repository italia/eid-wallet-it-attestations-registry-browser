import encPublicJwk from '../../../demo/keys/issuer-state-enc.public.jwk.json' with { type: 'json' };
import encPrivateJwk from '../../../demo/keys/issuer-state-enc.private.jwk.json' with { type: 'json' };
import signPublicJwk from '../../../demo/keys/issuer-sign.public.jwk.json' with { type: 'json' };
import signPrivateJwk from '../../../demo/keys/issuer-sign.private.jwk.json' with { type: 'json' };
import holderPublicJwk from '../../../demo/keys/holder-cnf.public.jwk.json' with { type: 'json' };
import holderPrivateJwk from '../../../demo/keys/holder-cnf.private.jwk.json' with { type: 'json' };

export const DEMO_ISSUER = 'https://demo.issuer.wallet.example';
export const DEMO_ISSUER_NAME = 'IT-Wallet Registry Browser Demo Issuer';
export const DEMO_VERIFIER = 'https://demo.verifier.wallet.example';
export const DEMO_ENC_KID = 'itw-demo-enc-1';
export const DEMO_SIG_KID = 'itw-demo-sig-1';

export { encPublicJwk, encPrivateJwk, signPublicJwk, signPrivateJwk, holderPublicJwk, holderPrivateJwk };

export function demoEncPublicJwkText() {
  return JSON.stringify(encPublicJwk, null, 2);
}

export function demoEncPrivateJwkText() {
  return JSON.stringify(encPrivateJwk, null, 2);
}

export function holderCnfPublicJwk() {
  return {
    kty: holderPublicJwk.kty,
    crv: holderPublicJwk.crv,
    x: holderPublicJwk.x,
    y: holderPublicJwk.y,
    alg: 'ES256',
  };
}
