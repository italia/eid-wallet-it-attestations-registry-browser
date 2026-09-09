export const REGISTRY_ENVS = {
  pre: {
    id: 'pre',
    aliases: ['pre', 'preprod', 'pre-prod', 'collaudo'],
    baseUrl: 'https://pre.ta.wallet.ipzs.it',
    manifestFile: 'manifest-pre.json',
  },
  prod: {
    id: 'prod',
    aliases: ['prod', 'production', 'produzione'],
    baseUrl: 'https://ta.wallet.ipzs.it',
    manifestFile: 'manifest-prod.json',
  },
};

export function resolveRegistryEnv(value) {
  const raw = String(value || 'pre').trim().toLowerCase();
  if (REGISTRY_ENVS.prod.aliases.includes(raw)) return REGISTRY_ENVS.prod;
  return REGISTRY_ENVS.pre;
}

export function registryEnvList() {
  return [REGISTRY_ENVS.pre, REGISTRY_ENVS.prod];
}
