const restHook = require('../lib/rest-hook');
const EVENT = 'scratch.completed';

module.exports = {
  key: 'scratch_completed',
  noun: 'Scratch',
  display: {
    label: 'Scratch Completed',
    description: 'Triggers when a customer finishes scratching their card.',
  },
  operation: {
    type: 'hook',
    performSubscribe: restHook.subscribeHook(EVENT),
    performUnsubscribe: restHook.unsubscribeHook,
    perform: restHook.perform,
    performList: restHook.getListItems(EVENT),
    sample: {
      id: '00000000-0000-4000-8000-000000000099',
      event: 'scratch.completed',
      occurred_at: new Date().toISOString(),
      data: {
        customer: { name: 'Sample Customer', phone: '+919876543210' },
        prize: { name: '10% Off' },
      },
    },
  },
};
