module.exports = {
  key: 'create_event',
  noun: 'Event',
  display: {
    label: 'Create Event',
    description: 'Records a universal event in the EngageOS CDP stream.',
  },
  operation: {
    inputFields: [
      {
        key: 'name',
        label: 'Event Name',
        required: true,
        type: 'string',
        helpText: 'Dotted verb, e.g. order.placed',
      },
      {
        key: 'category',
        label: 'Category',
        required: true,
        type: 'string',
        choices: {
          commerce: 'Commerce',
          loyalty: 'Loyalty',
          campaign: 'Campaign',
          communication: 'Communication',
          profile: 'Profile',
          marketing: 'Marketing',
          system: 'System',
        },
      },
      { key: 'customerId', label: 'Customer ID', required: false, type: 'string' },
      { key: 'campaignId', label: 'Campaign ID', required: false, type: 'string' },
    ],
    perform: async (z, bundle) => {
      const response = await z.request({
        method: 'POST',
        url: `${bundle.authData.baseUrl}/api/v1/events`,
        headers: {
          Authorization: `Bearer ${bundle.authData.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: {
          name: bundle.inputData.name,
          category: bundle.inputData.category,
          customerId: bundle.inputData.customerId || undefined,
          campaignId: bundle.inputData.campaignId || undefined,
          source: 'zapier',
        },
      });
      const body = response.json;
      return body.data ?? body;
    },
    sample: {
      id: '00000000-0000-4000-8000-000000000099',
      deduped: false,
    },
  },
};
