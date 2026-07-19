module.exports = {
  key: 'add_customer_tag',
  noun: 'Tag',
  display: {
    label: 'Add Customer Tag',
    description: 'Adds a tag to an existing customer.',
  },
  operation: {
    inputFields: [
      { key: 'customerId', label: 'Customer ID', required: true, type: 'string' },
      { key: 'name', label: 'Tag Name', required: true, type: 'string' },
    ],
    perform: async (z, bundle) => {
      const response = await z.request({
        method: 'POST',
        url: `${bundle.authData.baseUrl}/api/v1/customers/${bundle.inputData.customerId}/tags`,
        headers: {
          Authorization: `Bearer ${bundle.authData.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: {
          name: bundle.inputData.name,
        },
      });
      const body = response.json;
      return body.data ?? body;
    },
    sample: {
      id: '00000000-0000-4000-8000-000000000001',
      tags: ['vip'],
    },
  },
};
