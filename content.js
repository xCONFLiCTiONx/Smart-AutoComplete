// content.js - Smart AutoComplete Content Script with 42-Field Semantic Recognition & Page-Load Autofill

(function () {
  'use strict';

  if (window.__SMART_AUTOCOMPLETE_LOADED__) return;
  window.__SMART_AUTOCOMPLETE_LOADED__ = true;

  let activeInput = null;
  let currentSuggestions = [];
  let selectedIndex = -1;
  let shadowRoot = null;
  let dropdownEl = null;
  let ghostPillEl = null;
  let activeGhostSuggestion = null;
  let isInteractingWithDropdown = false;
  let observer = null;
  let isInvalidated = false;
  let hasAutoFilledPage = false;
  let isAutofillingPage = false;
  let autofillDebounceTimer = null;
  let captureSubmittedValues = false;
  let suggestionRequestId = 0;
  let isDomainPaused = false;
  let snippetsEnabled = true;
  let ghostTextEnabled = true;

  // Check if extension context is valid
  function isContextValid() {
    if (isInvalidated) return false;
    try {
      return Boolean(typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id);
    } catch (_) {
      isInvalidated = true;
      return false;
    }
  }

  // Gracefully teardown if extension context was invalidated
  function teardownIfInvalid() {
    if (!isContextValid()) {
      isInvalidated = true;
      if (observer) {
        try { observer.disconnect(); } catch (_) {}
        observer = null;
      }
      const host = document.getElementById('smart-autocomplete-host');
      if (host) {
        try { host.remove(); } catch (_) {}
      }
      return true;
    }
    return false;
  }

  // Safe wrapper for chrome.runtime.sendMessage that handles callbacks and Promises
  function safeSendMessage(message, callback) {
    if (teardownIfInvalid()) return;
    try {
      const p = chrome.runtime.sendMessage(message, (res) => {
        try {
          const err = chrome.runtime && chrome.runtime.lastError;
          if (err) {
            teardownIfInvalid();
            return;
          }
        } catch (_) {
          teardownIfInvalid();
          return;
        }

        if (callback && !isInvalidated) {
          try {
            callback(res);
          } catch (_) {}
        }
      });

      if (p && typeof p.catch === 'function') {
        p.catch(() => {
          teardownIfInvalid();
        });
      }
    } catch (err) {
      teardownIfInvalid();
    }
  }

  // --- 42-Field Semantic Identification Engine ---

  const US_STATES = {
    'al': 'alabama', 'ak': 'alaska', 'az': 'arizona', 'ar': 'arkansas', 'ca': 'california',
    'co': 'colorado', 'ct': 'connecticut', 'de': 'delaware', 'fl': 'florida', 'ga': 'georgia',
    'hi': 'hawaii', 'id': 'idaho', 'il': 'illinois', 'in': 'indiana', 'ia': 'iowa',
    'ks': 'kansas', 'ky': 'kentucky', 'la': 'louisiana', 'me': 'maine', 'md': 'maryland',
    'ma': 'massachusetts', 'mi': 'michigan', 'mn': 'minnesota', 'ms': 'mississippi', 'mo': 'missouri',
    'mt': 'montana', 'ne': 'nebraska', 'nv': 'nevada', 'nh': 'new hampshire', 'nj': 'new jersey',
    'nm': 'new mexico', 'ny': 'new york', 'nc': 'north carolina', 'nd': 'north dakota', 'oh': 'ohio',
    'ok': 'oklahoma', 'or': 'oregon', 'pa': 'pennsylvania', 'ri': 'rhode island', 'sc': 'south carolina',
    'sd': 'south dakota', 'tn': 'tennessee', 'tx': 'texas', 'ut': 'utah', 'vt': 'vermont',
    'va': 'virginia', 'wa': 'washington', 'wv': 'west virginia', 'wi': 'wisconsin', 'wy': 'wyoming',
    'dc': 'district of columbia', 'pr': 'puerto rico', 'gu': 'guam', 'vi': 'virgin islands', 'as': 'american samoa', 'mp': 'northern mariana islands', 'um': 'u.s. minor outlying islands', 'aa': 'armed forces americas', 'ae': 'armed forces europe', 'ap': 'armed forces pacific'
  };

  const COUNTRY_CODES = {
    'us': 'united states', 'usa': 'united states',
    'ca': 'canada', 'can': 'canada',
    'gb': 'united kingdom', 'uk': 'united kingdom', 'gbr': 'united kingdom',
    'ar': 'argentina', 'arg': 'argentina', 'au': 'australia', 'aus': 'australia',
    'de': 'germany', 'deu': 'germany', 'fr': 'france', 'fra': 'france',
    'es': 'spain', 'esp': 'spain', 'it': 'italy', 'ita': 'italy',
    'mx': 'mexico', 'mex': 'mexico', 'br': 'brazil', 'bra': 'brazil',
    'in': 'india', 'ind': 'india', 'jp': 'japan', 'jpn': 'japan',
    'cn': 'china', 'chn': 'china', 'nl': 'netherlands', 'nld': 'netherlands',
    'se': 'sweden', 'swe': 'sweden', 'no': 'norway', 'nor': 'norway',
    'fi': 'finland', 'fin': 'finland', 'dk': 'denmark', 'dnk': 'denmark',
    'ch': 'switzerland', 'che': 'switzerland', 'at': 'austria', 'aut': 'austria',
    'be': 'belgium', 'bel': 'belgium', 'nz': 'new zealand', 'nzl': 'new zealand',
    'ie': 'ireland', 'irl': 'ireland', 'pt': 'portugal', 'prt': 'portugal',
    'pl': 'poland', 'pol': 'poland', 'ru': 'russia', 'rus': 'russia',
    'za': 'south africa', 'zaf': 'south africa', 'kr': 'south korea', 'kor': 'south korea',
    'sg': 'singapore', 'sgp': 'singapore', 'il': 'israel', 'isr': 'israel'
  };

  function findSurroundingLabel(el) {
    if (!el) return '';
    if (el.labels && el.labels.length) {
      const labelText = Array.from(el.labels).map(label => label.textContent.trim()).filter(Boolean).join(' ');
      if (labelText) return labelText;
    }
    const labelledBy = (el.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean);
    if (labelledBy.length) {
      const text = labelledBy.map(id => document.getElementById(id)?.textContent.trim() || '').filter(Boolean).join(' ');
      if (text) return text;
    }
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim();
    // 1. Explicit label with for="id"
    if (el.id) {
      try {
        const labelEl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (labelEl && labelEl.textContent.trim()) return labelEl.textContent.trim();
      } catch (_) {}
    }
    // 2. Wrapping label
    const parentLabel = el.closest('label');
    if (parentLabel && parentLabel.textContent.trim()) {
      return parentLabel.textContent.trim();
    }
    // 3. Grid / row preceding column (e.g., RoboForm / Bootstrap / Tailwind form layouts)
    // <div class="row"><div class="col-xs-6 text-right">First Name</div><div class="col-xs-6"><input></div></div>
    const parentCol = el.closest('[class*="col-"], [class*="col"]');
    if (parentCol && parentCol.previousElementSibling) {
      const prevText = parentCol.previousElementSibling.textContent.trim();
      if (prevText && prevText.length < 60) return prevText;
    }
    // 4. Parent's previous sibling
    if (el.parentElement && el.parentElement.previousElementSibling) {
      const prevText = el.parentElement.previousElementSibling.textContent.trim();
      if (prevText && prevText.length < 60) return prevText;
    }
    // 5. Direct previous sibling
    let prev = el.previousElementSibling;
    while (prev) {
      const txt = prev.textContent.trim();
      if (txt && txt.length < 60) return txt;
      prev = prev.previousElementSibling;
    }
    // 6. Closest row's text-right or label-like container
    const row = el.closest('.row, tr, [class*="form-group"]');
    if (row) {
      const labelLike = row.querySelector('.text-right, [class*="label"], th, td:first-child');
      if (labelLike && labelLike !== el && !labelLike.contains(el)) {
        const txt = labelLike.textContent.trim();
        if (txt && txt.length < 60) return txt;
      }
    }
    // 7. Enclosing field group / card / container div (e.g. .field-group, .form-field)
    const container = el.closest('.field-group, .form-group, .form-row, .field, .form-item, .input-group, [class*="field"], [class*="group"], [class*="control"], fieldset');
    if (container) {
      const labelLike = container.querySelector('label, [class*="label"], [class*="title"], legend, span, p');
      if (labelLike && !labelLike.contains(el) && labelLike !== el) {
        const txt = labelLike.textContent.trim();
        if (txt && txt.length < 80) return txt;
      }
    }
    return '';
  }

  function getAutocompleteInfo(el) {
    const tokens = (el.getAttribute('autocomplete') || '').toLowerCase().trim().split(/\s+/).filter(Boolean);
    const section = tokens.find(token => token.startsWith('section-')) || '';
    const addressKind = tokens.find(token => token === 'billing' || token === 'shipping') || '';
    const group = [addressKind, section].filter(Boolean).join(':');
    const recipientType = tokens.find(token => ['home', 'work', 'mobile', 'fax', 'pager'].includes(token)) || '';
    const detail = tokens.find(token => token !== 'on' && token !== 'off' && token !== 'billing' && token !== 'shipping' && !['home', 'work', 'mobile', 'fax', 'pager'].includes(token) && !token.startsWith('section-') && token !== 'webauthn') || '';
    const map = {
      'honorific-prefix': 'title', 'honorific-suffix': 'title',
      'name': 'full_name',
      'given-name': 'first_name', 'additional-name': 'middle_name',
      'additional-name-initial': 'middle_initial',
      'family-name': 'last_name',
      'nickname': 'user_id', 'username': 'user_id',
      'organization-title': 'position', 'organization': 'company',
      'street-address': 'address_line_1', 'address-line1': 'address_line_1', 'address-line2': 'address_line_2',
      'address-level1': 'state', 'address-level2': 'city',
      'country': 'country', 'country-name': 'country', 'postal-code': 'zip',
      'email': 'email', 'tel': 'cell_phone', 'tel-national': 'cell_phone',
      'bday': 'dob', 'bday-day': 'dob_day', 'bday-month': 'dob_month', 'bday-year': 'dob_year',
      'sex': 'sex',
      'url': 'website', 'web': 'website', 'website': 'website'
    };
    let category = map[detail] || '';
    if (detail === 'tel' || detail === 'tel-national') {
      if (recipientType === 'home') category = 'home_phone';
      else if (recipientType === 'work') category = 'work_phone';
      else if (recipientType === 'fax') category = 'fax';
    }
    return { category, group, detail };
  }

  function getFieldIdentifier(el) {
    if (!el) return '';
    return el.name || el.id || el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || findSurroundingLabel(el) || '';
  }

  /**
   * Intelligently detects whether an address input belongs to Shipping or Billing.
   * Checks autocomplete tokens, input attributes, surrounding labels, and container hierarchy.
   */
  function detectAddressGroup(el) {
    if (!el) return '';

    // 1. Check autocomplete tokens
    const autoInfo = getAutocompleteInfo(el);
    if (autoInfo.group) {
      if (autoInfo.group.includes('billing')) return 'billing';
      if (autoInfo.group.includes('shipping')) return 'shipping';
    }

    // 2. Check element's attributes (id, name, class, placeholder, aria-label)
    const id = (el.id || '').toLowerCase();
    const name = (el.name || '').toLowerCase();
    const className = (el.className || '').toString().toLowerCase();
    const placeholder = (el.placeholder || '').toLowerCase();
    const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
    const combined = `${id} ${name} ${className} ${placeholder} ${ariaLabel}`;

    const isShipAttr = /(?:^|[-_])(ship|shipping|delivery|dest|destination|shipto)(?:$|[-_])|\b(shipping|delivery)\b/i.test(combined);
    const isBillAttr = /(?:^|[-_])(bill|billing|payment|payee|invoice|billto)(?:$|[-_])|\b(billing|invoice)\b/i.test(combined);

    if (isBillAttr && !isShipAttr) return 'billing';
    if (isShipAttr && !isBillAttr) return 'shipping';

    // 3. Check surrounding labels
    const label = findSurroundingLabel(el).toLowerCase();
    if (/\b(billing|bill)\b/i.test(label) && !/\b(shipping|delivery)\b/i.test(label)) return 'billing';
    if (/\b(shipping|delivery|ship)\b/i.test(label) && !/\b(billing|bill)\b/i.test(label)) return 'shipping';

    // 4. Check ancestor containers (fieldset, section, div, form containers)
    let curr = el.parentElement;
    let depth = 0;
    while (curr && depth < 6 && curr !== document.body) {
      if (curr.tagName && curr.tagName.toLowerCase() === 'fieldset') {
        const legend = curr.querySelector('legend');
        if (legend) {
          const legTxt = legend.textContent.toLowerCase();
          if (/\bbill/i.test(legTxt)) return 'billing';
          if (/\b(ship|delivery)/i.test(legTxt)) return 'shipping';
        }
      }

      const heading = curr.querySelector('h1, h2, h3, h4, h5, h6, [class*="title"], [class*="heading"]');
      if (heading && heading !== el) {
        const hTxt = heading.textContent.toLowerCase();
        if (/\b(billing|payment)\b/i.test(hTxt) && !/\b(shipping|delivery)\b/i.test(hTxt)) return 'billing';
        if (/\b(shipping|delivery)\b/i.test(hTxt) && !/\b(billing|payment)\b/i.test(hTxt)) return 'shipping';
      }

      const containerInfo = `${curr.id || ''} ${curr.className || ''}`.toLowerCase();
      if (/\b(billing|bill-to)\b/i.test(containerInfo) || /billing[-_]address/i.test(containerInfo)) return 'billing';
      if (/\b(shipping|ship-to|delivery)\b/i.test(containerInfo) || /shipping[-_]address/i.test(containerInfo)) return 'shipping';

      curr = curr.parentElement;
      depth++;
    }

    return '';
  }

  /**
   * Detects if an element is a password or login authentication credential field.
   * Smart AutoComplete strictly excludes these so the user's password manager has 100% control.
   */
  function isPasswordOrLoginField(el) {
    if (!el) return false;
    const type = (el.type || '').toLowerCase();
    if (type === 'password') return true;

    const autocomplete = (el.getAttribute('autocomplete') || '').toLowerCase();
    if (/\b(one-time-code|current-password|new-password)\b/.test(autocomplete)) return true;
    if (autocomplete.includes('password') || autocomplete === 'current-password' || autocomplete === 'new-password') {
      return true;
    }

    const name = (el.name || '').toLowerCase();
    const id = (el.id || '').toLowerCase();
    const placeholder = (el.placeholder || '').toLowerCase();
    const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
    const labelText = (typeof findSurroundingLabel === 'function' ? findSurroundingLabel(el) : '').toLowerCase();
    const combined = `${name} ${id} ${placeholder} ${ariaLabel} ${labelText}`;

    // Passwords, passcodes, secrets are always excluded
    if (/\bpassword\b|\bpasswd\b|\bpwd\b|passcode|secret/i.test(combined)) {
      return true;
    }

    // Explicit user ID / username / profile handle fields are NEVER treated as login credential fields!
    const combinedHandleText = `${placeholder} ${ariaLabel} ${labelText}`;
    const isShortcodeInst = /\b\/handle\b|\btype\s*[\/'"\(\)]*handle\b/i.test(combinedHandleText);
    if (
      !isShortcodeInst &&
      (/\b(user_id|userid|job_handle|handle|screen_name|nickname)\b/i.test(`${name} ${id}`) ||
      /user\s*id|handle|nickname|screen\s*name/i.test(combinedHandleText))
    ) {
      return false;
    }

    // Check if element is inside an actual dedicated login form
    const ownerForm = el.form || (el.closest && el.closest('form'));
    if (ownerForm && ownerForm.querySelector('input[type="password"]')) {
      const formId = (ownerForm.id || '').toLowerCase();
      const formAction = (ownerForm.action || '').toLowerCase();
      const formClass = (ownerForm.className || '').toString().toLowerCase();
      const isExplicitLoginForm = /login|signin|sign-in|log-in|auth/i.test(`${formId} ${formAction} ${formClass}`);

      // Count visible editable inputs
      const formInputs = ownerForm.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), select, textarea');

      // Only consider it a login credential if it's an explicit login form OR a compact login box (<= 3 inputs),
      // AND the form has NO profile/registration fields (like first/last name, address, phone, dob).
      if (isExplicitLoginForm || formInputs.length <= 3) {
        const formHtml = (ownerForm.innerText || '').toLowerCase();
        const hasRegistrationSignals = /create\s*account|sign\s*up|register|shipping|billing|checkout|profile|sandbox/i.test(formHtml);
        if (!hasRegistrationSignals && (autocomplete.includes('username') || /^(login|signin|user_login|session_user|username)$/i.test(name))) {
          return true;
        }
      }
    }

    // Direct standalone login credential identifiers (e.g. login username field)
    if (/^(login|signin|sign-in|log-in|user_login|session_user)$/i.test(name) || /^(login|signin|sign-in|log-in)$/i.test(id)) {
      return true;
    }

    return false;
  }

  function isValidEmail(email) {
    if (!email || typeof email !== 'string') return false;
    const trimmed = email.trim();
    return /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/.test(trimmed);
  }

  function isBotOrSecurityTokenField(el) {
    if (!el) return false;
    const name = (el.name || '').toLowerCase();
    const id = (el.id || '').toLowerCase();
    const className = (el.className || '').toString().toLowerCase();
    const placeholder = (el.placeholder || '').toLowerCase();
    const combined = `${name} ${id} ${className} ${placeholder}`;
    if (/token|csrf|nonce|honeypot|fake_email|honey_email|\bhp_|\bhoney\b|bot_trap|recaptcha|turnstile|captcha|anti_spam/i.test(combined)) {
      return true;
    }
    return false;
  }

  /**
   * Detects site search / query boxes (e.g. "Search an IP Address or a domain name").
   * These must NEVER be treated as profile fields or auto-filled on page load.
   */
  function isSearchField(el) {
    if (!el || !el.tagName || el.tagName.toLowerCase() !== 'input') return false;
    const type = (el.type || '').toLowerCase();
    if (type === 'search') return true;
    const role = (el.getAttribute('role') || '').toLowerCase();
    if (role === 'searchbox' || role === 'combobox' && /search/i.test(el.getAttribute('aria-label') || '')) return true;
    if (el.closest && el.closest('[role="search"], search')) return true;

    const name = (el.name || '').toLowerCase();
    const id = (el.id || '').toLowerCase();
    if (/^(q|query|s|search|searchterm|search_term|search_query|searchquery|keyword|keywords|kw|term|find)$/.test(name) ||
        /^(q|query|search|searchbox|search-box|search_input|search-input|searchinput|searchquery)$/.test(id)) {
      return true;
    }

    const placeholder = (el.placeholder || '').toLowerCase();
    const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
    const title = (el.getAttribute('title') || '').toLowerCase();
    if (/\bsearch\b|\blook\s*up\b|\blookup\b/.test(`${name} ${id} ${placeholder} ${ariaLabel} ${title}`)) return true;

    const form = el.form || (el.closest && el.closest('form'));
    if (form) {
      const formSig = `${form.id || ''} ${(form.className || '').toString()} ${form.getAttribute('action') || ''} ${form.getAttribute('role') || ''}`.toLowerCase();
      if (/search/.test(formSig)) return true;
    }
    return false;
  }

  /**
   * Examines an input/select element and maps it to a supported profile key.
   */
  function identifyField(el) {
    if (!el) return 'excluded';
    if (isPasswordOrLoginField(el)) return 'excluded';
    if (isBotOrSecurityTokenField(el)) return 'excluded';
    const autocompleteInfo = getAutocompleteInfo(el);
    const type = (el.type || '').toLowerCase();
    const name = (el.name || '').toLowerCase();
    const id = (el.id || '').toLowerCase();
    const placeholder = (el.placeholder || '').toLowerCase();
    const autocomplete = (el.getAttribute('autocomplete') || '').toLowerCase();
    const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
    const role = (el.getAttribute('role') || '').toLowerCase();
    const className = (el.className || '').toString().toLowerCase();

    // 0. EXCLUDE HIDDEN, SLIDERS, RANGE INPUTS, COLOR PICKERS, BUTTONS, CHECKBOXES, RADIOS
    if (
      type === 'hidden' ||
      type === 'range' || 
      type === 'color' || 
      type === 'checkbox' || 
      type === 'radio' || 
      type === 'file' || 
      type === 'button' || 
      type === 'submit' || 
      type === 'reset' || 
      type === 'image' ||
      role === 'slider' || 
      /\bslider\b|\brange-slider\b/i.test(className) || 
      /\bslider\b/i.test(name) || 
      /\bslider\b/i.test(id) ||
      (el.closest && el.closest('[role="slider"], .slider, .range-slider'))
    ) {
      return 'excluded';
    }

    const labelText = findSurroundingLabel(el).toLowerCase();

    // Shortcode & Ghost Text laboratory/test inputs are generic test boxes, not profile fields
    if (/shortcode|ghost.*text|ghost.*input|ghost.*field/i.test(`${id} ${name} ${placeholder} ${labelText}`)) {
      return 'site_custom';
    }

    const combined = `${type} ${name} ${id} ${placeholder} ${autocomplete} ${ariaLabel} ${labelText}`;
    if (/custom.*message|inquiry|your.*message|comment|notes|feedback|description|remarks/i.test(combined)) return 'excluded';
    const chatHost = /(^|\.)gemini\.google\.com$/.test(window.location.hostname.toLowerCase());
    if (chatHost && !autocompleteInfo.category) return 'excluded';
    if (!autocompleteInfo.category && /chat|prompt|composer|ask.?gemini|message.?input/i.test(combined)) return 'excluded';
    if (autocompleteInfo.detail === 'one-time-code' || autocompleteInfo.detail.startsWith('cc-')) return 'excluded';
    if (autocompleteInfo.detail.startsWith('tel-') && autocompleteInfo.detail !== 'tel-national') return 'excluded';
    if (el.tagName && el.tagName.toLowerCase() === 'textarea' && !autocompleteInfo.category) return 'excluded';
    if (autocompleteInfo.category) return autocompleteInfo.category;

    // Search / query boxes are never profile fields (keeps per-site history only)
    if (isSearchField(el)) return 'site_custom';

    // Direct name patterns for RoboForm / standard form test suites
    if (/^01___title/i.test(name)) return 'title';
    if (/^02frstname/i.test(name)) return 'first_name';
    if (/^03middle_i/i.test(name)) return 'middle_initial';
    if (/^04lastname/i.test(name)) return 'last_name';
    if (/^04fullname/i.test(name)) return 'full_name';
    if (/^05_company/i.test(name)) return 'company';
    if (/^06position/i.test(name)) return 'position';
    if (/^10address1/i.test(name)) return 'address_line_1';
    if (/^11address2/i.test(name)) return 'address_line_2';
    if (/^13adr_city/i.test(name)) return 'city';
    if (/^14adrstate/i.test(name)) return 'state';
    if (/^15_country/i.test(name)) return 'country';
    if (/^16addr_zip4|^16zip4/i.test(name)) return 'zip4';
    if (/^16addr_zip/i.test(name)) return 'zip';
    if (/^20homephon/i.test(name)) return 'home_phone';
    if (/^21workphon/i.test(name)) return 'work_phone';
    if (/^22faxphone/i.test(name)) return 'fax';
    if (/^23cellphon/i.test(name)) return 'cell_phone';
    if (/^24emailadr/i.test(name)) return 'email';
    if (/^25web_site/i.test(name)) return 'website';
    if (/^30_user_id/i.test(name)) return 'user_id';
    if (/^31password/i.test(name)) return 'excluded';
    if (/^40cc__type|^41ccnumber|^43cvc|^42ccexp_mm|^43ccexp_yy|^44cc_uname|^45ccissuer|^46cccstsvc/i.test(name)) return 'excluded';
    if (/^60pers_sex/i.test(name)) return 'sex';
    if (/^61pers_ssn/i.test(name)) return 'social_security_number';
    if (/^62driv_lic/i.test(name)) return 'driver_license_number';
    if (/^66mm/i.test(name)) return 'dob_month';
    if (/^67dd/i.test(name)) return 'dob_day';
    if (/^68yy/i.test(name)) return 'dob_year';
    if (/^66pers_age/i.test(name)) return 'age';
    if (/^67birth_pl/i.test(name)) return 'birth_place';
    if (/^68__income/i.test(name)) return 'income';
    if (/^71__custom|^72__commnt/i.test(name)) return 'excluded';

    // Exclude Credit Cards completely
    if (/card.*num|cc.*num|credit.*card|\bpan\b|cardno|cvv|cvc|security.*code|verification.*code|card.*code|card.*type|cc.*type|exp.*month|cc.*month|exp.*year|cc.*year|card.*exp|issuing.*bank/i.test(combined)) {
      return 'excluded';
    }

    // 8. Social Security Number
    if (/ssn|social.*security|social.*sec/i.test(combined)) return 'social_security_number';

    // 9. Driver License Number
    if (/driver.*lic|license.*num|dl.*num|driver.*id/i.test(combined)) return 'driver_license_number';

    // 10. Date Of Birth (DOB)
    if (/dob.*day|birth.*day/i.test(combined)) return 'dob_day';
    if (/dob.*month|birth.*month/i.test(combined)) return 'dob_month';
    if (/dob.*year|birth.*year/i.test(combined)) return 'dob_year';
    if (type === 'date' || /\bdob\b|birth.*date|date.*of.*birth|birthday/i.test(combined)) return 'dob';

    // 11. Age
    if (/\bage\b|your.*age/i.test(combined)) return 'age';

    // 12. Birth Place
    if (/birth.*place|place.*of.*birth/i.test(combined)) return 'birth_place';

    // 13. Income
    if (/income|salary|earnings|revenue/i.test(combined)) return 'income';

    // 14. Sex / Gender
    if (/\bsex\b|gender/i.test(combined)) return 'sex';

    // 15. Passwords - fully excluded for password manager compatibility
    if (type === 'password' || /password|passwd|pwd/i.test(combined)) return 'excluded';

    // 16. User ID / Username / Handle (excluding login credentials & shortcode instructions)
    const isShortcodeInstruction = /\b\/(handle|email|addr|phone|date|time|shrug)\b|\btype\s*[\/'"\(\)]*(handle|email|addr|phone|date|time|shrug)\b|shortcode|slash\s*command/i.test(combined);
    if (!isShortcodeInstruction && /\b(user[-_\s]*id|username|screen[-_\s]*name|nickname)\b|\bhandle\b/i.test(combined)) {
      return 'user_id';
    }

    // 17. Email
    if (!isShortcodeInstruction && (type === 'email' || /email|e-mail/i.test(combined))) {
      return 'email';
    }

    // 18. Website
    if (type === 'url' || /website|web.*site|homepage|\burl\b/i.test(combined)) return 'website';

    // 19. Phone Fields
    if (/fax|facsimile/i.test(combined)) return 'fax';
    if (/home.*phone|tel.*home|phone.*home/i.test(combined)) return 'home_phone';
    if (/work.*phone|work.*tel|business.*phone|office.*phone/i.test(combined)) return 'work_phone';
    if (/cell|mobile/i.test(combined)) return 'cell_phone';
    if (type === 'tel' || /phone|telephone|tel/i.test(combined)) return 'cell_phone';

    // 20. Zip / Postal Code (Check BEFORE Address lines so fields like "tZip-byaddress" aren't caught by "address"!)
    if (/zip.*4|zip.*plus.*4|plus.*4|zip.*ext|zip.*suffix|postal.*suffix|postal.*ext|addr_zip4|\bplus4\b|\bzip4\b/i.test(combined)) return 'zip4';
    if (el.tagName.toLowerCase() === 'input' && (el.maxLength === 4 || el.size === 4 || /\+4|####/i.test(placeholder))) {
      const prev = el.previousElementSibling;
      if (prev && /zip|postal/i.test(`${prev.name || ''} ${prev.id || ''} ${prev.placeholder || ''}`)) {
        return 'zip4';
      }
      if (/ext|suffix|\+4/i.test(combined)) return 'zip4';
    }
    if (/\b(zip|postal[-_\s]*code|pincode|postcode)\b/i.test(combined) || /^zip/i.test(name) || /^zip/i.test(id)) return 'zip';

    // 21. Address Fields
    if (/\b(street[-_\s]*address|addr[-_\s]*1)\b|(?:address|addr)[-_\s]*(?:line[-_\s]*)?1\b/i.test(combined)) return 'address_line_1';
    if (/(?:address|addr)[-_\s]*(?:line[-_\s]*)?2\b|\b(?:secondary[-_\s]*address|line[-_\s]*2|apt|apartment|suite|ste|unit|bldg|building|floor|fl|rm|room)\b/i.test(combined)) return 'address_line_2';
    // Bare "address" only counts if it isn't a non-postal address (IP, MAC, web, wallet, server, etc.)
    if (/\bstreet\b/i.test(combined) ||
        (/\baddress\b/i.test(combined) && !/\b(ip|ipv4|ipv6|mac|web|url|email|e-mail|wallet|bitcoin|btc|eth|crypto|server|host|network|contract)\s*address\b|\baddress\s*(bar|book)\b/i.test(combined))) {
      return 'address_line_1';
    }
    if (/city|locality|town/i.test(combined)) return 'city';
    // 21b. Country / Nation / Country-Region (Checked BEFORE State so "Country / Region", "countryRegion", "Country and birthday", etc. are recognized as Country, NOT State!)
    if (/\b(country|nation|nationality)\b|country[-_\s\/]*region|country_?code/i.test(combined)) return 'country';
    // 21c. State / Province / Administrative Area / Region
    if (/\b(state|province|administrative[-_\s]*area)\b|\bstate[-_\s\/]*region\b|\bregion\b/i.test(combined)) return 'state';

    // 21. Personal Name Fields
    if (/middle.*initial|minitial|\bm\.?i\.?\b|\bmi\b|middle.*i\b/i.test(combined) || (/middle/i.test(combined) && (el.maxLength === 1 || el.maxLength === 2 || (el.size && el.size <= 2) || /initial/i.test(combined)))) return 'middle_initial';
    if (/middle.*name|mname|additional.*name/i.test(combined)) return 'middle_name';
    if (/\bfirst\b|first.*name|fname|given.*name|forename/i.test(combined)) return 'first_name';
    if (/last.*name|lname|surname|family.*name/i.test(combined)) return 'last_name';
    if (/^name$|full.*name|your.*name|contact.*name/i.test(combined)) return 'full_name';
    if (/title|salutation|honorific/i.test(combined) && !/job.*title/i.test(combined)) return 'title';

    // 22. Company & Position
    if (/company|organization|employer|business.*name|org/i.test(combined)) return 'company';
    if (/position|job.*title|occupation|role/i.test(combined)) return 'position';

    // Standalone Month / Day / Year dropdowns
    if (/\bmonth\b/i.test(combined)) return 'dob_month';
    if (/\bday\b/i.test(combined)) return 'dob_day';
    if (/\byear\b/i.test(combined)) return 'dob_year';

    // Site-specific generalized inputs (e.g. custom inputs, search, rule expressions, or header fields on specific pages)
    if (el.tagName.toLowerCase() === 'input' && (type === 'text' || type === 'search' || !type)) {
      return 'site_custom';
    }

    // Unmatched elements are excluded - no unwanted general topic popups or tracking!
    return 'excluded';
  }

  // --- Auto-Fill Everything On Page Load ---

  /**
   * Scans supported inputs and selects on the page and fills them with the most-used & last-used data.
   */
  function autoFillEntirePage(force = false) {
    if (teardownIfInvalid()) return;

    const selector = 'input:not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="hidden"]):not([type="file"]):not([type="range"]):not([type="color"]):not([type="checkbox"]):not([type="radio"]):not([type="password"]), select, textarea';
    const allFields = document.querySelectorAll(selector);
    const candidateFields = [];

    allFields.forEach((el, index) => {
      const type = (el.type || '').toLowerCase();
      // Skip buttons, submits, resets, hidden, file, range sliders, color, checkboxes, radios, passwords, disabled, or readonly fields
      if (['button', 'submit', 'reset', 'hidden', 'file', 'image', 'range', 'color', 'checkbox', 'radio', 'password'].includes(type)) return;
      if (isPasswordOrLoginField(el)) return;
      if (el.getAttribute('role') === 'slider' || (el.closest && el.closest('[role="slider"], .slider, .range-slider'))) return;
      if (el.disabled || el.readOnly) return;
      // Never auto-fill search / query boxes on page load
      if (isSearchField(el)) return;

      // Skip fields that already have values entered by the user, or fields skipped/cleared, unless force is requested
      if (force) {
        delete el.dataset.sacUserCleared;
        delete el.dataset.sacUserModified;
        delete el.dataset.sacSkipAutofill;
        delete el.dataset.sacAutofilled;
        delete el.dataset.sacFilledValue;
        el.dataset.sacFillAttempts = '0';
      } else {
        if (el.dataset.sacUserCleared === 'true' || el.dataset.sacUserModified === 'true' || el.dataset.sacSkipAutofill === 'true') return;
        if (el.dataset.sacAutofilled === 'true') return;
        const attempts = parseInt(el.dataset.sacFillAttempts || '0', 10);
        if (attempts >= 2) return;

        if (el.tagName.toLowerCase() === 'select') {
          if (el.selectedIndex > 0 && el.options[el.selectedIndex].value !== '') return;
        } else {
          if ((el.value || '').trim().length > 0) return;
        }
      }

      const fieldKey = identifyField(el);
      // Only auto-fill recognized profile fields on page load (never generic/custom/notes inputs)
      if (['general', 'excluded', 'site_custom', 'notes', 'textarea'].includes(fieldKey)) return;

      const fieldId = 'sac_field_' + index;
      el.dataset.sacFieldId = fieldId;

      const detectedGroup = detectAddressGroup(el) || getAutocompleteInfo(el).group;

      candidateFields.push({
        id: fieldId,
        fieldKey,
        fieldGroup: detectedGroup,
        fieldIdentifier: getFieldIdentifier(el),
        maxLength: el.maxLength > 0 ? el.maxLength : 0,
        placeholder: el.placeholder || '',
        type: el.type,
        el
      });
    });

    if (candidateFields.length === 0) {
      if (force) {
        showAutofillToast(0, 'No matching fields found on this page');
      }
      return;
    }

    // Do not auto-load on page load unless there are MORE THAN TWO text boxes.
    // This prevents filling username fields on single/two-field login pages where password managers handle it,
    // while keeping autofill working for multi-field forms/sign-up pages (> 2 fields) or manual trigger (force = true).
    if (!force && candidateFields.length <= 2) {
      return;
    }

    // Disambiguate multi-address forms (e.g. checkout forms with both shipping and billing sections)
    const addr1Fields = candidateFields.filter(f => f.fieldKey === 'address_line_1');
    if (addr1Fields.length >= 2) {
      const firstHasGroup = Boolean(addr1Fields[0].fieldGroup);
      const secondHasGroup = Boolean(addr1Fields[1].fieldGroup);

      if (!firstHasGroup && !secondHasGroup) {
        // Standard checkout pattern: First address is Shipping, subsequent address is Billing
        let currentGroup = 'shipping';
        candidateFields.forEach(f => {
          if (['address_line_1', 'address_line_2', 'city', 'state', 'zip', 'zip4', 'country'].includes(f.fieldKey)) {
            if (f === addr1Fields[1]) currentGroup = 'billing';
            if (!f.fieldGroup) f.fieldGroup = currentGroup;
          }
        });
      } else if (firstHasGroup && !secondHasGroup) {
        const otherGroup = addr1Fields[0].fieldGroup === 'shipping' ? 'billing' : 'shipping';
        let foundSecond = false;
        candidateFields.forEach(f => {
          if (['address_line_1', 'address_line_2', 'city', 'state', 'zip', 'zip4', 'country'].includes(f.fieldKey)) {
            if (f === addr1Fields[1]) foundSecond = true;
            if (foundSecond && !f.fieldGroup) f.fieldGroup = otherGroup;
          }
        });
      } else if (!firstHasGroup && secondHasGroup) {
        const firstGroup = addr1Fields[1].fieldGroup === 'shipping' ? 'billing' : 'shipping';
        let foundSecond = false;
        candidateFields.forEach(f => {
          if (['address_line_1', 'address_line_2', 'city', 'state', 'zip', 'zip4', 'country'].includes(f.fieldKey)) {
            if (f === addr1Fields[1]) foundSecond = true;
            if (!foundSecond && !f.fieldGroup) f.fieldGroup = firstGroup;
          }
        });
      }
    }

    // Companion Zip+4 pass: detect a small 4-digit input right after a primary 5-digit zip field
    for (let i = 0; i < candidateFields.length; i++) {
      if (candidateFields[i].fieldKey === 'zip' && i + 1 < candidateFields.length) {
        const next = candidateFields[i + 1];
        if (next.fieldKey === 'site_custom' || next.fieldKey === 'zip') {
          const nextEl = next.el;
          if (nextEl && nextEl.tagName.toLowerCase() === 'input') {
            const maxL = nextEl.maxLength;
            const size = nextEl.size;
            const pl = (nextEl.placeholder || '').toLowerCase();
            const combinedNext = `${nextEl.name || ''} ${nextEl.id || ''} ${pl}`.toLowerCase();
            if (maxL === 4 || size === 4 || /ext|plus4|\+4|suffix|####/.test(combinedNext) || (/^[\d#\-+ ]{1,5}$/.test(pl) && maxL <= 5)) {
              next.fieldKey = 'zip4';
            }
          }
        }
      }
    }

    // Determine if page contains shipping context or fields
    const hasShippingOnPage = candidateFields.some(f => 
      (f.fieldGroup || '').toLowerCase().includes('ship') || 
      /\b(ship|shipping|delivery)\b/i.test(f.fieldIdentifier || '') || 
      /\b(ship|shipping|delivery)\b/i.test(f.placeholder || '')
    );

    // Send batch autofill query to background worker
    const queryPayload = candidateFields.map(f => ({ 
      id: f.id, 
      fieldKey: f.fieldKey,
      fieldGroup: f.fieldGroup,
      fieldIdentifier: f.fieldIdentifier,
      maxLength: f.maxLength,
      placeholder: f.placeholder
    }));

    safeSendMessage({
      type: 'GET_PAGE_AUTOFILL',
      force: Boolean(force),
      fields: queryPayload,
      hasShippingOnPage,
      url: window.location.href,
      path: window.location.origin + window.location.pathname,
      hostname: window.location.hostname
    }, (res) => {
      if (!res || !res.success || !res.autofills) return;

      // Do not auto-load on page load unless there are MORE THAN TWO text boxes to input matching values.
      if (!force) {
        const matchingFieldsCount = candidateFields.filter(f => {
          const val = res.autofills[f.id];
          return val !== undefined && val !== null && String(val).trim() !== '';
        }).length;

        if (matchingFieldsCount <= 2) {
          return;
        }
      }

      let filledCount = 0;
      isAutofillingPage = true;

      try {
        candidateFields.forEach(f => {
          const val = res.autofills[f.id];
          if (val === undefined || val === null || val === '') return;

          const targetEl = f.el;

          // Fill <select> elements
          if (targetEl.tagName.toLowerCase() === 'select') {
            let matched = false;
            const targetStr = String(val).toLowerCase().trim();
            const targetNum = parseInt(val, 10);
            const MONTH_NAMES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

            for (let i = 0; i < targetEl.options.length; i++) {
              const optVal = (targetEl.options[i].value || '').toLowerCase().trim();
              const optText = (targetEl.options[i].text || '').toLowerCase().trim();
              if (!optVal && !optText) continue;

              // 1. Exact match
              if (optVal === targetStr || optText === targetStr) {
                targetEl.selectedIndex = i;
                matched = true;
                break;
              }

              // 2. Substring match (e.g. "Visa" inside "Visa (Preferred)")
              if (targetStr.length >= 3 && (optText.includes(targetStr) || targetStr.includes(optText))) {
                targetEl.selectedIndex = i;
                matched = true;
                break;
              }

              // 3. Numeric match for Day, Month number, Year
              const optNum = parseInt(optVal, 10);
              if (!isNaN(targetNum) && !isNaN(optNum) && targetNum === optNum && optNum > 0) {
                targetEl.selectedIndex = i;
                matched = true;
                break;
              }

              // 4. Month names / abbreviations (e.g. "Jan" for 1 or "01")
              if (!isNaN(targetNum) && targetNum >= 1 && targetNum <= 12) {
                if (optText.toLowerCase().startsWith(MONTH_NAMES[targetNum - 1])) {
                  targetEl.selectedIndex = i;
                  matched = true;
                  break;
                }
              }

              // 5. State abbreviation / full name match (e.g. CA <-> California)
              if (f.fieldKey === 'state' || f.fieldKey === 'province') {
                const targetCode = targetStr.length === 2 ? targetStr : (Object.keys(US_STATES).find(k => US_STATES[k] === targetStr) || '');
                const targetFull = US_STATES[targetCode] || (targetStr.length > 2 ? targetStr : '');
                if (targetCode && (optVal === targetCode || optText.includes(`(${targetCode.toUpperCase()})`) || optText.startsWith(targetCode + ' ') || optText.endsWith(' ' + targetCode) || optText === targetCode)) {
                  targetEl.selectedIndex = i;
                  matched = true;
                  break;
                }
                if (targetFull && (optText.includes(targetFull) || optVal.includes(targetFull))) {
                  targetEl.selectedIndex = i;
                  matched = true;
                  break;
                }
              }

              // 6. Country code / full name match (e.g. US <-> United States)
              if (f.fieldKey === 'country') {
                const targetCode = targetStr.length <= 3 ? targetStr : (Object.keys(COUNTRY_CODES).find(k => COUNTRY_CODES[k] === targetStr) || '');
                const targetFull = COUNTRY_CODES[targetCode] || (targetStr.length > 3 ? targetStr : '');
                if (targetCode && (optVal === targetCode || optText.includes(`(${targetCode.toUpperCase()})`) || optText.startsWith(targetCode + ' ') || optText.endsWith(' ' + targetCode) || optText === targetCode)) {
                  targetEl.selectedIndex = i;
                  matched = true;
                  break;
                }
                if (targetFull && (optText.includes(targetFull) || optVal.includes(targetFull))) {
                  targetEl.selectedIndex = i;
                  matched = true;
                  break;
                }
              }
            }
            if (matched) {
              targetEl.dataset.sacAutofilled = 'true';
              targetEl.dataset.sacFilledValue = targetEl.options[targetEl.selectedIndex].text || targetEl.value;
              targetEl.dispatchEvent(new Event('change', { bubbles: true }));
              animateAutofill(targetEl);
              filledCount++;
            } else {
              targetEl.dataset.sacSkipAutofill = 'true';
            }
          } 
          // Fill checkboxes or radio buttons
          else if (targetEl.type === 'checkbox' || targetEl.type === 'radio') {
            if (String(val).toLowerCase() === 'true' || String(val).toLowerCase() === 'yes' || targetEl.value === String(val)) {
              targetEl.checked = true;
              targetEl.dataset.sacAutofilled = 'true';
              targetEl.dispatchEvent(new Event('change', { bubbles: true }));
              animateAutofill(targetEl);
              filledCount++;
            }
          }
          // Fill supported text, password, tel, and email controls.
          else {
            const fillVal = String(val);
            const fillAttempts = (parseInt(targetEl.dataset.sacFillAttempts || '0', 10)) + 1;
            targetEl.dataset.sacFillAttempts = String(fillAttempts);

            setNativeValue(targetEl, fillVal);
            dispatchInputEvents(targetEl);

            const curVal = (targetEl.value || '').trim();
            if (!curVal || fillAttempts >= 2) {
              targetEl.dataset.sacSkipAutofill = 'true';
            }

            if (curVal) {
              targetEl.dataset.sacAutofilled = 'true';
              targetEl.dataset.sacFilledValue = fillVal;
              animateAutofill(targetEl);
              filledCount++;
            }
          }
        });
      } finally {
        setTimeout(() => {
          isAutofillingPage = false;
          hideDropdown();
          activeInput = null;
        }, 150);
      }

      hideDropdown();
      activeInput = null;

      if (filledCount > 0) {
        showAutofillToast(filledCount);
      } else if (force) {
        showAutofillToast(0, 'All fields already match your profile');
      }
    });
  }

  // Visual confirmation glow for filled fields
  function animateAutofill(el) {
    try {
      const origTransition = el.style.transition;
      const origBoxShadow = el.style.boxShadow;
      el.style.transition = 'box-shadow 0.25s ease, border-color 0.25s ease';
      el.style.boxShadow = '0 0 0 2px #6366f1, 0 0 10px rgba(99, 102, 241, 0.45)';
      setTimeout(() => {
        el.style.boxShadow = origBoxShadow;
        el.style.transition = origTransition;
      }, 1200);
    } catch (_) {}
  }

  // Subtle floating toast on page load
  function showAutofillToast(count, customMsg) {
    try {
      let toast = document.getElementById('sac-autofill-toast');
      if (!toast) {
        toast = document.createElement('div');
        toast.id = 'sac-autofill-toast';
        toast.style.cssText = `
          position: fixed;
          bottom: 20px;
          right: 20px;
          background: #181a24;
          color: #f1f5f9;
          border: 1px solid #374151;
          box-shadow: 0 8px 24px rgba(0,0,0,0.6), 0 0 0 1px rgba(99,102,241,0.3);
          border-radius: 8px;
          padding: 8px 14px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-size: 12px;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 8px;
          z-index: 2147483647;
          pointer-events: none;
          animation: sac-toast-in 0.2s ease-out;
        `;
        document.body.appendChild(toast);
      }
      if (customMsg) {
        toast.innerHTML = `<span style="color:#818cf8; font-size:14px;">⚡</span> Smart AutoComplete: ${customMsg}`;
      } else {
        toast.innerHTML = `<span style="color:#818cf8; font-size:14px;">⚡</span> Smart AutoComplete filled ${count} field${count === 1 ? '' : 's'}`;
      }
      toast.style.display = 'flex';
      setTimeout(() => {
        if (toast) toast.style.display = 'none';
      }, 2500);
    } catch (_) {}
  }

  // --- In-Page Dark Floating Dropdown ---

  function ensureDropdownContainer() {
    if (shadowRoot && dropdownEl) return;

    let host = document.getElementById('smart-autocomplete-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'smart-autocomplete-host';
      host.style.cssText = 'position:fixed; top:0; left:0; width:0; height:0; z-index:2147483647; pointer-events:none;';
      document.documentElement.appendChild(host);
    }

    shadowRoot = host.shadowRoot || host.attachShadow({ mode: 'open' });
    shadowRoot.innerHTML = `
      <style>
        :host {
          all: initial;
        }
        .sac-dropdown {
          position: fixed;
          display: none;
          box-sizing: border-box;
          background: #13141c;
          color: #f1f5f9;
          border: 1px solid #2d3142;
          border-radius: 10px;
          box-shadow: 0 12px 36px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(99, 102, 241, 0.25);
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-size: 13.5px;
          min-width: 260px;
          max-width: 480px;
          max-height: 320px;
          overflow-y: auto;
          overflow-x: hidden;
          z-index: 2147483647;
          pointer-events: auto;
          scrollbar-width: thin;
          scrollbar-color: #3b3f58 #13141c;
        }
        .sac-dropdown::-webkit-scrollbar {
          width: 6px;
        }
        .sac-dropdown::-webkit-scrollbar-thumb {
          background: #3b3f58;
          border-radius: 3px;
        }
        .sac-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 7px 12px;
          background: #181a24;
          border-bottom: 1px solid #252836;
          font-size: 11px;
          font-weight: 600;
          color: #94a3b8;
          letter-spacing: 0.5px;
          text-transform: uppercase;
          user-select: none;
        }
        .sac-badge-count {
          background: #252836;
          color: #818cf8;
          padding: 1px 6px;
          border-radius: 10px;
          font-size: 10px;
        }
        .sac-list {
          list-style: none;
          margin: 0;
          padding: 4px 0;
        }
        .sac-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 12px;
          cursor: pointer;
          transition: background 0.08s ease;
          gap: 10px;
          user-select: none;
        }
        .sac-item:hover, .sac-item.sac-active {
          background: #222533;
        }
        .sac-item.sac-active {
          border-left: 3px solid #6366f1;
          padding-left: 9px;
        }
        .sac-item-content {
          display: flex;
          align-items: center;
          gap: 8px;
          flex: 1;
          min-width: 0;
        }
        .sac-tag {
          font-size: 9.5px;
          font-weight: 700;
          padding: 2px 6px;
          border-radius: 4px;
          text-transform: uppercase;
          letter-spacing: 0.3px;
          flex-shrink: 0;
          background: rgba(99, 102, 241, 0.2);
          color: #818cf8;
          border: 1px solid rgba(99, 102, 241, 0.35);
        }
        .sac-site-badge {
          display: inline-flex;
          align-items: center;
          font-size: 9.5px;
          font-weight: 600;
          padding: 2px 5px;
          border-radius: 4px;
          flex-shrink: 0;
          background: rgba(56, 189, 248, 0.15);
          color: #38bdf8;
          border: 1px solid rgba(56, 189, 248, 0.3);
          white-space: nowrap;
        }
        .sac-text {
          font-size: 13.5px;
          font-weight: 500;
          color: #f1f5f9;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .sac-match {
          color: #818cf8;
          font-weight: 700;
          text-decoration: underline;
        }
        .sac-meta {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-shrink: 0;
        }
        .sac-pin-icon {
          color: #fbbf24;
          font-size: 12px;
        }
        .sac-freq {
          font-size: 11px;
          color: #64748b;
        }
        .sac-del-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: transparent;
          border: none;
          color: #64748b;
          cursor: pointer;
          font-size: 13px;
          line-height: 1;
          padding: 0;
          transition: all 0.12s ease;
        }
        .sac-del-btn:hover {
          background: rgba(239, 68, 68, 0.2);
          color: #ef4444;
          transform: scale(1.15);
        }
        .sac-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 6px 12px;
          background: #181a24;
          border-top: 1px solid #252836;
          font-size: 10.5px;
          color: #64748b;
          user-select: none;
        }
        .sac-footer kbd {
          background: #252836;
          color: #cbd5e1;
          padding: 1px 4px;
          border-radius: 3px;
          font-family: inherit;
          font-size: 10px;
        }
        .sac-ghost-pill {
          position: fixed;
          display: none;
          box-sizing: border-box;
          background: rgba(19, 20, 28, 0.95);
          backdrop-filter: blur(8px);
          color: #94a3b8;
          border: 1px solid rgba(99, 102, 241, 0.45);
          border-radius: 6px;
          padding: 3px 8px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-size: 11.5px;
          font-weight: 500;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.5);
          z-index: 2147483647;
          pointer-events: none;
          white-space: nowrap;
          align-items: center;
          gap: 6px;
        }
        .sac-ghost-pill .sac-ghost-key {
          background: #252836;
          color: #818cf8;
          padding: 1px 5px;
          border-radius: 3px;
          font-size: 9.5px;
          font-weight: 700;
          border: 1px solid rgba(99, 102, 241, 0.3);
        }
        .sac-ghost-pill .sac-ghost-completion {
          color: #f1f5f9;
          font-weight: 600;
        }
      </style>
      <div class="sac-dropdown" id="sacDropdown">
        <div class="sac-header">
          <span id="sacHeaderTitle">Smart AutoComplete</span>
          <span class="sac-badge-count" id="sacCount">0</span>
        </div>
        <ul class="sac-list" id="sacList"></ul>
        <div class="sac-footer">
          <span><kbd>↑↓</kbd> navigate <kbd>↵</kbd> fill</span>
          <span><kbd>✕</kbd> / <kbd>Shift+Del</kbd> delete</span>
        </div>
      </div>
      <div class="sac-ghost-pill" id="sacGhostPill"></div>
    `;

    dropdownEl = shadowRoot.getElementById('sacDropdown');
    ghostPillEl = shadowRoot.getElementById('sacGhostPill');

    dropdownEl.addEventListener('mousedown', (e) => {
      isInteractingWithDropdown = true;
      e.preventDefault();
    });

    dropdownEl.addEventListener('mouseup', () => {
      setTimeout(() => {
        isInteractingWithDropdown = false;
        if (activeInput) activeInput.focus();
      }, 50);
    });
  }

  function positionDropdown(input) {
    if (!dropdownEl || !input) return;
    const rect = input.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;

    // Dropdown width: align with input box or appropriate min/max
    const isShortcode = currentSuggestions.some(s => s.category === 'shortcode');
    const minW = isShortcode ? 360 : 260;
    const maxW = isShortcode ? 540 : 480;
    const dropdownWidth = Math.max(Math.min(rect.width, maxW), minW);

    // Horizontal placement: align with input left edge
    let left = rect.left;
    if (left + dropdownWidth > window.innerWidth - 12) {
      left = Math.max(8, window.innerWidth - dropdownWidth - 12);
    }
    if (left < 8) left = 8;

    // Vertical placement: NEVER cover the text box!
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    if (spaceBelow >= 140 || spaceBelow >= spaceAbove) {
      // Place STRICTLY BELOW the text box with 4px gap
      dropdownEl.style.top = `${Math.round(rect.bottom + 4)}px`;
      dropdownEl.style.bottom = 'auto';
      dropdownEl.style.maxHeight = `${Math.min(280, Math.max(100, spaceBelow - 16))}px`;
    } else {
      // Place STRICTLY ABOVE the text box with 4px gap
      // Setting bottom ensures it grows upwards away from the text box and never overlaps it!
      dropdownEl.style.top = 'auto';
      dropdownEl.style.bottom = `${Math.round(window.innerHeight - rect.top + 4)}px`;
      dropdownEl.style.maxHeight = `${Math.min(280, Math.max(100, spaceAbove - 16))}px`;
    }

    dropdownEl.style.left = `${Math.round(left)}px`;
    dropdownEl.style.width = `${Math.round(dropdownWidth)}px`;
  }

  function highlightMatch(text, query) {
    if (!query) return escapeHtml(text);
    const qLower = query.toLowerCase();
    const tLower = text.toLowerCase();
    const idx = tLower.indexOf(qLower);
    if (idx === -1) return escapeHtml(text);

    const before = escapeHtml(text.slice(0, idx));
    const match = escapeHtml(text.slice(idx, idx + query.length));
    const after = escapeHtml(text.slice(idx + query.length));

    return `${before}<span class="sac-match">${match}</span>${after}`;
  }

  function escapeHtml(str) {
    return (str || '').replace(/[&<>'"]/g, tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag));
  }

  function formatValueForInput(element, value) {
    if (!element || value == null) return value;
    const type = (element.type || '').toLowerCase();
    const strVal = String(value).trim();

    // 1. Handling for HTML5 <input type="number">
    // Browsers reject any characters that cannot be parsed as a floating-point number
    // (e.g. hyphens between digits in phone numbers, spaces, currency symbols, parentheses)
    // and log "The specified value ... cannot be parsed, or is out of range."
    if (type === 'number') {
      // Check if it is already a valid floating point or integer string
      if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(strVal)) {
        return strVal;
      }
      // Check if it's formatted currency or number with commas/spaces (e.g., "$1,234.56" or "1 000")
      const cleanedNumber = strVal.replace(/[$,\s]/g, '');
      if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(cleanedNumber)) {
        return cleanedNumber;
      }
      // If it contains dashes, parentheses, dots, spaces (e.g. phone numbers "870-421-4442", zip codes, SSNs, credit cards)
      // Extract only the digits so input[type="number"] can parse and accept it
      const digitsOnly = strVal.replace(/\D/g, '');
      if (digitsOnly.length > 0) {
        return digitsOnly;
      }
      return strVal;
    }

    // 2. Handling for HTML5 <input type="date">
    // HTML5 date inputs strictly require YYYY-MM-DD format
    if (type === 'date') {
      const dateMatch = strVal.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
      const usDateMatch = strVal.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
      if (dateMatch) {
        return `${dateMatch[1]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[3].padStart(2, '0')}`;
      } else if (usDateMatch) {
        return `${usDateMatch[3]}-${usDateMatch[1].padStart(2, '0')}-${usDateMatch[2].padStart(2, '0')}`;
      }
      return strVal;
    }

    // 3. Handling for maxLength / length restrictions on numeric/phone fields
    const maxLength = element.maxLength;
    if (maxLength && maxLength > 0 && strVal.length > maxLength) {
      const category = identifyField(element);
      const digitsOnly = strVal.replace(/\D/g, '');
      // If stripping dashes/formatting allows it to fit exact maxLength (e.g. 10-digit phone in maxLength="10")
      if (digitsOnly.length === maxLength) {
        return digitsOnly;
      }
      // If 5-digit zip code in maxLength="5" (e.g. from 90210-1234)
      if (maxLength === 5 && ['zip', 'zip_code', 'postal'].includes(category) && digitsOnly.length >= 5) {
        return digitsOnly.slice(0, 5);
      }
      // If 10-digit US phone from +1 870-421-4442 (11 digits) into maxLength="10"
      if (maxLength === 10 && ['cell_phone', 'home_phone', 'work_phone', 'fax'].includes(category) && digitsOnly.length === 11 && digitsOnly.startsWith('1')) {
        return digitsOnly.slice(1);
      }
    }

    return strVal;
  }

  function dispatchInputEvents(element) {
    if (!element) return;
    try {
      element.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        cancelable: false,
        composed: true,
        inputType: 'insertReplacementText'
      }));
    } catch (_) {
      element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    }
    element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  }

  function setNativeValue(element, value) {
    if (!element) return;
    const initialType = (element.type || '').toLowerCase();
    const fillVal = formatValueForInput(element, value);

    const wasReadOnly = Boolean(element.readOnly);
    if (wasReadOnly) {
      try { element.readOnly = false; } catch (_) {}
    }

    try {
      // Find the true native prototype value setter (handles React/Angular/Vue property overrides)
      let prototype = Object.getPrototypeOf(element);
      let prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

      if (!prototypeValueSetter) {
        if (element instanceof HTMLInputElement) {
          prototypeValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        } else if (element instanceof HTMLTextAreaElement) {
          prototypeValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
        } else if (element instanceof HTMLSelectElement) {
          prototypeValueSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set;
        }
      }

      const instanceValueSetter = Object.getOwnPropertyDescriptor(element, 'value')?.set;

      if (prototypeValueSetter && instanceValueSetter !== prototypeValueSetter) {
        prototypeValueSetter.call(element, fillVal);
      } else if (instanceValueSetter) {
        instanceValueSetter.call(element, fillVal);
      } else {
        element.value = fillVal;
      }

      // If React or similar framework uses internal tracker, update it
      if (element._valueTracker) {
        try { element._valueTracker.setValue(''); } catch (_) {}
      }

      // Mechanism bypass fallback:
      // If input was type="number" and the browser rejected it (element.value is still empty despite fillVal being non-empty),
      // change type to "text" so the browser mechanism cannot block setting the value!
      if (initialType === 'number' && !element.value && value) {
        try {
          element.type = 'text';
          if (prototypeValueSetter) {
            prototypeValueSetter.call(element, value);
          } else {
            element.value = value;
          }
          if (element._valueTracker) {
            try { element._valueTracker.setValue(''); } catch (_) {}
          }
        } catch (_) {}
      }
    } catch (_) {
      try {
        element.value = fillVal;
      } catch (_) {}
    } finally {
      if (wasReadOnly) {
        try { element.readOnly = true; } catch (_) {}
      }
    }
  }

  function isSiteSpecificCategory(cat) {
    return ['site_custom', 'notes', 'textarea'].includes((cat || '').toLowerCase());
  }

  function renderSuggestions(suggestions, query) {
    ensureDropdownContainer();
    const listEl = shadowRoot.getElementById('sacList');
    const countEl = shadowRoot.getElementById('sacCount');
    const headerTitle = shadowRoot.getElementById('sacHeaderTitle');
    listEl.innerHTML = '';

    currentSuggestions = suggestions;
    selectedIndex = 0; // Default selection is index 0
    countEl.textContent = `${suggestions.length}`;

    if (!suggestions || suggestions.length === 0) {
      hideDropdown();
      return;
    }

    const isShortcodeList = suggestions.some(s => s.category === 'shortcode');
    if (headerTitle) {
      headerTitle.textContent = isShortcodeList ? '⚡ Text Expanders & Shortcodes' : 'Smart AutoComplete';
    }

    suggestions.forEach((item, index) => {
      const li = document.createElement('li');
      li.className = 'sac-item';
      li.dataset.index = index;

      const isShortcode = item.category === 'shortcode';

      if (isShortcode) {
        const triggerHtml = highlightMatch(item.text, query);
        const repVal = item.replacement || item.value || '';
        const descText = item.description || '';
        li.innerHTML = `
          <div class="sac-item-content" style="display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0;">
            <span class="sac-tag" style="background: rgba(99, 102, 241, 0.22); color: #818cf8; font-weight: 700; font-family: monospace; font-size: 13px; padding: 2px 7px; border-radius: 4px; border: 1px solid rgba(99, 102, 241, 0.45); flex-shrink: 0;">${triggerHtml}</span>
            <span style="color: #f1f5f9; font-size: 12.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 170px;" title="${escapeHtml(repVal)}">${escapeHtml(repVal)}</span>
            ${descText ? `<span class="sac-desc" style="color: #94a3b8; font-size: 11px; margin-left: auto; font-style: italic; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(descText)}">${escapeHtml(descText)}</span>` : ''}
          </div>
          <div class="sac-meta" style="margin-left: 6px; flex-shrink: 0;">
            <span style="font-size: 10px; color: #a5b4fc; background: #1e1b4b; padding: 2px 6px; border-radius: 4px; border: 1px solid #3730a3; font-weight: 600;">↵ expand</span>
          </div>
        `;
      } else {
        const categoryTag = (item.category || 'general').replace(/_/g, ' ');
        const isPinned = item.pinned ? '<span class="sac-pin-icon" title="Pinned Favorite">★</span>' : '';
        const freqText = item.count > 1 ? `<span class="sac-freq">${item.count}×</span>` : '';
        const descHtml = item.description 
          ? `<span class="sac-desc" style="color: #94a3b8; font-size: 11px; margin-left: 8px; font-weight: normal;">${escapeHtml(item.description)}</span>` 
          : '';
        const delBtnHtml = `<button class="sac-del-btn" data-id="${item.id}" title="Delete this suggestion">✕</button>`;

        // Site-specific badge: ONLY if the item is an unclassified/site-specific category!
        let siteBadge = '';
        if (isSiteSpecificCategory(item.category)) {
          if (item.url && item.url === window.location.href) {
            siteBadge = '<span class="sac-site-badge" title="Saved specifically for this page">📌 This page</span>';
          } else if (item.hostname) {
            siteBadge = `<span class="sac-site-badge" title="Saved for ${escapeHtml(item.hostname)}">🌐 ${escapeHtml(item.hostname)}</span>`;
          }
        }

        li.innerHTML = `
          <div class="sac-item-content">
            <span class="sac-tag">${escapeHtml(categoryTag)}</span>
            ${siteBadge}
            <span class="sac-text">${highlightMatch(item.text, query)}</span>
            ${descHtml}
          </div>
          <div class="sac-meta">
            ${isPinned}
            ${freqText}
            ${delBtnHtml}
          </div>
        `;
      }

      li.addEventListener('mouseenter', () => {
        selectedIndex = index;
        updateActiveHighlight();
      });

      li.addEventListener('click', (e) => {
        if (e.target.closest('.sac-del-btn')) return;
        selectSuggestion(index);
      });

      const delBtn = li.querySelector('.sac-del-btn');
      if (delBtn) {
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          e.preventDefault();
          deleteSuggestion(item, index);
        });
      }

      listEl.appendChild(li);
    });

    dropdownEl.style.display = 'block';
    positionDropdown(activeInput);
    updateActiveHighlight();
  }

  function showDropdownForInput(input) {
    if (teardownIfInvalid() || isAutofillingPage) return;
    if (!input) return;
    const isFocused = document.activeElement === input || (input.contains && input.contains(document.activeElement));
    if (!isFocused) return;

    if (input.type === 'password') {
      hideDropdown();
      return;
    }

    let val = '';
    let textBefore = '';
    if (input.tagName && (input.tagName.toLowerCase() === 'input' || input.tagName.toLowerCase() === 'textarea')) {
      val = input.value || '';
      const startPos = typeof input.selectionStart === 'number' ? input.selectionStart : val.length;
      textBefore = val.slice(0, startPos);
    } else if (input.isContentEditable) {
      val = input.textContent || '';
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        const preRange = range.cloneRange();
        preRange.selectNodeContents(input);
        preRange.setEnd(range.endContainer, range.endOffset);
        textBefore = preRange.toString();
      } else {
        textBefore = val;
      }
    }

    // Shortcuts & Text Expanders trigger when '/' is typed at the start of field or after whitespace
    const slashMatch = textBefore.match(/(?:^|\s)(\/[a-zA-Z0-9_\-]*)$/);
    const query = slashMatch ? slashMatch[1] : val;
    const isSlashQuery = Boolean(slashMatch);

    activeInput = input;
    const fieldCategory = identifyField(input);

    if (!isSlashQuery) {
      if (isPasswordOrLoginField(input)) {
        hideDropdown();
        return;
      }
      if (fieldCategory === 'excluded') {
        hideDropdown();
        return;
      }
      if (fieldCategory === 'site_custom' && query.trim().length < 2) {
        hideDropdown();
        return;
      }
      if (!query.trim() && !isHighConfidenceField(input, fieldCategory)) {
        hideDropdown();
        return;
      }
    }
    const fieldName = input.name || input.id || input.placeholder || '';
    const fieldIdentifier = getFieldIdentifier(input);
    const requestId = ++suggestionRequestId;

    const hasShippingOnPage = Boolean(document.querySelector('[autocomplete*="shipping" i], [id*="ship" i], [name*="ship" i], [class*="ship" i], [id*="delivery" i], [name*="delivery" i]'));

    safeSendMessage({
      type: 'GET_SUGGESTIONS',
      query,
      fieldCategory,
      fieldGroup: detectAddressGroup(input) || getAutocompleteInfo(input).group,
      fieldName,
      fieldIdentifier,
      hasShippingOnPage,
      url: window.location.href,
      path: window.location.origin + window.location.pathname,
      hostname: window.location.hostname
    }, (res) => {
      if (!res || !res.suggestions) return;
      if (isAutofillingPage || document.activeElement !== input) return;
      if (requestId === suggestionRequestId && activeInput === input) {
        renderSuggestions(res.suggestions, query);
      }
    });
  }

  function isHighConfidenceField(el, category) {
    if (!category || category === 'excluded' || category === 'general') return false;
    // Any recognized standard profile category (title, names, email, phone, address, etc.)
    // is high-confidence and should offer its saved suggestions immediately on click/focus!
    if (category !== 'site_custom') return true;
    const semantic = getAutocompleteInfo(el);
    if (semantic.category) return true;
    const type = (el.type || '').toLowerCase();
    if (['email', 'tel', 'url'].includes(type)) return true;
    return false;
  }

  function hideDropdown() {
    if (dropdownEl) {
      dropdownEl.style.display = 'none';
    }
    selectedIndex = -1;
    currentSuggestions = [];
  }

  // --- Inline Ghost Text Completion (Deterministic, Zero-AI) ---

  function updateGhostText(input) {
    if (!ghostTextEnabled || isDomainPaused || !input || isPasswordOrLoginField(input)) {
      hideGhostText();
      return;
    }
    const tag = (input.tagName || '').toLowerCase();
    if (tag !== 'input' && tag !== 'textarea') {
      hideGhostText();
      return;
    }
    const val = input.value || '';
    if (val.trim().length < 2 || val.startsWith('/')) {
      hideGhostText();
      return;
    }
    if (typeof input.selectionStart === 'number' && input.selectionStart !== val.length) {
      hideGhostText();
      return;
    }

    // Check if we already have matching suggestions cached
    if (currentSuggestions && currentSuggestions.length > 0) {
      const match = currentSuggestions.find(s => s.text && s.text.toLowerCase().startsWith(val.toLowerCase()) && s.text.toLowerCase() !== val.toLowerCase());
      if (match) {
        const completion = match.text.slice(val.length);
        activeGhostSuggestion = { text: match.text, input, completion };
        showGhostText(input, completion, match.text);
        return;
      }
    }

    const fieldCategory = identifyField(input);
    if (fieldCategory === 'excluded') {
      hideGhostText();
      return;
    }

    safeSendMessage({
      type: 'GET_SUGGESTIONS',
      query: val,
      fieldCategory,
      fieldGroup: detectAddressGroup(input) || getAutocompleteInfo(input).group,
      fieldName: input.name || input.id || input.placeholder || '',
      fieldIdentifier: getFieldIdentifier(input),
      url: window.location.href,
      path: window.location.origin + window.location.pathname,
      hostname: window.location.hostname
    }, (res) => {
      if (!res || !res.suggestions || res.suggestions.length === 0) {
        hideGhostText();
        return;
      }
      const match = res.suggestions.find(s => s.text && s.text.toLowerCase().startsWith(val.toLowerCase()) && s.text.toLowerCase() !== val.toLowerCase());
      if (match && activeInput === input && (input.value || '') === val) {
        const completion = match.text.slice(val.length);
        activeGhostSuggestion = { text: match.text, input, completion };
        showGhostText(input, completion, match.text);
      } else {
        hideGhostText();
      }
    });
  }

  function showGhostText(input, completion, fullText) {
    ensureDropdownContainer();
    if (!ghostPillEl && shadowRoot) {
      ghostPillEl = shadowRoot.getElementById('sacGhostPill');
    }
    if (!ghostPillEl || !input) return;

    const rect = input.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;

    ghostPillEl.innerHTML = `
      <span class="sac-ghost-key">Tab ⇥</span>
      <span>complete:</span>
      <span class="sac-ghost-completion">${escapeHtml(completion)}</span>
    `;

    // Position subtly at the right/top of the input field
    const pillTop = Math.round(rect.top - 28 < 4 ? rect.bottom + 4 : rect.top - 28);
    const pillLeft = Math.min(window.innerWidth - 220, Math.max(8, Math.round(rect.left + Math.min(rect.width * 0.35, 160))));

    ghostPillEl.style.top = `${pillTop}px`;
    ghostPillEl.style.left = `${pillLeft}px`;
    ghostPillEl.style.display = 'inline-flex';
  }

  function hideGhostText() {
    if (ghostPillEl) {
      ghostPillEl.style.display = 'none';
    }
    activeGhostSuggestion = null;
  }

  function handleGhostKeyDown(e, el) {
    if (!activeGhostSuggestion || activeGhostSuggestion.input !== el) return false;

    if (e.key === 'Tab' || (e.key === 'ArrowRight' && el.selectionStart === el.value.length)) {
      e.preventDefault();
      e.stopPropagation();
      const fullText = activeGhostSuggestion.text;
      hideGhostText();
      setNativeValue(el, fullText);
      dispatchInputEvents(el);
      hideDropdown();
      return true;
    }

    if (e.key === 'Escape') {
      hideGhostText();
      return false;
    }

    return false;
  }

  // --- Instant Shortcode Expander (Text Blaze Style) ---

  function checkSnippetExpansion(element) {
    if (!snippetsEnabled || isDomainPaused || !element) return;
    if (element.type === 'password') return;

    let textBeforeCursor = '';
    let startPos = 0;

    if (element.tagName && (element.tagName.toLowerCase() === 'input' || element.tagName.toLowerCase() === 'textarea')) {
      startPos = typeof element.selectionStart === 'number' ? element.selectionStart : (element.value || '').length;
      textBeforeCursor = (element.value || '').slice(0, startPos);
    } else if (element.isContentEditable) {
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) return;
      const range = sel.getRangeAt(0);
      const preRange = range.cloneRange();
      preRange.selectNodeContents(element);
      preRange.setEnd(range.endContainer, range.endOffset);
      textBeforeCursor = preRange.toString();
    }

    // Look for slash trigger command (e.g. /handle, /email, /addr, /today, /date, /phone, /name, /shrug)
    const match = textBeforeCursor.match(/(?:^|\s)(\/[a-zA-Z0-9_\-]+)\s?$/);
    if (!match) return;

    const fullMatched = match[0];
    const trigger = match[1].toLowerCase();

    safeSendMessage({ type: 'RESOLVE_SNIPPET', trigger }, (res) => {
      if (res && res.found) {
        if (res.expandedText) {
          expandSnippet(element, fullMatched, res.expandedText, trigger);
        } else {
          showAutofillToast(0, `⚠️ No configured value for ${trigger}`);
        }
      }
    });
  }

  function expandSnippet(element, matchedText, replacement, triggerName) {
    const cleanTrigger = (triggerName || matchedText || '').trim();

    if (element.tagName && (element.tagName.toLowerCase() === 'input' || element.tagName.toLowerCase() === 'textarea')) {
      const val = element.value || '';
      const start = typeof element.selectionStart === 'number' ? element.selectionStart : val.length;
      const textBefore = val.slice(0, start);

      const lastIdx = textBefore.toLowerCase().lastIndexOf(cleanTrigger.toLowerCase());

      if (lastIdx !== -1) {
        const before = val.slice(0, lastIdx);
        const after = val.slice(start);
        const newVal = before + replacement + after;
        setNativeValue(element, newVal);
        const newPos = before.length + replacement.length;
        try {
          element.selectionStart = element.selectionEnd = newPos;
        } catch (_) {}
        dispatchInputEvents(element);
        hideDropdown();
        hideGhostText();
        showAutofillToast(1, `⚡ Expanded ${cleanTrigger}`);
      }
    } else if (element.isContentEditable) {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        const textNode = range.endContainer;

        if (textNode && textNode.nodeType === Node.TEXT_NODE) {
          const textVal = textNode.nodeValue || '';
          const endOffset = range.endOffset;
          const textBefore = textVal.slice(0, endOffset);
          const lastIdx = textBefore.toLowerCase().lastIndexOf(cleanTrigger.toLowerCase());

          if (lastIdx !== -1) {
            range.setStart(textNode, lastIdx);
            range.setEnd(textNode, endOffset);
            sel.removeAllRanges();
            sel.addRange(range);
          }
        }
        document.execCommand('insertText', false, replacement);
        showAutofillToast(1, `⚡ Expanded ${cleanTrigger}`);
      }
    }
  }

  function updateActiveHighlight() {
    if (!shadowRoot) return;
    const items = shadowRoot.querySelectorAll('.sac-item');
    items.forEach((item, idx) => {
      if (idx === selectedIndex) {
        item.classList.add('sac-active');
        item.scrollIntoView({ block: 'nearest' });
      } else {
        item.classList.remove('sac-active');
      }
    });
  }

  let isSelectingSuggestion = false;

  function selectSuggestion(index) {
    if (!activeInput || index < 0 || index >= currentSuggestions.length) return;
    const item = currentSuggestions[index];

    isSelectingSuggestion = true;

    // Fast shortcode replacement from dropdown menu
    if (item.category === 'shortcode' || item.replacement) {
      const rep = item.replacement !== undefined ? item.replacement : item.text;
      if (activeInput.tagName && (activeInput.tagName.toLowerCase() === 'input' || activeInput.tagName.toLowerCase() === 'textarea')) {
        const val = activeInput.value || '';
        const start = typeof activeInput.selectionStart === 'number' ? activeInput.selectionStart : val.length;
        const textBefore = val.slice(0, start);
        const match = textBefore.match(/(?:^|\s)(\/[a-zA-Z0-9_\-]*)$/);
        if (match) {
          const matchedTrigger = match[1];
          const lastIdx = textBefore.toLowerCase().lastIndexOf(matchedTrigger.toLowerCase());
          if (lastIdx !== -1) {
            const before = val.slice(0, lastIdx);
            const after = val.slice(start);
            const newVal = before + rep + after;
            setNativeValue(activeInput, newVal);
            const newPos = before.length + rep.length;
            try {
              activeInput.selectionStart = activeInput.selectionEnd = newPos;
            } catch (_) {}
          } else {
            setNativeValue(activeInput, rep);
          }
        } else {
          setNativeValue(activeInput, rep);
        }
        dispatchInputEvents(activeInput);
      } else if (activeInput.isContentEditable) {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          const textNode = range.endContainer;
          if (textNode && textNode.nodeType === Node.TEXT_NODE) {
            const textVal = textNode.nodeValue || '';
            const endOffset = range.endOffset;
            const textBefore = textVal.slice(0, endOffset);
            const match = textBefore.match(/(?:^|\s)(\/[a-zA-Z0-9_\-]*)$/);
            if (match) {
              const matchedTrigger = match[1];
              const lastIdx = textBefore.toLowerCase().lastIndexOf(matchedTrigger.toLowerCase());
              if (lastIdx !== -1) {
                range.setStart(textNode, lastIdx);
                range.setEnd(textNode, endOffset);
                sel.removeAllRanges();
                sel.addRange(range);
              }
            }
          }
          document.execCommand('insertText', false, rep);
        }
      }
      setTimeout(() => { isSelectingSuggestion = false; }, 150);
      hideDropdown();
      hideGhostText();
      showAutofillToast(1, `⚡ Expanded ${item.text}`);
      if (activeInput && typeof activeInput.focus === 'function') {
        activeInput.focus();
      }
      return;
    }

    setNativeValue(activeInput, item.text);
    dispatchInputEvents(activeInput);
    activeInput.dataset.sacAutofilled = 'true';
    activeInput.dataset.sacFilledValue = item.text;
    activeInput.dataset.sacUserCleared = 'false';
    activeInput.dataset.sacUserModified = 'false';
    activeInput.dataset.sacSkipAutofill = 'false';
    activeInput.dataset.sacFillAttempts = '1';
    setTimeout(() => { isSelectingSuggestion = false; }, 150);

    const cat = item.category || identifyField(activeInput);
    const fieldGroup = detectAddressGroup(activeInput) || getAutocompleteInfo(activeInput).group;
    const isSite = isSiteSpecificCategory(cat) || Boolean(fieldGroup);

    // Update usage tracking with site context ONLY if unclassified/site-specific!
    safeSendMessage({
      type: 'SAVE_ENTRY',
      text: item.text,
      category: cat,
      url: isSite ? window.location.href : '',
      path: isSite ? (window.location.origin + window.location.pathname) : '',
      hostname: isSite ? window.location.hostname : '',
      fieldIdentifier: isSite ? getFieldIdentifier(activeInput) : '',
      fieldGroup
    });

    hideDropdown();
  }

  function deleteSuggestion(item, index) {
    safeSendMessage({
      type: 'DELETE_ENTRY',
      id: item.id,
      text: item.text
    }, () => {
      currentSuggestions.splice(index, 1);
      const query = activeInput ? activeInput.value : '';
      renderSuggestions(currentSuggestions, query);
      if (activeInput) activeInput.focus();
    });
  }

  function handleKeyDown(e) {
    if (teardownIfInvalid()) return;
    if (!dropdownEl || dropdownEl.style.display !== 'block' || currentSuggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation();
      selectedIndex = (selectedIndex + 1) % currentSuggestions.length;
      updateActiveHighlight();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      selectedIndex = (selectedIndex - 1 + currentSuggestions.length) % currentSuggestions.length;
      updateActiveHighlight();
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      const idx = selectedIndex >= 0 ? selectedIndex : 0;
      if (idx >= 0 && idx < currentSuggestions.length) {
        e.preventDefault();
        e.stopPropagation();
        selectSuggestion(idx);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      hideDropdown();
    }
  }

  // Save values from submitted forms only when the user opts in.
  function saveCurrentValue(input) {
    if (teardownIfInvalid() || !captureSubmittedValues) return;
    if (!input) return;
    if (input.type === 'hidden' || input.disabled || input.readOnly) return;
    if (isBotOrSecurityTokenField(input)) return;

    // Check if element is visually hidden (honeypot trap)
    if (input.offsetParent === null && input.type !== 'hidden') return;

    const value = (input.value || '').trim();
    if (!value || value.length < 1) return;

    const category = identifyField(input);
    if (category === 'excluded' || category === 'age' || category === 'site_custom') return;

    // Reject non-email values (such as CSRF tokens, hash strings, or bot nonces)
    if (category === 'email' && !isValidEmail(value)) return;

    // Reject non-phone strings
    if (['cell_phone', 'home_phone', 'work_phone', 'fax'].includes(category)) {
      if (value.replace(/\D/g, '').length < 7) return;
    }

    const fieldGroup = detectAddressGroup(input) || getAutocompleteInfo(input).group;
    const isSite = isSiteSpecificCategory(category) || Boolean(fieldGroup);

    safeSendMessage({
      type: 'SAVE_ENTRY',
      text: value,
      category,
      url: isSite ? window.location.href : '',
      path: isSite ? (window.location.origin + window.location.pathname) : '',
      hostname: isSite ? window.location.hostname : '',
      fieldIdentifier: isSite ? getFieldIdentifier(input) : '',
      fieldGroup
    });
  }

  // Attach handlers to an input element
  function attachToElement(el) {
    if (teardownIfInvalid() || isDomainPaused) return;
    if (el.type === 'password') return;
    if (el.dataset.sacAttached) return;
    el.dataset.sacAttached = 'true';

    const handleUserEdit = () => {
      if (isAutofillingPage || isSelectingSuggestion) return;
      const curVal = (el.value || '').trim();
      const filledVal = (el.dataset.sacFilledValue || '').trim();

      if (el.dataset.sacAutofilled === 'true' || filledVal) {
        if (curVal !== filledVal) {
          el.dataset.sacUserCleared = curVal.length === 0 ? 'true' : 'false';
          el.dataset.sacUserModified = 'true';
          el.dataset.sacSkipAutofill = 'true';
          el.dataset.sacAutofilled = 'false';
        }
      } else if (curVal.length > 0) {
        el.dataset.sacUserModified = 'true';
      } else if (el.dataset.sacUserModified === 'true' && curVal.length === 0) {
        el.dataset.sacUserCleared = 'true';
        el.dataset.sacSkipAutofill = 'true';
      }
    };

    if (el.tagName.toLowerCase() === 'select') {
      el.addEventListener('change', () => {
        handleUserEdit();
        if (teardownIfInvalid() || isDomainPaused) return;
        saveCurrentValue(el);
      });
      return;
    }

    el.addEventListener('focus', () => {
      if (teardownIfInvalid() || isDomainPaused) return;
      showDropdownForInput(el);
      updateGhostText(el);
    });

    el.addEventListener('click', () => {
      if (teardownIfInvalid() || isDomainPaused) return;
      showDropdownForInput(el);
      updateGhostText(el);
    });

    el.addEventListener('input', () => {
      handleUserEdit();
      if (teardownIfInvalid() || isDomainPaused || isSelectingSuggestion || isAutofillingPage) return;
      showDropdownForInput(el);
      updateGhostText(el);
      checkSnippetExpansion(el);
    });

    el.addEventListener('keydown', (e) => {
      if (handleGhostKeyDown(e, el)) return;
      handleKeyDown(e);
    });

    el.addEventListener('change', () => {
      handleUserEdit();
      if (teardownIfInvalid() || isDomainPaused || isAutofillingPage) return;
      if (el.value && el.value.trim().length >= 1) {
        saveCurrentValue(el);
      }
    });

    el.addEventListener('blur', () => {
      handleUserEdit();
      hideGhostText();
      setTimeout(() => {
        if (teardownIfInvalid()) return;
        if (!isInteractingWithDropdown) {
          if (activeInput === el) {
            hideDropdown();
            activeInput = null;
          }
        }
      }, 150);
      if (el.value && el.value.trim().length >= 1) {
        saveCurrentValue(el);
      }
    });
  }

  // Scan page for interactive elements
  function scanPage() {
    if (teardownIfInvalid()) return;

    safeSendMessage({ type: 'GET_SETTINGS' }, (res) => {
      if (res && res.settings) {
        const s = res.settings;
        captureSubmittedValues = Boolean(s.captureSubmittedValues);
        snippetsEnabled = s.snippetsEnabled !== false;
        ghostTextEnabled = s.ghostTextEnabled !== false;

        const disabledDomains = Array.isArray(s.disabledDomains) ? s.disabledDomains : [];
        const currentHost = window.location.hostname.toLowerCase();
        isDomainPaused = disabledDomains.some(d => currentHost === d || currentHost.endsWith('.' + d));

        if (isDomainPaused) {
          hideDropdown();
          hideGhostText();
          return;
        }

        const selector = 'input:not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="hidden"]):not([type="file"]):not([type="range"]):not([type="color"]):not([type="checkbox"]):not([type="radio"]):not([type="password"]), select, textarea';
        const elements = document.querySelectorAll(selector);
        elements.forEach(attachToElement);

        // Auto-fill on page load & dynamic SPA / modal hydration (Default: ON per user request)
        const shouldAutofill = s.autoFillOnLoad !== false;
        if (shouldAutofill) {
          clearTimeout(autofillDebounceTimer);
          autofillDebounceTimer = setTimeout(() => {
            autoFillEntirePage(false);
          }, hasAutoFilledPage ? 80 : 250);

          if (!hasAutoFilledPage) {
            hasAutoFilledPage = true;
            // Secondary attempt for dynamic SPAs that render inputs shortly after initial load
            setTimeout(() => autoFillEntirePage(false), 900);
          }
        }
      }
    });
  }

  // Support snippets inside rich-text contenteditable areas and standard text inputs globally
  document.addEventListener('input', (e) => {
    if (teardownIfInvalid() || isDomainPaused) return;
    const target = e.target;
    if (target && (target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
      if (target.type === 'password') return;
      if (!target.dataset.sacAttached) {
        attachToElement(target);
      }

      // Check for inline slash command suggestion trigger (only if '/' is first char)
      const val = target.isContentEditable ? (target.textContent || '') : (target.value || '');
      const startPos = (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') && typeof target.selectionStart === 'number'
        ? target.selectionStart
        : val.length;
      const textBefore = val.slice(0, startPos);
      if (/(?:^|\s)(\/[a-zA-Z0-9_\-]*)$/.test(textBefore)) {
        activeInput = target;
        showDropdownForInput(target);
      }

      if (snippetsEnabled) {
        checkSnippetExpansion(target);
      }
    }
  }, true);

  // Auto-attach to newly focused fields in dynamic pages
  document.addEventListener('focusin', (e) => {
    if (teardownIfInvalid() || isDomainPaused) return;
    const target = e.target;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) {
      if (target.type !== 'password' && !target.dataset.sacAttached) {
        attachToElement(target);
      }
    }
  }, true);

  // Global capture for keyboard navigation in dropdown across all element types
  document.addEventListener('keydown', (e) => {
    if (!dropdownEl || dropdownEl.style.display !== 'block' || currentSuggestions.length === 0) return;
    if (['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(e.key)) {
      handleKeyDown(e);
    }
  }, true);

  // Track form submits to record usage
  document.addEventListener('submit', (e) => {
    if (teardownIfInvalid() || isDomainPaused) return;
    const form = e.target;
    if (!form || !form.elements) return;
    if (!captureSubmittedValues) return;
    for (let i = 0; i < form.elements.length; i++) {
      const el = form.elements[i];
      if (el && el.value) {
        saveCurrentValue(el);
      }
    }
  }, true);

  if (chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      const settings = areaName === 'local' && changes.settings
        ? changes.settings.newValue
        : null;
      if (settings) {
        captureSubmittedValues = Boolean(settings.captureSubmittedValues);
        snippetsEnabled = settings.snippetsEnabled !== false;
        ghostTextEnabled = settings.ghostTextEnabled !== false;
        const wasPaused = isDomainPaused;
        const disabledDomains = Array.isArray(settings.disabledDomains) ? settings.disabledDomains : [];
        const currentHost = window.location.hostname.toLowerCase();
        isDomainPaused = disabledDomains.some(d => currentHost === d || currentHost.endsWith('.' + d));
        if (isDomainPaused) {
          hideDropdown();
          hideGhostText();
        } else if (wasPaused) {
          scanPage();
        }
      }
    });
  }

  // Initial scan
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scanPage);
  } else {
    scanPage();
  }

  // Watch for dynamically rendered inputs (SPAs like React / Angular / Vue) with quiet-window debounce
  let mutationDebounceTimer = null;
  observer = new MutationObserver((mutations) => {
    if (teardownIfInvalid() || isDomainPaused) return;

    let hasRelevantNodes = false;
    for (const m of mutations) {
      if (m.type === 'childList' && m.addedNodes && m.addedNodes.length > 0) {
        for (const node of m.addedNodes) {
          if (node.nodeType === 1) {
            if ((node.matches && node.matches('input, select, textarea, form, dialog, [role="dialog"], [class*="modal"]')) ||
                (node.querySelector && node.querySelector('input, select, textarea'))) {
              hasRelevantNodes = true;
              break;
            }
          }
        }
      } else if (m.type === 'attributes') {
        const target = m.target;
        if (target && target.nodeType === 1) {
          if ((target.matches && target.matches('input, select, textarea, form, dialog, [role="dialog"], [class*="modal"]')) ||
              (target.querySelector && target.querySelector('input, select, textarea'))) {
            hasRelevantNodes = true;
            break;
          }
        }
      }
      if (hasRelevantNodes) break;
    }

    if (!hasRelevantNodes) return;

    clearTimeout(mutationDebounceTimer);
    mutationDebounceTimer = setTimeout(() => {
      scanPage();
    }, 120);
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'hidden', 'open']
  });

  // Reposition on scroll and resize
  window.addEventListener('scroll', () => {
    if (teardownIfInvalid() || isDomainPaused) return;
    if (activeInput && dropdownEl && dropdownEl.style.display === 'block') {
      positionDropdown(activeInput);
    }
  }, { passive: true });

  window.addEventListener('resize', () => {
    if (teardownIfInvalid() || isDomainPaused) return;
    if (activeInput && dropdownEl && dropdownEl.style.display === 'block') {
      positionDropdown(activeInput);
    }
  }, { passive: true });

  // Hide on click outside
  document.addEventListener('click', (e) => {
    if (teardownIfInvalid()) return;
    if (isInteractingWithDropdown) return;
    const clickedInput = e.target && e.target.closest ? e.target.closest('input, textarea') : null;
    if (clickedInput && clickedInput === activeInput) return;
    if (e.target !== activeInput && (!shadowRoot || !shadowRoot.contains(e.target))) {
      hideDropdown();
      hideGhostText();
    }
  });

  // Listen for manual trigger from Context Menu or Popup button
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message) return;

    if (message.type === 'TRIGGER_AUTOFILL') {
      const force = Boolean(message.force);
      autoFillEntirePage(force);
      sendResponse({ success: true });
      return true;
    }

    return true;
  });

})();
