const restHook = require('../lib/rest-hook');
const EVENT = 'coupon.generated';

module.exports = {
  key: 'coupon_generated',
  noun: 'Coupon',
  display: {
    label: 'Coupon Generated',
    description: 'Triggers when a coupon is issued to a customer.',
  },
  operation: {
    type: 'hook',
    performSubscribe: restHook.subscribeHook(EVENT),
    performUnsubscribe: restHook.unsubscribeHook,
    perform: restHook.perform,
    performList: restHook.getListItems(EVENT),
    sample: {
      id: '00000000-0000-4000-8000-000000000099',
      event: 'coupon.generated',
      occurred_at: new Date().toISOString(),
      data: {
        coupon: { code: 'SUMMER10', status: 'active' },
        customer: { name: 'Sample Customer', phone: '+919876543210' },
      },
    },
  },
};
