const subscribeHook = (event) => async (z, bundle) => {
  const response = await z.request({
    method: 'POST',
    url: `${bundle.authData.baseUrl}/api/v1/integrations/zapier/hooks`,
    headers: {
      Authorization: `Bearer ${bundle.authData.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: {
      hookUrl: bundle.targetUrl,
      event,
    },
  });
  const body = response.json;
  return body.data ?? body;
};

const unsubscribeHook = async (z, bundle) => {
  await z.request({
    method: 'DELETE',
    url: `${bundle.authData.baseUrl}/api/v1/integrations/zapier/hooks/${bundle.subscribeData.id}`,
    headers: {
      Authorization: `Bearer ${bundle.authData.apiKey}`,
    },
  });
  return {};
};

const getFallbackSamples = (event) => async (z, bundle) => {
  const response = await z.request({
    url: `${bundle.authData.baseUrl}/api/v1/integrations/zapier/hooks/sample`,
    headers: {
      Authorization: `Bearer ${bundle.authData.apiKey}`,
    },
    params: { event },
  });
  const body = response.json;
  const data = body.data ?? body;
  return [data];
};

const getListItems = (event) => async (z, bundle) => {
  const response = await z.request({
    url: `${bundle.authData.baseUrl}/api/v1/events`,
    headers: {
      Authorization: `Bearer ${bundle.authData.apiKey}`,
    },
    params: {
      name: event,
      limit: 3,
    },
  });
  const body = response.json;
  const items = body.data ?? [];
  if (items.length > 0) {
    return items.map((item) => ({
      id: item.id,
      event: item.name,
      occurred_at: item.occurredAt,
      data: item.payload ?? {},
    }));
  }
  return getFallbackSamples(event)(z, bundle);
};

const perform = async (z, bundle) => {
  return [bundle.cleanedRequest];
};

module.exports = {
  subscribeHook,
  unsubscribeHook,
  getFallbackSamples,
  getListItems,
  perform,
};
