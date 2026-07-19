const restHook = require('../lib/rest-hook');
const EVENT = 'customer.registered';

module.exports = {
  key: 'customer_registered',
  noun: 'Customer',
  display: {
    label: 'Customer Registered',
    description: 'Triggers when a customer completes registration for a campaign.',
  },
  operation: {
    type: 'hook',
    performSubscribe: restHook.subscribeHook(EVENT),
    performUnsubscribe: restHook.unsubscribeHook,
    perform: restHook.perform,
    performList: restHook.getListItems(EVENT),
    sample: {
      id: '00000000-0000-4000-8000-000000000099',
      event: 'customer.registered',
      occurred_at: new Date().toISOString(),
      data: {
        customer: { name: 'Sample Customer', phone: '+919876543210' },
        campaign: { name: 'Summer Scratch', slug: 'summer-scratch' },
      },
    },
  },
};
