module.exports = {
  key: 'create_customer',
  noun: 'Customer',
  display: {
    label: 'Create or Update Customer',
    description: 'Creates or updates a customer by phone number.',
  },
  operation: {
    inputFields: [
      { key: 'phone', label: 'Phone', required: true, type: 'string' },
      { key: 'name', label: 'Name', required: false, type: 'string' },
      { key: 'email', label: 'Email', required: false, type: 'string' },
    ],
    perform: async (z, bundle) => {
      const response = await z.request({
        method: 'POST',
        url: `${bundle.authData.baseUrl}/api/v1/customers`,
        headers: {
          Authorization: `Bearer ${bundle.authData.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: {
          phone: bundle.inputData.phone,
          name: bundle.inputData.name,
          email: bundle.inputData.email,
        },
      });
      const body = response.json;
      return body.data ?? body;
    },
    sample: {
      id: '00000000-0000-4000-8000-000000000001',
      phone: '+919876543210',
      name: 'Sample Customer',
    },
  },
};
