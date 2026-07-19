const authentication = require('./authentication');
const customerRegistered = require('./triggers/customer_registered');
const scratchCompleted = require('./triggers/scratch_completed');
const couponRedeemed = require('./triggers/coupon_redeemed');
const couponGenerated = require('./triggers/coupon_generated');
const createCustomer = require('./creates/create_customer');
const addCustomerTag = require('./creates/add_customer_tag');
const createEvent = require('./creates/create_event');

module.exports = {
  version: require('./package.json').version,
  platformVersion: require('zapier-platform-core').version,
  authentication,
  triggers: {
    [customerRegistered.key]: customerRegistered,
    [scratchCompleted.key]: scratchCompleted,
    [couponRedeemed.key]: couponRedeemed,
    [couponGenerated.key]: couponGenerated,
  },
  creates: {
    [createCustomer.key]: createCustomer,
    [addCustomerTag.key]: addCustomerTag,
    [createEvent.key]: createEvent,
  },
};
