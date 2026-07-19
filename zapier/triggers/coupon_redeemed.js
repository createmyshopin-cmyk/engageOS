const restHook = require('../lib/rest-hook');
const EVENT = 'coupon.redeemed';

module.exports = {
  key: 'coupon_redeemed',
  noun: 'Coupon',
  display: {
    label: 'Coupon Redeemed',
    description: 'Triggers when a customer redeems a coupon in store.',
  },
  operation: {
    type: 'hook',
    performSubscribe: restHook.subscribeHook(EVENT),
    performUnsubscribe: restHook.unsubscribeHook,
    perform: restHook.perform,
    performList: restHook.getListItems(EVENT),
    sample: {
      id: '00000000-0000-4000-8000-000000000099',
      event: 'coupon.redeemed',
      occurred_at: new Date().toISOString(),
      data: {
        coupon: { code: 'SUMMER10', status: 'redeemed' },
        customer: { name: 'Sample Customer', phone: '+919876543210' },
      },
    },
  },
};
