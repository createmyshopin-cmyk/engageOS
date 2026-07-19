const testAuth = async (z, bundle) => {
  const response = await z.request({
    url: `${bundle.authData.baseUrl}/api/v1/integrations/zapier/me`,
    headers: {
      Authorization: `Bearer ${bundle.authData.apiKey}`,
      Accept: 'application/json',
    },
  });
  if (response.status !== 200) {
    throw new Error('Invalid API key');
  }
  const body = response.json;
  const data = body.data ?? body;
  return {
    businessName: data.businessName,
    businessId: data.businessId,
  };
};

module.exports = {
  type: 'custom',
  fields: [
    {
      key: 'baseUrl',
      label: 'EngageOS Base URL',
      required: true,
      type: 'string',
      helpText: 'Your EngageOS app URL, e.g. https://app.engageos.com',
      default: 'https://app.engageos.com',
    },
    {
      key: 'apiKey',
      label: 'API Key',
      required: true,
      type: 'string',
      helpText: 'Generate from EngageOS → Integrations → Zapier',
    },
  ],
  test: testAuth,
  connectionLabel: '{{businessName}}',
};
