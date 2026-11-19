// options.js - Dashboard, Harvester & Database Manager

document.addEventListener('DOMContentLoaded', () => {
  let allEntries = [];
  let currentCategoryFilter = 'all';

  // UI Elements
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');
  const totalBadge = document.getElementById('totalBadge');
  const statusToast = document.getElementById('statusToast');

  // Manager Elements
  const entriesTableBody = document.getElementById('entriesTableBody');
  const tableSearch = document.getElementById('tableSearch');
  const filterPills = document.querySelectorAll('.filter-pill');
  const addEntryText = document.getElementById('addEntryText');
  const addEntryCategory = document.getElementById('addEntryCategory');
  const addEntryBtn = document.getElementById('addEntryBtn');
  const clearAllBtn = document.getElementById('clearAllBtn');
  const cleanDuplicatesBtn = document.getElementById('cleanDuplicatesBtn');


  // Backup Elements
  const exportJsonBtn = document.getElementById('exportJsonBtn');
  const importJsonBtn = document.getElementById('importJsonBtn');
  const jsonArea = document.getElementById('jsonArea');

  // Master Profile Elements
  const autoFillOnLoadToggle = document.getElementById('autoFillOnLoadToggle');
  const inlineSuggestionsToggle = document.getElementById('inlineSuggestionsToggle');
  const ghostTextToggle = document.getElementById('ghostTextToggle');
  const snippetsToggle = document.getElementById('snippetsToggle');
  const captureSubmittedValuesToggle = document.getElementById('captureSubmittedValuesToggle');
  const saveMasterProfileBtn = document.getElementById('saveMasterProfileBtn');
  const saveMasterProfileBtnBottom = document.getElementById('saveMasterProfileBtnBottom');

  // Snippets Elements
  const snippetsTableBody = document.getElementById('snippetsTableBody');
  const newSnippetTrigger = document.getElementById('newSnippetTrigger');
  const newSnippetValue = document.getElementById('newSnippetValue');
  const newSnippetDesc = document.getElementById('newSnippetDesc');
  const addSnippetBtn = document.getElementById('addSnippetBtn');
  const resetSnippetsBtn = document.getElementById('resetSnippetsBtn');

  // Site Rules Elements
  const newDomainInput = document.getElementById('newDomainInput');
  const addDisabledDomainBtn = document.getElementById('addDisabledDomainBtn');
  const disabledDomainsList = document.getElementById('disabledDomainsList');

  // Address Elements
  const saveAddressesBtn = document.getElementById('saveAddressesBtn');
  const saveAddressesBtnBottom = document.getElementById('saveAddressesBtnBottom');
  const billingSameAsShippingToggle = document.getElementById('billingSameAsShippingToggle');
  const billingFieldsContainer = document.getElementById('billingFieldsContainer');
  const goToAddressesTabBtn = document.getElementById('goToAddressesTabBtn');

  const PROFILE_FIELDS = [
    'title', 'first_name', 'middle_name', 'middle_initial', 'last_name', 'full_name',
    'sex', 'dob', 'dob_month', 'dob_day', 'dob_year', 'age', 'birth_place',
    'user_id',
    'email', 'cell_phone', 'home_phone', 'work_phone', 'fax', 'website',
    'company', 'position', 'income',
    'social_security_number', 'driver_license_number'
  ];

  const ADDRESS_FIELDS = [
    'address_line_1', 'address_line_2', 'city', 'state', 'zip', 'zip4', 'country'
  ];

  function isValidEmail(email) {
    if (!email || typeof email !== 'string') return false;
    const trimmed = email.trim();
    return /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/.test(trimmed);
  }

  // Populate Master Profile inputs from stored entries
  function populateMasterProfile() {
    PROFILE_FIELDS.forEach(field => {
      const input = document.getElementById(`prof_${field}`);
      if (!input) return;

      // Find highest ranked entry for this field category
      const matches = allEntries.filter(e => {
        if ((e.category || '').toLowerCase() !== field) return false;
        if (field === 'email' && !isValidEmail(e.text)) return false;
        return true;
      });
      if (matches.length > 0) {
        matches.sort((a, b) => ((b.count || 1) + (b.pinned ? 50 : 0)) - ((a.count || 1) + (a.pinned ? 50 : 0)));
        input.value = matches[0].text;
      } else if (field === 'user_id') {
        const confliction = allEntries.find(e => (e.text || '').toLowerCase() === 'xconflictionx');
        if (confliction) input.value = confliction.text;
      }
    });

    // Auto-derive Middle Initial from Middle Name if initial is missing or full word:
    const miInput = document.getElementById('prof_middle_initial');
    const mnInput = document.getElementById('prof_middle_name');
    const fnInput = document.getElementById('prof_first_name');
    const lnInput = document.getElementById('prof_last_name');
    const fullInput = document.getElementById('prof_full_name');

    if (miInput && mnInput && mnInput.value.trim()) {
      if (!miInput.value.trim() || miInput.value.trim().length > 1) {
        miInput.value = mnInput.value.trim().charAt(0).toUpperCase();
      }
    }

    if (fullInput && fullInput.value.trim()) {
      const parts = cleanNameWords(fullInput.value);
      if (fnInput && !fnInput.value.trim() && parts.length > 0) {
        fnInput.value = parts[0];
      }
      if (miInput && !miInput.value.trim() && parts.length >= 3) {
        miInput.value = parts[1].charAt(0).toUpperCase();
      }
      if (lnInput && !lnInput.value.trim() && parts.length > 1) {
        lnInput.value = parts[parts.length - 1];
      }
    }

    // Auto-split ZIP if full ZIP+4 is in prof_zip
    const zipInput = document.getElementById('prof_zip');
    const zip4Input = document.getElementById('prof_zip4');
    if (zipInput && zip4Input && zipInput.value) {
      const mZip = zipInput.value.trim().match(/^(\d{5})[-\s]?(\d{4})$/);
      if (mZip) {
        zipInput.value = mZip[1];
        if (!zip4Input.value) zip4Input.value = mZip[2];
      }
    }
  }

  function cleanNameWords(str) {
    if (!str || typeof str !== 'string') return [];
    const titles = ['mr', 'mrs', 'ms', 'miss', 'dr', 'prof', 'rev', 'sir', 'madam', 'lord', 'lady'];
    const raw = str.trim().split(/\s+/);
    const parts = [];
    for (let i = 0; i < raw.length; i++) {
      const clean = raw[i].replace(/[.,]/g, '').toLowerCase();
      if (i === 0 && titles.includes(clean)) continue;
      parts.push(raw[i].replace(/[.,]/g, ''));
    }
    return parts;
  }

  // Save Master Profile
  function handleSaveMasterProfile() {
    // If middle name is provided and middle initial is empty or full word, take first letter!
    const miInput = document.getElementById('prof_middle_initial');
    const mnInput = document.getElementById('prof_middle_name');
    if (miInput && mnInput && mnInput.value.trim()) {
      if (!miInput.value.trim() || miInput.value.trim().length > 1) {
        miInput.value = mnInput.value.trim().charAt(0).toUpperCase();
      }
    }

    const fnInput = document.getElementById('prof_first_name');
    const fullInput = document.getElementById('prof_full_name');
    if (fnInput && !fnInput.value.trim() && fullInput && fullInput.value.trim()) {
      const parts = cleanNameWords(fullInput.value);
      if (parts.length > 0) fnInput.value = parts[0];
    }

    // Auto-split ZIP if typed as 12345-6789 or 123456789
    const zipInput = document.getElementById('prof_zip');
    const zip4Input = document.getElementById('prof_zip4');
    if (zipInput && zip4Input && zipInput.value.trim()) {
      const mZip = zipInput.value.trim().match(/^(\d{5})[-\s]?(\d{4})$/);
      if (mZip) {
        zipInput.value = mZip[1];
        if (!zip4Input.value.trim()) zip4Input.value = mZip[2];
      }
    }

    const profile = {};
    let count = 0;

    for (let i = 0; i < PROFILE_FIELDS.length; i++) {
      const field = PROFILE_FIELDS[i];
      const input = document.getElementById(`prof_${field}`);
      if (!input) continue;
      const val = input.value.trim();
      if (field === 'email' && val && !isValidEmail(val)) {
        showToast('Please enter a valid email address (e.g. user@example.com).', 'error');
        input.focus();
        return;
      }
      profile[field] = val; // Preserves explicit '' so backend purges deleted/empty fields
      if (val) {
        count++;
      }
    }

    if (count === 0) {
      showToast('Please enter at least one profile value.', 'error');
      return;
    }

    chrome.runtime.sendMessage({
      type: 'SAVE_FULL_PROFILE',
      profile
    }, (res) => {
      showToast(`Saved ${count} Master Profile fields! Autofill ready.`);
      loadData();
    });
  }

  if (saveMasterProfileBtn) saveMasterProfileBtn.addEventListener('click', handleSaveMasterProfile);
  if (saveMasterProfileBtnBottom) saveMasterProfileBtnBottom.addEventListener('click', handleSaveMasterProfile);

  // Live synchronizers between related profile fields
  const profMn = document.getElementById('prof_middle_name');
  const profMi = document.getElementById('prof_middle_initial');
  if (profMn && profMi) {
    profMn.addEventListener('input', () => {
      const val = profMn.value.trim();
      if (val && (!profMi.value.trim() || profMi.value.trim().length <= 1)) {
        profMi.value = val.charAt(0).toUpperCase();
      }
    });
  }

  const profFull = document.getElementById('prof_full_name');
  const profFn = document.getElementById('prof_first_name');
  if (profFull && profFn) {
    profFull.addEventListener('input', () => {
      const parts = cleanNameWords(profFull.value);
      if (parts.length > 0 && !profFn.value.trim()) {
        profFn.value = parts[0];
      }
    });
  }

  const liveProfZip = document.getElementById('prof_zip');
  const liveProfZip4 = document.getElementById('prof_zip4');
  if (liveProfZip && liveProfZip4) {
    liveProfZip.addEventListener('input', () => {
      const m = liveProfZip.value.trim().match(/^(\d{5})[-\s]?(\d{4})$/);
      if (m) {
        liveProfZip.value = m[1];
        liveProfZip4.value = m[2];
      }
    });
  }

  if (autoFillOnLoadToggle) {
    autoFillOnLoadToggle.addEventListener('change', () => {
      chrome.runtime.sendMessage({
        type: 'UPDATE_SETTINGS',
        settings: { autoFillOnLoad: autoFillOnLoadToggle.checked }
      }, () => {
        showToast(autoFillOnLoadToggle.checked ? 'Auto-fill on page load enabled' : 'Auto-fill on page load disabled');
      });
    });
  }

  if (inlineSuggestionsToggle) {
    inlineSuggestionsToggle.addEventListener('change', () => {
      chrome.runtime.sendMessage({
        type: 'UPDATE_SETTINGS',
        settings: { enabled: inlineSuggestionsToggle.checked }
      }, () => showToast(inlineSuggestionsToggle.checked ? 'Inline suggestions enabled' : 'Inline suggestions disabled'));
    });
  }

  if (ghostTextToggle) {
    ghostTextToggle.addEventListener('change', () => {
      chrome.runtime.sendMessage({
        type: 'UPDATE_SETTINGS',
        settings: { ghostTextEnabled: ghostTextToggle.checked }
      }, () => showToast(ghostTextToggle.checked ? 'Inline ghost text completion enabled' : 'Ghost text disabled'));
    });
  }

  if (snippetsToggle) {
    snippetsToggle.addEventListener('change', () => {
      chrome.runtime.sendMessage({
        type: 'UPDATE_SETTINGS',
        settings: { snippetsEnabled: snippetsToggle.checked }
      }, () => showToast(snippetsToggle.checked ? 'Instant shortcode expansion enabled' : 'Shortcode expansion disabled'));
    });
  }

  if (captureSubmittedValuesToggle) {
    captureSubmittedValuesToggle.addEventListener('change', () => {
      chrome.runtime.sendMessage({
        type: 'UPDATE_SETTINGS',
        settings: { captureSubmittedValues: captureSubmittedValuesToggle.checked }
      }, () => showToast(captureSubmittedValuesToggle.checked ? 'Submitted form values will be remembered' : 'Automatic value capture disabled'));
    });
  }

  // Toast Helper
  function showToast(message, type = 'success') {
    statusToast.textContent = message;
    statusToast.style.borderColor = type === 'error' ? '#ef4444' : '#0ea5e9';
    statusToast.style.display = 'block';
    setTimeout(() => {
      statusToast.style.display = 'none';
    }, 3500);
  }

  const swapAddressDefaultsBtn = document.getElementById('swapAddressDefaultsBtn');
  const addressWarningBanner = document.getElementById('addressWarningBanner');
  const addressWarningText = document.getElementById('addressWarningText');

  // Check and warn if default home, shipping, or billing is set on multiple addresses
  function validateAddressDefaults() {
    if (!addressWarningBanner || !addressWarningText) return;
    const a1Home = document.getElementById('addr1_isDefaultHome')?.checked;
    const a1Ship = document.getElementById('addr1_isDefaultShipping')?.checked;
    const a1Bill = document.getElementById('addr1_isDefaultBilling')?.checked;

    const a2Home = document.getElementById('addr2_isDefaultHome')?.checked;
    const a2Ship = document.getElementById('addr2_isDefaultShipping')?.checked;
    const a2Bill = document.getElementById('addr2_isDefaultBilling')?.checked;

    const warnings = [];
    if (a1Home && a2Home) {
      warnings.push('Both Address 1 and Address 2 are marked as Default for Home (Address 1 will take priority).');
    } else if (!a1Home && !a2Home) {
      warnings.push('No address is marked as Default for Home (Address 1 will be used by default).');
    }

    if (a1Ship && a2Ship) {
      warnings.push('Both Address 1 and Address 2 are marked as Default for Shipping (Address 1 will take priority).');
    } else if (!a1Ship && !a2Ship) {
      warnings.push('No address is marked as Default for Shipping (Address 1 will be used by default).');
    }

    if (a1Bill && a2Bill) {
      warnings.push('Both Address 1 and Address 2 are marked as Default for Billing (Address 1 will take priority).');
    } else if (!a1Bill && !a2Bill) {
      warnings.push('No address is marked as Default for Billing (Address 2 will be used by default).');
    }

    if (warnings.length > 0) {
      addressWarningBanner.style.display = 'block';
      addressWarningText.textContent = warnings.join(' ');
    } else {
      addressWarningBanner.style.display = 'none';
    }
  }

  // Populate Stored Addresses & Defaults
  function populateAddresses(addresses, entries = []) {
    let addr1 = addresses?.address1;
    let addr2 = addresses?.address2;

    // Migrate from legacy format if necessary
    if (!addr1 && addresses?.shipping) {
      addr1 = {
        ...addresses.shipping,
        label: 'Address 1 (Home)',
        isDefaultShipping: true,
        isDefaultBilling: Boolean(addresses.billingSameAsShipping)
      };
      addr2 = {
        ...addresses.billing,
        label: 'Address 2 (Alternate)',
        isDefaultShipping: false,
        isDefaultBilling: !Boolean(addresses.billingSameAsShipping)
      };
    }

    addr1 = addr1 || {};
    addr2 = addr2 || {};

    const getPinnedVal = cat => {
      const match = entries.find(e => e.pinned && (e.category || '').toLowerCase() === cat);
      return match ? match.text.trim() : '';
    };

    const l1 = document.getElementById('addr1_label');
    if (l1) l1.value = addr1.label || 'Address 1 (Home)';

    const l2 = document.getElementById('addr2_label');
    if (l2) l2.value = addr2.label || 'Address 2 (Alternate)';

    const h1 = document.getElementById('addr1_isDefaultHome');
    if (h1) h1.checked = addr1.isDefaultHome !== false;

    const s1 = document.getElementById('addr1_isDefaultShipping');
    if (s1) s1.checked = addr1.isDefaultShipping !== false;

    const b1 = document.getElementById('addr1_isDefaultBilling');
    if (b1) b1.checked = Boolean(addr1.isDefaultBilling);

    const h2 = document.getElementById('addr2_isDefaultHome');
    if (h2) h2.checked = Boolean(addr2.isDefaultHome);

    const s2 = document.getElementById('addr2_isDefaultShipping');
    if (s2) s2.checked = Boolean(addr2.isDefaultShipping);

    const b2 = document.getElementById('addr2_isDefaultBilling');
    if (b2) b2.checked = addr2.isDefaultBilling !== false;

    ADDRESS_FIELDS.forEach(f => {
      const in1 = document.getElementById(`addr1_${f}`);
      if (in1) in1.value = addr1[f] !== undefined ? addr1[f] : getPinnedVal(f);

      const in2 = document.getElementById(`addr2_${f}`);
      if (in2) in2.value = addr2[f] !== undefined ? addr2[f] : '';
    });

    validateAddressDefaults();
  }

  // Save Stored Addresses & Defaults
  function handleSaveAddresses() {
    const address1 = {
      label: (document.getElementById('addr1_label')?.value || 'Address 1').trim(),
      isDefaultHome: Boolean(document.getElementById('addr1_isDefaultHome')?.checked),
      isDefaultShipping: Boolean(document.getElementById('addr1_isDefaultShipping')?.checked),
      isDefaultBilling: Boolean(document.getElementById('addr1_isDefaultBilling')?.checked)
    };
    const address2 = {
      label: (document.getElementById('addr2_label')?.value || 'Address 2').trim(),
      isDefaultHome: Boolean(document.getElementById('addr2_isDefaultHome')?.checked),
      isDefaultShipping: Boolean(document.getElementById('addr2_isDefaultShipping')?.checked),
      isDefaultBilling: Boolean(document.getElementById('addr2_isDefaultBilling')?.checked)
    };

    ADDRESS_FIELDS.forEach(f => {
      const in1 = document.getElementById(`addr1_${f}`);
      if (in1) address1[f] = in1.value.trim();

      const in2 = document.getElementById(`addr2_${f}`);
      if (in2) address2[f] = in2.value.trim();
    });

    // Auto-split ZIP if typed as 12345-6789
    const s1ZipMatch = (address1.zip || '').match(/^(\d{5})[-\s]?(\d{4})$/);
    if (s1ZipMatch) {
      address1.zip = s1ZipMatch[1];
      if (!address1.zip4) address1.zip4 = s1ZipMatch[2];
    }
    const s2ZipMatch = (address2.zip || '').match(/^(\d{5})[-\s]?(\d{4})$/);
    if (s2ZipMatch) {
      address2.zip = s2ZipMatch[1];
      if (!address2.zip4) address2.zip4 = s2ZipMatch[2];
    }

    if (!address1.address_line_1 && !address1.city && !address1.zip && !address2.address_line_1) {
      showToast('Please enter at least one address field.', 'error');
      return;
    }

    chrome.runtime.sendMessage({
      type: 'SAVE_ADDRESS_PROFILES',
      address1,
      address2
    }, (res) => {
      if (res && (res.homeWarning || res.shippingWarning || res.billingWarning)) {
        showToast('Saved! Note: multiple addresses were marked for the same default role.', 'warning');
      } else {
        showToast('Saved both addresses and defaults! Autofill ready.');
      }
      loadData();
    });
  }

  if (saveAddressesBtn) saveAddressesBtn.addEventListener('click', handleSaveAddresses);
  if (saveAddressesBtnBottom) saveAddressesBtnBottom.addEventListener('click', handleSaveAddresses);

  // Swap Defaults Button
  if (swapAddressDefaultsBtn) {
    swapAddressDefaultsBtn.addEventListener('click', () => {
      const h1 = document.getElementById('addr1_isDefaultHome');
      const s1 = document.getElementById('addr1_isDefaultShipping');
      const b1 = document.getElementById('addr1_isDefaultBilling');
      const h2 = document.getElementById('addr2_isDefaultHome');
      const s2 = document.getElementById('addr2_isDefaultShipping');
      const b2 = document.getElementById('addr2_isDefaultBilling');

      if (s1 && s2 && b1 && b2) {
        if (h1 && h2) {
          const oldH1 = h1.checked;
          h1.checked = h2.checked;
          h2.checked = oldH1;
        }
        const oldS1 = s1.checked;
        const oldB1 = b1.checked;
        s1.checked = s2.checked;
        b1.checked = b2.checked;
        s2.checked = oldS1;
        b2.checked = oldB1;
        validateAddressDefaults();
        showToast('Swapped Home, Shipping & Billing defaults between Address 1 and Address 2. Click Save to persist.');
      }
    });
  }

  // Monitor default checkboxes for live warnings
  ['addr1_isDefaultHome', 'addr1_isDefaultShipping', 'addr1_isDefaultBilling', 'addr2_isDefaultHome', 'addr2_isDefaultShipping', 'addr2_isDefaultBilling'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', validateAddressDefaults);
  });

  // Live ZIP auto-splitters for Address 1 and Address 2
  const liveAddr1Zip = document.getElementById('addr1_zip');
  const liveAddr1Zip4 = document.getElementById('addr1_zip4');
  if (liveAddr1Zip && liveAddr1Zip4) {
    liveAddr1Zip.addEventListener('input', () => {
      const m = liveAddr1Zip.value.trim().match(/^(\d{5})[-\s]?(\d{4})$/);
      if (m) {
        liveAddr1Zip.value = m[1];
        liveAddr1Zip4.value = m[2];
      }
    });
  }

  const liveAddr2Zip = document.getElementById('addr2_zip');
  const liveAddr2Zip4 = document.getElementById('addr2_zip4');
  if (liveAddr2Zip && liveAddr2Zip4) {
    liveAddr2Zip.addEventListener('input', () => {
      const m = liveAddr2Zip.value.trim().match(/^(\d{5})[-\s]?(\d{4})$/);
      if (m) {
        liveAddr2Zip.value = m[1];
        liveAddr2Zip4.value = m[2];
      }
    });
  }

  function switchTab(tabId) {
    tabButtons.forEach(b => b.classList.toggle('active', b.getAttribute('data-tab') === tabId));
    tabContents.forEach(c => c.classList.toggle('active', c.id === tabId));
  }

  // Handle hash on load (e.g. options.html#addressesTab)
  const initialHash = (window.location.hash || '').replace('#', '');
  if (initialHash && document.getElementById(initialHash)) {
    switchTab(initialHash);
  }

  if (goToAddressesTabBtn) {
    goToAddressesTabBtn.addEventListener('click', () => switchTab('addressesTab'));
  }

  // Tab Switching
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      const targetId = btn.getAttribute('data-tab');
      document.getElementById(targetId).classList.add('active');
    });
  });

  // Load Data
  function loadData() {
    chrome.runtime.sendMessage({ type: 'GET_ALL_ENTRIES' }, (res) => {
      if (chrome.runtime.lastError || !res) return;
      allEntries = res.entries || [];
      const settings = res.settings || {};
      totalBadge.textContent = allEntries.length;
      if (autoFillOnLoadToggle) {
        autoFillOnLoadToggle.checked = settings.autoFillOnLoad !== false;
      }
      if (inlineSuggestionsToggle) {
        inlineSuggestionsToggle.checked = settings.enabled !== false;
      }
      if (ghostTextToggle) {
        ghostTextToggle.checked = settings.ghostTextEnabled !== false;
      }
      if (snippetsToggle) {
        snippetsToggle.checked = settings.snippetsEnabled !== false;
      }
      if (captureSubmittedValuesToggle) {
        captureSubmittedValuesToggle.checked = settings.captureSubmittedValues !== false;
      }
      populateMasterProfile();
      populateAddresses(res.addresses, allEntries);
      renderTable();
      renderSnippets(settings.customSnippets || []);
      renderDomains(settings.disabledDomains || []);
    });
  }

  // Render Database Table
  function renderTable() {
    const search = (tableSearch.value || '').toLowerCase().trim();
    let filtered = allEntries;

    if (currentCategoryFilter !== 'all') {
      if (currentCategoryFilter === 'site_custom') {
        filtered = filtered.filter(item => Boolean(item.url || item.hostname || item.category === 'site_custom'));
      } else if (currentCategoryFilter === 'address_line_1') {
        filtered = filtered.filter(item => [
          'address_line_1', 'address', 'street_address', 'street',
          'address_line_2', 'suite', 'apt', 'unit',
          'city', 'town',
          'state', 'province', 'region',
          'zip', 'postal_code', 'zip4',
          'country'
        ].includes((item.category || '').toLowerCase()));
      } else {
        filtered = filtered.filter(item => item.category === currentCategoryFilter);
      }
    }

    if (search) {
      filtered = filtered.filter(item => item.text.toLowerCase().includes(search) || (item.hostname && item.hostname.toLowerCase().includes(search)) || (item.url && item.url.toLowerCase().includes(search)));
    }

    // Sort: pinned first, then frequency
    filtered.sort((a, b) => {
      if (a.pinned !== b.pinned) return b.pinned ? 1 : -1;
      return (b.count || 1) - (a.count || 1);
    });

    entriesTableBody.innerHTML = '';

    if (filtered.length === 0) {
      entriesTableBody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align:center; padding: 28px; color: var(--text-muted);">
            No matching entries found.
          </td>
        </tr>
      `;
      return;
    }

    filtered.forEach(item => {
      const tr = document.createElement('tr');
      const tagClass = `tag-${item.category || 'general'}`;
      const pinClass = item.pinned ? 'pin-active' : '';

      tr.innerHTML = `
        <td>
          <button class="action-icon-btn ${pinClass} btn-table-pin" data-id="${item.id}" title="${item.pinned ? 'Unpin' : 'Pin to top'}">★</button>
        </td>
        <td>
          <span class="tag-badge ${tagClass}">${item.category || 'general'}</span>
        </td>
        <td style="font-weight: 500;">
          ${escapeHtml(item.text)}
          ${item.url || item.hostname ? `
            <div style="font-size: 11px; color: #38bdf8; margin-top: 3px; display: flex; align-items: center; gap: 4px;" title="${escapeHtml(item.url || item.path || item.hostname)}">
              <span>🌐</span>
              <span style="font-family: monospace;">${escapeHtml(item.hostname || item.url)}</span>
              ${item.url ? '<span style="color: var(--text-muted); font-size: 10px;">(Page specific)</span>' : ''}
            </div>
          ` : ''}
        </td>
        <td style="color: var(--text-muted);">
          ${item.count || 1}×
        </td>
        <td style="text-align: center;">
          <button class="action-icon-btn btn-table-del" data-id="${item.id}" title="Delete entry">✕</button>
        </td>
      `;

      // Pin
      tr.querySelector('.btn-table-pin').addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'TOGGLE_PIN', id: item.id }, () => {
          loadData();
        });
      });

      // Delete
      tr.querySelector('.btn-table-del').addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'DELETE_ENTRY', id: item.id }, () => {
          showToast(`Deleted "${item.text}"`);
          loadData();
        });
      });

      entriesTableBody.appendChild(tr);
    });
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

  // --- Snippets & Text Expanders Controller ---

  function renderSnippets(snippets = []) {
    if (!snippetsTableBody) return;
    snippetsTableBody.innerHTML = '';
    if (!snippets || snippets.length === 0) {
      snippetsTableBody.innerHTML = `
        <tr>
          <td colspan="4" style="text-align:center; padding: 20px; color: var(--text-muted);">
            No custom shortcuts defined. Click "Reset Defaults" or add one above!
          </td>
        </tr>
      `;
      return;
    }

    snippets.forEach(item => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong style="color: #38bdf8; font-family: monospace; font-size: 13px;">${escapeHtml(item.trigger)}</strong></td>
        <td><code style="background: #090b10; border: 1px solid #1a202e; padding: 2px 7px; border-radius: 4px; color: #f1f5f9; font-size: 12px;">${escapeHtml(item.value)}</code></td>
        <td style="color: var(--text-muted); font-size: 12px;">${escapeHtml(item.description || '')}</td>
        <td style="text-align: center;">
          <button class="action-icon-btn btn-del-snippet" data-id="${item.id}" title="Delete shortcut">✕</button>
        </td>
      `;

      tr.querySelector('.btn-del-snippet').addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'DELETE_SNIPPET', id: item.id }, (res) => {
          showToast(`Deleted ${item.trigger}`);
          renderSnippets(res.snippets || []);
        });
      });

      snippetsTableBody.appendChild(tr);
    });
  }

  if (addSnippetBtn) {
    addSnippetBtn.addEventListener('click', () => {
      const trigger = (newSnippetTrigger.value || '').trim();
      const value = (newSnippetValue.value || '').trim();
      const description = (newSnippetDesc.value || '').trim();
      if (!trigger || !value) {
        showToast('Trigger and replacement value are required', 'error');
        return;
      }
      chrome.runtime.sendMessage({
        type: 'SAVE_SNIPPET',
        trigger,
        value,
        description
      }, (res) => {
        if (res && res.success) {
          showToast(`Saved shortcut ${trigger}`);
          newSnippetTrigger.value = '';
          newSnippetValue.value = '';
          newSnippetDesc.value = '';
          renderSnippets(res.snippets || []);
        }
      });
    });
  }

  if (resetSnippetsBtn) {
    resetSnippetsBtn.addEventListener('click', () => {
      if (confirm('Reset all shortcuts to default triggers (/handle, /email, /addr, /date, /time, /shrug)?')) {
        chrome.runtime.sendMessage({ type: 'RESET_SNIPPETS' }, (res) => {
          showToast('Shortcuts reset to defaults');
          renderSnippets(res.snippets || []);
        });
      }
    });
  }

  // --- Site Rules & Paused Domains Controller ---

  function renderDomains(domains = []) {
    if (!disabledDomainsList) return;
    disabledDomainsList.innerHTML = '';
    if (!domains || domains.length === 0) {
      disabledDomainsList.innerHTML = `
        <li style="padding: 16px; background: #12141f; border-radius: 6px; border: 1px dashed var(--card-border); color: var(--text-muted); font-size: 13px; text-align: center;">
          Smart AutoComplete is active on all websites! No domains are currently paused.
        </li>
      `;
      return;
    }

    domains.forEach(d => {
      const li = document.createElement('li');
      li.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: #12141f; border: 1px solid var(--card-border); border-radius: 6px; font-size: 13px;';
      li.innerHTML = `
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="color:#f59e0b; font-size:14px;">⏸</span>
          <span style="font-weight:600; color:#f1f5f9;">${escapeHtml(d)}</span>
          <span style="font-size:11px; color:#94a3b8;">(Suggestions & autofill paused)</span>
        </div>
        <button class="btn btn-success btn-unpause-domain" style="padding: 4px 10px; font-size: 11px;">▶ Re-enable</button>
      `;

      li.querySelector('.btn-unpause-domain').addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'TOGGLE_DOMAIN_PAUSE', domain: d }, (res) => {
          if (res && res.success) {
            showToast(`Re-enabled on ${d}`);
            renderDomains(res.disabledDomains || []);
          }
        });
      });

      disabledDomainsList.appendChild(li);
    });
  }

  if (addDisabledDomainBtn) {
    addDisabledDomainBtn.addEventListener('click', () => {
      const domain = (newDomainInput.value || '').trim().toLowerCase();
      if (!domain) {
        showToast('Please enter a domain', 'error');
        return;
      }
      chrome.runtime.sendMessage({ type: 'TOGGLE_DOMAIN_PAUSE', domain }, (res) => {
        if (res && res.success) {
          showToast(`Paused on ${domain}`);
          newDomainInput.value = '';
          renderDomains(res.disabledDomains || []);
        }
      });
    });
  }

  // Filter pills
  filterPills.forEach(pill => {
    pill.addEventListener('click', () => {
      filterPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      currentCategoryFilter = pill.getAttribute('data-category');
      renderTable();
    });
  });

  tableSearch.addEventListener('input', renderTable);

  // Add Entry from Manager
  addEntryBtn.addEventListener('click', () => {
    const text = addEntryText.value.trim();
    if (!text) return;
    const category = addEntryCategory.value;

    if (category === 'email' && !isValidEmail(text)) {
      showToast('Please enter a valid email address (e.g. name@example.com).', 'error');
      addEntryText.focus();
      return;
    }

    chrome.runtime.sendMessage({
      type: 'SAVE_ENTRY',
      text,
      category,
      pinned: true
    }, (res) => {
      addEntryText.value = '';
      showToast(`Added and pinned "${text}"!`);
      loadData();
    });
  });


  // LOCAL BACKUP & JSON
  const downloadBackupBtn = document.getElementById('downloadBackupBtn');
  const uploadFileTriggerBtn = document.getElementById('uploadFileTriggerBtn');
  const fileUploadInput = document.getElementById('fileUploadInput');

  if (downloadBackupBtn) {
    downloadBackupBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'GET_ALL_ENTRIES' }, (res) => {
        const data = res.entries || [];
        const jsonStr = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const dateStr = new Date().toISOString().split('T')[0];
        a.href = url;
        a.download = `smart-autocomplete-backup.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast(`Downloaded backup file with ${data.length} entries!`);
      });
    });
  }

  if (uploadFileTriggerBtn && fileUploadInput) {
    uploadFileTriggerBtn.addEventListener('click', () => {
      fileUploadInput.click();
    });

    fileUploadInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          let parsed = JSON.parse(event.target.result);
          if (!Array.isArray(parsed) && parsed && Array.isArray(parsed.entries)) {
            parsed = parsed.entries;
          }
          if (!Array.isArray(parsed)) throw new Error('File must contain a JSON array of entries');

          chrome.runtime.sendMessage({
            type: 'BATCH_IMPORT',
            entries: parsed
          }, (res) => {
            showToast(`✅ Successfully restored ${res.added || 0} entries from backup file!`);
            loadData();
          });
        } catch (err) {
          showToast('Failed to parse backup file: ' + err.message, 'error');
        }
      };
      reader.readAsText(file);
      fileUploadInput.value = '';
    });
  }

  exportJsonBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'GET_ALL_ENTRIES' }, (res) => {
      const data = res.entries || [];
      jsonArea.value = JSON.stringify(data, null, 2);
      showToast(`Exported ${data.length} entries to JSON.`);
    });
  });

  importJsonBtn.addEventListener('click', () => {
    const raw = jsonArea.value.trim();
    if (!raw) {
      showToast('Paste JSON in the area first.', 'error');
      return;
    }

    try {
      let parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) && parsed && Array.isArray(parsed.entries)) {
        parsed = parsed.entries;
      }
      if (!Array.isArray(parsed)) throw new Error('Root JSON must be an array of entries');

      chrome.runtime.sendMessage({
        type: 'BATCH_IMPORT',
        entries: parsed
      }, (res) => {
        showToast(`Successfully imported ${res.added || 0} new entries!`);
        loadData();
      });
    } catch (e) {
      showToast('Invalid JSON: ' + e.message, 'error');
    }
  });

  // Clean Full-Match Duplicates
  if (cleanDuplicatesBtn) {
    cleanDuplicatesBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'CLEAN_DUPLICATES' }, (res) => {
        if (res && res.success) {
          if (res.removedCount > 0) {
            showToast(`Cleaned duplicates: removed ${res.removedCount} duplicate entries (${res.remainingCount} remaining).`);
          } else {
            showToast('No duplicates found. All saved entries are unique!');
          }
          loadData();
        } else {
          showToast('Failed to clean duplicates.', 'error');
        }
      });
    });
  }

  // Clear Entire Database
  clearAllBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to clear all remembered entries? This cannot be undone.')) {
      chrome.runtime.sendMessage({ type: 'CLEAR_ALL' }, () => {
        showToast('Database cleared.');
        loadData();
      });
    }
  });

  loadData();
});

