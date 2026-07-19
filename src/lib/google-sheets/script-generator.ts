import { buildExportQuery } from "@/lib/google-sheets/feeds-store";
import type { GoogleSheetsFeedPublic } from "@/lib/google-sheets/types";

const EXPORT_PATH = "/api/v1/integrations/google-sheets/export";

const HEADERS_BY_FEED: Record<string, string[]> = {
  all_customers: ["Name", "Phone", "Email", "Joined On", "Latest Coupon Code", "Latest Prize", "Total Rewards"],
  new_customers: ["Name", "Phone", "Email", "Joined On", "Latest Coupon Code", "Latest Prize", "Total Rewards"],
  reward_customers: ["Name", "Phone", "Email", "Joined On", "Latest Coupon Code", "Latest Prize", "Total Rewards"],
  tag: ["Name", "Phone", "Email", "Joined On", "Latest Coupon Code", "Latest Prize", "Total Rewards", "Tags"],
  campaign: ["Name", "Phone", "Email", "Joined On", "Campaign", "Prize", "Code", "Status", "Played At"],
  campaigns_summary: ["Name", "Slug", "Status", "Starts", "Ends", "Plays", "Wins", "Redeemed", "Remaining Coupons"],
  shopify_codes: [
    "Code", "Status", "Prize", "Campaign", "Customer Name", "Customer Phone",
    "Shopify Linked", "Shopify Code ID", "Source", "Created", "Redeemed", "Expires",
  ],
};

function sanitizeTabName(name: string): string {
  return name.replace(/[\\/?*[\]]/g, "").slice(0, 100) || "Sheet";
}

function feedToScriptEntry(feed: GoogleSheetsFeedPublic) {
  return {
    tab: sanitizeTabName(feed.tabName),
    feedType: feed.feedType,
    query: buildExportQuery(feed),
    headers: HEADERS_BY_FEED[feed.feedType] ?? HEADERS_BY_FEED.all_customers,
  };
}

export function generateAppsScript(feeds: GoogleSheetsFeedPublic[], webappUrl?: string | null): string {
  const enabled = feeds.filter((f) => f.enabled);
  const feedsJson = JSON.stringify(
    enabled.map(feedToScriptEntry),
    null,
    2
  );
  const baseUrlLiteral = JSON.stringify(webappUrl?.replace(/\/+$/, "") ?? "");

  return `/**
 * EngageOS Google Sheets Sync (auto-generated)
 * Do not edit FEEDS manually — update export settings in EngageOS and copy the new script.
 *
 * Script Properties required:
 *   ENGAGEOS_API_KEY — your eos_sheets_live_... key from EngageOS
 * ENGAGEOS_BASE_URL is embedded below; override via Script Properties if needed.
 */
var FEEDS = ${feedsJson};
var EXPORT_PATH = '${EXPORT_PATH}';
var ENGAGEOS_BASE_URL_DEFAULT = ${baseUrlLiteral};

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('EngageOS')
    .addItem('Sync Now', 'syncEngageOS')
    .addItem('Setup (run once)', 'setupEngageOS')
    .addToUi();
}

function setupEngageOS() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  for (var i = 0; i < FEEDS.length; i++) {
    ensureSheet_(ss, FEEDS[i].tab, FEEDS[i].headers);
  }
  installHourlyTrigger_();
  SpreadsheetApp.getUi().alert('EngageOS setup complete. ' + FEEDS.length + ' tab(s) ready.');
}

function syncEngageOS() {
  var config = getConfig_();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var total = 0;
  for (var i = 0; i < FEEDS.length; i++) {
    var feed = FEEDS[i];
    var rows = fetchAllPages_(config, EXPORT_PATH + '?' + feed.query);
    writeFeed_(ss, feed, rows);
    total += rows.length;
  }
  ss.toast('Synced ' + total + ' rows across ' + FEEDS.length + ' tab(s).', 'EngageOS', 5);
}

function ensureSheet_(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  sheet.clear();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  sheet.setFrozenRows(1);
  return sheet;
}

function writeFeed_(ss, feed, rows) {
  var sheet = ensureSheet_(ss, feed.tab, feed.headers);
  if (!rows.length) return;
  var values = rows.map(function (r) { return rowToValues_(feed.feedType, r); });
  sheet.getRange(2, 1, 1 + values.length, feed.headers.length).setValues(values);
}

function rowToValues_(feedType, r) {
  switch (feedType) {
    case 'all_customers':
    case 'new_customers':
    case 'reward_customers':
      return [r.name || '', r.phone || '', r.email || '', r.joinedOn || '', r.latestCouponCode || '', r.latestPrize || '', r.totalRewards != null ? r.totalRewards : 0];
    case 'tag':
      return [r.name || '', r.phone || '', r.email || '', r.joinedOn || '', r.latestCouponCode || '', r.latestPrize || '', r.totalRewards != null ? r.totalRewards : 0, r.tags || ''];
    case 'campaign':
      return [r.name || '', r.phone || '', r.email || '', r.joinedOn || '', r.campaignName || '', r.prizeName || '', r.code || '', r.couponStatus || '', formatDate_(r.playedAt)];
    case 'campaigns_summary':
      return [r.name || '', r.slug || '', r.status || '', formatDate_(r.startsAt), formatDate_(r.endsAt), r.plays != null ? r.plays : 0, r.wins != null ? r.wins : 0, r.redeemed != null ? r.redeemed : 0, r.remainingCoupons != null ? r.remainingCoupons : 0];
    case 'shopify_codes':
      return [r.code || '', r.status || '', r.prizeName || '', r.campaignName || '', r.customerName || '', r.customerPhone || '', r.shopifyLinked ? 'Yes' : 'No', r.shopifyCodeId || '', r.source || '', formatDate_(r.createdAt), formatDate_(r.redeemedAt), formatDate_(r.expiresAt)];
    default:
      return [];
  }
}

function fetchAllPages_(config, pathWithQuery) {
  var all = [];
  var cursor = null;
  var maxRows = 10000;
  var pageLimit = 100;
  while (all.length < maxRows) {
    var sep = pathWithQuery.indexOf('?') >= 0 ? '&' : '?';
    var url = config.baseUrl + pathWithQuery + sep + 'limit=' + pageLimit;
    if (cursor) url += '&cursor=' + encodeURIComponent(cursor);
    var response = UrlFetchApp.fetch(url, {
      method: 'get',
      muteHttpExceptions: true,
      headers: { Authorization: 'Bearer ' + config.apiKey, Accept: 'application/json' }
    });
    if (response.getResponseCode() !== 200) {
      throw new Error('EngageOS API error ' + response.getResponseCode() + ': ' + response.getContentText());
    }
    var body = JSON.parse(response.getContentText());
    if (!body.ok) throw new Error(body.error && body.error.message ? body.error.message : 'EngageOS API failed');
    var items = body.data || [];
    for (var i = 0; i < items.length; i++) {
      all.push(items[i]);
      if (all.length >= maxRows) break;
    }
    if (!body.page || !body.page.hasMore || !body.page.nextCursor) break;
    cursor = body.page.nextCursor;
  }
  return all;
}

function getConfig_() {
  var props = PropertiesService.getScriptProperties();
  var apiKey = props.getProperty('ENGAGEOS_API_KEY');
  var baseUrl = (props.getProperty('ENGAGEOS_BASE_URL') || ENGAGEOS_BASE_URL_DEFAULT || '').replace(/\\/+$/, '');
  if (!apiKey) throw new Error('Set ENGAGEOS_API_KEY in Script Properties.');
  if (!baseUrl) throw new Error('Set ENGAGEOS_BASE_URL in Script Properties or reconnect in EngageOS with your web app URL.');
  return { apiKey: apiKey, baseUrl: baseUrl };
}

function installHourlyTrigger_() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'syncEngageOS') ScriptApp.deleteTrigger(triggers[i]);
  }
  ScriptApp.newTrigger('syncEngageOS').timeBased().everyHours(1).create();
}

function formatDate_(iso) {
  if (!iso) return '';
  try { return Utilities.formatDate(new Date(iso), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm'); }
  catch (e) { return iso; }
}
`;
}
