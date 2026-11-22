// background.js - Smart AutoComplete Service Worker with Full Profile Autofill

const DEFAULT_SNIPPETS = [
  { id: 'snip_handle', trigger: '/handle', value: '{{user_id}}', description: 'Insert favorite handle (xCONFLiCTiONx)' },
  { id: 'snip_email', trigger: '/email', value: '{{email}}', description: 'Insert primary email' },
  { id: 'snip_phone', trigger: '/phone', value: '{{cell_phone}}', description: 'Insert phone number' },
  { id: 'snip_name', trigger: '/name', value: '{{full_name}}', description: 'Insert full name' },
  { id: 'snip_addr', trigger: '/addr', value: '{{address_full}}', description: 'Insert full street address' },
  { id: 'snip_date', trigger: '/date', value: '{{date}}', description: 'Insert current date (YYYY-MM-DD)' },
  { id: 'snip_time', trigger: '/time', value: '{{time}}', description: 'Insert current local time' },
  { id: 'snip_shrug', trigger: '/shrug', value: '¯\\_(ツ)_/¯', description: 'Shrug emoji' }
];

const DEFAULT_SETTINGS = {
  enabled: true,
  autoFillOnLoad: true, // Enabled on page load per user request
  captureSubmittedValues: true,
  theme: 'dark',
  maxSuggestions: 8,
  minCharsToSuggest: 2,
  snippetsEnabled: true,
  ghostTextEnabled: true,
  disabledDomains: [],
  customSnippets: [...DEFAULT_SNIPPETS]
};

const SEED_ENTRIES = [
  { id: 'seed_confliction', text: 'xCONFLiCTiONx', category: 'user_id', count: 55, lastUsed: Date.now(), pinned: true, created: Date.now() }
];

// Canonical category map for alias normalization.
const CATEGORY_CANONICAL_MAP = {
  // Street Address (Line 1)
  address_line_1: 'address_line_1',
  address: 'address_line_1',
  street_address: 'address_line_1',
  street: 'address_line_1',
  addr: 'address_line_1',
  address1: 'address_line_1',

  // Secondary Address (Line 2)
  address_line_2: 'address_line_2',
  suite: 'address_line_2',
  apt: 'address_line_2',
  apartment: 'address_line_2',
  unit: 'address_line_2',
  address2: 'address_line_2',
  secondary_address: 'address_line_2',

  // City
  city: 'city',
  town: 'city',
  suburb: 'city',
  locality: 'city',

  // State
  state: 'state',
  province: 'state',
  region: 'state',

  // Zip / Postal code
  zip: 'zip',
  postal_code: 'zip',
  postal: 'zip',
  postcode: 'zip',
  zipcode: 'zip',

  // Zip+4
  zip4: 'zip4',
  zip_plus4: 'zip4',
  zip_ext: 'zip4',
  postal_suffix: 'zip4',

  // Country
  country: 'country',
  nation: 'country',

  // User ID / Login
  user_id: 'user_id',
  username: 'user_id',
  login: 'user_id',
  handle: 'user_id',

  // Full Name
  full_name: 'full_name',
  name: 'full_name',

  // First Name
  first_name: 'first_name',
  firstname: 'first_name',
  fname: 'first_name',
  given_name: 'first_name',
  first: 'first_name',

  // Middle Name & Initial
  middle_name: 'middle_name',
  mname: 'middle_name',
  'additional-name': 'middle_name',
  middle_initial: 'middle_initial',
  minitial: 'middle_initial',

  // Last Name
  last_name: 'last_name',
  lastname: 'last_name',
  lname: 'last_name',
  surname: 'last_name',
  family_name: 'last_name',
  last: 'last_name',

  // Title
  title: 'title',
  salutation: 'title',
  honorific: 'title',
  prefix: 'title',

  // Phones
  cell_phone: 'cell_phone',
  mobile_phone: 'cell_phone',
  phone: 'cell_phone',
  telephone: 'cell_phone',
  home_phone: 'home_phone',
  work_phone: 'work_phone',
  fax: 'fax',

  // Email
  email: 'email',

  // Web
  website: 'website',
  url: 'website',

  // Demographics
  sex: 'sex',
  gender: 'sex',
  dob: 'dob',
  date_of_birth: 'dob',
  dob_month: 'dob_month',
  month: 'dob_month',
  dob_day: 'dob_day',
  day: 'dob_day',
  dob_year: 'dob_year',
  year: 'dob_year',
  age: 'age',
  birth_place: 'birth_place',

  // Work & Financial
  company: 'company',
  organization: 'company',
  position: 'position',
  job_title: 'position',
  occupation: 'position',
  income: 'income',
  salary: 'income',

  // Government ID
  social_security_number: 'social_security_number',
  ssn: 'social_security_number',
  driver_license_number: 'driver_license_number',
  dl: 'driver_license_number',

  // Freeform Site Custom
  site_custom: 'site_custom',
  notes: 'site_custom',
  textarea: 'site_custom'
};

function getCanonicalCategory(category) {
  if (!category || typeof category !== 'string') return 'site_custom';
  const clean = category.trim().toLowerCase();
  return CATEGORY_CANONICAL_MAP[clean] || clean;
}

function getDuplicateTextKey(text, canonicalCat) {
  if (!text || typeof text !== 'string') return '';
  let clean = text.trim().replace(/\s+/g, ' ').toLowerCase();

  // For phone numbers: digits-only comparison
  if (['cell_phone', 'home_phone', 'work_phone', 'fax'].includes(canonicalCat)) {
    const digits = clean.replace(/\D/g, '');
    if (digits.length >= 7) return digits;
  }

  // For address line 1, address line 2, city, state, country:
  // Strip trailing punctuation (periods, commas) so "123 Main St." matches "123 Main St", "TX." matches "tx"
  if (['address_line_1', 'address_line_2', 'city', 'state', 'country'].includes(canonicalCat)) {
    clean = clean.replace(/[,.]\s*$/, '').trim();
  }

  // For zip: extract 5-digit zip for comparison if present
  if (canonicalCat === 'zip') {
    const m = clean.match(/^(\d{5})/);
    if (m) return m[1];
  }

  return clean;
}

/**
 * Returns all active snippets: defaults plus all user-defined custom snippets.
 */
function getAllSnippets() {
  const custom = Array.isArray(cachedSettings.customSnippets) ? cachedSettings.customSnippets : [];
  const map = new Map();
  // Add defaults first
  DEFAULT_SNIPPETS.forEach(d => map.set(d.trigger.toLowerCase(), { ...d }));
  // Add/override with user-configured snippets
  custom.forEach(c => {
    if (c && c.trigger) {
      map.set(c.trigger.trim().toLowerCase(), c);
    }
  });
  return Array.from(map.values());
}

/**
 * Comprehensive duplicate cleaner.
 * Normalizes categories via canonical mapping and merges duplicates across
 * field groups (home, shipping, billing) and category aliases.
 * Preserves distinct categories (e.g. user_id vs email, address_line_1 vs address_line_2)
 * and preserves domain isolation for site_custom fields.
 */
function cleanDuplicateEntries() {
  const initialCount = cachedEntries.length;
  const seen = new Map();
  const result = [];

  for (const entry of cachedEntries) {
    if (!entry || !entry.text) continue;
    const canonicalCat = getCanonicalCategory(entry.category);

    if (isSensitive(entry.text)) continue;
    if (canonicalCat === 'email' && !isValidEmail(entry.text)) continue;

    const textKey = getDuplicateTextKey(entry.text, canonicalCat);
    if (!textKey) continue;

    const isSiteSpecific = ['site_custom', 'notes', 'textarea'].includes(canonicalCat);
    const siteKey = isSiteSpecific ? (entry.hostname || entry.url || '').trim().toLowerCase() : '';

    const signature = `${textKey}:::${canonicalCat}:::${siteKey}`;

    if (!seen.has(signature)) {
      // Normalize category to canonical category
      entry.category = canonicalCat;
      // For global profile/address fields, strip site context and fieldGroup so they are clean
      if (!isSiteSpecific) {
        delete entry.url;
        delete entry.path;
        delete entry.hostname;
        delete entry.fieldIdentifier;
        delete entry.fieldGroup;
        delete entry.addressGroup;
      }
      seen.set(signature, entry);
      result.push(entry);
    } else {
      // Duplicate found! Merge into existing entry
      const existing = seen.get(signature);
      existing.count = (existing.count || 1) + (entry.count || 1);
      if (entry.pinned) existing.pinned = true;
      existing.lastUsed = Math.max(existing.lastUsed || 0, entry.lastUsed || 0);
      existing.created = Math.min(existing.created || Date.now(), entry.created || Date.now());
      // Prefer cleaner text formatting (e.g. "TX" over "tx", or "123 Main St" without trailing period)
      if (entry.text && existing.text) {
        const existingHasUpper = /[A-Z]/.test(existing.text);
        const entryHasUpper = /[A-Z]/.test(entry.text);
        if (!existingHasUpper && entryHasUpper) {
          existing.text = entry.text.trim();
        }
        if (existing.text.endsWith('.') && !entry.text.endsWith('.')) {
          existing.text = entry.text.trim();
        }
      }
    }
  }

  cachedEntries = result;
  const removedCount = initialCount - cachedEntries.length;
  return { removedCount, remainingCount: cachedEntries.length };
}

// In-memory cache for ultra-fast matching
let cachedEntries = [];
let cachedSettings = { ...DEFAULT_SETTINGS };

const DEFAULT_ADDRESSES = {
  address1: {
    label: 'Address 1',
    address_line_1: '',
    address_line_2: '',
    city: '',
    state: '',
    zip: '',
    zip4: '',
    country: '',
    isDefaultHome: true,
    isDefaultShipping: true,
    isDefaultBilling: false
  },
  address2: {
    label: 'Address 2',
    address_line_1: '',
    address_line_2: '',
    city: '',
    state: '',
    zip: '',
    zip4: '',
    country: '',
    isDefaultHome: false,
    isDefaultShipping: false,
    isDefaultBilling: true
  }
};

let cachedAddresses = JSON.parse(JSON.stringify(DEFAULT_ADDRESSES));

function getResolvedAddresses() {
  const addr1 = cachedAddresses.address1 || DEFAULT_ADDRESSES.address1;
  const addr2 = cachedAddresses.address2 || DEFAULT_ADDRESSES.address2;

  // Home resolution
  let homeAddr = addr1;
  if (addr2.isDefaultHome && !addr1.isDefaultHome) {
    homeAddr = addr2;
  } else if (addr1.isDefaultHome) {
    homeAddr = addr1;
  } else if (addr2.isDefaultHome) {
    homeAddr = addr2;
  }

  // Shipping resolution
  let shippingAddr = addr1;
  if (addr2.isDefaultShipping && !addr1.isDefaultShipping) {
    shippingAddr = addr2;
  } else if (addr1.isDefaultShipping) {
    shippingAddr = addr1;
  } else if (addr2.isDefaultShipping) {
    shippingAddr = addr2;
  }

  // Billing resolution
  let billingAddr = addr2;
  if (addr1.isDefaultBilling && !addr2.isDefaultBilling) {
    billingAddr = addr1;
  } else if (addr2.isDefaultBilling) {
    billingAddr = addr2;
  } else if (addr1.isDefaultBilling) {
    billingAddr = addr1;
  }

  const homeWarning = Boolean(addr1.isDefaultHome && addr2.isDefaultHome);
  const shippingWarning = Boolean(addr1.isDefaultShipping && addr2.isDefaultShipping);
  const billingWarning = Boolean(addr1.isDefaultBilling && addr2.isDefaultBilling);

  return { homeAddr, shippingAddr, billingAddr, addr1, addr2, homeWarning, shippingWarning, billingWarning };
}
let dataLoadPromise = null;

function isRestrictedUrl(url) {
  if (!url || typeof url !== 'string') return true;
  const trimmed = url.trim().toLowerCase();
  if (
    trimmed.startsWith('chrome://') ||
    trimmed.startsWith('chrome-extension://') ||
    trimmed.startsWith('edge://') ||
    trimmed.startsWith('about:') ||
    trimmed.startsWith('view-source:') ||
    trimmed.startsWith('devtools://') ||
    trimmed.startsWith('data:')
  ) {
    return true;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.hostname === 'chromewebstore.google.com' || parsed.hostname === 'chrome.google.com') return true;
  } catch {
    return true;
  }
  return false;
}

function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim();
  // Valid email format with @ and a real domain part
  return /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/.test(trimmed);
}

function refreshData() {
  dataLoadPromise = (dataLoadPromise || Promise.resolve()).then(() => loadDataFromStorage());
  return dataLoadPromise;
}

// --- Storage Engine (Local Only) ---

/**
 * Loads all data from chrome.storage.local
 */
async function loadDataFromStorage() {
  try {
    const localData = await chrome.storage.local.get(['entries', 'settings', 'addresses', 'sac_initialized']).catch(err => {
      console.warn('Local storage read warning:', err);
      return {};
    });

    let entries = Array.isArray(localData.entries) ? localData.entries : [...SEED_ENTRIES];

    // Purge any invalid entries, general topics, passwords, credit cards, or legacy dummy test seeds
    const DUMMY_SEED_TEXTS = new Set([
      'confliction media', 'lead engineer', '125000', '123-45-6789', 'dl987654321',
      '100 innovation way', 'suite 400', '78701', 'chase bank', 'jane doe',
      '4111 1111 1111 1111', 'visa', 'master card', 'american express', 'discover',
      '(512) 555-0100', '(512) 555-0150', '(512) 555-0151', '(512) 555-0142', '800-432-3117',
      'automated by smart autocomplete - ultra fast and reliable.',
      'permanent high-frequency profile for automated form filling.'
    ]);

    entries = entries.filter(e => {
      if (!e || !e.text || isSensitive(e.text)) return false;
      const cat = (e.category || '').toLowerCase();
      // Purge invalid emails (e.g. CSRF tokens, honeypot hashes)
      if (cat === 'email' && !isValidEmail(e.text)) return false;
      if (['cell_phone', 'home_phone', 'work_phone', 'fax'].includes(cat)) {
        if (e.text.replace(/\D/g, '').length < 7) return false;
      }
      if (cat === 'comments' || cat === 'custom_message') return false;
      if (['general', 'excluded', 'password'].includes(cat)) return false;
      if (cat.startsWith('credit_card') || cat.startsWith('card_')) return false;
      if (DUMMY_SEED_TEXTS.has(e.text.trim().toLowerCase())) return false;
      if (e.id && e.id.startsWith('seed_') && e.id !== 'seed_confliction') return false;
      return true;
    });

    // Ensure classified fields (email, phone, address, name, handle, etc.) are strictly clean global items
    entries.forEach(e => {
      const cat = (e.category || '').toLowerCase();
      if (!['site_custom', 'notes', 'textarea'].includes(cat)) {
        delete e.url;
        delete e.path;
        delete e.hostname;
        delete e.fieldIdentifier;
      }
    });

    // Ensure xCONFLiCTiONx exists as a user_id / username
    const hasConfliction = entries.some(e => (e.text || '').toLowerCase() === 'xconflictionx');
    if (!hasConfliction) {
      entries.unshift({ ...SEED_ENTRIES[0] });
    }

    cachedEntries = entries;
    cleanDuplicateEntries();
    const loadedSettings = localData.settings || {};
    cachedSettings = {
      ...DEFAULT_SETTINGS,
      ...loadedSettings,
      disabledDomains: Array.isArray(loadedSettings.disabledDomains) ? loadedSettings.disabledDomains : [],
      customSnippets: Array.isArray(loadedSettings.customSnippets) && loadedSettings.customSnippets.length > 0
        ? loadedSettings.customSnippets
        : [...DEFAULT_SNIPPETS]
    };

    if (localData.addresses && typeof localData.addresses === 'object') {
      const raw = localData.addresses;
      if (raw.address1 && raw.address2) {
        cachedAddresses = {
          address1: { ...DEFAULT_ADDRESSES.address1, ...raw.address1 },
          address2: { ...DEFAULT_ADDRESSES.address2, ...raw.address2 }
        };
      } else if (raw.shipping || raw.billing) {
        // Migrate legacy { shipping, billing } format
        cachedAddresses = {
          address1: {
            ...DEFAULT_ADDRESSES.address1,
            ...(raw.shipping || {}),
            isDefaultShipping: true,
            isDefaultBilling: Boolean(raw.billingSameAsShipping)
          },
          address2: {
            ...DEFAULT_ADDRESSES.address2,
            ...(raw.billing || {}),
            isDefaultShipping: false,
            isDefaultBilling: !Boolean(raw.billingSameAsShipping)
          }
        };
      } else {
        cachedAddresses = JSON.parse(JSON.stringify(DEFAULT_ADDRESSES));
      }
    } else {
      // Migrate existing pinned address entries from entries if present
      cachedAddresses = JSON.parse(JSON.stringify(DEFAULT_ADDRESSES));
      const getPinnedVal = cat => {
        const found = entries.find(e => e.pinned && (e.category || '').toLowerCase() === cat);
        return found ? found.text.trim() : '';
      };
      const line1 = getPinnedVal('address_line_1') || getPinnedVal('address');
      const line2 = getPinnedVal('address_line_2');
      const city = getPinnedVal('city');
      const state = getPinnedVal('state');
      const zip = getPinnedVal('zip');
      const zip4 = getPinnedVal('zip4');
      const country = getPinnedVal('country');

      if (line1 || city || zip) {
        cachedAddresses.address1 = {
          label: 'Address 1',
          address_line_1: line1,
          address_line_2: line2,
          city,
          state,
          zip,
          zip4,
          country,
          isDefaultShipping: true,
          isDefaultBilling: false
        };
      }
    }

    await chrome.storage.local.set({
      entries: cachedEntries,
      settings: cachedSettings,
      addresses: cachedAddresses,
      sac_initialized: true
    });

  } catch (err) {
    console.warn('Local storage error (using memory fallback):', err);
    cachedEntries = cachedEntries.length ? cachedEntries : [...SEED_ENTRIES];
    cachedSettings = { ...DEFAULT_SETTINGS };
  }
}

/**
 * Updates or adds an entry in memory cache with full validation.
 */
function saveEntryInMemory(entryData) {
  const {
    text,
    category,
    pinned = false,
    url = '',
    path = '',
    hostname = '',
    fieldIdentifier = '',
    fieldGroup = ''
  } = entryData;
  if (!text || isSensitive(text)) return null;

  const trimmed = text.trim();
  const rawCat = (category || '').toLowerCase();
  const cat = getCanonicalCategory(rawCat);
  if (!cat || cat === 'general' || cat === 'excluded' || cat === 'comments' || cat === 'custom_message') return null;

  // Strict email validation: never save junk tokens / CSRF hashes as emails!
  if (cat === 'email' && !isValidEmail(trimmed)) return null;

  // Phone validation: must contain at least 7 digits
  if (['cell_phone', 'home_phone', 'work_phone', 'fax'].includes(cat)) {
    if (trimmed.replace(/\D/g, '').length < 7) return null;
  }

  const isSiteSpecific = ['site_custom', 'notes', 'textarea'].includes(cat);
  const cleanUrl = isSiteSpecific ? (url || '').trim() : '';
  const cleanPath = isSiteSpecific ? (path || '').trim() : '';
  const cleanHostname = isSiteSpecific ? (hostname || '').trim().toLowerCase() : '';
  const cleanFieldId = isSiteSpecific ? (fieldIdentifier || '').trim().toLowerCase() : '';
  const targetTextKey = getDuplicateTextKey(trimmed, cat);

  // Find existing match by text and canonical category
  const existingIdx = cachedEntries.findIndex(e => {
    const eCat = getCanonicalCategory(e.category);
    if (eCat !== cat) return false;
    if (getDuplicateTextKey(e.text, eCat) !== targetTextKey) return false;

    // For unclassified/site-specific fields, isolate by URL or domain so they don't merge across sites
    if (isSiteSpecific) {
      if (cleanUrl && e.url) return e.url === cleanUrl;
      if (cleanPath && e.path) return e.path === cleanPath;
      if (cleanHostname && e.hostname) return e.hostname === cleanHostname;
      return !cleanHostname && !e.hostname;
    }

    return true;
  });

  let targetEntry = null;

  if (existingIdx >= 0) {
    targetEntry = cachedEntries[existingIdx];
    targetEntry.count = (targetEntry.count || 1) + 1;
    targetEntry.lastUsed = Date.now();
    targetEntry.category = cat;
    if (pinned) {
      targetEntry.pinned = true;
    }
    if (isSiteSpecific) {
      if (cleanUrl) targetEntry.url = cleanUrl;
      if (cleanPath) targetEntry.path = cleanPath;
      if (cleanHostname) targetEntry.hostname = cleanHostname;
      if (cleanFieldId) targetEntry.fieldIdentifier = cleanFieldId;
    } else {
      delete targetEntry.url;
      delete targetEntry.path;
      delete targetEntry.hostname;
      delete targetEntry.fieldIdentifier;
      delete targetEntry.fieldGroup;
      delete targetEntry.addressGroup;
    }
  } else {
    targetEntry = {
      id: 'e_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6),
      text: trimmed,
      category: cat,
      count: 1,
      lastUsed: Date.now(),
      pinned: Boolean(pinned),
      created: Date.now()
    };
    if (isSiteSpecific) {
      if (cleanUrl) targetEntry.url = cleanUrl;
      if (cleanPath) targetEntry.path = cleanPath;
      if (cleanHostname) targetEntry.hostname = cleanHostname;
      if (cleanFieldId) targetEntry.fieldIdentifier = cleanFieldId;
    }
    cachedEntries.unshift(targetEntry);
  }

  // Cap entries list
  if (cachedEntries.length > 800) {
    cachedEntries = cachedEntries.slice(0, 800);
  }

  return targetEntry;
}

/**
 * Saves or updates a single entry and saves to local storage.
 */
async function saveEntry(entryData) {
  const targetEntry = saveEntryInMemory(entryData);
  if (!targetEntry) return null;

  await chrome.storage.local.set({ entries: cachedEntries });
  return targetEntry;
}

/**
 * Deletes an entry from local storage.
 */
async function deleteEntry(id, text) {
  const initialLen = cachedEntries.length;

  if (id) {
    cachedEntries = cachedEntries.filter(e => e.id !== id);
  }
  if (text) {
    const trimmed = text.trim().toLowerCase();
    cachedEntries = cachedEntries.filter(e => e.text.toLowerCase() !== trimmed);
  }

  await chrome.storage.local.set({ entries: cachedEntries });
  return initialLen - cachedEntries.length;
}

// --- Context Menu Setup ---
function setupContextMenu() {
  if (!chrome.contextMenus) return;
  chrome.contextMenus.removeAll(() => {
    if (chrome.runtime.lastError) {
      // Handled to suppress unchecked error
    }
    chrome.contextMenus.create(
      {
        id: 'sac_autofill_page',
        title: '⚡ AutoFill This Page',
        contexts: ['all']
      },
      () => {
        if (chrome.runtime.lastError) {
          // Handled to suppress unchecked runtime.lastError
        }
      }
    );
  });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'sac_autofill_page' && tab && tab.id) {
    if (isRestrictedUrl(tab.url)) {
      console.warn('Smart AutoComplete: Cannot autofill on internal/restricted browser page:', tab.url);
      return;
    }
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'TRIGGER_AUTOFILL', force: true });
    } catch (err) {
      console.warn('Smart AutoComplete: Could not establish connection to tab:', tab.id, err?.message);
    }
  }
});

// Initialize on extension install or update
chrome.runtime.onInstalled.addListener(() => {
  refreshData();
  setupContextMenu();
});
chrome.runtime.onStartup.addListener(() => {
  refreshData();
});
refreshData();

// --- Validation Helper ---

function isSensitive(text) {
  if (text === undefined || text === null || typeof text !== 'string') return true;
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > 5000) return true;
  return false;
}

// Helper to safely split and clean full names without salutations
function cleanNameParts(fullName) {
  if (!fullName || typeof fullName !== 'string') return [];
  const titles = ['mr', 'mrs', 'ms', 'miss', 'dr', 'prof', 'rev', 'sir', 'madam', 'lord', 'lady'];
  const rawParts = fullName.trim().split(/\s+/);
  const parts = [];
  for (let i = 0; i < rawParts.length; i++) {
    const cleanWord = rawParts[i].replace(/[.,]/g, '').toLowerCase();
    if (i === 0 && titles.includes(cleanWord)) {
      continue;
    }
    parts.push(rawParts[i].replace(/[.,]/g, ''));
  }
  return parts;
}

// Category aliases mapping for flexible cross-matching
const CATEGORY_ALIASES = {
  user_id: ['user_id', 'username', 'login'],
  username: ['username', 'user_id', 'login'],
  full_name: ['full_name', 'name'],
  first_name: ['first_name', 'firstname', 'fname', 'given_name', 'first'],
  middle_name: ['middle_name', 'mname', 'additional-name'],
  middle_initial: ['middle_initial', 'minitial'],
  last_name: ['last_name', 'lastname', 'lname', 'surname', 'family_name'],
  title: ['title', 'salutation', 'honorific', 'prefix'],
  company: ['company'],
  position: ['position'],
  address_line_1: ['address_line_1', 'address', 'street_address'],
  address_line_2: ['address_line_2', 'suite', 'apt'],
  city: ['city'],
  state: ['state', 'province'],
  country: ['country'],
  zip: ['zip', 'postal_code'],
  zip4: ['zip4', 'zip_plus4', 'zip_ext', 'postal_suffix'],
  home_phone: ['home_phone'],
  work_phone: ['work_phone'],
  fax: ['fax'],
  cell_phone: ['cell_phone', 'mobile_phone'],
  email: ['email'],
  website: ['website', 'url'],
  sex: ['sex', 'gender'],
  social_security_number: ['social_security_number', 'ssn'],
  driver_license_number: ['driver_license_number'],
  dob: ['dob', 'date_of_birth'],
  dob_month: ['dob_month', 'month'],
  dob_day: ['dob_day', 'day'],
  dob_year: ['dob_year', 'year'],
  age: ['age'],
  birth_place: ['birth_place'],
  income: ['income'],
  site_custom: ['site_custom'],
  notes: ['notes', 'site_custom'],
  textarea: ['textarea', 'site_custom']
};

/**
 * Dynamically calculates current age from stored Date of Birth (dob or dob_year/dob_month/dob_day).
 */
function computeAgeFromDob() {
  const dobStr = getDirectBestValue('dob');
  const yearStr = getDirectBestValue('dob_year');
  const monthStr = getDirectBestValue('dob_month');
  const dayStr = getDirectBestValue('dob_day');

  let birthYear = null;
  let birthMonth = 1;
  let birthDay = 1;

  if (dobStr) {
    const clean = dobStr.trim();
    let m = clean.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
    if (m) {
      birthYear = parseInt(m[1], 10);
      birthMonth = parseInt(m[2], 10);
      birthDay = parseInt(m[3], 10);
    } else {
      m = clean.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
      if (m) {
        birthMonth = parseInt(m[1], 10);
        birthDay = parseInt(m[2], 10);
        birthYear = parseInt(m[3], 10);
      } else {
        const parsed = new Date(clean);
        if (!isNaN(parsed.getTime())) {
          birthYear = parsed.getFullYear();
          birthMonth = parsed.getMonth() + 1;
          birthDay = parsed.getDate();
        }
      }
    }
  }

  if (!birthYear && yearStr && /^\d{4}$/.test(yearStr.trim())) {
    birthYear = parseInt(yearStr.trim(), 10);
    if (monthStr && /^\d{1,2}$/.test(monthStr.trim())) {
      birthMonth = parseInt(monthStr.trim(), 10);
    }
    if (dayStr && /^\d{1,2}$/.test(dayStr.trim())) {
      birthDay = parseInt(dayStr.trim(), 10);
    }
  }

  if (!birthYear) return null;

  const today = new Date();
  let age = today.getFullYear() - birthYear;
  const monthDiff = (today.getMonth() + 1) - birthMonth;
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDay)) {
    age--;
  }

  if (age < 0 || age > 130) return null;
  return String(age);
}

function getDirectBestValue(key, context = {}) {
  const { url = '', path = '', hostname = '', fieldIdentifier = '', fieldGroup = '' } = context;
  const cleanUrl = (url || '').trim();
  const cleanPath = (path || '').trim();
  const cleanHostname = (hostname || '').trim().toLowerCase();
  const cleanFieldId = (fieldIdentifier || '').trim().toLowerCase();

  const canonicalKey = getCanonicalCategory(key);
  const aliases = CATEGORY_ALIASES[canonicalKey] || CATEGORY_ALIASES[key] || [key];
  const isGeneralized = ['site_custom', 'notes', 'textarea'].includes(canonicalKey);

  let candidates = cachedEntries.filter(e => {
    if (!e.text) return false;
    const cat = getCanonicalCategory(e.category);
    if (!aliases.includes(cat) && cat !== canonicalKey) return false;

    // Strict site isolation for generalized fields.
    if (isGeneralized) {
      // If entry has a hostname and context has a hostname, they MUST match
      if (e.hostname && cleanHostname && e.hostname !== cleanHostname) {
        return false;
      }
    }
    return true;
  });
  if (fieldGroup) {
    const matchingGroup = candidates.filter(entry => (entry.fieldGroup || '') === fieldGroup);
    candidates = matchingGroup.length ? matchingGroup : candidates.filter(entry => !entry.fieldGroup);
  }
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    let scoreA = ((a.count || 1) * 4) + (a.pinned ? 250 : 0);
    let scoreB = ((b.count || 1) * 4) + (b.pinned ? 250 : 0);

    // Site specificity scoring boost: Exact URL > Path > Domain > Field ID
    if (cleanUrl && a.url && a.url === cleanUrl) scoreA += 1500;
    if (cleanUrl && b.url && b.url === cleanUrl) scoreB += 1500;

    if (cleanPath && a.path && a.path === cleanPath) scoreA += 1000;
    if (cleanPath && b.path && b.path === cleanPath) scoreB += 1000;

    if (cleanHostname && a.hostname && a.hostname === cleanHostname) scoreA += 500;
    if (cleanHostname && b.hostname && b.hostname === cleanHostname) scoreB += 500;

    if (cleanFieldId && a.fieldIdentifier && a.fieldIdentifier === cleanFieldId) scoreA += 300;
    if (cleanFieldId && b.fieldIdentifier && b.fieldIdentifier === cleanFieldId) scoreB += 300;

    const now = Date.now();
    scoreA += Math.max(0, 120 - ((now - (a.lastUsed || 0)) / (1000 * 60 * 60)) * 2.5);
    scoreB += Math.max(0, 120 - ((now - (b.lastUsed || 0)) / (1000 * 60 * 60)) * 2.5);
    return scoreB - scoreA;
  });

  return candidates[0].text;
}

/**
 * Evaluates dynamic placeholders in text expansion snippets (e.g., {{user_id}}, {{email}}, {{date}}).
 */
function resolveSnippetValue(rawSnippetValue) {
  if (!rawSnippetValue || typeof rawSnippetValue !== 'string') return '';

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const dateStr = `${year}-${month}-${day}`;
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const getBest = (key) => {
    const val = getDirectBestValue(key);
    if (val) return val;
    if (key === 'user_id' || key === 'handle') {
      const c = cachedEntries.find(e => (e.text || '').toLowerCase() === 'xconflictionx');
      if (c) return c.text;
    }
    if (key === 'email') {
      const emailEntry = cachedEntries.find(e => (e.category || '').toLowerCase() === 'email') ||
        cachedEntries.find(e => e.text && e.text.includes('@') && isValidEmail(e.text));
      if (emailEntry) return emailEntry.text.trim();
    }
    if (key === 'cell_phone' || key === 'phone') {
      const phoneEntry = cachedEntries.find(e => ['cell_phone', 'phone', 'home_phone', 'work_phone'].includes((e.category || '').toLowerCase()));
      if (phoneEntry) return phoneEntry.text.trim();
    }
    if (key === 'first_name') {
      const fnEntry = cachedEntries.find(e => (e.category || '').toLowerCase() === 'first_name');
      if (fnEntry) return fnEntry.text.trim();
    }
    if (key === 'last_name') {
      const lnEntry = cachedEntries.find(e => (e.category || '').toLowerCase() === 'last_name');
      if (lnEntry) return lnEntry.text.trim();
    }
    return '';
  };

  const shipGroup = getActiveAddressGroup({ fieldGroup: 'shipping' });
  const billGroup = getActiveAddressGroup({ fieldGroup: 'billing' });
  const shipFull = [shipGroup.line1, shipGroup.line2, shipGroup.city, shipGroup.state, shipGroup.zip].filter(Boolean).join(', ');
  const billFull = [billGroup.line1, billGroup.line2, billGroup.city, billGroup.state, billGroup.zip].filter(Boolean).join(', ');

  return rawSnippetValue
    .replace(/\{\{(user_id|handle)\}\}/gi, () => getBest('user_id') || 'xCONFLiCTiONx')
    .replace(/\{\{email\}\}/gi, () => getBest('email'))
    .replace(/\{\{(cell_phone|phone)\}\}/gi, () => getBest('cell_phone') || getBest('home_phone'))
    .replace(/\{\{full_name\}\}/gi, () => getBest('full_name') || `${getBest('first_name')} ${getBest('last_name')}`.trim())
    .replace(/\{\{first_name\}\}/gi, () => getBest('first_name'))
    .replace(/\{\{last_name\}\}/gi, () => getBest('last_name'))
    .replace(/\{\{(address_full|address|shipping_address)\}\}/gi, () => shipFull)
    .replace(/\{\{address_line_1\}\}/gi, () => shipGroup.line1)
    .replace(/\{\{address_line_2\}\}/gi, () => shipGroup.line2)
    .replace(/\{\{shipping_line_1\}\}/gi, () => shipGroup.line1)
    .replace(/\{\{shipping_line_2\}\}/gi, () => shipGroup.line2)
    .replace(/\{\{billing_address\}\}/gi, () => billFull)
    .replace(/\{\{billing_line_1\}\}/gi, () => billGroup.line1)
    .replace(/\{\{billing_line_2\}\}/gi, () => billGroup.line2)
    .replace(/\{\{city\}\}/gi, () => shipGroup.city)
    .replace(/\{\{state\}\}/gi, () => shipGroup.state)
    .replace(/\{\{zip\}\}/gi, () => shipGroup.zip)
    .replace(/\{\{country\}\}/gi, () => shipGroup.country)
    .replace(/\{\{date\}\}/gi, () => dateStr)
    .replace(/\{\{time\}\}/gi, () => timeStr)
    .replace(/\{\{datetime\}\}/gi, () => `${dateStr} ${timeStr}`)
    .replace(/\{\{year\}\}/gi, () => String(year))
    .replace(/\{\{month\}\}/gi, () => month)
    .replace(/\{\{day\}\}/gi, () => day);
}

/**
 * Robustly parses a zip code into 5-digit primary, 4-digit extension, and full ZIP+4.
 */
function parseZip(rawZip = '', rawZip4 = '') {
  let z = String(rawZip || '').trim();
  let z4 = String(rawZip4 || '').trim();

  // If rawZip contains both 5 digits and 4 digits (e.g. "78701-1234", "78701 1234", "787011234")
  const mFull = z.match(/^(\d{5})[-\s]?(\d{4})$/);
  if (mFull) {
    z = mFull[1];
    if (!z4) z4 = mFull[2];
  }

  // Strip leading plus/dash from extension if present
  z4 = z4.replace(/^[+-]/, '').trim();

  // 5-digit zip
  const m5 = z.match(/^(\d{5})/);
  const zip5 = m5 ? m5[1] : z;

  // 4-digit extension
  const m4 = z4.match(/^(\d{4})/);
  const zip4 = m4 ? m4[1] : (z4.length === 4 ? z4 : '');

  const fullZip = (zip5 && zip4) ? `${zip5}-${zip4}` : (zip5 || '');

  return { zip5, zip4, fullZip };
}

/**
 * Returns the currently active, cohesive address group.
 * Ensures Address Line 2 is NEVER populated unless the selected address actually has a secondary address!
 */
function getActiveAddressGroup(context = {}) {
  const fieldGroup = (context.fieldGroup || '').toLowerCase();
  const fieldIdentifier = (context.fieldIdentifier || '').toLowerCase();

  let isBilling = fieldGroup.includes('billing') || fieldGroup.includes('bill');
  let isShipping = fieldGroup.includes('shipping') || fieldGroup.includes('ship') || fieldGroup.includes('delivery');

  if (!isBilling && !isShipping) {
    if (/\b(bill|billing|payment|payee|invoice)\b/i.test(fieldIdentifier)) {
      isBilling = true;
    } else if (/\b(ship|shipping|delivery|dest|destination)\b/i.test(fieldIdentifier)) {
      isShipping = true;
    }
  }

  const { homeAddr, shippingAddr, billingAddr } = getResolvedAddresses();
  const hasShippingOnPage = Boolean(context.hasShippingOnPage);

  let target;
  if (isBilling) {
    target = billingAddr;
  } else if (isShipping) {
    target = shippingAddr;
  } else {
    // If there is NO shipping address field anywhere on this page, it's a HOME address!
    // If shipping is present on the page, general address falls back to shipping.
    target = hasShippingOnPage ? shippingAddr : homeAddr;
  }

  // Fallback to entries only if cachedAddresses is totally empty (e.g. uninitialized legacy)
  const line1 = (target.address_line_1 || '').trim() || (isBilling ? '' : (getDirectBestValue('address_line_1', context) || getDirectBestValue('address', context) || ''));
  // Secondary Address: ONLY if target explicitly has secondary address!
  // If target has no secondary address, line2 MUST be empty string! Never borrow secondary address from another address!
  const line2 = (target.address_line_2 || '').trim();
  const hasSecondary = Boolean(line2);

  const city = (target.city || '').trim() || (isBilling ? '' : (getDirectBestValue('city', context) || ''));
  const state = (target.state || '').trim() || (isBilling ? '' : (getDirectBestValue('state', context) || ''));
  const rawZip = (target.zip || '').trim() || (isBilling ? '' : (getDirectBestValue('zip', context) || ''));
  const rawZip4 = (target.zip4 || '').trim() || (isBilling ? '' : (getDirectBestValue('zip4', context) || ''));
  const country = (target.country || '').trim() || (isBilling ? '' : (getDirectBestValue('country', context) || ''));

  const parsed = parseZip(rawZip, rawZip4);

  return {
    line1,
    line2,
    hasSecondary,
    city,
    state,
    zip: parsed.zip5,
    zip4: parsed.zip4,
    fullZip: parsed.fullZip,
    country,
    isBilling,
    isShipping,
    isHome: !isBilling && !isShipping && !hasShippingOnPage
  };
}

/**
 * Computes the highest-ranked value for a given field key with smart fallback between related fields.
 */
function getBestAutofillValue(fieldKey, context = {}) {
  if (!fieldKey) return null;
  const key = fieldKey.toLowerCase();

  // 0. Address Grouping: Line 1, Line 2, Zip, Zip4, City, State, Country
  if (key === 'address_line_1' || key === 'address' || key === 'street_address') {
    const group = getActiveAddressGroup(context);
    return group.line1 || null;
  }

  // Address Line 2: strictly check if the primary address HAS a secondary address!
  // If the primary address has no secondary address, return null (never fill an orphan apartment or suite!)
  if (key === 'address_line_2' || key === 'suite' || key === 'apt') {
    const group = getActiveAddressGroup(context);
    return group.hasSecondary ? group.line2 : null;
  }

  // Zip4 (+4 Extension)
  if (key === 'zip4' || key === 'zip_plus4' || key === 'zip_ext') {
    const group = getActiveAddressGroup(context);
    return group.zip4 || null;
  }

  // Zip / Postal code
  if (key === 'zip' || key === 'postal_code') {
    const group = getActiveAddressGroup(context);
    return group.zip || null;
  }

  if (key === 'city') {
    const group = getActiveAddressGroup(context);
    return group.city || null;
  }

  if (key === 'state' || key === 'province') {
    const group = getActiveAddressGroup(context);
    return group.state || null;
  }

  if (key === 'country') {
    const group = getActiveAddressGroup(context);
    return group.country || null;
  }

  // 1. Middle Initial: ALWAYS exactly 1 uppercase letter!
  // Per user instruction: "it shuld take my middle name and justuse the first letter."
  if (key === 'middle_initial') {
    const directMi = getDirectBestValue('middle_initial', context);
    if (directMi && directMi.trim()) {
      return directMi.trim().replace(/\.$/, '').charAt(0).toUpperCase();
    }
    const mn = getDirectBestValue('middle_name', context);
    if (mn && mn.trim()) {
      return mn.trim().charAt(0).toUpperCase();
    }
    const full = getDirectBestValue('full_name', context) || getDirectBestValue('card_user_name', context);
    if (full) {
      const parts = cleanNameParts(full);
      if (parts.length >= 3) {
        return parts[1].charAt(0).toUpperCase();
      }
    }
    return null;
  }

  // 2. First Name: Check first_name, then extract from full_name / card_user_name
  if (key === 'first_name') {
    const directFn = getDirectBestValue('first_name', context);
    if (directFn && directFn.trim()) {
      return directFn.trim();
    }
    const full = getDirectBestValue('full_name', context) || getDirectBestValue('card_user_name', context);
    if (full) {
      const parts = cleanNameParts(full);
      if (parts.length > 0 && parts[0]) {
        return parts[0];
      }
    }
    return null;
  }

  // 3. Middle Name: Check direct middle_name, or extract from full_name
  if (key === 'middle_name') {
    const directMn = getDirectBestValue('middle_name', context);
    if (directMn && directMn.trim()) return directMn.trim();
    const full = getDirectBestValue('full_name', context) || getDirectBestValue('card_user_name', context);
    if (full) {
      const parts = cleanNameParts(full);
      if (parts.length >= 3) return parts[1];
    }
    return null;
  }

  // 4. Last Name: Check direct last_name, or extract from full_name
  if (key === 'last_name') {
    const directLn = getDirectBestValue('last_name', context);
    if (directLn && directLn.trim()) return directLn.trim();
    const full = getDirectBestValue('full_name', context) || getDirectBestValue('card_user_name', context);
    if (full) {
      const parts = cleanNameParts(full);
      if (parts.length > 1) return parts[parts.length - 1];
    }
    return null;
  }

  // 5. Full Name: Check direct full_name, or compose from First + (Middle Initial) + Last
  if (key === 'full_name') {
    const directFull = getDirectBestValue('full_name', context) || getDirectBestValue('card_user_name', context);
    if (directFull && directFull.trim()) return directFull.trim();
    const fn = getDirectBestValue('first_name', context);
    const mn = getDirectBestValue('middle_name', context) || getDirectBestValue('middle_initial', context);
    const ln = getDirectBestValue('last_name', context);
    if (fn && ln) {
      if (mn) {
        const mi = mn.trim().charAt(0).toUpperCase();
        return `${fn} ${mi}. ${ln}`;
      }
      return `${fn} ${ln}`;
    }
    if (fn) return fn;
    return null;
  }

  // 6. Age: direct or computed from DOB
  if (key === 'age') {
    const directAge = getDirectBestValue('age', context);
    if (directAge) return directAge;
    return computeAgeFromDob();
  }

  // 7. Title / Honorific / Salutation: Check direct title, or extract from full_name
  if (key === 'title' || key === 'salutation' || key === 'honorific' || key === 'prefix') {
    const directTitle = getDirectBestValue('title', context);
    if (directTitle && directTitle.trim()) return directTitle.trim();
    const full = getDirectBestValue('full_name', context) || getDirectBestValue('card_user_name', context);
    if (full) {
      const rawParts = full.trim().split(/\s+/);
      if (rawParts.length > 0) {
        const firstWordClean = rawParts[0].replace(/[.,]/g, '').toLowerCase();
        const titles = ['mr', 'mrs', 'ms', 'miss', 'dr', 'prof', 'rev', 'sir', 'madam', 'lord', 'lady'];
        if (titles.includes(firstWordClean)) {
          return rawParts[0];
        }
      }
    }
    return null;
  }

  // 8. Email: Direct or smart fallback to any valid email entry
  if (key === 'email' || key === 'e-mail') {
    const directEmail = getDirectBestValue('email', context);
    if (directEmail && isValidEmail(directEmail)) return directEmail.trim();
    const fallbackEmail = cachedEntries.find(e => (e.category || '').toLowerCase() === 'email' && isValidEmail(e.text)) ||
      cachedEntries.find(e => e.text && e.text.includes('@') && isValidEmail(e.text));
    if (fallbackEmail) return fallbackEmail.text.trim();
  }

  // Direct candidate search for any other category
  const direct = getDirectBestValue(key, context);
  if (direct) return direct;

  // Street Address fallback
  if (key === 'address_line_1') {
    const addr = getDirectBestValue('address', context) || getDirectBestValue('address_line_1', context);
    if (addr) return addr;
  }

  // Full DOB fallback from split year, month, day if direct dob is missing
  if (key === 'dob') {
    const directDob = getDirectBestValue('dob', context);
    if (directDob) return directDob;
    const year = getDirectBestValue('dob_year', context);
    const month = getDirectBestValue('dob_month', context);
    const day = getDirectBestValue('dob_day', context);
    if (year && month && day) {
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
  }

  // DOB Month, Day, Year from dob string
  if (key === 'dob_month' || key === 'dob_day' || key === 'dob_year') {
    const dob = getDirectBestValue('dob', context);
    if (dob) {
      let m = dob.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
      if (m) {
        if (key === 'dob_year') return m[1];
        if (key === 'dob_month') return m[2].padStart(2, '0');
        if (key === 'dob_day') return m[3].padStart(2, '0');
      } else {
        m = dob.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
        if (m) {
          if (key === 'dob_month') return m[1].padStart(2, '0');
          if (key === 'dob_day') return m[2].padStart(2, '0');
          if (key === 'dob_year') return m[3];
        }
      }
    }
  }

  // Username fallback to xCONFLiCTiONx
  if (key === 'user_id' || key === 'username') {
    const match = cachedEntries.find(e => e.text.toLowerCase() === 'xconflictionx');
    if (match) return match.text;
  }

  return null;
}

/**
 * Filters suggestions for real-time interactive typing dropdown.
 * Prioritizes entries matching the current page URL, path, or hostname.
 */
function filterSuggestions(entries, { query = '', fieldCategory = '', url = '', path = '', hostname = '', fieldIdentifier = '', fieldGroup = '' }, max = 8) {
  const q = query.trim().toLowerCase();
  const cat = (fieldCategory || '').toLowerCase();
  const cleanUrl = (url || '').trim();
  const cleanPath = (path || '').trim();
  const cleanHostname = (hostname || '').trim().toLowerCase();
  const cleanFieldId = (fieldIdentifier || '').trim().toLowerCase();

  const cleanFieldGroup = (fieldGroup || '').trim().toLowerCase();
  const siteContext = { url: cleanUrl, path: cleanPath, hostname: cleanHostname, fieldIdentifier: cleanFieldId, fieldGroup: cleanFieldGroup };

  // Shortcodes / Snippets suggestion list when typing '/'
  if (q.startsWith('/')) {
    if (cachedSettings.snippetsEnabled === false) return [];
    const snippets = getAllSnippets();

    const filtered = snippets.filter(s => {
      const trig = (s.trigger || '').toLowerCase();
      return trig.startsWith(q) || (q === '/' && trig.startsWith('/'));
    });

    return filtered.map(s => {
      const resolved = resolveSnippetValue(s.value);
      return {
        id: 'snip_' + (s.id || s.trigger),
        text: s.trigger,
        category: 'shortcode',
        description: s.description || '',
        value: s.value,
        replacement: resolved || s.value,
        pinned: true,
        count: 100
      };
    });
  }

  if (cat === 'age') {
    const computedAge = computeAgeFromDob();
    if (!computedAge) return [];
    if (q && !computedAge.includes(q)) return [];
    return [{
      id: 'computed_age',
      text: computedAge,
      category: 'age (from DOB)',
      count: 1,
      pinned: true
    }];
  }

  if (cat === 'middle_initial') {
    let initial = '';
    const directMi = getDirectBestValue('middle_initial', siteContext);
    const mn = getDirectBestValue('middle_name', siteContext);
    const full = getDirectBestValue('full_name', siteContext) || getDirectBestValue('card_user_name', siteContext);

    if (directMi && directMi.trim()) {
      initial = directMi.trim().replace(/\.$/, '').charAt(0).toUpperCase();
    } else if (mn && mn.trim()) {
      initial = mn.trim().charAt(0).toUpperCase();
    } else if (full) {
      const parts = cleanNameParts(full);
      if (parts.length >= 3) {
        initial = parts[1].charAt(0).toUpperCase();
      }
    }

    if (initial) {
      if (!q || initial.toLowerCase().includes(q)) {
        return [{
          id: 'computed_mi',
          text: initial,
          category: mn ? `middle_initial (from ${mn})` : 'middle_initial',
          count: 50,
          pinned: true
        }];
      }
    }
  }

  if (cat === 'first_name') {
    let fn = getDirectBestValue('first_name', siteContext);
    if (!fn) {
      const full = getDirectBestValue('full_name', siteContext) || getDirectBestValue('card_user_name', siteContext);
      if (full) {
        const parts = cleanNameParts(full);
        if (parts.length > 0) fn = parts[0];
      }
    }
    if (fn && (!q || fn.toLowerCase().includes(q))) {
      return [{
        id: 'computed_fname',
        text: fn,
        category: 'first_name',
        count: 50,
        pinned: true
      }];
    }
  }

  // Address Line 2: strictly check if the active address group has a secondary address!
  // If the active address has no secondary address, return EMPTY suggestions (never suggest an orphan apt!)
  if (cat === 'address_line_2' || cat === 'suite' || cat === 'apt') {
    const group = getActiveAddressGroup(siteContext);
    if (!group.hasSecondary || !group.line2) {
      return [];
    }
    if (q && !group.line2.toLowerCase().includes(q)) {
      return [];
    }
    return [{
      id: 'computed_addr_line_2',
      text: group.line2,
      category: group.isBilling ? 'Billing Address Line 2' : 'Shipping Address Line 2',
      count: 50,
      pinned: true
    }];
  }

  // Address Line 1: prioritize cohesive address for the active address group
  if (cat === 'address_line_1' || cat === 'address' || cat === 'street_address') {
    const group = getActiveAddressGroup(siteContext);
    if (group.line1) {
      if (!q || group.line1.toLowerCase().includes(q)) {
        return [{
          id: 'computed_addr_line_1',
          text: group.line1,
          category: group.isBilling ? 'Billing Address' : 'Shipping Address',
          count: 50,
          pinned: true
        }];
      }
    }
  }

  const canonicalCat = getCanonicalCategory(cat);
  if (!canonicalCat || canonicalCat === 'excluded' || canonicalCat === 'general') {
    return [];
  }

  const aliases = CATEGORY_ALIASES[canonicalCat] || CATEGORY_ALIASES[cat] || [canonicalCat];
  if (cat === 'comments' || cat === 'custom_message') return [];
  if (canonicalCat === 'site_custom' && q.length < (cachedSettings.minCharsToSuggest || 2)) return [];
  const isGeneralized = ['site_custom', 'notes', 'textarea'].includes(canonicalCat);

  let pool = entries.filter(item => {
    if (!item.text || isSensitive(item.text)) return false;
    const itemCat = getCanonicalCategory(item.category);
    if (itemCat === 'general' || itemCat === 'excluded') return false;

    // Strict email isolation: in email fields, only suggest emails
    if (canonicalCat === 'email') {
      return itemCat === 'email' || item.text.includes('@');
    }

    // Strict site isolation for generalized fields.
    if (isGeneralized) {
      if (item.hostname && cleanHostname && item.hostname !== cleanHostname) {
        return false;
      }
    }

    // Must match category aliases
    if (aliases.includes(itemCat) || itemCat === canonicalCat) {
      if (q) return item.text.toLowerCase().includes(q);
      return true;
    }

    return false;
  });

  if (cleanFieldGroup) {
    const matchingGroup = pool.filter(item => (item.fieldGroup || '') === cleanFieldGroup);
    pool = matchingGroup.length ? matchingGroup : pool.filter(item => !item.fieldGroup);
  }

  // Filter or re-order by typed query
  if (q.length > 0) {
    pool = pool.filter(item => item.text.toLowerCase().includes(q));
  }

  // Rank suggestions
  pool.sort((a, b) => {
    let scoreA = 0;
    let scoreB = 0;

    if (a.pinned) scoreA += 1000;
    if (b.pinned) scoreB += 1000;

    const textA = a.text.toLowerCase();
    const textB = b.text.toLowerCase();

    if (q) {
      if (textA.startsWith(q)) scoreA += 500;
      if (textB.startsWith(q)) scoreB += 500;
    }

    // Site specificity scoring boost: Exact URL > Path > Domain > Field ID
    if (cleanUrl && a.url && a.url === cleanUrl) scoreA += 1500;
    if (cleanUrl && b.url && b.url === cleanUrl) scoreB += 1500;

    if (cleanPath && a.path && a.path === cleanPath) scoreA += 1000;
    if (cleanPath && b.path && b.path === cleanPath) scoreB += 1000;

    if (cleanHostname && a.hostname && a.hostname === cleanHostname) scoreA += 500;
    if (cleanHostname && b.hostname && b.hostname === cleanHostname) scoreB += 500;

    if (cleanFieldId && a.fieldIdentifier && a.fieldIdentifier === cleanFieldId) scoreA += 300;
    if (cleanFieldId && b.fieldIdentifier && b.fieldIdentifier === cleanFieldId) scoreB += 300;

    if (aliases.includes((a.category || '').toLowerCase())) scoreA += 200;
    if (aliases.includes((b.category || '').toLowerCase())) scoreB += 200;

    scoreA += Math.min((a.count || 1) * 3, 150);
    scoreB += Math.min((b.count || 1) * 3, 150);

    const now = Date.now();
    const recencyA = Math.max(0, 50 - ((now - (a.lastUsed || 0)) / (1000 * 60 * 60)));
    const recencyB = Math.max(0, 50 - ((now - (b.lastUsed || 0)) / (1000 * 60 * 60)));
    scoreA += recencyA;
    scoreB += recencyB;

    return scoreB - scoreA;
  });

  return pool.slice(0, max);
}

// --- Message Dispatcher ---

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const action = message.type || message.action;

  (async () => {
    try {
      // The service worker can receive messages before its async storage read
      // finishes. Wait before serving exports, suggestions, or writes.
      if (dataLoadPromise) await dataLoadPromise;

      if (!cachedSettings.enabled && action === 'GET_SUGGESTIONS') {
        sendResponse({ suggestions: [] });
        return;
      }

      switch (action) {
        // Fast batch autofill for an entire page on load
        case 'GET_PAGE_AUTOFILL': {
          const fields = Array.isArray(message.fields) ? message.fields : [];
          const isForced = Boolean(message.force);
          const autofills = {};
          const pageContext = {
            url: message.url || '',
            path: message.path || '',
            hostname: message.hostname || ''
          };
          const hasShippingOnPage = message.hasShippingOnPage !== undefined
            ? Boolean(message.hasShippingOnPage)
            : fields.some(f => (f.fieldGroup || '').toLowerCase().includes('ship') || /\b(ship|shipping|delivery)\b/i.test(f.fieldIdentifier || '') || /\b(ship|shipping|delivery)\b/i.test(f.fieldKey || ''));

          // Fill if user triggered on-demand (force = true) OR autoFillOnLoad is enabled in settings
          if (isForced || cachedSettings.autoFillOnLoad === true) {
            fields.forEach(f => {
              const fieldContext = { ...pageContext, fieldGroup: f.fieldGroup || '', hasShippingOnPage };
              const addrGroup = getActiveAddressGroup(fieldContext);
              const hasZip4OnPage = fields.some(item => item.fieldKey === 'zip4' && (item.fieldGroup || '') === (f.fieldGroup || ''));
              // 1. Address Line 1
              if (f.fieldKey === 'address_line_1' || f.fieldKey === 'address' || f.fieldKey === 'street_address') {
                if (addrGroup.line1) autofills[f.id] = addrGroup.line1;
                return;
              }

              // 2. Address Line 2 (Secondary Address)
              // Only fill if primary address actually HAS a secondary address!
              if (f.fieldKey === 'address_line_2' || f.fieldKey === 'suite' || f.fieldKey === 'apt') {
                if (addrGroup.hasSecondary && addrGroup.line2) {
                  autofills[f.id] = addrGroup.line2;
                }
                return;
              }

              // 3. City
              if (f.fieldKey === 'city') {
                if (addrGroup.city) autofills[f.id] = addrGroup.city;
                return;
              }

              // 4. State
              if (f.fieldKey === 'state' || f.fieldKey === 'province') {
                if (addrGroup.state) autofills[f.id] = addrGroup.state;
                return;
              }

              // 5. Country
              if (f.fieldKey === 'country') {
                if (addrGroup.country) autofills[f.id] = addrGroup.country;
                return;
              }

              // 6. Zip+4 Extension (Box 2 in split zip layout)
              if (f.fieldKey === 'zip4') {
                if (addrGroup.zip4) autofills[f.id] = addrGroup.zip4;
                return;
              }

              // 7. Zip (Box 1 or Single Box)
              if (f.fieldKey === 'zip' || f.fieldKey === 'postal_code') {
                if (hasZip4OnPage) {
                  // Two-box layout: primary box gets 5-digit zip
                  if (addrGroup.zip) autofills[f.id] = addrGroup.zip;
                } else {
                  // Single box: check maxLength & full zip
                  const maxL = f.maxLength || 0;
                  if (maxL === 5) {
                    if (addrGroup.zip) autofills[f.id] = addrGroup.zip;
                  } else if (addrGroup.fullZip && (maxL >= 10 || maxL === 0)) {
                    autofills[f.id] = addrGroup.fullZip;
                  } else if (addrGroup.zip) {
                    autofills[f.id] = addrGroup.zip;
                  }
                }
                return;
              }

              // All other fields
              const bestVal = getBestAutofillValue(f.fieldKey, {
                ...fieldContext,
                fieldIdentifier: f.fieldIdentifier || ''
              });
              if (bestVal !== null && bestVal !== undefined) {
                autofills[f.id] = bestVal;
              }
            });
          }

          sendResponse({
            success: true,
            autofills,
            enabled: Boolean(isForced || cachedSettings.autoFillOnLoad === true)
          });
          break;
        }

        case 'GET_SUGGESTIONS': {
          const max = cachedSettings.maxSuggestions || 8;
          const suggestions = filterSuggestions(cachedEntries, message, max);
          sendResponse({ suggestions, theme: cachedSettings.theme });
          break;
        }

        case 'SAVE_ENTRY': {
          const saved = await saveEntry(message);
          sendResponse({ status: saved ? 'saved' : 'ignored', entry: saved, count: cachedEntries.length });
          break;
        }

        case 'DELETE_ENTRY': {
          const deleted = await deleteEntry(message.id, message.text);
          sendResponse({ success: true, deleted, remaining: cachedEntries.length });
          break;
        }

        case 'TOGGLE_PIN': {
          const { id } = message;
          const entry = cachedEntries.find(e => e.id === id);
          if (entry) {
            entry.pinned = !entry.pinned;
            await chrome.storage.local.set({ entries: cachedEntries });
            sendResponse({ success: true, pinned: entry.pinned });
          } else {
            sendResponse({ success: false, error: 'Entry not found' });
          }
          break;
        }

        case 'GET_ALL_ENTRIES': {
          sendResponse({
            entries: cachedEntries,
            settings: cachedSettings,
            addresses: cachedAddresses
          });
          break;
        }

        case 'CLEAN_DUPLICATES': {
          const stats = cleanDuplicateEntries();
          await chrome.storage.local.set({ entries: cachedEntries });
          sendResponse({ success: true, ...stats });
          break;
        }

        case 'SAVE_FULL_PROFILE': {
          // Saves a complete identity profile in a single atomic batch
          const profile = message.profile || {};
          let countSaved = 0;

          // 1. If address_line_2 is explicitly provided as empty string, purge old un-grouped pinned secondary address entries
          if (profile.address_line_2 !== undefined && !profile.address_line_2.trim()) {
            cachedEntries = cachedEntries.filter(e => {
              if (e.pinned && !e.fieldGroup && ['address_line_2', 'suite', 'apt'].includes((e.category || '').toLowerCase())) {
                return false;
              }
              return true;
            });
          }

          // 2. Parse Zip and Zip+4 if provided
          if (profile.zip) {
            const parsed = parseZip(profile.zip, profile.zip4 || '');
            profile.zip = parsed.zip5;
            if (parsed.zip4) {
              profile.zip4 = parsed.zip4;
            } else if (profile.zip4 !== undefined && !profile.zip4) {
              cachedEntries = cachedEntries.filter(e => {
                if (e.pinned && !e.fieldGroup && ['zip4', 'zip_plus4', 'zip_ext'].includes((e.category || '').toLowerCase())) {
                  return false;
                }
                return true;
              });
            }
          }

          // Update in-memory entries directly
          for (const [key, val] of Object.entries(profile)) {
            if (val && typeof val === 'string' && val.trim()) {
              const textVal = val.trim();
              if (key === 'email' && !isValidEmail(textVal)) {
                continue; // Do not save invalid emails!
              }
              saveEntryInMemory({
                text: textVal,
                category: key,
                pinned: true
              });
              countSaved++;
            }
          }

          await chrome.storage.local.set({ entries: cachedEntries });
          sendResponse({
            success: true,
            countSaved,
            total: cachedEntries.length
          });
          break;
        }

        case 'SAVE_ADDRESS_PROFILES': {
          let raw1 = message.address1;
          let raw2 = message.address2;

          // Backwards compatibility with { shipping, billing }
          if (!raw1 && message.shipping) {
            raw1 = { ...message.shipping, isDefaultShipping: true, isDefaultBilling: Boolean(message.billingSameAsShipping) };
            raw2 = { ...message.billing, isDefaultShipping: false, isDefaultBilling: !Boolean(message.billingSameAsShipping) };
          }

          raw1 = raw1 || {};
          raw2 = raw2 || {};

          const parsed1 = parseZip(raw1.zip, raw1.zip4);
          const parsed2 = parseZip(raw2.zip, raw2.zip4);

          cachedAddresses = {
            address1: {
              label: (raw1.label || 'Address 1').trim(),
              address_line_1: (raw1.address_line_1 || '').trim(),
              address_line_2: (raw1.address_line_2 || '').trim(),
              city: (raw1.city || '').trim(),
              state: (raw1.state || '').trim(),
              zip: parsed1.zip5 || (raw1.zip || '').trim(),
              zip4: parsed1.zip4 || (raw1.zip4 || '').trim(),
              country: (raw1.country || '').trim(),
              isDefaultHome: Boolean(raw1.isDefaultHome),
              isDefaultShipping: Boolean(raw1.isDefaultShipping),
              isDefaultBilling: Boolean(raw1.isDefaultBilling)
            },
            address2: {
              label: (raw2.label || 'Address 2').trim(),
              address_line_1: (raw2.address_line_1 || '').trim(),
              address_line_2: (raw2.address_line_2 || '').trim(),
              city: (raw2.city || '').trim(),
              state: (raw2.state || '').trim(),
              zip: parsed2.zip5 || (raw2.zip || '').trim(),
              zip4: parsed2.zip4 || (raw2.zip4 || '').trim(),
              country: (raw2.country || '').trim(),
              isDefaultHome: Boolean(raw2.isDefaultHome),
              isDefaultShipping: Boolean(raw2.isDefaultShipping),
              isDefaultBilling: Boolean(raw2.isDefaultBilling)
            }
          };

          const { homeAddr, shippingAddr, billingAddr, homeWarning, shippingWarning, billingWarning } = getResolvedAddresses();

          // Synchronize cachedEntries: remove old pinned address entries
          const ADDRESS_KEYS = ['address_line_1', 'address', 'street_address', 'address_line_2', 'suite', 'apt', 'city', 'state', 'province', 'zip', 'postal_code', 'zip4', 'zip_plus4', 'zip_ext', 'country'];
          cachedEntries = cachedEntries.filter(e => {
            if (!e.pinned) return true;
            const cat = getCanonicalCategory(e.category);
            return !ADDRESS_KEYS.includes(cat);
          });

          // Collect distinct address values across Address 1 and Address 2
          const addressEntriesToAdd = [];
          const addUniqueAddr = (text, category) => {
            if (!text || !text.trim()) return;
            const val = text.trim();
            const canonCat = getCanonicalCategory(category);
            const textKey = getDuplicateTextKey(val, canonCat);
            const alreadyAdded = addressEntriesToAdd.some(item =>
              getDuplicateTextKey(item.text, item.category) === textKey && item.category === canonCat
            );
            if (!alreadyAdded) {
              addressEntriesToAdd.push({ text: val, category: canonCat });
            }
          };

          // Address 1 fields
          addUniqueAddr(cachedAddresses.address1.address_line_1, 'address_line_1');
          addUniqueAddr(cachedAddresses.address1.address_line_2, 'address_line_2');
          addUniqueAddr(cachedAddresses.address1.city, 'city');
          addUniqueAddr(cachedAddresses.address1.state, 'state');
          addUniqueAddr(cachedAddresses.address1.zip, 'zip');
          addUniqueAddr(cachedAddresses.address1.zip4, 'zip4');
          addUniqueAddr(cachedAddresses.address1.country, 'country');

          // Address 2 fields (only if distinct!)
          addUniqueAddr(cachedAddresses.address2.address_line_1, 'address_line_1');
          addUniqueAddr(cachedAddresses.address2.address_line_2, 'address_line_2');
          addUniqueAddr(cachedAddresses.address2.city, 'city');
          addUniqueAddr(cachedAddresses.address2.state, 'state');
          addUniqueAddr(cachedAddresses.address2.zip, 'zip');
          addUniqueAddr(cachedAddresses.address2.zip4, 'zip4');
          addUniqueAddr(cachedAddresses.address2.country, 'country');

          // Add unique pinned entries
          addressEntriesToAdd.forEach(item => {
            const existing = cachedEntries.find(e =>
              getCanonicalCategory(e.category) === item.category &&
              getDuplicateTextKey(e.text, item.category) === getDuplicateTextKey(item.text, item.category)
            );
            if (existing) {
              existing.pinned = true;
              existing.count = Math.max(existing.count || 1, 25);
              existing.lastUsed = Date.now();
              delete existing.fieldGroup;
            } else {
              cachedEntries.unshift({
                id: 'e_addr_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6),
                text: item.text,
                category: item.category,
                count: 25,
                lastUsed: Date.now(),
                pinned: true,
                created: Date.now()
              });
            }
          });

          // Run comprehensive duplicate cleaner to guarantee zero duplicate address entries
          cleanDuplicateEntries();

          await chrome.storage.local.set({
            addresses: cachedAddresses,
            entries: cachedEntries
          });

          sendResponse({
            success: true,
            addresses: cachedAddresses,
            homeWarning,
            shippingWarning,
            billingWarning,
            total: cachedEntries.length
          });
          break;
        }

        case 'BATCH_IMPORT': {
          const incoming = Array.isArray(message.entries) ? message.entries : [];
          let addedCount = 0;
          let updatedCount = 0;

          for (const inc of incoming) {
            if (!inc.text || isSensitive(inc.text)) continue;
            const text = inc.text.trim();
            const cat = (inc.category || '').toLowerCase();
            if (!cat || cat === 'general' || cat === 'excluded' || cat === 'comments' || cat === 'custom_message') continue;
            if (cat === 'email' && !isValidEmail(text)) continue;
            if (['cell_phone', 'home_phone', 'work_phone', 'fax'].includes(cat)) {
              if (text.replace(/\D/g, '').length < 7) continue;
            }

            const fieldGroup = (inc.fieldGroup || '').trim().toLowerCase();
            const existing = cachedEntries.find(e => e.text.toLowerCase() === text.toLowerCase() && e.category === cat && (e.fieldGroup || '') === fieldGroup);

            if (existing) {
              existing.count = (existing.count || 1) + 1;
              existing.lastUsed = Date.now();
              if (inc.pinned) existing.pinned = true;
              updatedCount++;
            } else {
              cachedEntries.push({
                id: 'import_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6),
                text,
                category: cat,
                ...(fieldGroup ? { fieldGroup } : {}),
                count: inc.count || 1,
                lastUsed: inc.lastUsed || Date.now(),
                pinned: Boolean(inc.pinned),
                created: Date.now()
              });
              addedCount++;
            }
          }

          await chrome.storage.local.set({ entries: cachedEntries });
          sendResponse({
            success: true,
            added: addedCount,
            updated: updatedCount,
            total: cachedEntries.length
          });
          break;
        }

        case 'CLEAR_ALL': {
          cachedEntries = [];
          await chrome.storage.local.set({ entries: [] });
          sendResponse({ success: true });
          break;
        }

        case 'GET_SETTINGS': {
          sendResponse({ settings: cachedSettings });
          break;
        }

        case 'UPDATE_SETTINGS': {
          cachedSettings = { ...cachedSettings, ...(message.settings || {}) };
          await chrome.storage.local.set({ settings: cachedSettings });
          sendResponse({ success: true, settings: cachedSettings });
          break;
        }

        case 'TOGGLE_DOMAIN_PAUSE': {
          const rawDomain = (message.domain || '').trim().toLowerCase();
          if (!rawDomain) {
            sendResponse({ success: false, error: 'No domain provided' });
            break;
          }
          const list = Array.isArray(cachedSettings.disabledDomains) ? [...cachedSettings.disabledDomains] : [];
          const isMatched = list.some(d => rawDomain === d || rawDomain.endsWith('.' + d));
          let isPaused = false;
          let updatedList = list;
          if (isMatched) {
            updatedList = list.filter(d => !(rawDomain === d || rawDomain.endsWith('.' + d)));
            isPaused = false;
          } else {
            updatedList.push(rawDomain);
            isPaused = true;
          }
          cachedSettings.disabledDomains = updatedList;
          await chrome.storage.local.set({ settings: cachedSettings });
          sendResponse({ success: true, isPaused, disabledDomains: updatedList });
          break;
        }

        case 'GET_SNIPPETS': {
          const list = Array.isArray(cachedSettings.customSnippets) ? cachedSettings.customSnippets : DEFAULT_SNIPPETS;
          sendResponse({
            success: true,
            snippets: list,
            enabled: Boolean(cachedSettings.snippetsEnabled !== false)
          });
          break;
        }

        case 'RESOLVE_SNIPPET': {
          const trigger = (message.trigger || '').trim().toLowerCase();
          const snippets = Array.isArray(cachedSettings.customSnippets) ? cachedSettings.customSnippets : DEFAULT_SNIPPETS;
          const match = snippets.find(s => (s.trigger || '').trim().toLowerCase() === trigger);
          if (match && cachedSettings.snippetsEnabled !== false) {
            const expandedText = resolveSnippetValue(match.value);
            sendResponse({ success: true, found: true, trigger: match.trigger, expandedText });
          } else {
            sendResponse({ success: true, found: false });
          }
          break;
        }

        case 'SAVE_SNIPPET': {
          const { id, trigger, value, description } = message;
          if (!trigger || !value) {
            sendResponse({ success: false, error: 'Trigger and value required' });
            break;
          }
          let list = Array.isArray(cachedSettings.customSnippets) ? [...cachedSettings.customSnippets] : [...DEFAULT_SNIPPETS];
          const cleanTrigger = trigger.startsWith('/') ? trigger.trim() : ('/' + trigger.trim());
          const existingIdx = id
            ? list.findIndex(s => s.id === id)
            : list.findIndex(s => s.trigger.toLowerCase() === cleanTrigger.toLowerCase());

          const snippetObj = {
            id: id || ('snip_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6)),
            trigger: cleanTrigger,
            value: value.trim(),
            description: (description || '').trim()
          };

          if (existingIdx >= 0) {
            list[existingIdx] = snippetObj;
          } else {
            list.push(snippetObj);
          }

          cachedSettings.customSnippets = list;
          await chrome.storage.local.set({ settings: cachedSettings });
          sendResponse({ success: true, snippets: list });
          break;
        }

        case 'DELETE_SNIPPET': {
          const { id, trigger } = message;
          let list = Array.isArray(cachedSettings.customSnippets) ? [...cachedSettings.customSnippets] : [...DEFAULT_SNIPPETS];
          list = list.filter(s => {
            if (id && s.id === id) return false;
            if (trigger && s.trigger.toLowerCase() === trigger.toLowerCase()) return false;
            return true;
          });
          cachedSettings.customSnippets = list;
          await chrome.storage.local.set({ settings: cachedSettings });
          sendResponse({ success: true, snippets: list });
          break;
        }

        case 'RESET_SNIPPETS': {
          cachedSettings.customSnippets = [...DEFAULT_SNIPPETS];
          await chrome.storage.local.set({ settings: cachedSettings });
          sendResponse({ success: true, snippets: cachedSettings.customSnippets });
          break;
        }

        default:
          sendResponse({ error: 'Unknown action' });
      }
    } catch (err) {
      console.error('Smart AutoComplete background worker error:', err);
      sendResponse({ error: err.message });
    }
  })();

  return true;
});
